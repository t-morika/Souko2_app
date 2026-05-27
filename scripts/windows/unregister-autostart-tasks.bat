@echo off
setlocal EnableExtensions

echo [INFO] Deleting scheduled tasks...
schtasks /Delete /TN "Inventory Server Auto Start" /F >nul 2>&1
schtasks /Delete /TN "Inventory UI Auto Start" /F >nul 2>&1

echo [OK] Delete completed (also OK when tasks do not exist).
exit /b 0
