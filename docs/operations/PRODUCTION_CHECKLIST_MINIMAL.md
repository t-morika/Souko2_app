# 本番運用チェックリスト（最小）

## 使い方
- リリース日当日に、上から順にチェックする。
- NG が出た項目は、当日中に原因を記録して再確認する。

## 1. 起動前チェック
- [ ] 作業フォルダが最新である（必要ファイルがある）
- [ ] `go version` が取得できる
- [ ] DBファイル名を確認した（現運用は `inventory.db`）
- [ ] 前日バックアップが存在する

## 2. サーバー起動チェック
- [ ] `go run main.go` がエラーなく起動する
- [ ] ログに `Server starting on http://localhost:8080` が出る
- [ ] `http://localhost:8080` で画面表示できる

## 3. API疎通チェック
- [ ] `GET /api/categories` が 200
- [ ] `GET /api/makers?category_id=01` が 200
- [ ] `GET /api/inventory` が 200

確認コマンド（PowerShell）:
```powershell
Invoke-WebRequest http://localhost:8080/api/categories | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest "http://localhost:8080/api/makers?category_id=01" | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest http://localhost:8080/api/inventory | Select-Object -ExpandProperty StatusCode
```

## 4. 画面操作チェック（Web）
- [ ] カテゴリ選択で一覧が更新される
- [ ] メーカー選択で絞り込みできる
- [ ] バーコード検索で該当商品が表示される
- [ ] 入庫が成功する
- [ ] 出庫が成功する（在庫なし時は無効になる）
- [ ] 廃棄が成功する

## 5. 画面操作チェック（デスクトップ）
- [ ] ショートカット（アプリモード）で起動できる
- [ ] Web版と同じデータを表示する
- [ ] カメラタブの起動ができる（端末権限許可済み）

## 6. データ整合チェック
- [ ] 同じ操作を二重送信しても重複反映されない
- [ ] 在庫数が負になっていない
- [ ] 主要カテゴリの表示が崩れていない

## 7. 運用設定チェック
- [ ] Windows Defender / FW の必要ポート設定済み
- [ ] 自動起動タスクが有効（必要端末のみ）
- [ ] 障害時の連絡先と復旧手順が共有済み

## 8. 当日クローズ判定
- [ ] Web運用 OK
- [ ] デスクトップ運用 OK
- [ ] バックアップ実行 OK
- [ ] 未解決事項なし（あればチケット化済み）

## 障害時の最小対応
1. サーバー再起動
2. ブラウザ再起動（Service Worker 再登録を含む）
3. 直近バックアップ確認
4. 影響範囲を記録してエスカレーション
