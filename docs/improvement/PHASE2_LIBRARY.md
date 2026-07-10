# Phase 2 詳細仕様: ライブラリ信頼性 + パッケージング + 実装一本化

**目的:** ライブラリ本体(`src/terrain.ts` / `src/worker.ts`)の恒常的な不安定要因を除去し、npmパッケージとして成立させ、デモの3重実装を一本化する。
**期間目安:** 2〜3週間
**依存:** Phase 1 と独立(並行可)。2-3(副作用除去)は Phase 4-1(ライブラリテスト)の前提。

---

## 2-1. Worker のリソース管理とエラー応答保証

**課題ID:** H4, H5 **見積もり:** 1日 **対象:** `src/worker.ts`

### 修正仕様

#### (a) テクスチャの再利用(リークの根治)

現状はタイルごとに `gl.createTexture()`(worker.ts:139)し解放しない。タイルは常に256×256なので、**初期化時に1枚だけ生成して使い回す**:

```js
// initWebGL 内で1度だけ
heightMapTexture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, heightMapTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// onmessage 内は texImage2D による内容差し替えのみ
gl.bindTexture(gl.TEXTURE_2D, heightMapTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
```

さらに `image.close()` を処理完了後に呼び、ImageBitmap のメモリも即時解放する。

#### (b) 全 throw 経路でエラー応答を保証

現状の catch は `error instanceof Error` のときだけ postMessage(worker.ts:161-163)。以下に置換:

```js
} catch (error) {
    const message =
        error instanceof Error ? error.message :
        typeof error === 'string' ? error :
        'Unknown worker error';
    self.postMessage({ url, error: message });
} finally {
    if (image && typeof image.close === 'function') image.close();
}
```

#### (c) 転送最適化

`self.postMessage({ url, buffer })` → `self.postMessage({ url, buffer }, [buffer])`(transfer list)。ArrayBuffer のコピーを回避。

#### (d) GLコンテキストロスト対応

```js
canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    gl = null; program = null; positionBuffer = null; heightMapLocation = null;
    // 次の onmessage で initWebGL が再実行される(既存の if (!gl) ガードを利用)
});
```

### 受け入れ基準

- [ ] 開発ツールのGPUメモリ計測で、10分間の連続パン/ズーム後もWorkerのGLメモリが横ばい
- [ ] Worker内で文字列を throw させるテスト(コード注入)でも呼び出し側の Promise が reject される

---

## 2-2. WorkerProtocol のタイムアウト・多重リクエスト・自動復旧

**課題ID:** H6, H7, M8 **見積もり:** 1.5日 **対象:** `src/terrain.ts:23-88`

### 修正仕様

#### (a) リクエストID方式への変更(URLキー競合の根治)

`pendingRequests` のキーを URL から**単調増加ID**に変更。Worker との往復に `id` を含める:

```ts
class WorkerProtocol {
    private worker: Worker
    private pendingRequests = new Map<number, PendingRequest>()
    private nextRequestId = 0
    ...
    async request(url: string, controller: AbortController): Promise<{ data: Uint8Array }> {
        const image = await loadImage(url, controller.signal)
        if (!image) throw new Error(`Failed to load image: ${url}`)

        const id = this.nextRequestId++
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.settle(id, undefined, new Error(`GSI DEM tile timed out: ${url}`))
            }, WorkerProtocol.REQUEST_TIMEOUT_MS) // 10_000

            const onAbort = () => this.settle(id, undefined, new DOMException('aborted', 'AbortError'))
            controller.signal.addEventListener('abort', onAbort, { once: true }) // onabort 上書き問題も解消

            this.pendingRequests.set(id, { resolve, reject, timeout, signal: controller.signal, onAbort })
            this.worker.postMessage({ id, image, url }, [image]) // ImageBitmap は transferable
        })
    }

    private settle(id: number, value?: { data: Uint8Array }, error?: Error) {
        const req = this.pendingRequests.get(id)
        if (!req) return
        this.pendingRequests.delete(id)
        clearTimeout(req.timeout)
        req.signal.removeEventListener('abort', req.onAbort)
        if (error) req.reject(error)
        else req.resolve(value!)
    }
}
```

Worker側は受信した `id` をそのまま応答に含める(`self.postMessage({ id, url, buffer }, [buffer])`)。

