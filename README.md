# PC機器在庫管理アプリ

Go + Gin + SQLite を使用したタブレット向けPC機器在庫管理Webアプリです。

## 機能

- バーコード入力または手動選択による製品入出庫管理
- カテゴリ別製品フィルタリング
- 在庫一覧表示と印刷
- 全画面タブレットUI

## 起動方法

1. Goがインストールされていることを確認してください。
2. 依存関係をインストール:
   ```
   go mod tidy
   ```
3. アプリをビルド:
   ```
   go build -o inventory-app
   ```
4. 実行:
   ```
   ./inventory-app
   ```
5. ブラウザでアクセス: http://localhost:8080

## 技術仕様

- バックエンド: Go + Gin
- データベース: SQLite (modernc.org/sqlite)
- フロントエンド: HTML + CSS + JavaScript
- CGO不要でクロスプラットフォーム対応

## APIエンドポイント

- `GET /api/products`: 製品リスト取得
- `GET /api/inventory`: 在庫一覧取得
- `POST /api/inventory/update`: 在庫更新 (入庫/出庫)
- `POST /api/barcode/search`: バーコード検索