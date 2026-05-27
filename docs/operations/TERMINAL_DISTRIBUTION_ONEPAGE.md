# 在庫管理アプリ 端末配布 1ページ版（超短縮）

## これだけ実施
1. フォルダを配置
- `C:\Users\<ユーザー名>\Desktop\souko_2` に一式を置く

2. 初回起動確認
```powershell
cd C:\Users\<ユーザー名>\Desktop\souko_2
go run main.go
```
- ブラウザで `http://localhost:8080` を開く
- エラー時は下の「起動NG時」へ

3. 自動起動を一発登録
```bat
scripts\windows\register-autostart-tasks.bat
```
- 作成されるタスク
  - `Inventory Server Auto Start`
  - `Inventory UI Auto Start`

4. 端末再ログオンして確認
- 自動でサーバー起動 + アプリ窓起動すること

## 起動NG時（最短対処）
1. 8080競合確認
```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object -First 1 OwningProcess
```
2. 占有プロセス停止
```powershell
Stop-Process -Id <PID> -Force
```
3. 再起動
```powershell
go run main.go
```

## アンインストール（自動起動解除）
```bat
scripts\windows\unregister-autostart-tasks.bat
```

## 最終チェック（30秒）
- `http://localhost:8080/api/categories` が 200
- 画面で「カテゴリ選択 → 商品表示」ができる
- IN/OUT/廃棄のボタン操作ができる
