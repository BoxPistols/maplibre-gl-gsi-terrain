![GitHub Release](https://badge.fury.io/js/maplibre-gl-gsi-terrain.svg) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/mug-jp/maplibre-gl-gsi-terrain/test.yml?label=test) [![codecov](https://codecov.io/gh/mug-jp/maplibre-gl-gsi-terrain/graph/badge.svg?token=U9WGZANPZ9)](https://codecov.io/gh/mug-jp/maplibre-gl-gsi-terrain)

# 🚁 3D Flight Simulator - MapLibre GL JS + GSI Terrain

![](./screenshot.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-5.13-green)](https://maplibre.org/)

## 概要

MapLibre GL JS と日本の地理院地形データを使用した、インタラクティブな **3D フライトシミュレーター**。教育、観光、ドローン点検計画のための高度なツールです。

## 📚 ドキュメント

- 📖 **[ユーザーマニュアル](./docs/USER_MANUAL.md)** - 基本操作、フライトプラン、トラブルシューティング
- 💻 **[開発者マニュアル](./docs/DEVELOPER_MANUAL.md)** - アーキテクチャ、API、カスタマイズ方法

### ✨ 最新の機能

- 🗺️ **6種類のマップスタイル** - 衛星写真、標準地図、淡色、白地図、ダーク、地形図
- ✈️ **4つのプリセットフライトプラン** - 東京タワー、富士山、スカイツリー、金閣寺
- 🎮 **ゲームパッド対応** - キーボード・ゲームパッドによる手動操作
- 📊 **高度なアニメーション** - 滑らかなイージング関数と物理演算
- 📁 **多様なデータフォーマット** - JSON、CSV、GPX形式のインポート/エクスポート

## 主な機能

### 🗺️ マップスタイル

- **衛星写真** - 高解像度の衛星画像（GSI Seamless Photo）
- **標準地図** - 詳細な地図情報（GSI Standard Map）
- **淡色地図** - シンプルで見やすいスタイル
- **白地図** - 注記のないクリーンなベースマップ
- **ダークモード** - 目に優しいダークテーマ
- **地形図** - 等高線と陰影を含む詳細地形
- **地形誇張度調整** - 1.0〜3.0倍のリアルタイム調整スライダー

### ✈️ フライトプラン管理

-   **プリセットフライトプラン**
    - 東京タワー点検（11フェーズ、39秒）
    - 富士山周遊（13フェーズ、60秒）
    - 東京スカイツリー点検（12フェーズ、48秒）
    - 京都金閣寺周遊（12フェーズ、42秒）
-   **カスタムフライトプラン**
    - JSON/CSV形式でのインポート/エクスポート
    - GPX形式でのエクスポート（GPS互換）
-   **リアルタイム実行**: フライトプランの段階的実行とリアルタイムログ
-   **一時停止/再開**: 実行中のフライトプランの制御

### 🎮 手動操作

**キーボード操作:**
- `W` / `↑` - 前進
- `S` / `↓` - 後退
- `A` / `←` - 左移動
- `D` / `→` - 右移動
- `Space` - 上昇
- `Shift` - 下降
- `Q` - 左回転
- `E` - 右回転
- `Ctrl` - ターボ

**ゲームパッド対応:**
- 左スティック - 移動
- 右スティック - 回転
- R2トリガー - 上昇
- L2トリガー - ターボ
- Aボタン - 離陸
- Bボタン - 着陸

### 🎨 高度なアニメーション

- **イージング関数** - Linear, Quad, Cubic, Sine, Elastic
- **カメラ制御** - 滑らかなピッチ/ベアリング/ズーム
- **パスアニメーション** - ウェイポイントに沿った移動
- **軌道飛行** - 円形パスでの周回飛行

### 📊 3D データ可視化

-   **地理院地形**: 高精度な日本の地形データを 3D 表示
-   **3D ポイント**: 点検ポイントの 3D 表示
-   **メッシュデータ**: 建物や構造物の 3D メッシュ表示
-   **ウェイポイント**: ドローンの飛行経路表示

### 📁 データ管理

-   **CSV/GeoJSON 対応**: 複数のデータ形式でのインポート・エクスポート
-   **統一フライトデータ**: 標準化されたフライトデータ形式
-   **軌跡データ**: 時系列でのドローン軌跡管理

### 🎮 インタラクティブ機能

-   **ドローン配置**: マップ上でのドローン配置
-   **オブジェクト編集**: ドラッグ&ドロップでのオブジェクト移動
-   **多角形描画**: 点検エリアの描画機能
-   **2D/3D 切り替え**: 表示モードの切り替え

## クイックスタート

### 1. プロジェクトのセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-repo/maplibre-gl-gsi-terrain.git
cd maplibre-gl-gsi-terrain

# 依存関係をインストール
npm install
# または
pnpm install
```

### 2. 開発サーバーの起動

```bash
# 開発サーバーを起動
npm run dev
# または
pnpm dev
```

ブラウザで `http://localhost:5173` にアクセスしてください。

### 3. Vercel デプロイ

```bash
# ビルド
npm run build:example

# Vercelにデプロイ
npx vercel
```

## 使用方法

### フライトプランの実行

1. **フライトプランの読み込み**

    - 「インポート」ボタンで JSON ファイルを選択
    - またはデフォルトの東京タワーフライトプランを使用

2. **フライトプランの開始**

    - 「開始」ボタンをクリック
    - ドローンが自動的にフライトプランを実行

3. **リアルタイムログの確認**
    - 画面下部のログパネルで実行状況を確認
    - 各フェーズの進行状況がリアルタイムで表示

### データのインポート/エクスポート

#### サポートされているデータ形式

-   **3D ポイントデータ**: CSV 形式（経度,緯度,高度,名前,タイプ）
-   **メッシュデータ**: CSV 形式（頂点座標と面情報）
-   **ウェイポイント**: CSV 形式（経度,緯度,高度,名前）
-   **フライトプラン**: JSON 形式（フェーズ情報）
-   **統一フライトデータ**: CSV/GeoJSON 形式
-   **軌跡データ**: CSV/GeoJSON 形式（時系列データ）

#### インポート手順

1. **CSV/GeoJSON ファイルのインポート**

    - 「CSV 入力」または「GeoJSON 入力」ボタンをクリック
    - ファイルを選択してアップロード

2. **フライトプランのインポート**

    - 「インポート」ボタンをクリック
    - JSON ファイルを選択

3. **サンプルデータの読み込み**
    - 各セクションの「サンプル」ボタンをクリック
    - 1 クリックでサンプルデータを読み込み

#### エクスポート手順

1. **データのエクスポート**

    - 「CSV 出力」または「GeoJSON 出力」ボタンをクリック
    - ファイルが自動的にダウンロード

2. **フライトプランのエクスポート**
    - 「エクスポート」ボタンをクリック
    - 現在のフライトプランが JSON 形式でダウンロード

## サンプルデータ

### 利用可能なサンプルデータ

#### フライトプラン

-   **東京タワー点検フライトプラン** (デフォルト)

#### 3D データ

-   **3D ポイントデータ**: 各地点の点検ポイント
-   **メッシュデータ**: 建物や構造物の 3D モデル
-   **ウェイポイント**: ドローンの飛行経路

#### 統一フライトデータ

-   **サンプルフライトデータ**: 東京タワー周辺の点検データ
-   **サンプル軌跡データ**: ドローンの飛行軌跡

### サンプルデータのダウンロード

サンプルデータは `example/data/` ディレクトリに格納されています。代表的なデータは以下の通りです。

```bash
# 3Dデータ
example/data/mock-3d-data.csv
example/data/mock-mesh-data.csv
example/data/mock-building-inspection-points.csv
example/data/mock-building-inspection-mesh.csv

# 統一フライトデータ
example/data/sample-flight-data.csv
example/data/sample-trajectory-data.csv
example/data/sample-mission-data.json
```

## 技術仕様

### 使用技術

-   **MapLibre GL JS**: 3D 地図表示ライブラリ
-   **地理院地形**: 日本の高精度地形データ
-   **TypeScript**: 型安全な JavaScript 開発
-   **Vite**: 高速な開発サーバーとビルドツール

### データ形式

#### フライトプラン JSON 形式

```json
{
  "name": "フライトプラン名",
  "description": "フライトプランの説明",
  "created": "2025-01-31T10:00:00.000Z",
  "phases": [
    {
      "phase": "フェーズ名",
      "action": "アクション説明",
      "duration": 3000,
      "position": [経度, 緯度, 高度]
    }
  ],
  "totalDuration": 39000
}
```

#### 3D ポイント CSV 形式

```csv
longitude,latitude,altitude,name,type
139.7454,35.6586,100,東京タワー,landmark
```

#### 統一フライトデータ CSV 形式

```csv
timestamp,longitude,latitude,altitude,drone_id,mission_id,status
2025-01-31T10:00:00Z,139.7454,35.6586,100,drone-001,mission-001,active
```

### アーキテクチャ

```
src/
├── terrain.ts          # 地理院地形プロトコル
├── data-import-export.ts # データインポート/エクスポート機能
└── worker.ts          # Web Worker処理

example/
├── index.ts           # メインアプリケーション
├── index.html         # UI
└── data/             # サンプルデータ
```

## 開発者向け情報

### 環境構築

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build:example

# テストの実行
npm run test
```

### 新しいフライトプランの追加

1. **JSON ファイルの作成**

    ```json
    {
      "name": "新しいフライトプラン",
      "description": "説明",
      "phases": [...]
    }
    ```

2. **ユーザーがインポート機能を使用**
    - 「インポート」ボタンで JSON ファイルをアップロード

### カスタマイズ

-   **地形データの変更**: `src/terrain.ts`で地形ソースを変更
-   **UI のカスタマイズ**: `example/index.html`で UI を変更
-   **データ形式の拡張**: `src/data-import-export.ts`で新しいデータ形式を追加

## デプロイ

### Vercel デプロイ

このプロジェクトは Vercel に最適化されています：

```bash
# ビルド
npm run build:example

# Vercelにデプロイ
npx vercel
```

### 制限事項

-   ローカルファイルアクセス機能は削除済み（セキュリティ上の理由）
-   キーボードショートカット機能は削除済み
-   データインポートはユーザーアップロードのみ対応

## ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

## 貢献

プルリクエストやイシューの報告を歓迎します。貢献する前に、以下の点を確認してください：

1. コードスタイルの統一
2. TypeScript の型安全性の確保
3. テストの追加（新機能の場合）

## 更新履歴

-   **v2.2.2**: Vercel デプロイ対応、不要機能削除
-   **v2.1.0**: ドローン点検システムの追加
-   **v2.0.0**: MapLibre GL JS v4 対応
-   **v1.0.0**: 初回リリース

## サポート

問題や質問がある場合は、GitHub のイシューページで報告してください。
