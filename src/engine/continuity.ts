import {spawn} from 'node:child_process';

export type Jump = {frame: number; diff: number};

/** Mean absolute difference (0-255) between each frame and the one before, on a small grey copy of the video. index i = frame i+1. */
export function frameDiffs(video: string, w = 54, h = 96): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', video, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], {stdio: ['ignore', 'pipe', 'inherit']});
    const size = w * h;
    let prev: Buffer | null = null;
    let pending = Buffer.alloc(0);
    const out: number[] = [];
    p.stdout.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= size) {
        const cur = pending.subarray(0, size);
        if (prev) {
          let sum = 0;
          for (let i = 0; i < size; i++) sum += Math.abs(cur[i] - prev[i]);
          out.push(sum / size);
        }
        prev = Buffer.from(cur);
        pending = pending.subarray(size);
      }
    });
    p.on('error', reject);
    p.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve(out)));
  });
}

/**
 * Sudden changes: a frame whose change from the previous frame is more than `maxJump` above the change before it.
 * A hard cut (black to white, one scene to the next) jumps from about 0 to a large value in one frame; a smooth camera move
 * or fade builds up over several frames and stays under the limit. `frame` is the first frame of the new picture.
 * Frames in `cuts` are intended and not reported.
 */
export function findJumps(diffs: number[], maxJump: number, cuts: number[]): Jump[] {
  const ok = new Set(cuts);
  const jumps: Jump[] = [];
  diffs.forEach((d, i) => {
    const rise = d - (i > 0 ? diffs[i - 1] : 0);
    if (rise > maxJump && !ok.has(i + 1)) jumps.push({frame: i + 1, diff: Math.round(rise * 10) / 10});
  });
  return jumps;
}
