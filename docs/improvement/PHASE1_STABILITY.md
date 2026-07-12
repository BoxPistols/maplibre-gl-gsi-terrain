# Phase 1 詳細仕様: 安定化クイックウィン

**目的:** 「挙動が不安定」の体感を直接引き起こしている7件を、既存アーキテクチャを変えずに最小差分で修正する。
**期間目安:** 1週間(実装3日+検証2日)
**前提:** すべてのタスクは独立しており並行実施可能。ただし 1-1 と 1-2 は同じ関数群を触るため同一PRを推奨。

---

## 1-1. フライトプランタイマーの一元管理

**課題ID:** H1 / M4 **優先度:** 🔴 最高 **見積もり:** 0.5日

### 現状の問題

`example/index.ts:2771-2775` — フェーズ遷移の `setTimeout` がIDを保持していない:

```ts
// 現状(index.ts:2770-2775)
setTimeout(() => {
    currentFlightPhase++
    updateFlightLogDisplay()
    executeFlightPhase()
}, phase.duration)
```

- `pauseFlightPlan()`(:2795)は `flightPlanActive = false` にするのみ。**予約済みタイマーは発火し**、`currentFlightPhase++` 後に `executeFlightPhase()` → `!flightPlanActive` 判定で `completeFlightPlan()` に落ちる。つまり「一時停止」がフェーズを進めて完了扱いにする。
- 再開(Startボタン再クリック)は `currentFlightPhase = 0` にリセットして新チェーンを開始。旧チェーンの残タイマーと**並走**し、`map.flyTo` を奪い合う。
- フライトプラン `<select>` の change ハンドラ(:3198付近)は実行中でも `currentFlightPlan` を差し替え可能 → 配列長が変わり範囲外アクセス。

### 修正仕様

1. **タイマーIDをモジュール状態に追加:**

```ts
let flightPhaseTimer: ReturnType<typeof setTimeout> | null = null

const clearFlightPhaseTimer = () => {
    if (flightPhaseTimer !== null) {
        clearTimeout(flightPhaseTimer)
        flightPhaseTimer = null
    }
}
```

2. **`executeFlightPhase` の遷移予約を置き換え:**

```ts
flightPhaseTimer = setTimeout(() => {
    flightPhaseTimer = null
    if (!flightPlanActive) return // pause後の発火を無害化(二重ガード)
    currentFlightPhase++
    updateFlightLogDisplay()
    executeFlightPhase()
}, phase.duration)
```

3. **`pauseFlightPlan` の先頭で `clearFlightPhaseTimer()`。** これにより一時停止時に `currentFlightPhase` が保持される(真の pause/resume が可能になる)。

4. **`startFlightPlan` の再開セマンティクス:** 現在は Start 再クリックで先頭から。真の再開に変更する:

```ts
const startFlightPlan = () => {
    if (flightPlanActive) { /* 既存の警告 */ return }
    clearFlightPhaseTimer() // 保険
    stopDroneSimulation()   // 1-2 参照
    flightPlanActive = true
    // 再開: pause 位置から。完了済み/未開始ならリセット
    if (currentFlightPhase >= currentFlightPlan.length) currentFlightPhase = 0
    ...
    executeFlightPhase()
}
```

5. **`completeFlightPlan` でも `clearFlightPhaseTimer()` + `currentFlightPhase = 0`。**

6. **プラン切替のガード**(select change ハンドラ、:3198付近):

```ts
if (flightPlanActive) {
    clearFlightPhaseTimer()
    flightPlanActive = false
    addFlightLog('システム', 'フライトプラン', 'プラン切替のため飛行を停止しました', 'warning')
}
currentFlightPhase = 0
// その後にプラン差し替え
```

### 受け入れ基準

- [ ] pause → resume(Start)を10回繰り返しても、フライトログのフェーズ番号が単調増加し、重複・スキップがない
- [ ] pause 中に `currentFlightPhase` が進まない(pause 直後 5秒放置してフェーズ表示不変)
- [ ] 飛行中にプランを切り替えると安全に停止し、新プランは Start で先頭から始まる
- [ ] e2e: `flight-simulator.spec.ts` の pause/resume テストに「pause 後 duration+α 待ってもログにフェーズ進行が記録されない」アサーションを追加(Phase 4-3 の先行実施)

---

## 1-2. ランダムウォークシミュレーションの排他制御

**課題ID:** H2 **優先度:** 🔴 最高 **見積もり:** 0.25日

### 現状の問題

