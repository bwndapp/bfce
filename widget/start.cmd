@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo First run - installing dependencies...
  call npm install
)
start "" "node_modules\electron\dist\electron.exe" .
