@echo off
cd /d "%~dp0"
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        WebBuilder — Local Server         ║
echo  ║  http://localhost:8765/builder/          ║
echo  ║  Press Ctrl+C to stop the server.        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Try Python 3 first, then Python 2 fallback
python --version >nul 2>&1
if %errorlevel%==0 (
    start "" "http://localhost:8765/builder/"
    python -m http.server 8765
) else (
    echo ERROR: Python not found. Please install Python 3 and try again.
    echo  OR open builder\index.html directly (some features may not work).
    pause
)