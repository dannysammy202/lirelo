@echo off
cd /d "%~dp0"
echo Preparing Lirelo...
py -m pip install -r requirements.txt
if errorlevel 1 (
 echo Dependency installation failed. Check your Python installation.
 pause
 exit /b 1
)
echo.
echo Open http://127.0.0.1:8765 in Chrome or Edge after the server starts.
echo Keep this window open while using Lirelo.
py server.py
pause
