# ドローン飛行シミュレーター - 開発者マニュアル

## 📋 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [セットアップ](#セットアップ)
3. [プロジェクト構造](#プロジェクト構造)
4. [主要コンポーネント](#主要コンポーネント)
5. [フライトプランシステム](#フライトプランシステム)
6. [カスタマイズガイド](#カスタマイズガイド)
7. [デプロイメント](#デプロイメント)
8. [トラブルシューティング](#トラブルシューティング)

---

## アーキテクチャ概要

### 🏗️ 技術スタック

- **フロントエンド**: TypeScript + Vite
- **地図ライブラリ**: MapLibre GL JS
- **地形データ**: 国土地理院 DEM (Terrarium形式)
- **スタイリング**: CSS-in-JS (inline styles)
- **ビルドツール**: Vite 5.x
- **型チェック**: TypeScript 5.x

### 📐 システムアーキテクチャ

```
┌─────────────────────────────────────────────┐
│           User Interface (HTML)             │
├─────────────────────────────────────────────┤
│          Application Logic (TS)             │
│  ┌──────────┬──────────┬──────────────┐    │
│  │ Flight   │ Drone    │ Map Style    │    │
│  │Controller│ Model    │ Manager      │    │
│  └──────────┴──────────┴──────────────┘    │
├─────────────────────────────────────────────┤
│         MapLibre GL JS (Rendering)          │
├─────────────────────────────────────────────┤
│    国土地理院 DEM / Tile Server              │
└─────────────────────────────────────────────┘
```

---

## セットアップ

### 🚀 クイックスタート

```bash
# リポジトリのクローン
git clone <repository-url>
cd maplibre-gl-gsi-terrain

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ブラウザで開く
# http://localhost:5173
```

### 📦 利用可能なスクリプト

```bash
# 開発サーバー
npm run dev

# プロダクションビルド
npm run build

# ビルドのプレビュー
npm run preview

# コードフォーマット
npm run format

# リント
npm run lint
npm run lint:fix

# テスト
npm run test
npm run test:e2e
```

---

## プロジェクト構造

```
maplibre-gl-gsi-terrain/
├── example/                    # メインアプリケーション
│   ├── index.html             # エントリーポイント (HTML)
│   ├── index.ts               # エントリーポイント (TypeScript)
│   ├── favicon.svg            # アプリアイコン
│   ├── modules/               # モジュール
│   │   ├── FlightController.ts    # フライト制御
│   │   ├── DroneModel.ts          # ドローンモデル
│   │   ├── MapStyleManager.ts     # 地図スタイル管理
│   │   ├── GameController.ts      # ゲームコントロール
│   │   ├── TouchController.ts     # タッチ操作
│   │   └── types.ts               # 型定義
│   └── data/                  # フライトプランデータ
│       ├── mt-fuji-flight-plan.json
│       ├── tokyo-skytree-flight-plan.json
│       └── kyoto-kinkakuji-flight-plan.json
├── src/                       # ライブラリソース
│   ├── terrain.ts             # 地形プロトコル
│   ├── worker.ts              # Webワーカー
│   └── data-import-export.ts  # データ処理
├── docs/                      # ドキュメント
│   ├── USER_MANUAL.md         # ユーザーマニュアル
│   └── DEVELOPER_MANUAL.md    # 開発者マニュアル
└── tests/                     # テスト
    └── e2e/                   # E2Eテスト
```

---

## 主要コンポーネント

### 🎮 FlightController

フライトプランの実行を管理するコアコンポーネント。

#### 主要メソッド

```typescript
class FlightController {
  // フライトプランを設定
  setFlightPlan(plan: FlightPlanData): void

  // フライトプランを開始
  startFlightPlan(): void

  // フライトプランを一時停止
  pauseFlightPlan(): void

  // フライトプランを再開
  resumeFlightPlan(): void

  // フライトプランを停止
  stopFlightPlan(): void

  // ログ更新コールバックを設定
  setLogUpdateCallback(callback: (log: FlightLogEntry[]) => void): void
}
```

#### 使用例

```typescript
// 初期化
const flightController = new FlightController(map)

// ログコールバックを設定
flightController.setLogUpdateCallback(log => {
  updateFlightLogDisplay()
})

// フライトプランを設定
flightController.setFlightPlan({
  name: 'テストフライト',
  description: 'テスト用のフライトプラン',
  phases: [/* phases */],
  created: new Date().toISOString(),
  totalDuration: 30000,
})

// 実行
flightController.startFlightPlan()
```

### 🗺️ Waypoint可視化システム

#### updateFlightPlanVisualization

フライトプランのウェイポイントとパスを地図上に可視化します。

```typescript
const updateFlightPlanVisualization = (flightPlan: FlightPlanPhase[]) => {
  // 型安全なヘルパー関数
  const setGeoJsonSourceData = (sourceId: string, features: GeoJSON.Feature[]) => {
    const source = map.getSource(sourceId)
    if (source?.type === 'geojson') {
      (source as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: features,
      })
    }
  }

  // ウェイポイント作成
  const waypointFeatures = flightPlan.map((phase, index) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [phase.position[0], phase.position[1]],
    },
    properties: {
      id: `waypoint-${index}`,
      name: `WP${index + 1}: ${phase.phase}`,
      // ...
    },
  }))

  // データを更新
  setGeoJsonSourceData('flight-plan-waypoints', waypointFeatures)
  setGeoJsonSourceData('flight-plan-path', [pathFeature])
}
```

### 📹 FPVカメラシステム

ドローンの目線でフライトを体験できるカメラシステム。

```typescript
const executeFlightPhase = () => {
  const phase = currentFlightPlan[currentFlightPhase]

  // 次のwaypointへの方位を計算
  let bearing = 0
  if (currentFlightPhase < currentFlightPlan.length - 1) {
    const nextPhase = currentFlightPlan[currentFlightPhase + 1]
    bearing = calculateBearing(
      [phase.position[0], phase.position[1]],
      [nextPhase.position[0], nextPhase.position[1]]
    )
  }

  // FPVカメラ設定
  map.flyTo({
    center: [drone.longitude, drone.latitude],
    zoom: phase.zoom ?? 18,
    pitch: phase.pitch ?? 70,  // ドローン視点
    bearing: bearing,           // 進行方向
    duration: phase.duration,
  })
}
```

---

## フライトプランシステム

### 📝 FlightPlanData型定義

```typescript
interface FlightPlanData {
  name: string                  // フライトプラン名
  description: string           // 説明
  created: string              // 作成日時 (ISO 8601)
  totalDuration: number        // 総所要時間 (ms)
  phases: FlightPlanPhase[]    // フェーズ配列
}

interface FlightPlanPhase {
  phase: string                 // フェーズ名 (例: "離陸", "旋回1")
  action: string                // アクション説明
  duration: number              // 所要時間 (ms)
  position: [number, number, number]  // [経度, 緯度, 高度]
  zoom?: number                 // ズームレベル (オプション)
  pitch?: number                // ピッチ角度 (オプション)
  bearing?: number              // 方位角度 (オプション)
}
```

### 🎯 新しいフライトプランの作成

#### 1. JSONファイルを作成

```json
{
  "name": "新しい場所のフライト",
  "description": "詳細な説明",
  "created": "2024-01-15T10:00:00Z",
  "totalDuration": 30000,
  "phases": [
    {
      "phase": "離陸",
      "action": "開始地点から離陸",
      "duration": 3000,
      "position": [経度, 緯度, 高度],
      "zoom": 17,
      "pitch": 60,
      "bearing": 0
    }
    // ... 他のフェーズ
  ]
}
```

#### 2. ファイルを配置

```bash
example/data/my-flight-plan.json
```

#### 3. ドロップダウンに追加

`example/index.ts` の `flightPlanSelect` イベントリスナーを編集:

```typescript
const fileMap: Record<string, string> = {
  'mt-fuji': './data/mt-fuji-flight-plan.json',
  'tokyo-skytree': './data/tokyo-skytree-flight-plan.json',
  'my-plan': './data/my-flight-plan.json',  // 追加
}
```

HTMLのドロップダウンにオプションを追加:

```html
<select id="flightPlanSelect">
  <option value="tokyo-tower">東京タワー</option>
  <option value="my-plan">マイフライトプラン</option>
</select>
```

---

## カスタマイズガイド

### 🎨 スタイルのカスタマイズ

#### ウェイポイントの色を変更

`example/index.html` の `setupLayers()` 内:

```typescript
map.addLayer({
  id: 'flight-plan-waypoints-layer',
  type: 'circle',
  source: 'flight-plan-waypoints',
  paint: {
    'circle-color': '#ff00ff',  // 色を変更
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      10, 8,   // サイズを変更
      18, 16,
    ],
    // ...
  },
})
```

#### フライトパスのスタイル

```typescript
map.addLayer({
  id: 'flight-plan-path-layer',
  type: 'line',
  source: 'flight-plan-path',
  paint: {
    'line-color': '#00ff00',     // 色を変更
    'line-width': 5,             // 太さを変更
    'line-opacity': 0.9,         // 透明度を変更
    'line-dasharray': [2, 2],   // 点線にする（オプション）
  },
})
```

### 🎯 カメラ動作のカスタマイズ

#### ピッチ角度の調整

```typescript
// example/index.ts の executeFlightPhase() 内
map.flyTo({
  center: [drone.longitude, drone.latitude],
  zoom: phase.zoom ?? 18,
  pitch: phase.pitch ?? 80,  // より急な角度（0-85の範囲）
  bearing: bearing,
  duration: phase.duration,
})
```

#### デフォルトのズームレベル

```typescript
const phase = currentFlightPlan[currentFlightPhase]

map.flyTo({
  center: [drone.longitude, drone.latitude],
  zoom: phase.zoom ?? 20,  // デフォルトのズームを変更
  // ...
})
```

### 📊 ログシステムのカスタマイズ

#### ログエントリの最大数

```typescript
// example/index.ts の addFlightLog() 内
if (flightLog.length > 100) {  // 最大数を変更
  flightLog = flightLog.slice(-50)  // 保持する数を変更
}
```

#### ログの色とスタイル

`example/index.html` の CSS:

```css
.log-entry-latest {
  background: rgba(34, 197, 94, 0.2);  /* 背景色 */
  border-left: 5px solid #22c55e;      /* ボーダー太さ */
}

.latest-indicator {
  color: #ff0000;  /* インジケーター色 */
}
```

---

## デプロイメント

### 🌐 Vercelへのデプロイ

```bash
# ビルド
npm run build

# Vercel CLIでデプロイ
vercel --prod
```

### 📦 静的ホスティング

```bash
# ビルド
npm run build

# demo/ディレクトリをホスティングサービスにアップロード
# - Netlify
# - GitHub Pages
# - Cloudflare Pages
```

### 🔧 環境変数

必要に応じて `.env` ファイルを作成:

```env
VITE_MAP_STYLE_URL=https://your-custom-style.com/style.json
VITE_TERRAIN_URL=https://your-terrain-server.com/tiles
```

---

## トラブルシューティング

### 🐛 よくある問題

#### ビルドエラー

**問題**: `npm run build` でエラーが発生

**解決方法**:
```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### 型エラー

**問題**: TypeScriptの型エラー

**解決方法**:
```bash
# 型定義を確認
npm run build  # tscが自動実行される

# 型定義ファイルを確認
cat example/modules/types.ts
```

#### 地図が表示されない

**問題**: 地図タイルが読み込まれない

**解決方法**:
1. ブラウザのコンソールでネットワークエラーを確認
2. 国土地理院のタイルサーバーが正常か確認
3. プロトコル設定を確認:

```typescript
const protocolAction = getGsiDemProtocolAction('gsidem')
maplibregl.addProtocol('gsidem', protocolAction)
```

### 🔍 デバッグテクニック

#### コンソールログの有効化

```typescript
// 詳細なログを出力
console.log('フライトプラン:', currentFlightPlan)
console.log('現在のフェーズ:', currentFlightPhase)
console.log('ドローン位置:', drone)
```

#### ソースマップ

開発モードではソースマップが有効になっています:

```bash
npm run dev
# ブラウザの開発者ツールで元のTypeScriptコードを確認可能
```

---

## API リファレンス

### 主要な関数

#### updateFlightPlanVisualization

フライトプランを地図上に可視化します。

```typescript
updateFlightPlanVisualization(flightPlan: FlightPlanPhase[]): void
```

**パラメータ**:
- `flightPlan`: フライトプランのフェーズ配列

**戻り値**: なし

#### calculateBearing

2点間の方位角を計算します。

```typescript
calculateBearing(
  start: [number, number],
  end: [number, number]
): number
```

**パラメータ**:
- `start`: 開始座標 [経度, 緯度]
- `end`: 終了座標 [経度, 緯度]

**戻り値**: 方位角（0-360度）

#### updateFlightLogDisplay

フライトログの表示を更新します。

```typescript
updateFlightLogDisplay(): void
```

**パラメータ**: なし

**戻り値**: なし

---

## コントリビューション

### 🤝 プルリクエスト

1. フォークを作成
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

### 📝 コーディング規約

- **TypeScript**: 厳密な型チェックを使用
- **フォーマット**: Prettier (自動フォーマット)
- **リント**: ESLint
- **コミットメッセージ**: 明確で説明的なメッセージ

---

## 📚 参考資料

- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js-docs/)
- [国土地理院 地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev/)

---

**Version**: 2.2.2
**Last Updated**: 2025-01-15

💻 Happy Coding!