`example/index.ts:1737-1747` — `startSimulation` の1秒 `setInterval` が全 `type==='drone'` の座標をランダム摂動。停止条件は同ボタン再クリック(:1724)と `clearData` のみ。フライトプラン開始・ゲーム/タッチ操作開始では停止されず、**同一オブジェクトの座標を2系統が同時更新**する。

### 修正仕様

1. **停止処理を関数化**(現在はボタンハンドラ内にインライン):

```ts
const stopDroneSimulation = (reason?: string) => {
    if (droneSimulationInterval === null) return
    clearInterval(droneSimulationInterval)
    droneSimulationInterval = null
    const btn = document.getElementById('startSimulation')
    if (btn) btn.textContent = 'シミュレーション開始' // ボタン表示も同期
    if (reason) updateStatus(`シミュレーション停止(${reason})`)
}
```

2. **排他呼び出しを追加:**
   - `startFlightPlan()` 冒頭: `stopDroneSimulation('フライトプラン開始')`
   - ゲームコントロール有効化ハンドラ: `stopDroneSimulation('手動操作開始')`
   - タッチコントロール有効化: 同上
3. **逆方向の排他:** `startSimulation` ハンドラ冒頭に `if (flightPlanActive) { showToast('フライトプラン実行中はシミュレーションを開始できません', 'warning'); return }`

### 受け入れ基準

- [ ] シミュレーション実行中にフライトプランを開始してもドローンがジッターしない(目視+ログの座標が計画値と一致)
- [ ] フライトプラン実行中にシミュレーション開始ボタンを押すと警告トーストが出て開始されない
- [ ] シミュレーション停止時にボタンラベルが「シミュレーション開始」に戻る

---

## 1-3. localStorage の安全ラッパー導入

**課題ID:** H3 **優先度:** 🔴 最高 **見積もり:** 0.5日

### 現状の問題

- `example/index.ts:14` が import 直後に `loadProviderConfig()` を呼び、`map-provider.ts:81-82` が try/catch なしで `localStorage.getItem`。Safari プライベートモード・Cookie 無効・サンドボックス iframe では `SecurityError` throw → **バンドル全体が評価失敗し白画面**(グローバルエラーハンドラ設置前なので捕捉もされない)。
- 同様の無防備アクセス: `saveProviderConfig`(map-provider.ts:94-99)、パネル開閉状態(index.ts:3384, 3398, 3419, 3432, 3453, 3466)。

### 修正仕様

1. **`example/modules/safe-storage.ts` を新設:**

```ts
/** localStorage が使えない環境(Safariプライベート等)でも落ちないラッパー */
const memoryFallback = new Map<string, string>()

const storageAvailable = (() => {
    try {
        const k = '__storage_test__'
        localStorage.setItem(k, k)
        localStorage.removeItem(k)
        return true
    } catch {
        return false
    }
})()

export const safeStorage = {
    get(key: string): string | null {
        if (!storageAvailable) return memoryFallback.get(key) ?? null
        try { return localStorage.getItem(key) } catch { return null }
    },
    set(key: string, value: string): void {
        if (!storageAvailable) { memoryFallback.set(key, value); return }
        try { localStorage.setItem(key, value) } catch { /* quota等は黙殺 */ }
    },
    remove(key: string): void {
        if (!storageAvailable) { memoryFallback.delete(key); return }
        try { localStorage.removeItem(key) } catch { /* noop */ }
    },
}
```

2. **全直接アクセスを置換:** `map-provider.ts:81-82, 94-98` と index.ts の6箇所。`grep -n "localStorage" example/` が safe-storage.ts 以外で0件になること。

3. **`loadProviderConfig()` の呼び出し位置は変更不要**(ラッパーで throw しなくなるため)。ただし将来のため index.ts:14 の module-top-level 呼び出しに `// NOTE: safeStorage 経由のため例外安全` コメントは不要 — コードで保証する。

### 受け入れ基準

- [ ] `grep -rn "localStorage" example/ src/` のヒットが `safe-storage.ts` 内のみ
- [ ] Playwright で `page.addInitScript` により `localStorage` getter を throw させた状態でページを読み込み、地図が表示される(新規e2eケース)
- [ ] safe-storage.ts のユニットテスト(throw する Storage モックで get/set/remove が例外を出さない、メモリフォールバックが機能する)

---

## 1-4. map エラーハンドラの一本化とデバウンス

**課題ID:** M1(+LOW: グローバルハンドラのトースト洪水) **優先度:** 🟡 高 **見積もり:** 0.5日

### 現状の問題

