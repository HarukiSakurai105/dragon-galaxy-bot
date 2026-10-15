@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Dragon Galaxy Discord Bot

echo ==================================================
echo            DRAGON GALAXY DISCORD BOT
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js 20 tro len. Tai tai https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Da tao .env. Hay dien DISCORD_TOKEN va CLIENT_ID.
  start "" notepad ".env"
  pause
  exit /b 1
)

if not exist "node_modules\discord.js\package.json" (
  echo [CAI DAT] Dang cai thu vien...
  call npm install
  if errorlevel 1 pause & exit /b 1
)

echo [KHOI DONG] Khong dong cua so nay neu muon bot online.
call npm start
pause

