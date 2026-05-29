# PC機器在庫管理アプリ 運用手順書

## 1. 目的
本手順書は、日次運用担当者が本アプリを安全に起動・利用・保守できるようにするための運用ガイドです。

## 2. 対象システム
- アプリ: Go + Gin + SQLite
- 画面URL: http://localhost:8080/
- 主な機能:
  - カテゴリー -> メーカー -> 製品の階層選択
  - バーコード検索
  - 入庫/出庫/廃棄による在庫更新

## 3. 事前確認
- Go が利用可能であること
- 8080番ポートが未使用、または既存プロセスを停止済みであること
- DBファイルが存在すること
  - 運用DB: inventory.db

注意:
- 現在の実装は、`INVENTORY_DB_PATH` -> `INVENTORY_DB_DIR/inventory.db` -> `./inventory.db` の順で参照します。
- 開発時に共有フォルダを使う場合は、`INVENTORY_DB_DIR=C:\Users\ks24.m-takahashi\Desktop` を設定します。

## 4. 起動手順
### 4.0 事前チェック（推奨）
`go run main.go` が `listen tcp :8080: bind: Only one usage ...` で失敗する場合は、先に8080ポート占有を解消します。

```powershell
$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $pid = ($conn | Select-Object -First 1 -ExpandProperty OwningProcess)
  Get-Process -Id $pid | Select-Object Id, ProcessName, Path
  Stop-Process -Id $pid -Force
}
```

### 4.1 起動方法（推奨）
1. 作業フォルダへ移動
2. 以下を実行

```powershell
.\start-inventory-server.cmd
```

3. コンソールに `Server starting on http://localhost:8080` が表示されることを確認

補足:
- このバッチは `C:\Users\ks24.m-takahashi\Desktop\inventory.db` を明示的に参照します。
- 直接 `go run main.go` する場合は、同じ環境変数を手動設定してください。

### 4.2 実行ファイルから起動
```powershell
.\inventory-app.exe
```

## 5. 停止手順
起動したターミナルで `Ctrl + C` を押して停止します。

## 6. 日次運用フロー
1. ブラウザで http://localhost:8080/ を開く
2. 左ペインでカテゴリーを選択
3. メーカーを選択
4. 製品一覧から対象製品を選択
5. 数量を設定し、以下を実行
   - 入庫: 入庫確定 (IN)
   - 出庫: 出庫確定 (OUT)
  - 廃棄: 廃棄（右端コンパクトボタン）
6. 通知メッセージを確認

## 6.1 入出庫イベント仕様（event_master連携）
在庫更新イベントは `inventory.db` の `event_master` を参照して処理されます。

- 入庫: event_master.name = 入庫（id=01）
- 出庫: event_master.name = 出庫（id=02）
- 廃棄: event_master.name = 廃棄（id=03）

注意:
- 画面に表示していないイベントは無視します（現在は購入・課内一時利用を非対象）。
- `action=temp` など非対象アクションは `Invalid action` になります。

## 7. バーコード運用
1. バーコード入力欄を選択
2. 必要に応じてテンキーで入力
3. 検索ボタンを押下
4. 製品詳細が表示されることを確認

補足:
- 全角記号/全角スペースは内部で正規化されます。

## 8. APIヘルスチェック
障害切り分け時は以下でAPI疎通を確認します。

```powershell
Invoke-WebRequest http://localhost:8080/api/categories | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest "http://localhost:8080/api/makers?category_id=01" | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest "http://localhost:8080/api/inventory?category_id=01&maker_id=02" | Select-Object -ExpandProperty StatusCode
```

期待値:
- いずれも `200`

## 9. データ運用
### 9.1 バックアップ
```powershell
Copy-Item .\inventory.db .\backup_inventory_$(Get-Date -Format yyyyMMdd_HHmmss).db
```

### 9.2 リストア
1. アプリ停止
2. バックアップファイルを inventory.db に戻す
3. `start-inventory-server.cmd` でアプリ再起動

## 10. キャッシュ/表示不整合時の対応
本アプリは Service Worker を使用します。画面が古い場合は以下を実施します。

1. ブラウザでハードリロード（Ctrl + F5）
2. 直らない場合は Service Worker を削除して再読み込み
3. `/static/style-list.css` や `/static/script-list.js` の404が出る場合、古いキャッシュ参照の可能性が高いためキャッシュクリアを優先

## 11. よくある障害と対処
### 11.1 8080ポート使用中
症状:
- 起動時エラー、または `go run main.go` が失敗

対処:
- 既存プロセスを停止後に再起動

```powershell
$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $pid = ($conn | Select-Object -First 1 -ExpandProperty OwningProcess)
  Get-Process -Id $pid | Select-Object Id, ProcessName, Path
  Stop-Process -Id $pid -Force
}
.\start-inventory-server.cmd
```

補足:
- 本環境での実測では、占有元は `go run` が残した `main` プロセスでした。

### 11.2 バーコード検索で 404
症状:
- `POST /api/barcode/search` が 404

主因:
- 製品コードが存在しない

対処:
- コード値を再確認
- 先頭/末尾空白や全角文字の混入を確認

### 11.3 出庫で在庫不足
症状:
- `Insufficient stock`

対処:
- 現在庫を確認し、数量を調整

### 11.4 無効なイベント指定
症状:
- `Invalid action`

主因:
- 対象外イベント（例: `temp`）を送信している

対処:
- `in` / `out` / `dispose` のいずれかを指定

## 12. 運用上の注意
- DBファイルを直接編集する場合は必ず停止中に実施
- 本番運用に切り替える場合は DB参照先（inventory.db）を明確に変更管理する
- DB参照先を切り替える場合は `INVENTORY_DB_PATH` または `INVENTORY_DB_DIR` のどちらを使うかを統一する
- 更新前後で在庫値が元に戻るか、定期的に簡易検証する

## 12.1 同時更新時の運用方針
- 同一製品に対する同時操作は、画面上で連続クリックせず 1 操作ごとに通知表示を確認してから次操作を行う。
- 複数端末運用時は、同一製品を同時に操作しないよう担当を分ける。
- 在庫値に差異が出た場合は、直ちに `/api/barcode/search` で現在値を確認し、必要数だけ `in` または `out` で補正する。
- 日次締め時にランダム3件以上の製品で在庫値を照合し、差異があれば運用ログへ記録する。

## 12.2 異常系APIテスト結果（記録）
- quantity不正: `quantity=0` / `quantity=-1` は `quantity must be greater than zero` を返すことを確認済み。
- 不正product_cd: `inventory/update` は外部キー制約エラー、`barcode/search` は `Product not found` を返すことを確認済み。

## 13. 参考（現行実装の要点）
- API定義: main.go
- 画面構成: index.html
- 画面ロジック: script.js
- スタイル: style.css
- PWAキャッシュ: sw.js