> 併せて worker.ts のメッセージスキーマが `{id, url, image}` / `{id, url, buffer|error}` に変わるため、2-1 と同一PRで実施する。

#### (b) Worker の自動再生成

```ts
private handleError = (e: ErrorEvent) => {
    console.error('[gsi-terrain] worker crashed, restarting:', e.message)
    for (const id of [...this.pendingRequests.keys()]) {
        this.settle(id, undefined, new Error('Worker error occurred'))
    }
    this.respawnWorker()
}

private respawnWorker() {
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.removeEventListener('error', this.handleError)
    this.worker.terminate()
    this.worker = createWorker() // Blob URL からの生成を関数化して再利用
    this.worker.addEventListener('message', this.handleMessage)
    this.worker.addEventListener('error', this.handleError)
}
```

連続クラッシュ対策として、60秒以内に3回再生成したら以降のリクエストを即 reject するサーキットブレーカーを付ける(復旧見込みのない環境=WebGL2非対応で無限再起動しないため)。

#### (c) WebGL2 非対応の明示的シグナル

Worker 初回初期化失敗(`WebGL not supported`)を受けたら、コンソールに**1回だけ**「この環境ではGSI地形を利用できません(WebGL2/OffscreenCanvas 非対応)」を警告し、以降のリクエストは即 reject。README にフォールバック指針(terrain を設定しない)を記載。

### 受け入れ基準

- [ ] 同一URLの同時2リクエストが両方 resolve される(ユニットテスト)
- [ ] Worker を強制 terminate 後、次のタイルリクエストが成功する(自動再生成)
- [ ] 応答が来ないケースで10秒後に reject され、`pendingRequests.size` が0に戻る
- [ ] abort 済みリクエストのエントリ/タイマーが残らない

---

## 2-3. import 時副作用の除去(遅延初期化)

**課題ID:** H8 **見積もり:** 0.5日 **対象:** `src/terrain.ts:86-88`

### 修正仕様

```ts
// Before: モジュール評価時に Worker 生成(SSR/テストで即死)
// const blob = new Blob([workerCode], ...); const worker = new Worker(...); ...

// After: 初回利用時に生成
let workerProtocol: WorkerProtocol | null = null
const getWorkerProtocol = (): WorkerProtocol => {
    if (!workerProtocol) {
        const blob = new Blob([workerCode], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        try {
            workerProtocol = new WorkerProtocol(new Worker(url))
        } finally {
            URL.revokeObjectURL(url) // Worker生成後は revoke 可能(LOW課題も同時解消)
        }
    }
    return workerProtocol
}
```

`getGsiDemProtocolAction` 内の `workerProtocol.request(...)` を `getWorkerProtocol().request(...)` に変更。これで **import しても Worker は生成されず**、happy-dom でのユニットテスト・SSR が可能になる。

### 受け入れ基準

- [ ] `import { useGsiTerrainSource } from './terrain'` が happy-dom / Node で例外なく評価できる(ユニットテストで担保)
- [ ] 地形表示の実動作に変化なし(デモで確認)

---

## 2-4. ホットパスのログ除去 / debug オプション化

**課題ID:** M9 **見積もり:** 0.25日 **対象:** `src/terrain.ts:8,10,13,18,178,179`

### 修正仕様

- タイルごとの `console.log`(`[GSI DEM] Fetching:` 等4箇所)を**削除**。
- エラー系(`console.error`)は残す。ただし 1-4 と同思想で、同一URLの連続失敗はログ抑制(直近エラーURLを Set に保持、成功で解除)までは不要 — ライブラリ側はシンプルに残してよい。
- 開発時の追跡が必要なら `useGsiTerrainSource(addProtocol, { debug: true })` オプションを追加し、debug 時のみ log(任意・推奨)。

### 受け入れ基準

- [ ] 通常利用でタイル取得ごとのコンソール出力が0行

---

## 2-5. パッケージング修正(dist生成 / mapbox-gl依存整理)

**課題ID:** H9, H10, H11 **見積もり:** 1日

### (a) ライブラリバンドルの生成

現状 `pnpm build` = `vite build && tsc` だが、`vite.config.ts` は `root: './example'` のデモビルド、`tsc` は `emitDeclarationOnly` — **`dist/terrain.js` が誰にも作られない**。

`vite.config.ts` をライブラリモードへ変更(デモビルドは既存の `vite.config.example.ts` に一本化されているため役割が重複しない):

