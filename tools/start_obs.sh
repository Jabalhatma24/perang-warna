#!/usr/bin/env bash
# Membuka OBS (Flatpak) di profil ContinentalWar dan merender di GPU NVIDIA.
# Tanpa ini OBS merender di GPU Intel, dan pada 60 FPS sekitar 14% frame tertinggal.
set -euo pipefail

APP=com.obsproject.Studio
# Nama folder driver mengikuti versinya, jadi dicari setiap kali dijalankan.
EGL_FILE=$(flatpak run --command=sh "$APP" -c 'ls /usr/lib/x86_64-linux-gnu/GL/nvidia-*/glvnd/egl_vendor.d/10_nvidia.json 2>/dev/null | head -1' || true)

ENV_ARGS=()
if [ -n "$EGL_FILE" ]; then
  ENV_ARGS=(
    --env=__NV_PRIME_RENDER_OFFLOAD=1
    --env=__GLX_VENDOR_LIBRARY_NAME=nvidia
    --env=__VK_LAYER_NV_optimus=NVIDIA_only
    "--env=__EGL_VENDOR_LIBRARY_FILENAMES=$EGL_FILE"
  )
else
  echo "Driver NVIDIA untuk Flatpak tidak ditemukan. OBS memakai GPU bawaan; pakai 30 FPS." >&2
fi

exec flatpak run "${ENV_ARGS[@]}" "$APP" --profile ContinentalWar --collection ContinentalWar "$@"
