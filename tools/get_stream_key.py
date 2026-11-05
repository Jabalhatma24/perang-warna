#!/usr/bin/env python3
"""Mengambil RTMP URL dan Stream Key TikTok di Linux lewat alat pihak ketiga berbasis Streamlabs.

Skrip ini tidak berisi logika login. Ia hanya mengunduh Loukious/StreamLabsTikTokStreamKeyGenerator
pada commit yang sudah dibaca isinya, memasangnya di folder yang tidak ikut ke git, lalu menjalankannya.

Pemakaian:
    python3 tools/get_stream_key.py                 # pasang jika perlu, lalu buka aplikasinya
    python3 tools/get_stream_key.py --install-only  # hanya memasang
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/Loukious/StreamLabsTikTokStreamKeyGenerator.git"
PINNED_COMMIT = "ef03fb23cb1680eb47e9598850509ce22e218600"
ENTRY_POINT = "StreamLabsTikTokStreamKeyGenerator.py"
# nuitka dan clang di requirements asli hanya untuk membuat rilis, tidak dibutuhkan saat dijalankan.
RUNTIME_PACKAGES = ["PySide6>=6.9,<7", "requests>=2.32,<3", "packaging>=26"]
TOOL_DIR = Path(__file__).resolve().parent / ".streamlabs-keygen"
# Versi besar supaya aplikasi tidak menawarkan pembaruan: commit ini sengaja dikunci.
VERSION_FILE = "__version__ = '9999.0.0'\n"

WARNING = """\
PERHATIAN, baca sebelum lanjut:
- Ini alat pihak ketiga, bukan produk TikTok atau Streamlabs. Alat ini menyamar sebagai Streamlabs
  Desktop saat menghubungi Streamlabs, dan bisa saja melanggar ketentuan layanan.
  Risikonya ada pada akun Anda.
- Akun Anda tetap harus punya akses "Streamlabs TikTok LIVE". Alat ini tidak bisa memberikan akses.
- Token login tersimpan tanpa enkripsi di tools/.streamlabs-keygen/repo/config.json.
- Jangan tampilkan jendela alat ini saat siaran. Stream Key sama artinya dengan izin siaran di akun Anda.
- Tombol END LIVE di alat ini yang mengakhiri siaran, bukan tombol berhenti di OBS.
"""

_TOKEN_LINE = re.compile(r"(oauth token:\s*)\S+", re.IGNORECASE)


def redact(line: str) -> str:
    """Aplikasi aslinya mencetak token utuh ke terminal."""
    return _TOKEN_LINE.sub(r"\1<disembunyikan>", line)


def run(command: list[str], **kwargs) -> None:
    subprocess.run(command, check=True, **kwargs)


def head_commit(repo: Path) -> str:
    result = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def fetch_repo(tool_dir: Path, url: str = REPO_URL, commit: str = PINNED_COMMIT) -> Path:
    if shutil.which("git") is None:
        raise SystemExit("git belum terpasang. Jalankan: sudo apt install git")
    repo = tool_dir / "repo"
    tool_dir.mkdir(parents=True, exist_ok=True)
    if not (repo / ".git").exists():
        run(["git", "clone", "--quiet", url, str(repo)])
    if head_commit(repo) != commit:
        try:
            run(["git", "-C", str(repo), "fetch", "--quiet", "origin"])
            run(["git", "-C", str(repo), "-c", "advice.detachedHead=false", "checkout", "--quiet", commit])
        except subprocess.CalledProcessError as error:
            raise SystemExit("Commit yang sudah diperiksa tidak ditemukan. Pemasangan dibatalkan.") from error
    if head_commit(repo) != commit:
        raise SystemExit("Commit alat tidak cocok dengan yang sudah diperiksa. Pemasangan dibatalkan.")
    (repo / "_version.py").write_text(VERSION_FILE, encoding="utf-8")
    return repo


def install(tool_dir: Path = TOOL_DIR) -> Path:
    fetch_repo(tool_dir)
    python = tool_dir / "venv" / "bin" / "python"
    if not python.exists():
        print("Membuat virtualenv dan memasang dependensi, bisa beberapa menit...")
        run([sys.executable, "-m", "venv", str(tool_dir / "venv")])
    run([str(python), "-m", "pip", "install", "--quiet", "--disable-pip-version-check", *RUNTIME_PACKAGES])
    return python


def launch(python: Path, tool_dir: Path = TOOL_DIR) -> int:
    repo = tool_dir / "repo"
    process = subprocess.Popen(
        [str(python), "-u", ENTRY_POINT], cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        # config.json berisi token: hanya pemilik yang boleh membacanya.
        preexec_fn=lambda: os.umask(0o077),
    )
    for line in process.stdout:
        sys.stdout.write(redact(line))
    return process.wait()


def main() -> int:
    parser = argparse.ArgumentParser(description="Mengambil RTMP URL dan Stream Key TikTok lewat Streamlabs")
    parser.add_argument("--install-only", action="store_true", help="pasang saja, tanpa membuka aplikasi")
    parser.add_argument("--yes", action="store_true", help="lewati pertanyaan konfirmasi")
    args = parser.parse_args()

    print(WARNING)
    if not args.yes and input("Lanjut? Ketik ya: ").strip().lower() != "ya":
        print("Dibatalkan.")
        return 1
    python = install()
    print(f"Terpasang pada commit {PINNED_COMMIT[:7]}.")
    if args.install_only:
        return 0
    print("Setelah aplikasi terbuka: Load from Web > login > isi judul dan kategori > GO LIVE.")
    print("Salin Server dan Stream Key ke OBS: Pengaturan > Siaran > Custom.\n")
    return launch(python)


if __name__ == "__main__":
    raise SystemExit(main())
