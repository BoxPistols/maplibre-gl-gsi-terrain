# 内部分析・改善提案・UI/UX改善プラン

**対象バージョン:** 2.2.2
**作成日:** 2026-07-10
**目的:** 「挙動が不安定」「UI/UXに改善の余地が多い」という課題に対し、コードベース全体の内部分析を行い、優先度付きの改善ロードマップを提示する。

---

## 実装状況（2026-07-11 更新）

Phase 1（安定化クイックウィン）と Phase 2 のライブラリ本体部分を実装・テスト済み。
ユニット/モジュールテスト68件・lint・type-check・デモビルドすべてグリーン。

**実装済み:**

| 課題 | 内容 | 対応 |
|------|------|------|
| H1/M4 | フライトプランタイマー多重実行 | `flightPhaseTimer` を保持し pause/停止/切替で `clearTimeout`。pause→再開が現在フェーズから継続。select 切替の TOCTOU も含めガード |
| H2 | ランダムウォークとの座標競合 | `stopDroneSimulation()` を開始側から呼び排他。実行中の開始をブロック |
| H3 | localStorage 起動時クラッシュ | `example/modules/safe-storage.ts`（メモリフォールバック付き）に集約。例外を投げる環境でも起動可 |
| H4 | Worker GPUテクスチャリーク | テクスチャを1枚だけ生成し `texImage2D` で再利用 |
| H5 | 非Error throw で永久ハング | どの throw でも必ずエラー応答を返す |
| H6 | fetch/Worker タイムアウトなし | リクエストごとにタイムアウト＋確実な後始末 |
| H7 | Worker死亡後に再生成されない | error イベントで自動再生成（サーキットブレーカー付き） |
| H8 | import時副作用（テスト不能） | Worker を初回利用時に遅延生成。maplibre-gl を型のみ import |
| H13(一部) | テストカバレッジ実質0% | terrain.ts に実テスト19件（worker.ts 100%）、GameController 5件、safe-storage 2件 |
| H15 | 存在しないIDへのハンドラ | `#loadPoints/#loadMesh/#loadBuilding/#importMission` と未使用 import を削除 |
| M1 | map.on('error') 二重登録 | 1つに統合＋タイルエラー集約、トースト洪水デバウンス |
| M2 | GameController キーリスナーリーク | `destroy()`＋enabledガード＋入力欄フォーカス保護 |
| M3 | ドラッグ編集で操作が固まる | 後始末を無条件・冪等化し削除/Escape/編集終了から呼ぶ |
| M8 | 同一URL同時リクエスト競合 | pendingRequests を採番IDキーに変更 |
| M9 | タイルホットパスの console.log | 削除 |
| — | husky v9 非推奨行 | pre-commit/pre-push から除去 |

**実装済み（追加分・UI刷新とマージ準備）:**

| 課題 | 内容 | 対応 |
|------|------|------|
| 3D CRUD | 標高/海抜/対地の3D高度モデル | `elevation.ts`（不変条件 asl=ground+agl・GSI DEM連携・テスト18件）。オブジェクト配置/ドラッグ/フライトプラン編集に統合 |
| PC最適化 | DJI Flight Hub 2 風プランエディタ | `PlanPanel.ts`＋`flight-plan-editor.ts`（WP CRUD・タイムライン・インライン高度編集・テスト計28件） |
| モバイル最適化 | iPhone 3Dゲーム風HUD | `MobileHud.ts`（テレメトリ/開始停止・44px・Safe Area・テスト7件） |
| デバイス判定統一 | PC/モバイルの明確な分岐 | `device-profile.ts`（単一判定源・テスト7件・`<html data-device>`） |
| デザイン基盤 | flight-ops デザイントークン | `tokens.css`＋`app.css`（z-index階層・ダーク配色・focus-visible・全要素translateZハック撤廃） |
| 型検査ギャップ | example が型未検査 | 新規モジュール用 `tsconfig.modules.json` を `type-check` に追加（CI で検査） |
| e2e ドリフト | 未提供UIを参照するテスト | マップスタイル切替系テストを skip 化（機能復活時に解除） |

**未実装（次段階）:** Phase 2-5（パッケージング/mapbox-gl依存整理）、2-6（data-import-export 移設・共通パーサ）、2-7（実装3系統の一本化・既存モジュールの型負債解消）、Phase 3 残り（パネル3層情報設計・アクセシビリティ全般）、Phase 4（e2e全面同期・CSP厳格化）、マップスタイル切替UIの復活。詳細は各フェーズ仕様書を参照。

---

## 目次

