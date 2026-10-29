#!/bin/sh
# usage: compare.sh NEW.mp4 GOLDEN.mp4  -> mean SSIM over 1 frame per beat (every 15th frame) and loudness of both
set -e
N="$1"; G="$2"
ffmpeg -hide_banner -nostats -i "$N" -i "$G" -lavfi "[0:v]select='not(mod(n\,15))',setpts=N/TB,scale=1080:1920[a];[1:v]select='not(mod(n\,15))',setpts=N/TB,scale=1080:1920[b];[a][b]ssim" -f null - 2>&1 | grep "SSIM" | tail -1
for f in "$N" "$G"; do
  ffmpeg -hide_banner -nostats -i "$f" -vn -af ebur128=peak=true -f null - 2>&1 | awk '/Summary/{s=1} s&&/I:/{printf "%s LUFS  ", $2} s&&/Peak:/{print "TP", $2}'
done
