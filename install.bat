@echo off
rem Installs / repairs the Listen Along mod in Vencord (Discord) and Spicetify (Spotify).
rem Extra switches are passed through, e.g.:  install.bat -NoUpdate
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
