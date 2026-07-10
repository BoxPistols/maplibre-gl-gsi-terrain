# Phase 4 詳細仕様: テスト・品質基盤

**目的:** 「修正しても再発する」状態を終わらせる。実効カバレッジの確立、e2e の実UI同期、CI ゲート、CSP 厳格化、ドキュメント同期。
**期間目安:** 初期整備2週間+以降継続
**依存:** 4-1 は Phase 2-3(import副作用除去)後。4-3 の一部は Phase 1 と同時に先行実施。

---

## 4-1. ライブラリ本体のユニットテスト

**課題ID:** H13 **見積もり:** 3日 **対象:** `src/terrain.ts`, `src/worker.ts`

### 前提

Phase 2-3 により import が副作用フリーになり、happy-dom で `WorkerProtocol` をモック Worker と共にテスト可能になる。現在の `terrain.test.ts`(`1+1===2` の6行)を置き換える。

### テスト設計

```
src/terrain.test.ts
├─ useGsiTerrainSource
│   ├─ デフォルトで gsidem://cyberjapandata... の terrarium ソースを返す
│   ├─ tileUrl/minzoom/maxzoom/attribution オプションの反映
│   └─ addProtocol が 'gsidem' で1回呼ばれる
├─ getGsiDemProtocolAction(URL正規化)
│   ├─ 'gsidem://https://host/1/2/3.png' → 'https://host/1/2/3.png'
│   ├─ 'gsidem:https://host/...'(新形式)
│   ├─ 'gsidem://https/// host'(正規化破損形式)→ 'https://' に修復
│   ├─ クエリ文字列付きURLが破壊されない(回帰テスト: 既知の弱点)
│   └─ カスタムプロトコル名
└─ WorkerProtocol(FakeWorker を注入)
    ├─ 正常系: postMessage への応答で resolve、pendingRequests が空になる
    ├─ 同一URL同時2リクエスト → 両方 resolve(Phase 2-2a の回帰)
    ├─ タイムアウト: 応答なし10秒(fake timers)で reject + クリーンアップ
    ├─ abort: signal.abort() で AbortError reject、Worker応答が来ても無視
    ├─ worker error イベント → 全 pending reject + respawn が呼ばれる
    ├─ 非Errorエラー応答({error: 'string'})でも reject
    └─ fetch 失敗/HTTP非OK/createImageBitmap 失敗 → 'Failed to load image' reject
```

**FakeWorker パターン:**

```ts
class FakeWorker implements Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'> {
    listeners = new Map<string, Set<Function>>()
    sent: unknown[] = []
    postMessage(msg: unknown) { this.sent.push(msg) }
    emit(type: 'message' | 'error', payload: unknown) { ... }
    ...
}
```

`WorkerProtocol` のコンストラクタは既に Worker を受け取る設計(DI 済み)なのでそのまま注入可能。`loadImage` は `vi.stubGlobal('fetch', ...)` + `vi.stubGlobal('createImageBitmap', ...)` でスタブ。

**シェーダーロジックの検証(選択制):** GLSL 自体は unit 不能のため、e2e 側で「既知のGSI標高PNG 1枚 → 期待 terrarium 値」のゴールデンテストを browser mode(@vitest/browser + playwright、依存導入済み)で1本だけ持つ。標高0m・負値・無効値(128,0,0)の3画素を検証。

### 受け入れ基準

- [ ] `src/` の line カバレッジ 80% 以上(worker.ts の文字列コードは除外設定)
- [ ] 全テストが Worker/ネットワーク実物なしで1秒以内に完走

---

## 4-2. データ層のユニットテスト

**課題ID:** M5, M6 の回帰防止 **見積もり:** 2日 **対象:** `example/lib/csv.ts`, `data-import-export.ts`(移設後), `FlightDataManager`

### テスト設計