```ts
// vite.config.ts(ライブラリ専用に書き換え)
import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        lib: {
            entry: 'src/terrain.ts',
            formats: ['es'],
            fileName: () => 'terrain.js',
        },
        outDir: 'dist',
        emptyOutDir: false, // tsc の .d.ts と共存
        rollupOptions: {
            external: ['maplibre-gl'],
        },
    },
})
```

`package.json` に `exports` フィールドを追加(モダン解決):

```json
"main": "./dist/terrain.js",
"types": "./dist/terrain.d.ts",
"exports": {
    ".": { "types": "./dist/terrain.d.ts", "import": "./dist/terrain.js" }
}
```

> 注: `terrain.ts:2` の `import maplibregl from 'maplibre-gl'` は型参照のみなので `import type` に変更し、maplibre-gl を完全に型専用依存へ(external 指定とあわせてバンドル0依存に)。`peerDependencies: { "maplibre-gl": ">=3" }` を宣言。

### (b) mapbox-gl の依存整理

1. `package.json`: `dependencies.mapbox-gl` → `devDependencies` へ移動(ライブラリは一切使用していないため)。
2. `example/index.ts:7-9` の静的 `import mapboxgl from 'mapbox-gl'` + CSS import を削除し、**`map-provider.ts` の動的 import に完全委譲**。index.ts 内の mapboxgl 直接参照は `loadMapProvider()` の戻り値経由に書き換え。
3. maplibre-gl も同様に静的/動的の二重 import(ビルド警告の原因)を解消: index.ts は `map-provider.ts` 経由のみに統一。

**効果見込み:** デモの単一チャンク 2.82MB → maplibre チャンク ~800KB + mapbox 遅延チャンク(選択時のみロード)。初期ロードはほぼ半減。

### (c) CSP との整合

mapbox 遅延チャンク化後も `vercel.json` の CSP は現状のままで動作(mapbox ドメインは connect-src 済み)。変更不要だが、Phase 4-5 の厳格化時に再確認。

### 受け入れ基準

- [ ] `pnpm build` 後に `dist/terrain.js` と `dist/terrain.d.ts` が存在
- [ ] `npm pack` した tarball を素の Vite プロジェクトに install し、`useGsiTerrainSource` で地形が表示される(手動検証手順を docs に記録)
- [ ] デモ初期ロードのJSが 1.5MB(gzip 400KB)以下、mapbox-gl は provider 切替時のみネットワークに現れる
- [ ] `pnpm ls --prod` の依存が0件(または peer の maplibre-gl のみ)

---

## 2-6. data-import-export の移設と共通パーサ化

**課題ID:** H12(一部), M5, M6, M7, M10, M11 **見積もり:** 2日

### (a) 移設

`src/data-import-export.ts`(2,207行)→ `example/lib/data-import-export.ts` へ移動。import 元(example/index.ts:93 ほか3ファイル)のパスを更新。`tsconfig.json` の型チェック対象に example を含める設定を確認(現状 `include: ["src/terrain.ts"]` のためライブラリ用 tsconfig と、`tsconfig.example.json` の2枚に分割し、`type-check` スクリプトで両方実行):

```json
// package.json
"type-check": "tsc --noEmit && tsc --noEmit -p tsconfig.example.json"
```

> これにより2,207行が初めて型チェックされる。`any` 起因のエラーが数十件出る想定 — 機械的に解消し、意図的な `any` は `unknown`+絞り込みへ。

### (b) CSV共通パーサ

6本の重複パーサ(:216, 433, 460, 496, 534, 591)を1つのユーティリティに統合:

```ts
// example/lib/csv.ts
export interface CsvParseResult { header: string[]; rows: string[][]; errors: string[] }

/** RFC4180準拠の引用符対応パーサ(既存エクスポートの quote と往復整合) */
export function parseCsv(text: string): CsvParseResult { ... }

/** 数値カラムの安全変換: NaN なら errors に行番号付きで記録し、その行をスキップ */
export function toNumber(value: string, field: string, line: number, errors: string[]): number | null { ... }
```

各データ種別のパーサは「カラム定義 + 行→オブジェクト変換」の宣言だけ残す。**NaN ガードを共通層で強制**し、`map.flyTo([NaN, NaN])` 系の事故を根絶。スキップ行があればトーストで「N行を読み飛ばしました(詳細はコンソール)」。

