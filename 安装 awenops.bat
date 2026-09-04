@echo off
title awenops Installer
cd /d "%~dp0"
echo ============================================
echo   awenops Installer
echo ============================================
echo.
echo This will: detect/install Python and Node, install deps,
echo build the frontend, generate config, and create a desktop shortcut.
echo Internet required; may take a few minutes.
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\install.ps1"
echo.
pause