- **CSV往復プロパティテスト:** `formatCsvField` → `parseCsv` の往復同一性。ケース: カンマ含み、二重引用符、改行、日本語、空フィールド、BOM付き。
- **NaN/不正データ:** 座標が `abc` / 空 / `1e999` の行 → スキップ+errors に行番号。`validateFlightPlan` に NaN ケースを追加(現在 NaN が範囲チェックを素通りするバグの回帰テスト。`Number.isFinite` ガード導入後に green になることを確認)。
- **KML/XMLエスケープ:** 名前に `<b>&"'` を含むミッションのエクスポートが well-formed XML(DOMParser で parsererror なし)。
- **境界:** 空CSV、ヘッダのみ、25頂点未満メッシュ(convertMeshToTriangles の暗黙ドロップ → 警告付きスキップへ仕様化)。

### 受け入れ基準

- [ ] `example/lib/` の line カバレッジ 80% 以上
- [ ] 既知バグ(NaN通過・往復破損・XML注入)それぞれに red→green の回帰テストが存在

---

## 4-3. e2e の実UI同期と強化

**課題ID:** M18 **見積もり:** 2日+UI変更ごとに随時 **対象:** `tests/e2e/flight-simulator.spec.ts`

### 修正内容

1. **乖離テストの解消:** `.map-style-control` / 誇張度スライダーの3テストは、Phase 2-7 でスタイルUIを復活させるまで `test.skip(true, 'style control disabled — see PHASE2 2-7')` で明示 skip(現状は対象要素が存在しないのに存在チェックが通っている/落ちているか不明な状態を排除)。復活後に skip 解除。
2. **pause/resume の実効アサーション(Phase 1-1 の検収):**

```ts
test('pause は本当に止まる', async ({ page }) => {
    // 開始 → フェーズ2まで待つ → pause
    // pause 時点のフェーズ表示を記録
    const phaseBefore = await page.locator('#flightStatus').textContent()
    await page.waitForTimeout(4000) // 最長フェーズduration+α
    await expect(page.locator('#flightStatus')).toHaveText(phaseBefore) // 進んでいない
    // resume → フェーズが単調増加し完走
})
```

3. **新規シナリオ:**
   - シミュレーション中にフライトプラン開始 → ログ座標がプラン座標と一致(ジッターなし、H2 検収)
   - localStorage 無効環境(`page.addInitScript` で Storage を throw 化)→ 地図表示(H3 検収)
   - ゲームコントロール無効化後に `<input>` へ 'w' 入力が通る(M2 検収)
   - モバイルビューポート(iPhone 14 Pro)+ `hasTouch: true` プロジェクトを projects に追加し、プライマリバー操作を検証(Phase 3 後)
4. **フレーク対策:** `waitForTimeout` の多用を避け、ログ行の出現(`toHaveText` / `toContainText`)ベースの待機に統一。GSI タイルへの実ネットワーク依存は `page.route` でローカルフィクスチャPNG に差し替えるオプションを用意(CI安定化)。

### 受け入れ基準

- [ ] skip 以外の全テストがローカル3連続グリーン(フレークなし)
- [ ] CI(下記4-4)で e2e が毎PR実行される

---

## 4-4. CI ゲートとカバレッジ閾値

**見積もり:** 1日 **対象:** `.github/workflows/ci.yml`, `vitest.config.ts`, `codecov.yml`

### 修正内容

1. **CI パイプライン(毎PR):**

```
jobs:
  check:   pnpm ci:check(lint + type-check×2 + format + unit)
  modules: pnpm test:modules:ci
  e2e:     pnpm exec playwright install --with-deps chromium
           pnpm dev &(wait-on http://localhost:5173)
           pnpm test:e2e --project=chromium   # PRは chromium のみ、main で3ブラウザ
  build:   pnpm build && pnpm build:example
           + dist/terrain.js の存在アサーション(H11 の再発防止)
           + demo/assets/*.js の合計サイズ上限チェック(例: gzip 500KB。Phase 2-5 の退行防止)
```

