# CI/CD パイプライン設定

このプロジェクトでは、GitHub Actionsを使用してシンプルなCI/CDパイプラインを構築し、huskyを使用してローカルでのチェックを実装しています。

## ワークフロー構成

### 1. メインCI/CDパイプライン (`ci.yml`)

**トリガー**: プッシュ、プルリクエスト（main/master/developブランチ）

**実行内容**:
- **Lint & Type Check**: ESLint、TypeScript型チェック、Prettier
- **Test**: ユニットテスト実行
- **Build**: ライブラリとサンプルアプリケーションのビルド

### 2. プルリクエストチェック (`pr.yml`)

**トリガー**: プルリクエスト

**実行内容**:
- コード品質チェック
- 型チェック
- テスト実行
- ビルドチェック

### 3. リリースワークフロー (`release.yml`)

**トリガー**: タグプッシュ（`v*`）

**実行内容**:
- リリース前チェック
- GitHubリリース作成

## Husky設定

### ローカルでの自動チェック

#### Pre-commitフック
```bash
# コミット前に自動実行
pnpm run fix
```

#### Pre-pushフック
```bash
# プッシュ前に自動実行
pnpm run ci:build
```

### 設定ファイル

- `.husky/pre-commit`: コミット前のフォーマットとリント修正
- `.husky/pre-push`: プッシュ前のビルドチェック

## ローカル開発用コマンド

```bash
# コード品質チェック
pnpm ci:check

# ビルド
pnpm ci:build

# フォーマットとリント修正
pnpm fix

# 型チェック
pnpm type-check

# フォーマットチェック
pnpm format:check
```

## ワークフロー実行条件

### プルリクエスト
- コード品質チェック
- 型チェック
- テスト実行
- ビルドチェック

### メインブランチへのプッシュ
- 上記すべて
- アーティファクトの保存

### タグプッシュ
- リリース前チェック
- GitHubリリース作成

## 役割分担

### ローカル（Husky）
- **Pre-commit**: フォーマットとリント修正
- **Pre-push**: ビルドチェック

### CI/CD（GitHub Actions）
- コード品質チェック
- テスト実行
- ビルド検証
- リリース作成

## トラブルシューティング

### よくある問題

1. **ESLintエラー**
   ```bash
   pnpm lint:fix
   ```

2. **型エラー**
   ```bash
   pnpm type-check
   ```

3. **フォーマットエラー**
   ```bash
   pnpm format
   ```

4. **ビルドエラー**
   ```bash
   pnpm ci:build
   ```

### Huskyの無効化（緊急時）

```bash
# 一時的にhuskyを無効化
git commit --no-verify

# または
git push --no-verify
```

### キャッシュクリア

```bash
# pnpmキャッシュクリア
pnpm store prune

# node_modules削除
rm -rf node_modules
pnpm install
```

## パフォーマンス最適化

- pnpmキャッシュを使用
- 並列実行でジョブを最適化
- 必要なファイルのみをチェック対象に設定
- アーティファクトの保持期間を7日に設定

## セキュリティ

- 依存関係の脆弱性スキャン（npm audit）
- シークレットを使用しないシンプルな構成
- ローカルでの事前チェックによる品質向上 