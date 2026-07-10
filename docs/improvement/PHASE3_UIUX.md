# Phase 3 詳細仕様: UI/UX 改善

**目的:** 「初見で使い方が分かる」「モバイルで誤操作しない」「読み込み中/エラーが分かる」「キーボード・支援技術で使える」の4点を達成する。
**期間目安:** 2〜3週間(スプリントS1〜S4)
**依存:** S3(パネル再構築)は Phase 2-7(一本化)完了後を推奨。S1/S2 は即着手可。

---

## S1. フィードバック統一(トースト・ローディング・ボタン色)

**課題ID:** M14, M15, ボタン色(§4.1) **見積もり:** 3日

### S1-1. トーストシステムの統一

現状3実装(index.ts:147-187 `showErrorToast` / :243-268 地形フォールバック / :507-549 `showToast`)を単一モジュールへ:

```ts
// example/ui/toast.ts
export type ToastType = 'info' | 'success' | 'warning' | 'error'
export function toast(type: ToastType, title: string, message?: string, opts?: { dedupeKey?: string }): void
```

**仕様:**
- コンテナ `#toast-container` を1つ(`position: fixed; top: calc(12px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right));`)。トーストは縦に**スタック**(flex column, gap 8px)、最大4枚で古いものから破棄。
- `dedupeKey` 指定時、同キーの表示中トーストがあればカウンタ表示「×N」に集約(タイルエラー等の洪水対策、Phase 1-4 と接続)。
- `role="status"` + コンテナに `aria-live="polite"`(error のみ `assertive`)。
- テキストは `textContent` で挿入(**innerHTML 禁止** → M17 のトースト側も同時解消)。
- 自動消滅: info/success 3秒、warning 5秒、error 8秒+閉じるボタン(44×44ヒットエリア)。
- z-index はトークン `--z-toast`(モーダルより下、§S2-2 参照)。
- スタイルは CSS ファイルで定義(TS からの cssText 注入をやめる)。

**移行:** `showToast`/`showErrorToast` の呼び出し(約60箇所)を `toast()` へ機械置換。地形フォールバック(:243)は `dedupeKey: 'terrain-fallback'` 付き warning に。

### S1-2. ローディングオーバーレイ

- `index.html` に静的マークアップ(JS実行前から見える):

```html
<div id="app-loading" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <p id="app-loading-message">地図を読み込んでいます…</p>
</div>
```

- 段階メッセージ: 「地図を読み込んでいます…」→(map `load` 発火)→ フェードアウト(300ms)して `remove()`。
- 15秒経っても `load` が来ない場合: 「読み込みに時間がかかっています。通信環境をご確認ください」+ 再読み込みボタン表示(map.on('load') 未発火の単一障害点=旧LOW課題への UX 面の手当て)。
- map `error`(致命系)時: オーバーレイをエラーパネルに転用(「地図を初期化できませんでした」+ 詳細折りたたみ + 再読み込みボタン)。**`confirm()`(index.ts:3031)を廃止**。

### S1-3. ボタン色ルールの再定義

| クラス | 用途 | 色 |
|--------|------|----|
| `.btn-primary` | 各セクションの主アクション(開始、インポート実行) | 青 |
| `.btn-neutral`(デフォルト) | その他すべて | グレー系グラス |
| `.btn-danger` | 破壊的操作(クリア、削除)のみ | 赤 |
| `.btn-toggle.active` | トグル系のON状態 | 青枠+チェック表示 |

- 既存の `success/info/warning/error` クラス流用(index.html:263-301, 824-846, 1316-1352 の3重定義)を上記4種へ統合。**1画面内の primary は各セクション1つまで**。
- トグル系ボタン(2D/3D、描画モード、編集モード等)は `aria-pressed` を併せて付与(S4 と接続)。

### 受け入れ基準

- [ ] `grep -n "cssText" example/index.ts` が0件(トースト関連)
- [ ] トーストが同時5件発生しても画面上は最大4枚が整列
- [ ] スロットリング(Chrome DevTools Slow 3G)で起動時にスピナー→地図表示の遷移が見える
- [ ] `confirm(` が example/ から消える

---

## S2. CSS アーキテクチャとモバイル基盤

**課題ID:** M12, M13, M16, CSS品質全般(§4.5) **見積もり:** 4日

### S2-1. ファイル分割とトークン

`index.html` の `<style>` 約1,700行(:78-1792)を外部化:

