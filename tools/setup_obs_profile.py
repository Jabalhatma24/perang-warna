#!/usr/bin/env python3
"""Mengatur profil OBS menjadi vertikal 1080x1920 untuk siaran. Tutup OBS dulu.

Pemakaian:
    python3 tools/setup_obs_profile.py                     # NVENC, 6000 Kbps, 60 FPS
    python3 tools/setup_obs_profile.py --encoder qsv --fps 30 --bitrate 4000
"""
from __future__ import annotations

import argparse
import configparser
import json
import shutil
import subprocess
import time
from pathlib import Path

CONFIG_DIRS = [
    Path.home() / ".var/app/com.obsproject.Studio/config/obs-studio",
    Path.home() / ".config/obs-studio",
]
ENCODERS = {
    "nvenc": ("obs_nvenc_h264_tex", {"preset2": "p5", "tune": "hq", "multipass": "qres", "profile": "high", "bf": 2}),
    "qsv": ("obs_qsv11_v2", {"target_usage": "balanced", "profile": "high", "bframes": 2}),
    "x264": ("obs_x264", {"preset": "veryfast", "profile": "high", "bf": 2}),
}


def find_config_dir(candidates: list[Path] = CONFIG_DIRS) -> Path:
    for path in candidates:
        if (path / "basic" / "profiles").is_dir():
            return path
    raise SystemExit("Konfigurasi OBS tidak ditemukan. Buka OBS sekali, lalu coba lagi.")


def read_ini(path: Path) -> configparser.ConfigParser:
    ini = configparser.ConfigParser(delimiters=("=",), interpolation=None, strict=False)
    ini.optionxform = str  # OBS membedakan huruf besar dan kecil pada nama kunci
    ini.read(path, encoding="utf-8-sig")
    return ini


def apply_settings(ini: configparser.ConfigParser, encoder_id: str, fps: int) -> None:
    values = {
        "Video": {
            "BaseCX": "1080", "BaseCY": "1920", "OutputCX": "1080", "OutputCY": "1920",
            "FPSType": "0", "FPSCommon": str(fps),
        },
        "Output": {"Mode": "Advanced"},
        "AdvOut": {"Encoder": encoder_id, "RecEncoder": "none", "ApplyServiceSettings": "false", "TrackIndex": "1", "Track1Bitrate": "160"},
    }
    for section, items in values.items():
        if not ini.has_section(section):
            ini.add_section(section)
        for key, value in items.items():
            ini.set(section, key, value)


def encoder_settings(extra: dict, bitrate: int) -> dict:
    return {"rate_control": "CBR", "bitrate": bitrate, "keyint_sec": 2, **extra}


def obs_is_running() -> bool:
    return subprocess.run(["pgrep", "-x", "obs"], capture_output=True).returncode == 0


def configure(profile_dir: Path, encoder: str, bitrate: int, fps: int) -> Path:
    ini_path = profile_dir / "basic.ini"
    if not ini_path.exists():
        raise SystemExit(f"Profil {profile_dir.name} tidak ada. Buat dulu di OBS: Profil > Baru.")
    # Di luar folder profiles: OBS memindai folder itu dan akan menampilkan backup sebagai profil ganda.
    backup = profile_dir.parent.parent / "profile-backups" / f"{profile_dir.name}-{time.strftime('%Y%m%d-%H%M%S')}"
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(profile_dir, backup, dirs_exist_ok=True)

    encoder_id, extra = ENCODERS[encoder]
    ini = read_ini(ini_path)
    apply_settings(ini, encoder_id, fps)
    with open(ini_path, "w", encoding="utf-8") as handle:
        ini.write(handle, space_around_delimiters=False)
    (profile_dir / "streamEncoder.json").write_text(json.dumps(encoder_settings(extra, bitrate)), encoding="utf-8")
    return backup


def main() -> int:
    parser = argparse.ArgumentParser(description="Mengatur profil OBS untuk siaran vertikal")
    parser.add_argument("--profile", default="ContinentalWar")
    parser.add_argument("--encoder", choices=sorted(ENCODERS), default="nvenc")
    parser.add_argument("--bitrate", type=int, default=6000, help="Kbps")
    parser.add_argument("--fps", type=int, choices=[30, 60], default=60)
    args = parser.parse_args()

    if obs_is_running():
        raise SystemExit("OBS sedang berjalan dan akan menimpa perubahan ini. Tutup OBS dulu.")
    profile_dir = find_config_dir() / "basic" / "profiles" / args.profile
    backup = configure(profile_dir, args.encoder, args.bitrate, args.fps)
    print(f"Profil {args.profile}: 1080x1920, {args.fps} FPS, {args.encoder}, {args.bitrate} Kbps.")
    print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
