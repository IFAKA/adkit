#!/bin/sh
N=${N:-3}
rm -rf /tmp/exp/r*
for i in $(seq 1 $N); do nice -n 15 npx tsx scripts/det-exp.mts /tmp/exp/r$i 2>&1 | tail -3; done
cd /tmp/exp; t=0; for i in $(seq 2 $N); do for f in r1/*.jpg; do cmp -s $f r$i/$(basename $f) || { echo DIFF r$i $(basename $f); t=$((t+1)); }; done; done; echo "total diffs: $t"
