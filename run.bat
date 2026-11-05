@echo off
rem Membuat virtualenv jika belum ada, memasang dependensi, menjalankan tes, lalu server.
rem Contoh: run.bat --simulate   atau   run.bat --username @akunku
setlocal
cd /d "%~dp0"
chcp 65001 >nul

set "PY=py -3"
where py >nul 2>nul || set "PY=python"

if not exist ".venv\Scripts\python.exe" (
  echo Membuat virtualenv...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo Python 3.10+ tidak ditemukan. Pasang dari python.org, centang "Add to PATH".
    exit /b 1
  )
)

if not exist ".venv\.installed" (
  echo Memasang dependensi...
  ".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
  ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
  if errorlevel 1 exit /b 1
  type nul > ".venv\.installed"
)

echo Menjalankan tes...
".venv\Scripts\python.exe" -m pytest -q
if errorlevel 1 exit /b 1

".venv\Scripts\python.exe" backend\server.py %*