```
example/styles/
  tokens.css       # デザイントークン(下記)
  base.css         # リセット、タイポグラフィ、フォーカスリング
  components.css   # ボタン、グラスパネル、モーダル、トースト、ジョイスティック、チップ
  layout.css       # ドロワー、フッター、固定ボタン群、レスポンシブ
```

`tokens.css` の必須定義:

```css
:root {
    /* z-index 階層(マジックナンバー禁止。既存の 99999/10000/3000/2501... を置換) */
    --z-map: 0;
    --z-panel: 100;       /* ドロワー、情報パネル、フッター */
    --z-fixed-controls: 200; /* 画面端トグル、ジョイスティック */
    --z-overlay: 300;     /* デバッグオーバーレイ */
    --z-modal: 400;       /* モーダル(ヘルプ、モバイルFP) */
    --z-toast: 500;
    --z-tooltip: 600;

    /* 色(グラス+アクセント) */
    --color-accent: #2563eb;
    --color-danger: #dc2626;
    --surface-glass: rgba(255, 255, 255, 0.85); /* 旧0.6-0.75 → コントラスト改善 */
    --text-primary: rgba(0, 0, 0, 0.87);

    /* 間隔・サイズ */
    --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
    --tap-target: 44px;
    --radius: 10px;

    /* safe area(全 fixed 要素はこれを使う) */
    --inset-top: env(safe-area-inset-top, 0px);
    --inset-bottom: env(safe-area-inset-bottom, 0px);
    --inset-left: env(safe-area-inset-left, 0px);
    --inset-right: env(safe-area-inset-right, 0px);
}
@media (prefers-color-scheme: dark) {
    :root {
        --surface-glass: rgba(30, 30, 34, 0.85);
        --text-primary: rgba(255, 255, 255, 0.92);
    }
}
```

**移行ルール:**
- inline `style=""` 属性(ヘッダー:1835-1848、select:1871-1879 ほか約30箇所)→ クラス化。
- `!important` は maplibre コントロール上書き(:1193-1211)以外禁止。移行時に specificity を整理して既存の `!important`(:971, 992, 996, 1064, 1116, 1357)を除去。
- ブレークポイントは2つに統一: `--bp-mobile: 768px`(レイアウト切替)+ `(hover: none) and (pointer: coarse)`(入力手段)。480px/380px の微調整ブロックは統合。
- モバイル全要素 `* { transform: translateZ(0) }` ハック(:900-904)を削除。ちらつきが出る要素にのみ `will-change: transform` を個別指定。
- 高さフォールバック(100vh/-webkit-fill-available/100dvh の3行重複)は `.full-height` ユーティリティに集約。

### S2-2. タップターゲットと safe-area の全数適用

**対象一覧(修正マトリクス):**

| 要素 | 現状 | 修正 |
|------|------|------|
| モーダル閉じる(×) 3種(:1266, 1428, 1557) | 28-32px | 視覚32px+擬似要素で44pxヒットエリア |
| ボタン mobile min-height(:988, 1124, 1181) | 40→38→36px | 一律 `min-height: var(--tap-target)` に統一(縮小カスケード廃止) |
| `.controls-toggle`(:939) | `top:10px; left:10px` | `top: calc(10px + var(--inset-top)); left: calc(10px + var(--inset-left))` |
| `.mobile-flight-plan-toggle` / `.mobile-home-button`(:322, 346) | `right:10px` | `right: calc(10px + var(--inset-right))` + top に inset-top |
| ジョイスティック(:1074-1082) | `bottom:35px` | `bottom: calc(35px + var(--inset-bottom))`、ノブ48px/リング120px |
| トースト(S1で新設) | — | 実装時から inset 適用 |
| デバッグトグル/オーバーレイ(:1752, 1783) | `bottom:250px` 固定 | フッター実高を `--footer-height` CSS変数で共有し `calc()` 参照 |

### S2-3. モバイル判定の一元化

```ts
// example/ui/device.ts
export const isCoarsePointer = () =>
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
export const isNarrowViewport = () =>
    window.matchMedia('(max-width: 768px)').matches
```

- インラインスクリプトの UA 正規表現(index.html:20-23)を削除し、**「タッチUI表示」= isCoarsePointer、「狭幅レイアウト」= isNarrowViewport** と意味で使い分ける(現状は両概念が混同され、狭いデスクトップに仮想ジョイスティックが出る)。
- `resize`/`change` リスナーで動的切替に追従。

### 受け入れ基準