- `index.ts:361-374` と `index.ts:3064` に `map.on('error')` が二重登録。全エラーで両方発火し、挙動が矛盾(前者はトースト表示、後者はタイルエラーを黙殺)。
- 一時的なタイル失敗が連発すると前者がトーストを**エラー件数分**生成。
- グローバル `error`/`unhandledrejection`(index.ts:119-140)も1エラー=1トーストで洪水になる。

### 修正仕様

1. **`map.on('error')` を1箇所に統合**(:361 側を残し :3064 を削除)。分類ロジックを統一:

```ts
const TILE_ERROR_PATTERN = /Failed to fetch|AJAXError|tile/i
let tileErrorCount = 0
let tileErrorToastTimer: ReturnType<typeof setTimeout> | null = null

map.on('error', e => {
    console.error('マップエラー:', e)
    const msg = e.error?.message || 'マップのロードに失敗しました'
    if (TILE_ERROR_PATTERN.test(msg)) {
        // 集約: 3秒窓でまとめて1トースト
        tileErrorCount++
        if (tileErrorToastTimer === null) {
            tileErrorToastTimer = setTimeout(() => {
                showErrorToast('タイル読み込みエラー', `${tileErrorCount}件のタイルが読み込めませんでした`, 'warning')
                updateStatus('警告: タイル読み込みエラー')
                tileErrorCount = 0
                tileErrorToastTimer = null
            }, 3000)
        }
        return
    }
    showErrorToast('エラーが発生しました', msg, 'error')
    updateStatus(`エラー: ${msg}`)
})
```

2. **グローバルハンドラにも同種集約を適用**(同一 `message` は10秒に1回まで表示。カウンタは Map<string, number> で保持し、トーストに「×N」を表示)。

3. `preventDefault()` の全吸収(:119-140)をやめ、**表示制御のみ**行う(エラー自体はコンソールに残す)。

### 受け入れ基準

- [ ] `grep -c "map.on('error'" example/index.ts` が 1
- [ ] ネットワークをオフラインにしてパンしても、トーストは3秒に1枚以下
- [ ] e2e 既存の「console error / network abort resilience」テストがグリーン

---

## 1-5. GameController の destroy() 追加

**課題ID:** M2 **優先度:** 🟡 高 **見積もり:** 0.5日

### 現状の問題

`GameController.ts:61-68` — `document` への keydown/keyup を `.bind(this)` の**新規参照**で登録するため removeEventListener 不能。`disable()`(:235)は interval を止めるだけでリスナーは残り、W/A/S/D/Space/Shift/Q/E/矢印の `preventDefault()`(:74-112)が**無効化後もページ全体で効き続ける**。

### 修正仕様

1. **bind 済み参照をフィールドに保持:**

```ts
private readonly boundKeyDown = this.handleKeyDown.bind(this)
private readonly boundKeyUp = this.handleKeyUp.bind(this)

private setupEventListeners(): void {
    document.addEventListener('keydown', this.boundKeyDown)
    document.addEventListener('keyup', this.boundKeyUp)
}

public destroy(): void {
    this.disable()
    document.removeEventListener('keydown', this.boundKeyDown)
    document.removeEventListener('keyup', this.boundKeyUp)
}
```

2. **`handleKeyDown` の先頭ガードを追加**(destroy まで待たなくても無効時は素通しにする):

```ts
private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled()) return               // 無効時は preventDefault しない
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return // 入力中は奪わない
    ...既存処理
}
```

   ※ `isEnabled()` が無ければ `private enabled: boolean` を enable/disable で更新して参照。

3. **呼び出し側(index.ts):** ゲームコントロール無効化ボタンで `gameController.disable()`(従来どおり)。`destroy()` はページ離脱時 `window.addEventListener('pagehide', ...)` で呼ぶ。TouchController にも同形の見直しを実施(リスナー登録箇所を確認し、同じ bound-reference パターンに統一)。

### 受け入れ基準

- [ ] ゲームコントロールを一度有効→無効化した後、ページのスクロール・`<input>` へのスペース/矢印入力が正常に機能する
- [ ] ゲームコントロール有効中でも Mapbox トークン入力欄(`#mapboxTokenInput`)にWASDが入力できる
- [ ] ユニットテスト: happy-dom 上で enable→disable 後に `document.dispatchEvent(new KeyboardEvent('keydown', {key:'w'}))` の `defaultPrevented` が false

---

## 1-6. ドラッグ編集の後始末保証

**課題ID:** M3 **優先度:** 🟡 中 **見積もり:** 0.25日

### 現状の問題

`index.ts:1483-1491` の `disableMapInteraction()`(dragPan/scrollZoom 等を無効化)に対し、復帰は `endDragObject`(:1549)のみで、条件 `isDragging && selectedObject` を要求。ドラッグ中に選択解除・オブジェクト削除・Escape が起きると**地図操作が無効のまま固まる**。

