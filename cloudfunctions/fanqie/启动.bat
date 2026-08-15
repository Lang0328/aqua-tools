@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=D:\user\个人\node18\node-v18.20.4-win-x64\node.exe"
if not exist "%NODE%" (
  echo [错误] 未找到 Node：%NODE%
  echo 请确认已安装 Node 免装包到该目录，或在此脚本里修改 NODE 路径。
  pause
  exit /b 1
)
echo 正在启动番茄小说下载器本地服务……
"%NODE%" server.js
pause
