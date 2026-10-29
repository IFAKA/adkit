#!/bin/sh
# Proves the per-scene cache on a copy of the minimal example:
#   1. full render  2. change one title  3. re-render (only that scene rebuilds)
#   4. render the same spec from scratch (--force)  5. both videos are byte-identical.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=${1:-/tmp/adkit-cache-proof}
rm -rf "$W" && mkdir -p "$W"
cp -R "$ROOT/examples/minimal/." "$W/"
A="nice -n 15 node $ROOT/bin/adkit.mjs"
echo "== 1. first render (cold)"; $A render "$W" --out out/a.mp4
echo "== 2. nothing changed"; $A render "$W" --out out/a.mp4
echo "== 3. change one title in scene 'order'"
sed -i.bak 's/\["Pay \*once\.\*"\]/["Pay *in_one_tap.*"]/' "$W/ad.yaml"; rm "$W/ad.yaml.bak"
grep -n "one_tap" "$W/ad.yaml"
$A render "$W" --out out/b.mp4
echo "== 4. same spec from scratch (--force)"; $A render "$W" --force --out out/c.mp4
echo "== 5. identical?"
shasum -a 256 "$W/out/b.mp4" "$W/out/c.mp4"
cmp "$W/out/b.mp4" "$W/out/c.mp4" && echo "IDENTICAL: partial render == full render"
