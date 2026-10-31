#!/usr/bin/env bash
# Per-frame luma at 25fps (64x36) and audio PCM 8kHz mono.
# 64x36, not 32x18: at the smaller size a frame hash had NO discrimination —
# best match distance 0 and rival distance 0-1, so no frame could identify
# itself and every vote was rejected.
#
# ---------------------------------------------------------------------------
# FOURTH ARGUMENT — CROP, and why it exists
# ---------------------------------------------------------------------------
# A vertical rendition is a 9:16 centre crop of its master. Hashing its frames
# against the master's FULL frames compares two different pictures, so the
# picture lag that comes back is noise rather than a lag: phase 5 of
# sync-finish measured offsets from -42 s to +0.4 s, or null, on 70 verticals
# that were each a clean crop of the film they were measured against. The
# audio agreed to 42 ms on the same films, which is what gave it away.
#
# Pass 9x16 to crop the master the same way before its frames are hashed.
#
# ---------------------------------------------------------------------------
# ${OUT}.geom IS WRITTEN ON EVERY RUN
# ---------------------------------------------------------------------------
# It records the aspect of the picture that was ACTUALLY hashed, so the
# instrument can refuse a crop-against-full comparison instead of returning a
# confident wrong number. Written unconditionally and not behind the crop
# flag, because a check that is skipped when its input is absent reads exactly
# like a check that passed — and the caller that forgets the flag is precisely
# the case the sidecar exists to catch.
set -euo pipefail
SRC="$1"; OUT="$2"; DUR="${3:-45}"; CROP="${4:-none}"

VF="fps=25,scale=64:36,format=gray"
case "$CROP" in
  none) ;;
  9x16) VF="crop=ih*9/16:ih,${VF}" ;;
  *) echo "sync-signals: unknown crop '${CROP}' (expected none or 9x16)" >&2; exit 2 ;;
esac

ffmpeg -nostdin -v error -t "$DUR" -i "$SRC" \
  -map 0:v:0 -vf "$VF" -f rawvideo -pix_fmt gray "${OUT}.luma" \
  -map 0:a:0 -ac 1 -ar 8000 -f s16le "${OUT}.pcm" -y

# The aspect of the hashed picture, to 2dp. A 9:16 crop of a 1920x1080 master
# and a native 1080x1920 vertical both land on 0.56; the uncropped master is
# 1.78, and that difference is what the instrument refuses on.
WH="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
       -of csv=p=0:s=x "$SRC" | head -1)"
printf '%s' "$WH" | awk -F x -v c="$CROP" '{
  w = $1; h = $2;
  if (h <= 0) { print "unknown"; exit }
  if (c == "9x16") w = h * 9 / 16;
  printf "%.2f", w / h;
}' > "${OUT}.geom"
