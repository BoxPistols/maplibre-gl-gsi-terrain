# 3D Flight Simulator - 技術仕様書

## 📋 目次

1. [概要](#概要)
2. [システムアーキテクチャ](#システムアーキテクチャ)
3. [モジュール詳細](#モジュール詳細)
4. [データ構造](#データ構造)
5. [API仕様](#api仕様)
6. [パフォーマンス仕様](#パフォーマンス仕様)
7. [セキュリティ](#セキュリティ)
8. [ブラウザ互換性](#ブラウザ互換性)

---

## 概要

### プロジェクト名

**MapLibre GL GSI Terrain - 3D Flight Simulator**

### バージョン

2.2.2

### 目的

日本の地理院地形データ（GSI DEM）を使用した、インタラクティブな3Dフライトシミュレーター。
教育、観光、ドローン点検計画のためのツール。

### 技術スタック

| カテゴリ           | 技術                    | バージョン |
| ------------------ | ----------------------- | ---------- |
| 地図ライブラリ     | MapLibre GL JS          | 5.0.0      |
| プログラミング言語 | TypeScript              | 5.7.2      |
| ビルドツール       | Vite                    | 3.2.11     |
| テストフレームワーク | Vitest                | 2.1.8      |
| E2Eテスト          | Playwright              | 1.49.1     |
| UIフレームワーク   | React (オプション)      | 18.x       |
| リンター           | ESLint                  | 9.32.0     |
| フォーマッター     | Prettier                | 3.6.2      |

---

## システムアーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                     User Interface                       │
│  (HTML5 + CSS3 + Glassmorphism Design)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              Application Layer (TypeScript)              │
│  ┌──────────────┬──────────────┬────────────────────┐  │
│  │ MapStyle     │ Flight       │ Game               │  │
│  │ Manager      │ Controller   │ Controller         │  │
│  ├──────────────┼──────────────┼────────────────────┤  │
│  │ Drone        │ Flight Data  │ UI Event           │  │
│  │ Model        │ Manager      │ Handlers           │  │
│  └──────────────┴──────────────┴────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│           MapLibre GL JS (Rendering Engine)              │
│  ┌──────────────┬──────────────┬────────────────────┐  │
│  │ Vector Tiles │ Raster Tiles │ 3D Terrain         │  │
│  │ Rendering    │ Rendering    │ (WebGL2)           │  │
│  └──────────────┴──────────────┴────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              Data Sources & APIs                         │
│  ┌──────────────┬──────────────┬────────────────────┐  │
│  │ GSI DEM PNG  │ GSI Photo    │ GSI Map Tiles      │  │
│  │ (Terrain)    │ (Satellite)  │ (Vector)           │  │
│  └──────────────┴──────────────┴────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### レイヤー構造

#### 1. プレゼンテーション層

- **HTML5**: セマンティックマークアップ
- **CSS3**: Glassmorphism、Grid Layout、Flexbox
- **イベントハンドリング**: DOM Event Listeners

#### 2. アプリケーション層

##### コアモジュール

- `MapStyleManager`: マップスタイル管理
- `FlightController`: フライト制御とアニメーション
- `DroneModel`: 3Dドローンモデルと物理演算
- `GameController`: 入力デバイス管理
- `FlightDataManager`: データIO管理

#### 3. レンダリング層

- **MapLibre GL JS**: WebGL2ベースのレンダリング
- **Custom Layer API**: カスタム3Dオブジェクト
- **Terrain Protocol**: GSI DEM処理

#### 4. データ層

- **地理院タイル API**: リアルタイムデータ取得
- **ローカルストレージ**: フライトプラン保存
- **IndexedDB**: (将来) 大規模データキャッシュ

---

## モジュール詳細

### 1. MapStyleManager

**ファイル**: `example/modules/MapStyleManager.ts`

**責務**: マップスタイルの管理と切り替え

#### プロパティ

```typescript
private map: Map
private currentStyleId: string
private styles: Map<string, MapStyle>
private terrainSource: any
```

#### 主要メソッド

| メソッド                | 引数                     | 戻り値 | 説明                           |
| ----------------------- | ------------------------ | ------ | ------------------------------ |
| `addStyle`              | `MapStyle`               | void   | 新しいスタイルを追加           |
| `switchStyle`           | `styleId: string`        | void   | スタイルを切り替え             |
| `setTerrainExaggeration`| `exaggeration: number`   | void   | 地形誇張度を変更               |
| `createStyleControl`    | -                        | HTMLElement | UIコントロールを生成      |

#### スタイル定義

```typescript
interface MapStyle {
	id: string // 一意識別子
	name: string // 表示名
	description: string // 説明
	thumbnail?: string // サムネイルURL（オプション）
	styleUrl?: string // Mapbox Style Spec URL
	styleObject?: any // Style Spec Object
}
```

#### プリセットスタイル

1. **satellite** - 衛星写真
   - ソース: `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg`
   - MaxZoom: 18
2. **standard** - 標準地図
   - ソース: `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`
3. **pale** - 淡色地図
4. **blank** - 白地図
5. **dark** - ダークモード
6. **relief** - 地形図

### 2. FlightController

**ファイル**: `example/modules/FlightController.ts`

**責務**: フライトプランの実行とカメラ制御

#### プロパティ

```typescript
private map: Map
private config: FlightControllerConfig
private flightLog: FlightLogEntry[]
private currentFlightPlan: FlightPlanPhase[]
private flightPlanActive: boolean
private currentFlightPhase: number
```

#### 主要メソッド

| メソッド           | 引数                     | 戻り値   | 説明                     |
| ------------------ | ------------------------ | -------- | ------------------------ |
| `setFlightPlan`    | `FlightPlanData`         | void     | フライトプランを設定     |
| `startFlightPlan`  | -                        | void     | フライト開始             |
| `pauseFlightPlan`  | -                        | void     | 一時停止                 |
| `resumeFlightPlan` | -                        | void     | 再開                     |
| `stopFlightPlan`   | -                        | void     | 停止                     |
| `flyToSmooth`      | `target, options`        | void     | 滑らかなカメラ移動       |
| `flyAlongPath`     | `waypoints, options`     | void     | パスに沿った移動         |
| `flyOrbit`         | `center, radius, options`| void     | 軌道飛行                 |

#### イージング関数

```typescript
export const easingFunctions = {
	linear: (t: number) => t,
	easeInQuad: (t: number) => t * t,
	easeOutQuad: (t: number) => t * (2 - t),
	easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
	easeInCubic: (t: number) => t * t * t,
	easeOutCubic: (t: number) => --t * t * t + 1,
	easeInOutCubic: (t: number) =>
		t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
	easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
	easeOutElastic: (t: number) => {
		const c4 = (2 * Math.PI) / 3
		return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
	},
}
```

### 3. DroneModel

**ファイル**: `example/modules/DroneModel.ts`

**責務**: 3Dドローンモデルと物理シミュレーション

#### 物理状態

```typescript
interface DronePhysicsState {
	position: [number, number, number] // [経度, 緯度, 高度]
	velocity: [number, number, number] // [x, y, z] m/s
	acceleration: [number, number, number] // [x, y, z] m/s²
	rotation: [number, number, number] // [roll, pitch, yaw] 度
	angularVelocity: [number, number, number] // 角速度 度/s
}
```

#### 物理パラメータ

- **空気抵抗係数**: 0.95
- **質量**: 1.0kg（仮定）
- **最大速度**: 20 m/s
- **最大角速度**: 180 度/s

#### 主要メソッド

| メソッド         | 引数                        | 戻り値              | 説明             |
| ---------------- | --------------------------- | ------------------- | ---------------- |
| `updatePosition` | `[lon, lat, alt]`           | void                | 位置更新         |
| `updateRotation` | `[roll, pitch, yaw]`        | void                | 回転更新         |
| `updatePhysics`  | `deltaTime: number`         | void                | 物理演算更新     |
| `applyForce`     | `[fx, fy, fz]`              | void                | 力を加える       |
| `applyTorque`    | `[tx, ty, tz]`              | void                | トルクを加える   |
| `getTrail`       | -                           | `[lon, lat, alt][]` | トレイル取得     |
| `toGeoJSON`      | -                           | `GeoJSON.Feature`   | GeoJSON変換      |

### 4. GameController

**ファイル**: `example/modules/GameController.ts`

**責務**: キーボード・ゲームパッド入力管理

#### キーボードマッピング

| キー            | アクション |
| --------------- | ---------- |
| W / ↑           | 前進       |
| S / ↓           | 後退       |
| A / ←           | 左移動     |
| D / →           | 右移動     |
| Space           | 上昇       |
| Shift           | 下降       |
| Q               | 左回転     |
| E               | 右回転     |
| Ctrl            | ターボ     |

#### ゲームパッドマッピング (Standard Gamepad)

| 入力            | アクション |
| --------------- | ---------- |
| 左スティックX   | 左右移動   |
| 左スティックY   | 前後移動   |
| 右スティックX   | 回転       |
| R2トリガー      | 上昇       |
| L2トリガー      | ターボ     |
| Aボタン         | 離陸       |
| Bボタン         | 着陸       |

#### パラメータ

```typescript
private readonly params = {
	moveSpeed: 0.0001, // 経度/緯度の移動速度
	altitudeSpeed: 2.0, // 高度変化速度 (m/s)
	rotationSpeed: 2.0, // 回転速度 (度/s)
	turboMultiplier: 2.0, // ターボ時の速度倍率
}
```

#### デッドゾーン処理

- **デッドゾーン閾値**: 0.15
- スティック入力の絶対値が0.15未満の場合は0として扱う

### 5. FlightDataManager

**ファイル**: `example/modules/FlightDataManager.ts`

**責務**: フライトデータのインポート/エクスポート

#### サポートフォーマット

| フォーマット | インポート | エクスポート | 説明                   |
| ------------ | ---------- | ------------ | ---------------------- |
| JSON         | ✅          | ✅            | フライトプラン標準形式 |
| CSV          | ✅          | ✅            | 表計算ソフト互換       |
| GPX          | ❌          | ✅            | GPS交換形式            |
| KML          | ❌          | ✅ (予定)    | Google Earth互換       |

#### 主要メソッド

| メソッド          | 引数               | 戻り値                    | 説明                 |
| ----------------- | ------------------ | ------------------------- | -------------------- |
| `exportToJSON`    | `FlightPlanData`   | void                      | JSON出力             |
| `exportToCSV`     | `FlightPlanData`   | void                      | CSV出力              |
| `exportToGPX`     | `FlightPlanData`   | void                      | GPX出力              |
| `importFromJSON`  | -                  | `Promise<FlightPlanData>` | JSONインポート       |
| `importFromCSV`   | -                  | `Promise<FlightPlanData>` | CSVインポート        |
| `validateFlightPlan` | `FlightPlanData` | `FlightPlanData`          | バリデーション       |
| `calculateStatistics` | `FlightPlanData` | `Statistics`             | 統計情報計算         |

---

## データ構造

### FlightPlanPhase

```typescript
interface FlightPlanPhase {
	phase: string // フェーズ名
	action: string // アクション説明
	duration: number // 継続時間（ミリ秒）
	position: [number, number, number] // [経度, 緯度, 高度(m)]
	pitch?: number // カメラピッチ角度（0-85度、デフォルト: 60）
	bearing?: number // カメラ方位角（0-360度、デフォルト: 0）
	zoom?: number // ズームレベル（1-22、デフォルト: 17）
}
```

#### バリデーションルール

- `phase`: 必須、非空文字列
- `action`: 必須、非空文字列
- `duration`: 必須、正の整数
- `position[0]` (経度): -180 ~ 180
- `position[1]` (緯度): -90 ~ 90
- `position[2]` (高度): 0 ~ 10000 (m)
- `pitch`: 0 ~ 85 (度)
- `bearing`: 0 ~ 360 (度)
- `zoom`: 1 ~ 22

### FlightPlanData

```typescript
interface FlightPlanData {
	name: string // フライトプラン名
	description: string // 説明
	created: string // 作成日時（ISO 8601形式）
	phases: FlightPlanPhase[] // フェーズ配列
	totalDuration: number // 総継続時間（ミリ秒）
}
```

### FlightLogEntry

```typescript
interface FlightLogEntry {
	timestamp: string // タイムスタンプ（HH:MM:SS形式）
	phase: string // フェーズ名
	action: string // アクション
	details: string // 詳細
	type: 'info' | 'success' | 'error' | 'warning' // ログタイプ
}
```

### MapStyle

```typescript
interface MapStyle {
	id: string // 一意ID
	name: string // 表示名
	description: string // 説明
	thumbnail?: string // サムネイルURL（オプション）
	styleUrl?: string // Mapbox Style Spec URL
	styleObject?: any // Style Spec Object
}
```

---

## API仕様

### 地理院タイル API

#### DEM（標高）タイル

```
URL: https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png
形式: PNG（RGB）
エンコーディング: Terrarium形式
  - 標高(m) = (R * 256 + G + B / 256) - 32768
最大ズームレベル: 17
タイルサイズ: 256x256
```

#### 写真タイル

```
URL: https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg
形式: JPEG
最大ズームレベル: 18
タイルサイズ: 256x256
```

#### 標準地図タイル

```
URL: https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
形式: PNG
最大ズームレベル: 18
タイルサイズ: 256x256
```

### カスタムプロトコル

#### gsidem://

GSI DEM PNGタイルを取得し、WebGL2でTerrarium形式に変換

```typescript
const protocolAction = getGsiDemProtocolAction('gsidem')
maplibregl.addProtocol('gsidem', protocolAction)

// 使用例
tiles: ['gsidem://https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png']
```

> **Note**: プロトコルハンドラはURL正規化による余分なスラッシュ（例: `https:///`）を自動的に修正します。

---

## パフォーマンス仕様

### 目標パフォーマンス

| 指標                | 目標値     | 測定方法              |
| ------------------- | ---------- | --------------------- |
| 初期ロード時間      | < 3秒      | DOMContentLoaded      |
| フレームレート      | 60 FPS     | requestAnimationFrame |
| メモリ使用量        | < 500MB    | Chrome DevTools       |
| タイル読み込み時間  | < 1秒      | Network Panel         |

### 最適化手法

#### 1. レンダリング最適化

- **レイヤーバッチング**: 同種のレイヤーをグループ化
- **カリング**: 視界外のオブジェクトを非表示
- **LOD**: ズームレベルに応じた詳細度調整

#### 2. データ最適化

- **タイルキャッシング**: Service Workerによるキャッシュ
- **データ圧縮**: GeoJSON → Protocol Buffers（検討中）
- **遅延読み込み**: 必要なタイルのみ読み込み

#### 3. コード最適化

- **Tree Shaking**: 未使用コードの削除
- **コード分割**: Dynamic import
- **バンドルサイズ削減**: < 1MB（gzip圧縮後）

---

## セキュリティ

### セキュリティ対策

#### 1. XSS対策

- **入力サニタイゼーション**: ユーザー入力のエスケープ
- **Content Security Policy**: CSPヘッダー設定
- **DOMPurify**: HTMLサニタイズ（検討中）

#### 2. CORS対策

- **地理院API**: CORS許可済み
- **ローカルファイル**: File API使用

#### 3. データ検証

- **フライトプラン**: スキーマバリデーション
- **座標範囲**: 範囲チェック
- **型安全性**: TypeScript型チェック

### セキュリティチェックリスト

- [x] XSS脆弱性チェック
- [x] CSRF対策（不要：外部API呼び出しなし）
- [x] 入力バリデーション
- [ ] CSPヘッダー設定（検討中）
- [ ] Subresource Integrity（検討中）

---

## ブラウザ互換性

### サポートブラウザ

| ブラウザ         | 最小バージョン | 動作確認済み |
| ---------------- | -------------- | ------------ |
| Chrome           | 90+            | ✅            |
| Firefox          | 88+            | ✅            |
| Safari           | 14+            | ⚠️ (一部制限) |
| Edge             | 90+            | ✅            |
| Opera            | 76+            | ✅            |

### 必須機能

- [x] WebGL2サポート
- [x] ES2020サポート
- [x] Gamepad API（オプション）
- [x] File API
- [x] Blob API
- [x] Canvas API

### ポリフィル

- **requestAnimationFrame**: 不要（モダンブラウザでサポート）
- **Promise**: 不要（ES6でネイティブサポート）
- **Fetch API**: 不要（MapLibre内部で使用）

---

## ビルド・デプロイ

### ビルドコマンド

```bash
# 開発サーバー起動
pnpm dev

# プロダクションビルド
pnpm build

# ライブラリビルド
pnpm build:lib

# テスト実行
pnpm test

# E2Eテスト
pnpm test:e2e

# リンター実行
pnpm lint

# フォーマッター実行
pnpm format
```

### 出力構成

```
dist/
├── terrain.js          # ライブラリ本体（UMD）
├── terrain.d.ts        # TypeScript型定義
└── terrain.js.map      # ソースマップ

demo/
├── index.html          # デモHTML
├── assets/
│   ├── index.[hash].js  # バンドルJS
│   └── index.[hash].css # バンドルCSS
```

### 環境変数

```bash
# 開発環境
NODE_ENV=development
VITE_API_URL=https://cyberjapandata.gsi.go.jp

# 本番環境
NODE_ENV=production
VITE_API_URL=https://cyberjapandata.gsi.go.jp
```

---

## テスト戦略

### ユニットテスト (Vitest)

- **カバレッジ目標**: 80%以上
- **対象**: 全モジュール
- **実行頻度**: 毎コミット

### E2Eテスト (Playwright)

- **対象シナリオ**:
  1. フライトプラン読み込み
  2. フライト実行
  3. マップスタイル切り替え
  4. 手動操作
  5. データエクスポート

### パフォーマンステスト

- **Lighthouse**: 定期実行
- **WebPageTest**: リリース前実行

---

## 今後の拡張予定

### Phase 2

- [ ] リアルタイムマルチプレイヤー
- [ ] VR/ARサポート
- [ ] 気象データ統合
- [ ] AI経路最適化

### Phase 3

- [ ] モバイルアプリ（React Native）
- [ ] オフラインモード
- [ ] クラウド同期
- [ ] コミュニティ共有機能

---

## ライセンス

MIT License

## 作成者

BoxPistols

## 更新履歴

| バージョン | 日付       | 変更内容                               |
| ---------- | ---------- | -------------------------------------- |
| 2.2.2      | 2025-01-15 | 3Dフライトシミュレーター機能追加       |
| 2.2.1      | 2024-12-01 | 地形誇張度調整機能追加                 |
| 2.2.0      | 2024-11-01 | MapLibre GL v5対応                     |
| 2.1.0      | 2024-10-01 | React対応                              |
| 2.0.0      | 2024-09-01 | 初版リリース                           |
