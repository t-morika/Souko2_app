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

## 製品DB管理・運用ガイド

### データベース構造

このアプリはSQLiteデータベースを使用し、以下の2つのテーブルで構成されています：

#### productsテーブル
- `id` (INTEGER PRIMARY KEY): 製品の一意の識別子
- `category` (TEXT): 製品カテゴリ（例: マウス、ノートPC、一体型PC、モニター、セキュリティワイヤー）
- `manufacturer` (TEXT): メーカー名
- `name` (TEXT): 製品名
- `barcode` (TEXT UNIQUE): バーコード（一意制約あり）

#### inventoryテーブル
- `product_id` (INTEGER PRIMARY KEY): productsテーブルのidを参照
- `quantity` (INTEGER): 在庫数量（デフォルト0）

### データベースファイルの場所

- デフォルト: `./inventory.db` (実行ファイルと同じディレクトリ)
- 環境変数 `DB_PATH` でカスタムパスを指定可能

### 初期データ

アプリ初回起動時に、サンプル製品データが自動挿入されます：
- マウス: Logitech Wireless Mouse M100
- セキュリティワイヤー: Kensington Lock
- ノートPC: Dell XPS 13
- 一体型PC: Apple iMac 24
- モニター: Samsung 27" UHD Monitor

### データ操作方法

#### 製品の追加
API経由での製品追加は現在サポートされていません。直接DB操作またはコード修正が必要です。

#### 在庫の更新
Web UIまたはAPI経由で入出庫操作を行います：
```bash
# 入庫例 (product_id=1, quantity=5)
curl -X POST http://localhost:8080/api/inventory/update \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "action": "in", "quantity": 5}'

# 出庫例 (product_id=1, quantity=2)
curl -X POST http://localhost:8080/api/inventory/update \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "action": "out", "quantity": 2}'
```

#### バーコード検索
```bash
curl -X POST http://localhost:8080/api/barcode/search \
  -H "Content-Type: application/json" \
  -d '{"barcode": "490001"}'
```

### バックアップと運用

#### バックアップ
```bash
# DBファイルをコピー
cp inventory.db inventory.db.backup

# 定期バックアップ（cron等で自動化推奨）
cp inventory.db "inventory_$(date +%Y%m%d_%H%M%S).db"
```

#### リストア
```bash
# バックアップから復元
cp inventory.db.backup inventory.db
```

#### データベースの最適化
SQLiteは定期的なVACUUMが推奨されます：
```sql
-- SQLiteコマンドラインから実行
VACUUM;
```

### 運用時の注意点

1. **同時アクセス**: SQLiteはファイルロックを使用するため、同時書き込みに注意
2. **データ整合性**: 外部キー制約によりproducts削除時はinventoryも連動
3. **パフォーマンス**: 大量データ時はインデックス追加を検討
4. **セキュリティ**: DBファイルは適切な権限設定を
5. **監査**: 重要な操作はログを確認

### トラブルシューティング

#### DBファイルが破損した場合
```bash
# バックアップから復元
cp inventory.db.backup inventory.db

# または新規作成（サンプルデータ再挿入）
rm inventory.db
./inventory-app
```

#### バーコード重複エラー
バーコードはUNIQUE制約があるため、重複時はエラーが発生します。既存製品の確認を推奨。

#### 在庫数量がマイナスになる場合
UI/APIで数量チェックを実装済みですが、直接DB操作時は注意してください。