- [ ] `index.html` の `<style>` ブロックが0行、inline style 属性が0件
- [ ] z-index の数値リテラルが styles/ 以外に存在しない
- [ ] iPhone 15 Pro 実機/シミュレータ(縦・横)で全固定要素がノッチ・ホームインジケータと重ならない
- [ ] Chrome DevTools の CSS Overview でタップターゲット44px未満の警告0件
- [ ] ダークモード(OS設定)でパネル・文字が反転し可読

---

## S3. 情報設計の再構築

**課題ID:** H14(一部), §4.1全般 **見積もり:** 5日 **依存:** Phase 2-7 完了推奨

### S3-1. 3層モデルへの再編

**Layer 1 — プライマリバー(常時表示、地図下部中央):**

```
[▶ 開始/⏸ 一時停止] [フライトプラン ▾] [2D/3D] [状態チップ: 待機中|飛行中 フェーズ3/8]
```

- 現在ドロワー最深部にある主要導線(`#startFlightPlan` 等)を昇格。モバイルでは同バーがボトムシート化(`bottom: calc(0px + var(--inset-bottom))`)。
- 既存の `#mobileFlightPlanToggle`「DRONE FLIGHT」ボタンと専用モーダル(index.html:2213-2329)、および `<select>` 2重管理+手動同期(index.ts:2042-2053)は**廃止** — プライマリバーがレスポンシブに両対応するため、プラン選択 `<select>` は1つになる。

**Layer 2 — ドロワー(3タブ):**

| タブ | 収容(現6セクション24ボタンを再配置) |
|------|-------------------------------------|
| 飛行 | ドローン配置、シミュレーション、ゲーム/タッチ操作、プランのインポート/エクスポート |
| データ | CSV/GeoJSON入出力、フライトデータ、軌跡、描画・多角形・編集モード |
| 設定 | マッププロバイダー、Mapboxトークン、マップスタイル(2-7で復活)、地形誇張度 |

- 各タブ先頭に1行説明。ボタンは「ラベル+短い説明文」のリスト行形式にし、2-4文字の省略ラベル(配置/クリア)+800msツールチップ依存(index.html:2614)を廃止。**ツールチップは補助に格下げ**され、なくても使える文言にする。
- 情報パネル(`#infoPanel` の点検ワークフロー説明)はヘルプモーダルへ統合し、常設パネルを1枚削減。

**Layer 3 — 開発者向け:** デバッグオーバーレイ(現状どおり非表示デフォルト)。表示文言を日本語化(「System State」→「システム状態」等、index.html:2341-2455)。ラベル定数は `ui/strings.ts` に集約し、将来の i18n の下地とする(本フェーズでは日本語統一のみ。英語対応はスコープ外)。

### S3-2. 初期表示の整理

- デスクトップ初期状態: プライマリバーのみ表示。ドロワー・情報パネル・フライトプランパネルの**デフォルト `visible` を廃止**(index.html:2091, 2121)。
- 初回訪問時(safeStorage にフラグ)のみ、3ステップの簡易コーチマーク(「① プランを選ぶ → ② 開始 → ③ 詳細はメニュー」)。「次から表示しない」付き。
- フッターログはデフォルト折りたたみ(ヘッダー1行+展開ボタン)。ログ文字サイズは最小11px(現状モバイル6-7px、index.html:1036, 1174 を廃止)。

### S3-3. DOM 契約の強化

- パネル開閉状態を `classList.contains('visible')` で読む方式(index.ts:3394 ほか)をやめ、`ui/panels.ts` の状態オブジェクトを単一ソースに(DOM はビューとして追従)。
- シェブロン切替の `innerHTML` SVG injection(index.ts:3387-3474)→ CSS クラス切替(`.is-open` で `transform: rotate(180deg)`)に置換。
- 起動時に必須IDの存在検証(`byId` ヘルパー、Phase 1-7)を全面適用。

### 受け入れ基準

- [ ] 初回ロード時に開いているパネルが0枚(プライマリバーのみ)
- [ ] フライトプラン選択 `<select>` がDOMに1つ
- [ ] ユーザビリティ簡易テスト: 初見者が「富士山プランを開始して一時停止する」を60秒以内に達成(社内2名で確認)
- [ ] e2e をプライマリバーの新セレクタに更新し全件グリーン

---

## S4. アクセシビリティ(WCAG 2.1 AA 基礎)

**課題ID:** H14, M17 **見積もり:** 4日

