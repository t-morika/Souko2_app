# デスクトップ運用手順（アプリモード）

## 対象
- Windows 端末
- Microsoft Edge または Google Chrome

## 目的
- 在庫管理アプリを通常ブラウザタブではなく、専用アプリ風ウィンドウで起動する。

## 事前確認
1. サーバーが起動できること
- 実行: `go run main.go`
- 確認: `http://localhost:8080` が開けること

2. ブラウザの実行ファイル位置（既定）
- Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`

## 手順A（推奨）: Edge のショートカット作成
1. デスクトップで右クリック → 新規作成 → ショートカット
2. 項目の場所に以下を入力
```text
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080
```
3. 名前を `在庫管理アプリ（Desktop）` にする
4. 作成後、右クリック → プロパティ → 実行時の大きさを「最大化」に変更

## 手順B: Chrome のショートカット作成
1. デスクトップで右クリック → 新規作成 → ショートカット
2. 項目の場所に以下を入力
```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:8080
```
3. 名前を `在庫管理アプリ（Desktop）` にする

## サーバーと同時起動するショートカット（任意）
1. 以下内容で `start-inventory-desktop.cmd` を作成
```bat
@echo off
cd /d C:\Users\ks24.m-takahashi\Desktop\souko_2
start "inventory-server" cmd /c "go run main.go"
timeout /t 2 /nobreak > nul
start "inventory-ui" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080
```
2. この cmd をダブルクリックすると、サーバーとデスクトップ窓を連続起動できる

## よくあるつまずき
1. 画面が開かない
- 先に `go run main.go` を実行してエラー有無を確認
- `http://localhost:8080` が通常ブラウザで開けるか確認

2. Edge のパスが違う
- `C:\Program Files\Microsoft\Edge\Application\msedge.exe` も確認

3. カメラが動かない
- アプリ窓でもブラウザ権限設定が必要
- Edge のサイト権限でカメラを許可

## 完了判定
- デスクトップのショートカットから、専用ウィンドウで起動できる
- 通常タブではなく、アプリ風表示で操作できる
- 入庫・出庫・廃棄・検索が実行できる
