@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 goto :serve

where python >nul 2>nul
if %errorlevel%==0 goto :serve

echo Python was not found. Opening the soundboard directly...
echo Folder audio needs the local server, but you can still import files with + Add audio.
start "" "index.html"
exit /b

:serve
echo Starting the soundboard at http://localhost:8080
echo Audio folder: %~dp0audio
echo Keep the server window open while the event is running.
start "Soundboard server" cmd /k "py server.py || python server.py"
timeout /t 1 >nul
start "" "http://localhost:8080"
exit /b