### (c) エクスポートのエスケープ

- KML/XML(:1819, 1842): `escapeXml(s)`(`& < > " '` の5種)を通す。
- CSV: 共通 `formatCsvField()`(引用符・改行・カンマを含む場合に quote + 内部 `"` を `""`)でエクスポートし、(b) のパーサと往復整合を保証。
- `Math.max(...arr)`(:427)→ `arr.reduce((m, v) => Math.max(m, v), -Infinity)` + 空配列ガード。

### 受け入れ基準

- [ ] エクスポート→インポートの往復でデータが完全一致するプロパティテスト(カンマ・引用符・改行・日本語を含むフィールド)
- [ ] NaN を含むCSVをインポートしても地図が壊れず、警告トーストが出る
- [ ] `pnpm type-check` が example 配下も検査してグリーン
- [ ] `src/` 配下が `terrain.ts` / `worker.ts` / テストのみになる

---

## 2-7. デモ実装の一本化

**課題ID:** H12 **見積もり:** 3日 **リスク:** 中(挙動変更を伴うため e2e を先に整備)

### 方針決定(推奨案)

| 対象 | 処置 | 理由 |
|------|------|------|
| `example/index.ts` + `index.html` | **正とする** | e2e・Vercelデプロイの実体 |
| `example/App.tsx` / `DroneDataSystem.tsx` | **削除** | どこからも参照されない並行実装。地図中心・DEMデコードが本体と乖離済み |
| `example/standalone-drone-system.html` | **削除**(必要なら git 履歴で参照) | 3つ目のコピー。メンテ対象を1つに |
| `modules/FlightController` | **採用** — index.ts:2640-2793 の重複実装(startFlightPlan/executeFlightPhase/pause/calculateBearing)を削除し、FlightController に一本化。1-1 のタイマー管理は FlightController 側に実装し直す | テスト済みコードを活かす。イージング/orbit 機能も回収できる |
| `modules/FlightDataManager` | **採用** — index.ts の自前 export/import を置換。NaN バリデーション(2-6b)を追加 | ユニットテストが既にある |
| `modules/MapStyleManager` | **UI復活を判断**: `createStyleControl()` のコメントアウト解除 + モバイルで terrain 再有効化してしまうバグ(switchStyle が CONFIG.enableTerrain を無視)を修正して有効化。README が謳う「6種マップスタイル」機能の回復 | 機能欠落とREADMEの乖離解消 |
| `modules/DroneModel` | 空実装の WebGL カスタムレイヤー(`onAdd`/`render` スタブ)を**削除**し、物理状態管理のみ残す(または全体を GameController に吸収) | 「3Dドローンが描画されている」という誤解を排除 |

### 手順(安全な移行順)

1. e2e の現行グリーン化(Phase 4-3 の先行分: スタイル切替テストを skip 化 or 機能復活とセットで)
2. React版・standalone 削除(ビルド対象外の確認のみ、リスク極小)
3. FlightController 一本化(1-1 の修正を FlightController.startFlightPlan/pause/resume に実装、index.ts はボタン→コントローラ呼び出しの薄い配線に)
4. FlightDataManager 一本化
5. MapStyleManager 有効化(+モバイル terrain バグ修正)
6. index.ts の行数計測: 目標 3,595 → 2,000行以下(最終目標は Phase 3 のUI再構築後に 1,000行以下)

### 受け入れ基準

- [ ] `calculateBearing` / フライトプラン実行ロジック / DEMデコードの実装がリポジトリ内に**各1つ**
- [ ] e2e 全件グリーン(スタイル切替テスト含む)
- [ ] デモの目視リグレッション: 4プリセットプラン完走、pause/resume、ゲーム/タッチ操作、データ入出力
- [ ] バンドルから React が消える(現在 App.tsx 経由で dead import されていれば)

---

## Phase 2 マイルストーン

| 週 | 完了項目 |
|----|---------|
| W1 | 2-1, 2-2, 2-3, 2-4(ライブラリ本体)+ ユニットテスト着手 |
| W2 | 2-5(パッケージング)、2-6(移設・共通パーサ) |
| W3 | 2-7(一本化)+ リグレッション |

**Phase 2 完了の定義:** `npm pack` で配布可能・長時間セッションでGLメモリ横ばい・実装重複ゼロ・`pnpm ci:check` と e2e グリーン。
