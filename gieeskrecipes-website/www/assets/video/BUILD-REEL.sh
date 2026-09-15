#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  GieesK — Hero Reel Builder
#  Combines your clips into ONE colour-graded, web-optimised reel.
#
#  USAGE:
#    1. Put your source clips in this folder as clip1/2/3.mp4
#    2. bash BUILD-REEL.sh
#    3. Outputs hero-reel.mp4 + hero-reel.webm + hero-poster.jpg
#
#  Requires ffmpeg:  https://ffmpeg.org/download.html
# ══════════════════════════════════════════════════════════════
set -e

IN1="${1:-clip1.mp4}"
IN2="${2:-clip2.mp4}"
IN3="${3:-clip3.mp4}"

# ── Tuning ────────────────────────────────────────────────────
SEG=8              # seconds to take from each clip
XF=1.5             # cross-fade duration between clips
W=1920; H=1080
CRF=30             # 28-32 — higher = smaller file. Backgrounds tolerate 30.
# ──────────────────────────────────────────────────────────────

for f in "$IN1" "$IN2" "$IN3"; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done

echo "▶ Building hero reel from 3 clips…"

# COLOUR GRADE — matches the GieesK palette:
#   • crush blacks slightly, lift warmth
#   • gold in the highlights, teal in the shadows (cinematic split-tone)
#   • desaturate a touch so UI text stays dominant
GRADE="eq=brightness=-0.04:contrast=1.16:saturation=1.05,\
colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:gm=0.01:bm=-0.03:rh=0.08:gh=0.03:bh=-0.05,\
curves=r='0/0 0.5/0.53 1/1':g='0/0 0.5/0.5 1/0.98':b='0/0.02 0.5/0.47 1/0.94',\
unsharp=5:5:0.4,\
gblur=sigma=2.4"
# ^ blur is baked in HERE, not applied live with CSS filter:blur() in the
#   browser. Real-time blur on a full-viewport playing video is one of the
#   most expensive things a browser can do — it forced a Gaussian
#   recompute across the whole screen on every frame. Baking it costs
#   nothing at runtime (and compresses smaller too — less detail to encode).

SCALE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30"

# Trim, normalise and grade each segment
for i in 1 2 3; do
  eval SRC=\$IN$i
  echo "  • grading clip $i…"
  ffmpeg -y -loglevel error -ss 0 -t $SEG -i "$SRC" \
    -vf "${SCALE},${GRADE}" -an -c:v libx264 -crf 18 -preset fast "/tmp/gk_seg$i.mp4"
done

echo "  • cross-fading…"
O1=$(echo "$SEG - $XF" | bc)
O2=$(echo "($SEG - $XF) * 2" | bc)

ffmpeg -y -loglevel error \
  -i /tmp/gk_seg1.mp4 -i /tmp/gk_seg2.mp4 -i /tmp/gk_seg3.mp4 \
  -filter_complex \
  "[0][1]xfade=transition=fade:duration=$XF:offset=$O1[a];\
   [a][2]xfade=transition=fade:duration=$XF:offset=$O2[v]" \
  -map "[v]" -an -c:v libx264 -crf 18 -preset fast /tmp/gk_joined.mp4

# Seamless loop: blend the tail back into the head, then drop the
# duplicate head so the file wraps invisibly.
# (Tested: 6.0s source + 1.5s fade → 4.5s seamless output)
echo "  • making it loop seamlessly…"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/gk_joined.mp4)
LOOP_OFF=$(echo "$DUR - $XF" | bc)

ffmpeg -y -loglevel error -i /tmp/gk_joined.mp4 -filter_complex "\
[0:v]trim=0:${XF},setpts=PTS-STARTPTS[head];\
[0:v]trim=${XF}:${LOOP_OFF},setpts=PTS-STARTPTS[mid];\
[0:v]trim=${LOOP_OFF}:${DUR},setpts=PTS-STARTPTS[tail];\
[tail][head]blend=all_expr='A*(1-(T/${XF}))+B*(T/${XF})'[blend];\
[mid][blend]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -an -c:v libx264 -crf 18 -preset fast /tmp/gk_loop.mp4 \
  || { echo "  (seamless pass failed — using straight cut)"; cp /tmp/gk_joined.mp4 /tmp/gk_loop.mp4; }

echo "  • encoding web versions…"
# MP4 (H.264) — universal support
ffmpeg -y -loglevel error -i /tmp/gk_loop.mp4 \
  -c:v libx264 -crf $CRF -preset slow -profile:v main -pix_fmt yuv420p \
  -movflags +faststart -an hero-reel.mp4

# WebM (VP9) — ~30% smaller where supported
ffmpeg -y -loglevel error -i /tmp/gk_loop.mp4 \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -an hero-reel.webm

# Poster — shown instantly while video buffers
ffmpeg -y -loglevel error -i /tmp/gk_loop.mp4 -vframes 1 -q:v 4 hero-poster.jpg

rm -f /tmp/gk_seg*.mp4 /tmp/gk_joined.mp4 /tmp/gk_loop.mp4

echo ""
echo "✅ Done:"
ls -lh hero-reel.mp4 hero-reel.webm hero-poster.jpg | awk '{print "   "$9"  "$5}'
echo ""
echo "⚠  Keep hero-reel.mp4 under ~4 MB. If it's bigger, raise CRF to 32-34"
echo "   or shorten SEG. This file loads on every visit."
