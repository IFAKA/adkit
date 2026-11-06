#!/usr/bin/env bash
# Speed guard for capture. One line out: per-step wall and CPU seconds. Full log: .speed/speed.log (not tracked).
#   scripts/speed.sh              measure and print
#   scripts/speed.sh --save       also write the base file scripts/speed.base.json (tracked)
#   scripts/speed.sh --vs-base    compare with the base; exit 1 if a step is >20% slower
# Steps (fixture scripts/speed-fixture, 60-frame takes at scale 3):
#   take  = 1 set, 1 take                   (cost of one frame: screenshot, clock, wait)
#   sets  = 3 sets side by side             (parallel sets)
#   indep = 1 set, 4 independent screens    (parallel screens)
# CPU = user+sys of the whole process tree (Chrome included); steadier than wall on a shared machine.
# A failure on wall alone is re-run once (load from other sessions); a failure on CPU stands.
set -u
cd "$(dirname "$0")/.."
BASE=scripts/speed.base.json
LOG=.speed/speed.log
mkdir -p .speed
FRAMES=${SPEED_FRAMES:-60}
MODE=print
for a in "$@"; do case $a in --save) MODE=save;; --vs-base) MODE=vs;; *) echo "unknown flag $a" >&2; exit 2;; esac; done

measure() { # prints {"take":{"wall":..,"cpu":..},...}
python3 - "$FRAMES" "$LOG" <<'PY'
import json, resource, subprocess, sys, time
frames, log = sys.argv[1:3]
out = {'frames': int(frames)}
for name in ('take', 'sets', 'indep'):
    r0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    t = time.time()
    p = subprocess.run(['npx', 'tsx', 'scripts/speed.mts', name, '--frames', frames], capture_output=True, text=True)
    wall = time.time() - t
    r1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    with open(log, 'a') as f:
        f.write(f'=== {name} exit={p.returncode} wall={wall:.1f}\n{p.stdout}\n{p.stderr[-2000:]}\n')
    if p.returncode != 0:
        print(f'step {name} failed, see {log}', file=sys.stderr); sys.exit(3)
    out[name] = {'wall': round(wall, 2), 'cpu': round(r1.ru_utime + r1.ru_stime - r0.ru_utime - r0.ru_stime, 2)}
print(json.dumps(out))
PY
}

compare() { # base json, new json -> prints problems; exit 1 if any
python3 - "$1" "$2" <<'PY'
import json, sys
b = json.load(open(sys.argv[1])); n = json.loads(sys.argv[2]); bad = 0
for s in ('take', 'sets', 'indep'):
    for k in ('wall', 'cpu'):
        r = n[s][k] / b[s][k]
        if r > 1.2:
            print(f'SLOWER {s} {k}: {n[s][k]} vs base {b[s][k]} ({r:.2f}x)'); bad = 1
sys.exit(bad)
PY
}

: > "$LOG"
echo "load $(uptime | sed 's/.*averages: //')" >> "$LOG"
json=$(measure) || exit 3
line() {
  echo "$1" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("speed: " + " | ".join("%s %ss wall %ss cpu" % (s, d[s]["wall"], d[s]["cpu"]) for s in ("take", "sets", "indep")) + " (%d frames, log %s)" % (d["frames"], sys.argv[1]))' "$LOG"
}
line "$json"
case $MODE in
  save) echo "$json" > $BASE; echo "saved $BASE";;
  vs)
    [ -f $BASE ] || { echo "no base file $BASE (run --save first)"; exit 1; }
    if compare $BASE "$json"; then echo "vs base: ok"; exit 0; fi
    echo "retrying once (wall noise on a shared machine?)"
    json2=$(measure) || exit 3
    line "$json2"
    # best of the two runs per number
    best=$(python3 -c '
import json,sys
a=json.loads(sys.argv[1]); b=json.loads(sys.argv[2])
print(json.dumps({"frames":a["frames"],**{s:{k:min(a[s][k],b[s][k]) for k in ("wall","cpu")} for s in ("take","sets","indep")}}))' "$json" "$json2")
    if compare $BASE "$best"; then echo "vs base: ok (after retry)"; exit 0; fi
    echo "vs base: FAIL"; exit 1;;
esac
