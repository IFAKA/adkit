#!/usr/bin/env bash
# Are two captures pixel-identical? Usage: scripts/speed-same.sh DIR_A DIR_B   (two .seq folders, or two capture folders)
# Compares every PNG pair by decoded pixels (file bytes may differ when the PNG encoder differs). Prints "same N frames" or the first differences; exit 1 on any.
a=$1; b=$2; bad=0; n=0
while IFS= read -r f; do
  r=$(compare -metric AE "$a/$f" "$b/$f" null: 2>&1); n=$((n+1))
  [ "${r%% *}" = "0" ] || { echo "DIFF $f: $r px"; bad=$((bad+1)); [ $bad -ge 5 ] && break; }
done < <(cd "$a" && find . -name '*.png' | sort)
[ $bad -eq 0 ] && echo "same $n images" || exit 1