1. [エグゼクティブサマリー](#1-エグゼクティブサマリー)
2. [現状分析: アーキテクチャの実態](#2-現状分析-アーキテクチャの実態)
3. [挙動不安定の根本原因(安定性分析)](#3-挙動不安定の根本原因安定性分析)
4. [UI/UX 問題の分析](#4-uiux-問題の分析)
5. [テスト・ビルド・パッケージングの問題](#5-テストビルドパッケージングの問題)
6. [改善ロードマップ(フェーズ別)](#6-改善ロードマップフェーズ別)
7. [UI/UX 改善プラン詳細](#7-uiux-改善プラン詳細)
8. [課題一覧(全件・優先度付き)](#8-課題一覧全件優先度付き)

---

## 1. エグゼクティブサマリー

### 診断結果

「挙動が不安定」の原因は単一のバグではなく、**構造的な問題の積み重なり**である。特に影響が大きいのは以下の5点:

| # | 根本原因 | 症状 |
|---|---------|------|
| 1 | フライトプランのフェーズタイマー(`setTimeout`)のIDを保持しておらず、一時停止/再開のたびに**複数のタイマーループが並走**する | カメラが飛ぶ・二倍速になる・ドローンがジャンプする |
| 2 | `startSimulation` のランダムウォーク `setInterval` がフライトプラン実行中も止まらず、**同じドローン座標を2系統が同時に書き換える** | ドローンのジッター(小刻みな震え) |
| 3 | ライブラリ本体のWorkerに**GPUテクスチャリーク**・タイムアウトなし・Worker死亡後の復旧なしという欠陥があり、タイル取得が静かにハングする | 地形が読み込まれない・長時間使用で劣化 |
| 4 | `localStorage` へのアクセスがモジュールトップレベルで**無防備**(Safariプライベートモード等で起動時に全体クラッシュ) | 白画面・黒画面で何も起きない |
| 5 | **同一機能の実装が3系統併存**(index.ts / React版 / standalone HTML)し、modules/ のリファクタは未完のまま死にコード化。修正が一箇所に反映されず回帰が繰り返される | 直したはずのバグが再発する |

直近のコミット履歴(タイル取得エラー修正 → CSP修正 → ウェイポイント非表示修正 → 再修正…)は、この構造問題による「もぐら叩き」状態を裏付けている。

### 提案の骨子

- **Phase 1(即効・1週間目安):** 不安定さの直接原因4件を修正(タイマー管理、シミュレーション干渉、localStorage ガード、二重エラーハンドラ統一)。
- **Phase 2(基盤・2〜3週間目安):** ライブラリ本体の信頼性修正(Workerライフサイクル、タイムアウト、パッケージングバグ)+ 実装3系統の一本化。
- **Phase 3(UI/UX・2〜3週間目安):** 情報設計の再構築、モバイル操作性、アクセシビリティ、フィードバック(ローディング/トースト)の統一。
- **Phase 4(品質基盤・継続):** 実効性のあるテスト整備(現在カバレッジ実質0%)、CSS設計トークン化、CI強化。

---

## 2. 現状分析: アーキテクチャの実態

### 2.1 リポジトリの二重性格

このリポジトリは「GSI地形ライブラリ(npm パッケージ)」と「3Dフライトシミュレーター(デモアプリ)」の2つの顔を持つが、境界が崩壊している。

- **公開ライブラリの実体は `src/terrain.ts`(+ `src/worker.ts`)のみ。** `tsconfig.json` の `include` は `src/terrain.ts` だけ。
- **`src/data-import-export.ts`(2,207行)はライブラリではない。** ドローンミッション/点検データ処理のコードで、`example/` からしか import されていないのに `src/` に置かれている。しかも tsconfig の include 外のため **`pnpm type-check` で一切型チェックされていない**(ESLint のみ通過)。

### 2.2 同一アプリの3重実装

| 実装 | ファイル | 状態 |
|------|---------|------|
| 本体(モノリス) | `example/index.html`(2,790行) + `example/index.ts`(3,595行) | 実際に動いているアプリ。e2e テストの対象 |
| React 版 | `example/App.tsx` → `example/DroneDataSystem.tsx`(432行) | 並行再実装。地図中心もDEMデコードもタイルURLも本体と**異なる**。どこからも参照されない |
| スタンドアロン版 | `example/standalone-drone-system.html`(1,139行) | 3つ目のコピー。インラインJS |

`calculateBearing`、DEMデコード、フライトプラン実行ロジックがそれぞれ2〜3回書かれており、既にドリフトしている(index.ts は `tiles.gsj.jp`、React版は `cyberjapandata.gsi.go.jp/xyz/dem_png` を使用)。

### 2.3 modules/ は「未完のリファクタ」= 大部分が死にコード

`example/index.ts` は modules/ の6クラスを import・インスタンス化している(index.ts:3106-3140)が、実際のロジックは自前の複製を使っている:

- **FlightController:** `startFlightPlan`/`executeFlightPhase`/`pauseFlightPlan` 等の実行エンジン(約250行)は**一度も呼ばれない**。index.ts:2640-2793 に独自実装が存在し、ボタンはそちらに配線されている。使われているのは `setFlightPlan` とログコールバックのみ。
- **MapStyleManager:** `createStyleControl()` がコメントアウトされており(index.ts:3110-3111)、6種マップスタイル切替・誇張度スライダーの**UIは実アプリに存在しない**(READMEは「6種類のマップスタイル」を機能として謳っている)。
- **FlightDataManager(358行):** index.ts から一切 import されていない。ユニットテストからのみ到達可能。
- **DroneModel:** WebGLカスタムレイヤーは `onAdd`/`render` が空のスタブで、**3Dドローンモデルは実際には描画されていない**。物理演算も `applyForce` が呼ばれないため速度が常に0で「偶然動いている」状態。

**含意:** ドキュメント(TECHNICAL_SPECIFICATION.md / DEVELOPER_MANUAL.md)が説明するモジュールアーキテクチャは実態と乖離している。バンドル(2.8MB)にはこれらの死にコードがすべて含まれる。

### 2.4 グローバル可変状態

`loadedObjects`, `is3D`, `drawMode`, `editMode`, `selectedObject`, `isDragging`, `flightPlanActive`, `currentFlightPhase`, `droneSimulationInterval`, `gameControlActive` 等(index.ts:379-428)がモジュールレベルの `let` として約40個のイベントハンドラから直接書き換えられる。`flightPlanActive`/`currentFlightPhase` は FlightController 内にも重複して存在し、**状態のオーナーが不在**。

---

## 3. 挙動不安定の根本原因(安定性分析)

### 3.1 デモアプリ(即効性の高い修正対象)

#### 🔴 HIGH-A1: フライトプランのタイマー多重実行
`example/index.ts:2771` — 次フェーズを `setTimeout` で予約するがタイマーIDを保持しない。

- `pauseFlightPlan()`(:2795)は `flightPlanActive = false` にするだけでタイマーをキャンセルできない → 予約済みコールバックが発火し `currentFlightPhase++` → 「一時停止」のはずが状態が進む/完了扱いになる。
- 再開は Start ボタン再クリック(= `startFlightPlan()`)だが、これは `currentFlightPhase = 0` にリセットして**新しいタイマーチェーンを開始**する。停止しきれていない旧チェーンと並走し、`map.flyTo` とドローン座標を2系統が奪い合う。
- **修正:** タイマーIDを保持し pause/stop/プラン切替時に `clearTimeout`。実行中のプラン切替をガード(select の change ハンドラ index.ts:3198+ に `flightPlanActive` チェックがない)。

#### 🔴 HIGH-A2: ランダムウォークシミュレーションとの干渉
`example/index.ts:1737` — `startSimulation` の1秒 `setInterval` が全ドローンの座標をランダム摂動。フライトプラン開始・ゲーム操作開始で停止されず、スクリプト飛行と**同じ座標を同時に書き換える** → ジッター。停止条件は同ボタンの再トグルと `clearData` のみ。

#### 🔴 HIGH-A3: localStorage の無防備アクセスによる起動時全体クラッシュ
`example/index.ts:14` → `map-provider.ts:81-82` — モジュールトップレベル(エラーハンドラ設置前)で `localStorage.getItem` を try/catch なしで実行。Safari プライベートモード・Cookie無効・サンドボックス iframe では `SecurityError` が throw され**バンドル全体が起動不能(白画面)**。パネル開閉状態の読み書き(index.ts:3384, 3398, 3419, 3432, 3453, 3466)も同様に無防備。

#### 🟡 MED-A4: `map.on('error')` の二重登録
`index.ts:361` と `index.ts:3064` に挙動の異なるエラーハンドラが両方登録され、すべてのエラーで両方発火。一時的なタイル失敗でトーストがスパム的に出る。

#### 🟡 MED-A5: GameController のキーリスナーリーク
`GameController.ts:61-68` — `document` レベルの keydown/keyup を `.bind(this)` で登録し、`destroy()`/`removeEventListener` が存在しない。`disable()`(:235)後も W/A/S/D/矢印/Space 等の `preventDefault()` が**ページの寿命まで効き続け**、スクロールやフォーム入力を阻害する。

#### 🟡 MED-A6: NaN 座標がバリデーションを通過
`FlightDataManager.ts:249` — `parseFloat` に NaN ガードなし。`validateFlightPlan`(:201-213)の範囲チェックは NaN に対してすべて `false` になるため**不正データが合格**し、`map.flyTo({center:[NaN,NaN]})` で地図トランスフォームが壊れる。`src/data-import-export.ts` の各CSVパーサ(:225-228 ほか)も同様。

#### 🟡 MED-A7: ドラッグ編集で地図操作が無効のまま残留
`index.ts:1483-1491` — ドラッグ開始で dragPan/scrollZoom 等を無効化。復帰は `endDragObject`(:1549)のみで `isDragging && selectedObject` が条件。途中で選択解除・削除されると**地図操作が無効のまま固まる**。

### 3.2 ライブラリ本体(`src/terrain.ts` / `src/worker.ts`)

#### 🔴 HIGH-B1: GPUテクスチャリーク
`worker.ts:139` — タイルごとに `gl.createTexture()` を呼び、`deleteTexture` を一度もしない。パン/ズームを続けるとWorkerの単一GLコンテキスト上に**無制限にテクスチャが蓄積**。長時間セッションでの劣化・クラッシュの有力原因。

#### 🔴 HIGH-B2: リクエストの永久ハング(3経路)
1. Worker の catch は `error instanceof Error` のときだけ応答を返す(`worker.ts:161-163`)。文字列 throw・`DOMException`・GLコンテキストロストでは**応答が返らず** `pendingRequests`(`terrain.ts:49`)が永久に残る。
2. fetch にも Worker 往復にも**タイムアウトが一切ない**(`terrain.ts:9, 48-56`)。
3. Worker の `error` イベント後、**Worker を再生成しない**(`terrain.ts:77-83`)。以降の全タイルリクエストは死んだWorkerへ `postMessage` され、静かにハングする。

#### 🟡 MED-B3: 同一URL同時リクエストの競合
`pendingRequests` がURLキーのため、同じタイルの同時リクエストで先行エントリが上書きされ、先行 Promise が**永久未解決**になる(`terrain.ts:49`)。

#### 🟡 MED-B4: タイルフェッチのホットパスに console.log
`terrain.ts:8, 10, 178, 179` — **全タイル取得ごと**にログ出力。ライブラリとして出荷される場所でのコンソールスパム+性能低下。`data-import-export.ts` にも日本語 console.log が数百箇所。

#### 🟡 MED-B5: import 時副作用で SSR/テスト不能
`terrain.ts:86-88` — モジュールトップレベルで `Blob`/`Worker`/`URL.createObjectURL` を実行。import しただけでブラウザ専用APIが動くため Node/happy-dom で読み込めず、**terrain.test.ts が6行のダミーになっている根本原因**。遅延初期化(初回利用時に生成)へ変更すべき。

---

## 4. UI/UX 問題の分析

### 4.1 情報設計・視覚的階層

- **🔴 初期表示で3パネル同時オープン + フッターログ + 地図コントロールが競合。** 左ドロワーには6セクション約24ボタンが詰め込まれ、段階的開示(progressive disclosure)がない(index.html:1865-2084, 2091, 2121)。
- **🟡 ボタン色のセマンティクスが崩壊。** success/info/warning/error が「状態」でなく「なんとなくのトーン」で使われ、色が意味を伝えない(index.html:263-301)。
- **🟡 主要機能がハンバーガーの奥に隠れ、初回ペイントで何ができるアプリか分からない**(`#controls` は `left:-350px` で開始)。
- **🟡 ツールチップは800msホバー必須・タッチでは一切出ない**(index.html:2614)。「配置」「クリア」等の省略ラベルの説明手段がモバイルに存在しない。

### 4.2 モバイル操作性

- **🔴 タップターゲットがApple推奨44×44pt未満多数:** モーダル閉じるボタン32×32(index.html:1266-1273)、モバイルでボタン `min-height` が40→38→36pxへ縮む(:988, :1124, :1181)、デバッグ/ヘルプの閉じるは28-32px。
- **🟡 Safe Area 対応が部分的(CLAUDE.md の規約違反)。** `.footer` とモバイルFPモーダルには適用済みだが、**画面端に固定される全トグルボタン**(`.controls-toggle` :939、`.mobile-flight-plan-toggle`/`.mobile-home-button` :322/346)、ジョイスティック(:1074-1082)、TS注入トースト(index.ts:150-151, 246, 511-512)には未適用。ノッチ/ランドスケープで隠れる。
- **🟡 モバイル判定が3系統でズレる:** インラインスクリプトのUA正規表現+`innerWidth<=768`(index.html:20-23)、CSSの768px/480px、`(hover:none)`。狭いデスクトップウィンドウが「モバイル」判定される。
- **🟢 `viewport-fit=cover` と apple-mobile-web-app メタは設定済み**(index.html:7-10)。

### 4.3 アクセシビリティ(ほぼゼロ)

- **🔴 `aria-*`/`role`/`tabindex`/`alt` がリポジトリ全体で0件。** アイコンのみのボタン(ハンバーガー、ホーム、閉じる×、シェブロン)にアクセシブルネームがない。
- **🔴 モーダルに `role="dialog"`・フォーカストラップ・Escape クローズがない。** Escape は編集モード解除にしか使われていない(index.ts:3019-3023)。キーボードでモーダルを閉じられない。
- **🟡 フォーカススタイルが全く定義されていない**(`:hover` のみ)上、ゲーム操作が WASD/矢印を `preventDefault` で奪う。
- **🟡 コントラスト:** 半透明グラスパネル+地図背景で文字コントラストが不定。モバイルでログ文字が**6-7px**(index.html:1036, 1174)。

### 4.4 フィードバック(ローディング/エラー)

- **🟡 ローディング表示が「閉じているドロワーの中のテキスト」のみ。** スピナー/スケルトンがなく、タイル読み込みが遅いと黒画面のまま固まって見える(body 背景 #000、index.html:89)。
- **🟡 トースト実装が3系統**(index.ts:147-187, 243-268, 507-549)で位置・アニメーションが不統一、スタックせず重なる。致命的エラーはネイティブ `confirm()`(index.ts:3031)。

### 4.5 CSS品質・DOM結合

- **🔴 約1,700行のインラインCSSが index.html に埋め込まれ**、standalone/data-import-export の各HTMLも独自の `<style>` を持つ(単一ソースなし)。さらに inline `style=""` 属性と TS注入 `cssText` の3方式が混在。
- **🔴 存在しないIDへのハンドラ登録(サイレント死):** `#loadPoints`(index.ts:1609)、`#loadMesh`(:1629)、`#loadBuilding`(:1649)、`#importMission`(:2208)は index.html に存在せず、`?.` により**無警告で機能が死んでいる**。
- **🟡 z-index が 99999/10000/3000/2501/2100/2000/1800/1500/1100 のマジックナンバー階層**で、トースト(10000)とヘルプモーダル(10000)が衝突しうる。
- **🟡 デザイントークンなし**(CSS変数は `--app-height` 1個のみ)、`!important` 多用、ダークモード(`prefers-color-scheme`)なし。
- **🟡 モバイルフライトプラン用 `<select>` が2つ併存**し change リスナーで手動同期(index.ts:2042-2053) — プリセット追加時に3箇所の修正が必要。
- **🟡 innerHTML 直接代入がエスケープなし:** DebugManager のイベントログ(DebugManager.ts:461-471)とトースト(index.ts:164-168)は外部由来文字列の注入ベクタになりうる。

---

## 5. テスト・ビルド・パッケージングの問題

- **🔴 npm パッケージとして壊れている:** `package.json` の `main: ./dist/terrain.js` に対し、ビルドは**そのファイルを生成しない**(`tsconfig.json:16` が `emitDeclarationOnly: true`、`vite build` はデフォルト設定でデモをビルド)。`npm install` した利用者は型定義だけ入手し実行コードがない。
- **🔴 mapbox-gl が唯一の runtime dependency だが、ライブラリは一切使っていない。** 使用箇所はデモのみ。しかも `example/index.ts:7-9` が**静的 import** しているため、`map-provider.ts` の遅延 import が無効化され、**2つの完全なWebGL地図エンジンが1バンドル(2.8MB)に同梱**されている。ライセンス面でも mapbox-gl v2+ は非OSSであり、MapLibre プラグインの必須依存にするのは矛盾。→ devDependencies へ移動+動的 import 化。
- **🔴 テストカバレッジ実質0%:** `terrain.test.ts` は `1+1===2` の6行。`config.test.ts` は package.json の pnpm チェックのみ。2,207行の data-import-export.ts はテストゼロ。カバレッジレポートは全ファイル 0% Stmts。
- **🟡 e2e が実UIと乖離:** マップスタイル切替・誇張度スライダーのテストは、コメントアウトされた `createStyleControl()` が生成するはずの要素を対象にしており、**現状のアプリでは成立しない**(= e2e がCIで実行されていない疑い)。pause/resume テストはタイマー多重バグ(HIGH-A1)を検出できない書き方。
- **🟡 CSP(vercel.json)に `unsafe-eval`/`unsafe-inline` が広く許可**されており、インラインscript/style依存をやめれば厳格化できる。

---

## 6. 改善ロードマップ(フェーズ別)

> **📘 各フェーズの実装レベル詳細仕様(Before/Afterコード案・受け入れ基準・テスト方法・PR分割・見積もり)は以下を参照:**
>
> - [Phase 1 詳細: 安定化クイックウィン](./improvement/PHASE1_STABILITY.md)
> - [Phase 2 詳細: ライブラリ信頼性 + パッケージング + 実装一本化](./improvement/PHASE2_LIBRARY.md)
> - [Phase 3 詳細: UI/UX 改善(S1〜S4スプリント)](./improvement/PHASE3_UIUX.md)
> - [Phase 4 詳細: テスト・品質基盤](./improvement/PHASE4_QUALITY.md)

### Phase 1: 安定化クイックウィン(目安1週間・リスク低)

「挙動が不安定」の体感を直接改善する。既存構造のまま最小差分で修正可能。

| # | 作業 | 対象 |
|---|------|------|
| 1-1 | フェーズタイマーIDの保持と `clearTimeout`(pause/stop/プラン切替/開始時)。プラン切替を `flightPlanActive` 中はブロックまたは安全に停止→切替 | index.ts:2640-2795, 3198 |
| 1-2 | フライトプラン開始・ゲーム操作開始時に `droneSimulationInterval` を停止 | index.ts:1737, 2640 |
| 1-3 | `localStorage` アクセスを安全なヘルパー(`safeStorage.get/set`)に集約し try/catch | map-provider.ts:80-101, index.ts 6箇所 |
| 1-4 | `map.on('error')` ハンドラを1つに統合(タイルエラーはデバウンス+集約表示) | index.ts:361, 3064 |
| 1-5 | GameController に `destroy()` を追加し `disable()` から呼ぶ | GameController.ts:61-68, 235 |
| 1-6 | ドラッグ編集の後始末を `finally` 相当に(選択解除・削除時も `enableMapInteraction`) | index.ts:1483-1549 |
| 1-7 | 存在しないID(`#loadPoints` 等4件)のハンドラを削除、またはボタンを復活(要判断) | index.ts:1609-1649, 2208 |

**受け入れ基準:** pause→resume を10回繰り返してもフェーズ進行が単調であること。シミュレーション中にフライトプラン開始してもジッターが出ないこと。Safari プライベートモードで起動すること。

### Phase 2: ライブラリ信頼性 + 実装一本化(目安2〜3週間)

| # | 作業 | 対象 |
|---|------|------|
| 2-1 | Worker: テクスチャ/リソースの解放(または1テクスチャの再利用)、非Error throw でも必ずエラー応答、`postMessage` に transfer list | worker.ts:139, 159, 161-163 |
| 2-2 | WorkerProtocol: リクエストタイムアウト(例10s)、URLキー競合の解消(リクエストID採番 or 同URL Promise 共有)、Worker死亡時の自動再生成 | terrain.ts:9, 48-56, 77-83 |
| 2-3 | import 時副作用の除去(Worker生成を初回利用時に遅延)→ ユニットテスト可能に | terrain.ts:86-88 |
| 2-4 | ホットパスの console.log 削除(必要なら debug オプション化) | terrain.ts:8-10, 178-179 |
| 2-5 | パッケージング修正: vite にライブラリモード設定を追加し `dist/terrain.js` を実際に生成。`mapbox-gl` を devDependencies へ移動し、example の静的 import を動的 import へ | package.json, vite.config.ts, example/index.ts:7-9 |
| 2-6 | `src/data-import-export.ts` を `example/` 配下へ移動し型チェック対象に。CSVパーサ6本を共通パーサ(引用符対応+NaNガード)に統合 | src/data-import-export.ts |
| 2-7 | **実装の一本化:** React版(DroneDataSystem.tsx)と standalone HTML を削除 or `examples/legacy/` へ隔離。modules/ は「採用して index.ts の重複を削除」か「削除」のどちらかに決める(推奨: FlightController/FlightDataManager を採用し index.ts の重複実装を削除) | example/ 全体 |

**受け入れ基準:** `npm pack` した tarball を別プロジェクトで import して動作すること。デモバンドルが 1.5MB 以下(mapbox-gl 遅延化で達成見込み)。terrain.ts のユニットテストが書ける状態になること。

### Phase 3: UI/UX 改善(目安2〜3週間) — 詳細は §7

| # | 作業 |
|---|------|
| 3-1 | CSSの外部ファイル化+デザイントークン導入(色/間隔/z-index/ブレークポイント) |
| 3-2 | 初期表示の整理: パネルはデフォルト1枚まで、ローディングオーバーレイ追加 |
| 3-3 | トースト実装を1つに統合(スタック対応・safe-area対応・ARIA live region) |
| 3-4 | タップターゲット44px保証、固定要素への safe-area-inset 適用 |
| 3-5 | アクセシビリティ基礎: aria-label、role="dialog"、Escapeクローズ、フォーカストラップ、`:focus-visible` |
| 3-6 | コントロールパネルの情報設計再構築(基本操作/データ/上級の3層化) |
| 3-7 | 言語の統一(UIは日本語に統一、デバッグパネルも含む)or 簡易i18n |

### Phase 4: 品質基盤(継続)

| # | 作業 |
|---|------|
| 4-1 | terrain.ts/WorkerProtocol のユニットテスト(タイムアウト、abort、エラー伝播、URL正規化) |
| 4-2 | CSVパーサ・バリデーション(NaN含む)のテスト |
| 4-3 | e2e を実UIと同期(スタイル切替テストの修正 or 機能復活)、pause/resume の多重タイマー検出アサーション追加 |
| 4-4 | CI で e2e 実行+カバレッジ閾値設定(まず lines 40% → 60%) |
| 4-5 | CSP の厳格化(unsafe-inline/unsafe-eval の削減 — インラインstyle/script撤去後) |
| 4-6 | docs(TECHNICAL_SPECIFICATION / DEVELOPER_MANUAL)を実態に同期 |

### 依存関係

```
Phase 1(独立・即着手可)
Phase 2-3(console.log除去)・2-4 は独立・即着手可
Phase 2-7(一本化)→ Phase 3-6(パネル再構築)の前提
Phase 2-3(副作用除去)→ Phase 4-1(ライブラリテスト)の前提
Phase 3-1(CSS外部化)→ Phase 4-5(CSP厳格化)の前提
```

---

## 7. UI/UX 改善プラン詳細

### 7.1 情報設計の再構築(3層モデル)

現状の「6セクション24ボタンのドロワー+常時3パネル」を、利用頻度で3層に再編する:

1. **常時表示(地図上):** 開始/一時停止、フライトプラン選択、2D/3D切替、現在状態(ステータスチップ)。→ 現在ドロワーの奥にある主要導線を地図上のプライマリバーへ昇格。
2. **ドロワー(オンデマンド):** データ管理(インポート/エクスポート)、描画・編集モード、マッププロバイダー設定。カテゴリは「飛行」「データ」「設定」の3タブに整理。
3. **上級/開発者:** デバッグオーバーレイ、ログエクスポート。デフォルト非表示(現状どおり)だが言語を日本語に統一。

**ボタン色ルールの再定義:** primary(青)=主要アクション、neutral=通常、danger(赤)=破壊的操作のみ。success/warning の乱用をやめ、色数を減らす。

### 7.2 モバイル

- すべてのインタラクティブ要素に `min-width/height: 44px`(視覚サイズが小さくても擬似要素でヒットエリア拡張)。
- 画面端固定要素(トグルボタン群・ジョイスティック・トースト)に `env(safe-area-inset-*)` を適用(CLAUDE.md 準拠)。
- モバイル判定を1箇所のユーティリティ(`matchMedia('(hover: none) and (pointer: coarse)')` ベース)に統一。
- ジョイスティックのリング/ノブ比を維持したままリング120px・ノブ48px以上に。フッターログとの重なりを解消。
- ツールチップ代替: タッチではボタン長押しでラベル表示、または初回起動時の簡易コーチマーク。

### 7.3 フィードバック

- **ローディング:** 地図初期化〜スタイル load までフルスクリーンのローディングオーバーレイ(ロゴ+スピナー+段階メッセージ)。タイル読み込み中はステータスチップで表示。
- **トースト統一:** 単一の `toast(type, title, message)` API。右上スタック、同種エラーは集約(「タイル読み込み失敗 ×12」)、`role="status"`/`aria-live="polite"`、safe-area 対応、モーダルより下の z-index。
- **致命的エラー:** `confirm()` をやめ、アプリ内のエラーパネル(再読み込みボタン付き)に。

### 7.4 アクセシビリティ(WCAG 2.1 AA 最低ライン)

| 項目 | 対応 |
|------|------|
| アイコンボタン | `aria-label` 付与(ハンバーガー「メニューを開く」等) |
| モーダル | `role="dialog"` `aria-modal="true"`、フォーカストラップ、Escape で閉じる、開閉時のフォーカス移動/復元 |
| フォーカス | 全インタラクティブ要素に `:focus-visible` スタイル |
| キーボード衝突 | ゲーム操作の preventDefault は有効時のみ+入力フィールドフォーカス中は無効 |
| コントラスト | グラスパネルの不透明度を上げる(0.85+)か文字に影/縁取り。最小フォント 11px(6-7px のログ文字を廃止) |
| ライブ情報 | フライトステータス/ログに `aria-live` |

### 7.5 CSS アーキテクチャ

```
example/styles/
  tokens.css      … 色・間隔・radius・z-index階層(--z-map/-panel/-overlay/-modal/-toast)・ブレークポイント
  base.css        … リセット、タイポグラフィ、フォーカス
  components.css  … ボタン、パネル(グラス)、モーダル、トースト、ジョイスティック
  layout.css      … ドロワー、フッター、レスポンシブ
```

- インライン `<style>` 1,700行と inline `style=""` 属性、TS注入 `cssText` をすべて上記へ移行。
- z-index はトークンのみ使用(マジックナンバー禁止)。
- `prefers-color-scheme: dark` 対応(グラスパネルの暗色バリアント)。
- モバイルの全要素 `translateZ(0)` ハック(index.html:900-904)は削除し、必要なレイヤーのみ `will-change` 指定。

### 7.6 段階的実施(UI/UXスプリント案)

| スプリント | 内容 | ユーザー体感 |
|-----------|------|-------------|
| S1 | トースト統一+ローディングオーバーレイ+ボタン色ルール | 「固まった/壊れた感」の解消 |
| S2 | CSS外部化+トークン+safe-area+44pxターゲット | モバイルでの操作ミス減 |
| S3 | パネル3層化+プライマリバー | 初見で使い方が分かる |
| S4 | アクセシビリティ(dialog/フォーカス/aria) | キーボード・SR利用可能に |

---

## 8. 課題一覧(全件・優先度付き)

### 🔴 HIGH(15件)

| ID | 課題 | 場所 | Phase |
|----|------|------|-------|
| H1 | フライトプランタイマー多重実行(pause/resume 破綻) | index.ts:2771, 2795 | 1 |
| H2 | ランダムウォークとフライトプランの座標競合 | index.ts:1737 | 1 |
| H3 | localStorage 無防備アクセスで起動クラッシュ | map-provider.ts:81, index.ts:14 | 1 |
| H4 | Worker GPUテクスチャリーク | worker.ts:139 | 2 |
| H5 | 非Error throw でリクエスト永久ハング | worker.ts:161-163 | 2 |
| H6 | fetch/Worker タイムアウトなし | terrain.ts:9, 48 | 2 |
| H7 | Worker死亡後に再生成されない | terrain.ts:77-83 | 2 |
| H8 | import時副作用(SSR/テスト不能) | terrain.ts:86-88 | 2 |
| H9 | mapbox-gl が未使用の runtime dependency | package.json:62 | 2 |
| H10 | 地図エンジン2つを同梱(バンドル2.8MB) | index.ts:7-9 | 2 |
| H11 | `dist/terrain.js`(package main)が生成されない | tsconfig.json:16, vite.config.ts | 2 |
| H12 | 実装3系統の併存+modules/ 死にコード | example/ 全体 | 2 |
| H13 | テストカバレッジ実質0% | terrain.test.ts ほか | 4 |
| H14 | アクセシビリティゼロ(aria/dialog/フォーカス) | index.html 全体 | 3 |
| H15 | 存在しないIDへのハンドラ(機能がサイレント死) | index.ts:1609-1649, 2208 | 1 |

### 🟡 MEDIUM(主要18件)

| ID | 課題 | 場所 | Phase |
|----|------|------|-------|
| M1 | map.on('error') 二重登録+トーストスパム | index.ts:361, 3064 | 1 |
| M2 | GameController キーリスナーリーク | GameController.ts:61-68 | 1 |
| M3 | ドラッグ編集で地図操作が無効のまま残留 | index.ts:1483-1549 | 1 |
| M4 | 実行中のフライトプラン切替が無ガード | index.ts:3198 | 1 |
| M5 | NaN がバリデーション通過 → flyTo 破壊 | FlightDataManager.ts:249, data-import-export.ts:225 | 2 |
| M6 | CSV 引用符の出力/入力不整合(往復でデータ破損) | data-import-export.ts:1295 vs 222 | 2 |
| M7 | KML/XML エクスポートのエスケープなし | data-import-export.ts:1819, 1842 | 2 |
| M8 | 同一URL同時リクエスト競合 | terrain.ts:49 | 2 |
| M9 | タイルホットパスの console.log | terrain.ts:8-10, 178 | 2 |
| M10 | data-import-export.ts が型チェック対象外 | tsconfig.json:23 | 2 |
| M11 | src/data-import-export.ts の配置違反(2,207行) | src/ | 2 |
| M12 | タップターゲット44px未満多数 | index.html:988, 1124, 1266 | 3 |
| M13 | safe-area 未適用の固定要素(CLAUDE.md違反) | index.html:322, 346, 939, 1074 | 3 |
| M14 | トースト3実装・スタックなし | index.ts:147, 243, 507 | 3 |
| M15 | ローディング表示なし(黒画面に見える) | index.html:89, 2086 | 3 |
| M16 | z-index マジックナンバー階層 | index.html 各所 | 3 |
| M17 | innerHTML 無エスケープ注入(デバッグログ/トースト) | DebugManager.ts:461, index.ts:164 | 3 |
| M18 | e2e が実UIと乖離(スタイル切替テスト等) | tests/e2e/flight-simulator.spec.ts | 4 |

### 🟢 LOW(代表)

- グローバル error ハンドラの preventDefault 全吸収+トースト洪水(index.ts:119-140)→ Phase 1 で集約
- `Math.max(...spread)` のスタックオーバーフローリスク(data-import-export.ts:427)
- `processLargeDataset` の無意味な async(:2196)
- モバイル全要素 `translateZ(0)` ハック(index.html:900-904)
- `user-select:none` がヘルプ/ログ文面まで選択不可に(index.html:93-95)
- objectURL 未 revoke、abort ハンドラの上書き(terrain.ts:87, 52)

---

## 付録: 検証コマンド

```bash
pnpm ci:check      # lint + type-check + format + unit
pnpm test:modules  # modules/ ユニットテスト
pnpm test:e2e      # Playwright e2e(dev サーバー起動が前提)
pnpm build && pnpm build:example
```

> 注意: 本ドキュメントの行番号は 2026-07-10 時点の `main`(03194cb)基準。