### S4-1. アクセシブルネームとロール

- 全アイコンボタンに `aria-label`: ハンバーガー「メニューを開く」、`#mobileHomeButton`「ホーム位置に戻る」、閉じる×「閉じる」、エッジシェブロン「パネルを開閉」等。**チェックリストを付録Aに列挙し、全数消化を PR 条件にする。**
- トグル系(2D/3D、描画、編集、ゲーム操作)に `aria-pressed`、ドロワー開閉ボタンに `aria-expanded` + `aria-controls`。
- 地図キャンバスに `role="application"` + `aria-label="3D地図"`。

### S4-2. モーダルの標準実装

対象: ヘルプモーダル、(S3で残る)設定系ダイアログ、デバッグオーバーレイ。

```ts
// example/ui/modal.ts — 共通ふるまい
export function openModal(overlay: HTMLElement) {
    overlay.hidden = false
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    previouslyFocused = document.activeElement as HTMLElement
    trapFocus(overlay)              // Tab / Shift+Tab を内部循環
    firstFocusable(overlay).focus()
}
export function closeModal(overlay: HTMLElement) {
    overlay.hidden = true
    releaseFocus()
    previouslyFocused?.focus()      // フォーカス復元
}
// Escape で閉じる(document keydown、開いているモーダルのみ)
```

- ゲーム操作のキーハンドラとの優先順位: **モーダル表示中はゲーム入力を無効**(modal.ts が open 中フラグを提供し、GameController がガード)。

### S4-3. フォーカスとキーボード

- `base.css` に統一フォーカスリング:

```css
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
```

- `user-select: none`(index.html:93-95)を body から外し、操作系要素(ボタン、ジョイスティック)にのみ適用。ヘルプ・ログ本文は選択可能に。
- Tab 順序の確認: プライマリバー → 地図 → ドロワートグルの自然順。

### S4-4. コントラストと文字サイズ

- グラス面 `--surface-glass` 0.85 化(S2)で 4.5:1 を確保。地図直上の白文字(状態チップ等)は `text-shadow: 0 1px 2px rgba(0,0,0,.6)` を標準化。
- 最小フォント11px(トークンで `--font-min: 11px`)。6-7px指定を全廃。
- axe DevTools でコントラスト違反0件を確認。

### S4-5. innerHTML 注入の排除

- `DebugManager.updateEventLog`(DebugManager.ts:461-471)のイベントログ生成を `createElement` + `textContent` に書き換え(formatJSON 側の escapeHtml は既存流用)。
- リポジトリ規約として ESLint に `no-unsanitized/property`(eslint-plugin-no-unsanitized)を導入し、innerHTML 代入を lint エラー化(既存の正当な使用は個別 disable + 理由コメント)。

### 受け入れ基準

- [ ] axe DevTools(自動検査)で Critical/Serious 違反0件
- [ ] キーボードのみで「プラン選択→開始→一時停止→ヘルプを開く→Escapeで閉じる」が完遂できる
- [ ] VoiceOver(iOS)でプライマリバーの各ボタンが意味のある名前で読み上げられる
- [ ] ESLint に no-unsanitized が入り CI でグリーン

---

## スプリント計画と成果指標

| スプリント | 期間 | 主対象 | 完了指標 |
|-----------|------|--------|---------|
| S1 | 3日 | トースト/ローディング/ボタン色 | 「固まった/壊れた感」ゼロ(スロットリング検証) |
| S2 | 4日 | CSS外部化+トークン+モバイル | インラインstyle 0件、44px保証、safe-area全数 |
| S3 | 5日 | 3層情報設計 | 初期パネル0枚、初見60秒タスク達成 |
| S4 | 4日 | アクセシビリティ | axe違反0件、キーボード完遂 |

**注意:** S2→S3 の順を守る(トークンなしでパネルを作り直すと二度手間)。S1 は独立。S4 は S3 の新DOMに対して実施。

## 付録A: aria-label 付与対象(全数)

`#controlsToggle`, `#mobileFlightPlanToggle`, `#mobileHomeButton`, `#debugToggleBtn`, `#helpButton`, `#helpModalClose`, `#mobileFlightPlanModalClose`(S3で廃止予定なら対象外), `#debugOverlayClose`, `#infoPanelToggle`(同), `#flightPlanToggle`(同), `#clearLog`, `#exportLog`, `#toggleLog`, ジョイスティック2種(`role="slider"` 相当の説明), プライマリバー新設ボタン一式。
