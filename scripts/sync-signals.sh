#!/usr/bin/env bash
# Per-frame luma at 25fps (64x36) and audio PCM 8kHz mono.
# 64x36, not 32x18: at the smaller size a frame hash had NO discrimination —
# best match distance 0 and rival distance 0-1, so no frame could identify
# itself and every vote was rejected.
set -euo pipefail
SRC="$1"; OUT="$2"; DUR="${3:-45}"
ffmpeg -nostdin -v error -t "$DUR" -i "$SRC" \
  -map 0:v:0 -vf "fps=25,scale=64:36,format=gray" -f rawvideo -pix_fmt gray "${OUT}.luma" \
  -map 0:a:0 -ac 1 -ar 8000 -f s16le "${OUT}.pcm" -y
