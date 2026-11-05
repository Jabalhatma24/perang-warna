#!/usr/bin/env bash
# Membuat virtualenv jika belum ada, memasang dependensi, menjalankan tes, lalu server.
# Contoh: ./run.sh --simulate   atau   ./run.sh --username @akunku
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3.10+ tidak ditemukan. Pasang Python dulu, lalu jalankan lagi." >&2
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "Membuat virtualenv..."
  "$PYTHON" -m venv .venv
fi

# Dependensi hanya dipasang ulang jika requirements.txt berubah.
if [ ! -f .venv/.installed ] || [ requirements.txt -nt .venv/.installed ]; then
  echo "Memasang dependensi..."
  .venv/bin/python -m pip install --quiet --upgrade pip
  .venv/bin/python -m pip install --quiet -r requirements.txt
  touch .venv/.installed
fi

echo "Menjalankan tes..."
.venv/bin/python -m pytest -q

exec .venv/bin/python backend/server.py "$@"
