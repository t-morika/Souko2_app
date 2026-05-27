@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "ROOT=%%~fI"

set "EDGE_1=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE_2=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set "CHROME_1=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_2=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

set "BROWSER_EXE="
if exist "%EDGE_1%" set "BROWSER_EXE=%EDGE_1%"
if not defined BROWSER_EXE if exist "%EDGE_2%" set "BROWSER_EXE=%EDGE_2%"
if not defined BROWSER_EXE if exist "%CHROME_1%" set "BROWSER_EXE=%CHROME_1%"
if not defined BROWSER_EXE if exist "%CHROME_2%" set "BROWSER_EXE=%CHROME_2%"
if not defined BROWSER_EXE (
  echo [ERROR] Edge/Chrome not found. Please check browser path.
  exit /b 1
)

echo [INFO] Workspace: %ROOT%
echo [INFO] Browser  : %BROWSER_EXE%

> "%ROOT%\start-inventory-server.cmd" (
  echo @echo off
  echo cd /d "%ROOT%"
  echo go run main.go
)

> "%ROOT%\start-inventory-ui.cmd" (
  echo @echo off
  echo timeout /t 2 /nobreak ^> nul
  echo start "" "%BROWSER_EXE%" --app=http://localhost:8080
)

echo [INFO] launcher files created:
echo        %ROOT%\start-inventory-server.cmd
echo        %ROOT%\start-inventory-ui.cmd

if /I "%~1"=="--dry-run" (
  echo [DRY-RUN] schtasks /Create was skipped.
  exit /b 0
)

schtasks /Create /F /SC ONLOGON /TN "Inventory Server Auto Start" /TR "\"%ROOT%\start-inventory-server.cmd\"" /RL LIMITED
if errorlevel 1 (
  echo [ERROR] Failed to create server task.
  exit /b 1
)

schtasks /Create /F /SC ONLOGON /DELAY 0000:10 /TN "Inventory UI Auto Start" /TR "\"%ROOT%\start-inventory-ui.cmd\"" /RL LIMITED
if errorlevel 1 (
  echo [ERROR] Failed to create UI task.
  exit /b 1
)

echo [OK] Task creation completed.
schtasks /Query /TN "Inventory Server Auto Start"
schtasks /Query /TN "Inventory UI Auto Start"

exit /b 0