2. **カバレッジ閾値(vitest.config.ts):** 開始値 `lines: 40` → Phase 4-1/4-2 完了後 `60` に引き上げ。`worker.ts`(文字列テンプレート)と `*.test.ts` は除外。
3. **husky 警告解消:** `.husky/pre-commit` / `pre-push` の非推奨2行(v10で動作しなくなる)を削除。pre-push の `ci:build` はコミット体験を損ねるため pre-push から外し CI に委譲(ローカルは lint-staged 相当の軽量チェックのみ)。

### 受け入れ基準

- [ ] 「テストなし・型エラーあり・バンドル肥大」のPRがCIで落ちる
- [ ] main の必須ステータスチェックに check/modules/e2e/build を設定

---

## 4-5. CSP 厳格化

**依存:** Phase 3 S2(インラインstyle/script撤去)完了後 **見積もり:** 1日 **対象:** `vercel.json`, `example/index.html`

### 修正内容

| ディレクティブ | 現状 | 変更後 |
|---------------|------|--------|
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live` | `'self' https://vercel.live`(インラインscript(モバイル判定・ツールチップ)はS2/S3で外部化済み。`unsafe-eval` は maplibre/mapbox が不要なことを確認して除去 — 要動作検証) |
| `style-src` | `'self' 'unsafe-inline' https://unpkg.com` | maplibre は動的style注入があるため `'unsafe-inline'` 残置が必要か検証。不要なら `'self'` のみ。unpkg 参照は自前バンドルに置換して除去 |
| その他 | mapbox/pusher 系 | mapbox プロバイダー継続なら残置、Phase 2-5 の遅延化後も必要ドメインは同じ |

**手順:** まず `Content-Security-Policy-Report-Only` で1週間運用し、違反レポート(report-to)ゼロを確認してから enforce に切替。

### 受け入れ基準

- [ ] enforce 後、全機能(地形・スタイル切替・mapbox切替・エクスポート)がCSP違反なしで動作

---

## 4-6. ドキュメント同期

**見積もり:** 1日+各Phase完了時に随時

- `docs/TECHNICAL_SPECIFICATION.md` / `DEVELOPER_MANUAL.md`: modules 一本化(2-7)後のアーキテクチャに全面改訂。「存在しない機能」(現状: 6種スタイルUI等)を実装状態と一致させる。バージョン表(Vite 3.2.11 等の古い記載)を実際の lockfile と同期。
- `README.md`: ライブラリ利用者向け(npm)とデモ紹介を分離。Phase 2-5 のパッケージング後、インストール〜最小コード例を検証済みの内容に更新。
- `CLAUDE.md`: safe-area 規約は維持。`byId` ヘルパー・toast API・safeStorage の利用規約を追記(AIエージェントの再発防止)。
- 各Phase完了時に `docs/IMPROVEMENT_PLAN.md` の課題一覧へ ✅ を記録し、本計画自体を進捗トラッカーとして運用する。

---

## 継続運用ルール(Definition of Done への組み込み)

1. バグ修正PRは**必ず red→green の回帰テストを含む**(テスト不能な場合は理由をPR本文に明記)。
2. UIを追加・変更するPRは: aria-label / 44px / safe-area / トークン使用 のセルフチェック4項目をPRテンプレートに含める。
3. `example/index.ts` への追記は原則禁止(モジュールへ)。行数が増えるPRには理由を要求。
4. 依存追加は `pnpm ls --prod` への影響(ライブラリ利用者に波及するか)を必ず確認。

## Phase 4 完了の定義

- CI が lint / type / unit / e2e / build / サイズ / カバレッジ閾値の7ゲートを毎PRで実行
- src + example/lib のカバレッジ 60% 以上
- e2e が実UIと一致し3連続グリーン
- CSP enforce 済み・ドキュメントが実装と一致
