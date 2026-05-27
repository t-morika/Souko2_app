# Windows 自動起動設定手順（タスクスケジューラ）

## 目的
- Windows ログオン時に以下を自動起動する。
- 1) 在庫管理サーバー（Go）
- 2) デスクトップ画面（Edge アプリモード）

## 最短手順（コマンド一発）
以下を実行すると、ランチャーcmd作成とタスク登録を自動で実施します。

```bat
scripts\windows\register-autostart-tasks.bat
```

補足:
- 登録を解除する場合は以下を実行します。

```bat
scripts\windows\unregister-autostart-tasks.bat
```

## 準備
1. サーバー起動バッチを作成
- ファイル名: `start-inventory-server.cmd`
- 配置先: `C:\Users\ks24.m-takahashi\Desktop\souko_2`
- 内容:
```bat
@echo off
cd /d C:\Users\ks24.m-takahashi\Desktop\souko_2
go run main.go
```

2. UI起動バッチを作成
- ファイル名: `start-inventory-ui.cmd`
- 配置先: `C:\Users\ks24.m-takahashi\Desktop\souko_2`
- 内容:
```bat
@echo off
timeout /t 2 /nobreak > nul
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080
```

## タスク作成（GUI）

### タスク1: サーバー起動
1. タスクスケジューラを開く
2. 「タスクの作成」を選択
3. 全般タブ
- 名前: `Inventory Server Auto Start`
- 「ユーザーがログオンしているときのみ実行する」
4. トリガータブ
- 新規 → 「ログオン時」
5. 操作タブ
- 新規 → プログラム/スクリプト:
```text
C:\Users\ks24.m-takahashi\Desktop\souko_2\start-inventory-server.cmd
```
6. 条件タブ
- 必要なら「AC電源時のみ実行」のチェックを外す
7. 設定タブ
- 「タスクを要求時に実行する」を有効

### タスク2: UI起動
1. 「タスクの作成」を選択
2. 全般タブ
- 名前: `Inventory UI Auto Start`
3. トリガータブ
- 新規 → 「ログオン時」
- 遅延: 10秒（推奨）
4. 操作タブ
- 新規 → プログラム/スクリプト:
```text
C:\Users\ks24.m-takahashi\Desktop\souko_2\start-inventory-ui.cmd
```

## 動作確認
1. タスクスケジューラから両タスクを右クリック実行
2. サーバーが起動し、Edgeアプリ窓が表示されること
3. `http://localhost:8080/api/categories` が 200 を返すこと

## 停止方法
1. UIを閉じる
2. サーバーのコンソールを閉じる
3. 自動起動を止める場合はタスクを「無効化」

## 補足
- 社内Web運用端末では、UIタスクは不要でサーバーのみ自動起動でもよい
- 端末ごとにブラウザパスが異なる場合は、cmd内のパスを調整する
- `register-autostart-tasks.bat --dry-run` で、タスク登録せずにランチャーcmdの生成だけを確認できる