### 修正仕様

1. **後始末を無条件化:**

```ts
const endDragObject = () => {
    const wasDragging = isDragging
    isDragging = false
    dragStartPos = null
    enableMapInteraction() // 条件を問わず必ず復帰
    if (!wasDragging || !selectedObject) return
    ...既存の確定処理
}
```

2. **セーフティネット:** `map.on('mouseup')` / `map.on('touchend')` / Escape ハンドラ / `clearData` / 編集モードOFF の各経路で `endDragObject()` を呼ぶ(冪等なので多重呼び出し可)。
3. `enableMapInteraction()` 自体も冪等であることを確認(すでに有効な handler への `.enable()` は MapLibre では無害)。

### 受け入れ基準

- [ ] ドラッグ中に Delete でオブジェクト削除 → 地図がパン/ズーム可能
- [ ] ドラッグ中に Escape → 地図がパン/ズーム可能
- [ ] ドラッグ中に編集モードをOFF → 同上

---

## 1-7. 死んでいるDOMハンドラの整理

**課題ID:** H15 **優先度:** 🟡 中 **見積もり:** 0.5日(方針判断込み)

### 現状の問題

以下のIDは `index.html` に存在せず、`?.addEventListener` により**無警告で機能が死んでいる**:

| ID | 配線箇所 | 本来の機能 |
|----|---------|-----------|
| `#loadPoints` | index.ts:1609 | 3Dポイントサンプル読込 |
| `#loadMesh` | index.ts:1629 | メッシュサンプル読込 |
| `#loadBuilding` | index.ts:1649 | 建物点検サンプル読込 |
| `#importMission` | index.ts:2208 | ミッションJSONインポート |

### 修正仕様(推奨: 削除)

1. **推奨方針:** 4ハンドラと、そこからしか呼ばれない関数(サンプル生成等)を削除する。理由: (a) 現UIの「ドローン点検」「データ管理」セクションで代替機能が提供済み、(b) Phase 3 のパネル再構築で必要なら復活させる方が安全。
   - 削除対象は「そのハンドラからのみ到達可能なコード」に限定。`data-import-export.ts` 側の関数は他からも使われるため残す。
2. **DOM契約の検証ヘルパーを導入**(再発防止):

```ts
const byId = <T extends HTMLElement = HTMLElement>(id: string): T | null => {
    const el = document.getElementById(id) as T | null
    if (!el && import.meta.env.DEV) {
        console.warn(`[DOM] #${id} が index.html に存在しません(ハンドラは未配線)`)
    }
    return el
}
```

   以後の `getElementById(...)` を段階的に `byId(...)` へ置換(Phase 1 では新規/修正箇所のみで可)。

### 受け入れ基準

- [ ] `grep -n "loadPoints\|loadMesh\|loadBuilding\|importMission" example/index.ts` が0件(または対応するボタンが index.html に存在)
- [ ] DEVビルドで起動時に `[DOM]` 警告が0件
- [ ] `pnpm ci:check` グリーン

---

## Phase 1 全体の検証手順

```bash
pnpm ci:check                 # lint + type-check + format + unit
pnpm test:modules:ci          # GameController 追加テスト含む
pnpm dev                      # 手動シナリオ(下記)
pnpm test:e2e                 # 追加アサーション含む
```

手動シナリオ(リグレッションチェックリスト):
1. 起動 → 東京タワープラン開始 → pause → 5秒待機 → resume → 完走(ログのフェーズが1,2,3...と単調)
2. ドローン配置 → シミュレーション開始 → フライトプラン開始(シミュレーションが自動停止し、警告なくスムーズに飛行)
3. ゲームコントロール有効 → 無効 → ページスクロールとフォーム入力が正常
4. 編集モード → ドラッグ中に Escape → 地図操作が可能
5. Safari プライベートモード(または localStorage を潰した Playwright)で起動 → 地図表示

## PR 分割案

| PR | 内容 | サイズ感 |
|----|------|---------|
| PR-1 | 1-1 + 1-2(フライト制御の排他とタイマー) | ~150行 |
| PR-2 | 1-3(safeStorage)+ ユニットテスト | ~120行 |
| PR-3 | 1-4(エラーハンドラ統合) | ~80行 |
| PR-4 | 1-5 + 1-6(コントローラ/ドラッグ後始末)+ テスト | ~120行 |
| PR-5 | 1-7(死にハンドラ削除 + byId ヘルパー) | 削除中心 |
