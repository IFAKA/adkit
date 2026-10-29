import fs from 'node:fs';
import path from 'node:path';
import {CliError} from '../util';

const AD = `# yaml-language-server: $schema=https://raw.githubusercontent.com/IFAKA/adkit/main/schema/ad.schema.json
# adkit spec. You write this file; the engine does the rest.
# Run: adkit capture && adkit render && adkit check && adkit tile

meta: {fps: 30, width: 1080, height: 1920, bpm: 120, bars: 7.5}   # 7.5 bars at 120 BPM = 15 s

brief:                       # why this ad exists (for you and for AI agents; not drawn)
  audience: Who is this for?
  message: One sentence the viewer should remember.
  language: en
  tone: warm, confident

brand:
  name: Your Brand
  contact: yourbrand.com     # shown on the end card
  colors: {paper: "#FAF5EE", paperDeep: "#F0E4D4", ink: "#2A211B", glow: "#FFD9B0", accent: "#B4532A", night: "#14181F"}
  icon: {text: Y, color: "#B4532A", textColor: "#FFF3E6"}

capture: capture.yaml        # how to photograph the app (edit selectors there)

scenes:                      # lengths are in bars (4 beats = 2 s at 120 BPM); all times in beats from the scene start
  - block: reveal
    bars: 1.5
    screen: home
    open: rise
    titles:
      - {lines: ["Your promise,", "in *one line.*"], at: 1, to: 5.5, size: 112}   # *word* = accent colour

  - block: tapFlow
    bars: 3
    start: {screen: home}
    titles:
      - {lines: ["Show the *key* action."], at: 1, to: 5, size: 120, scrim: true}
    steps:
      - {type: screen, at: 0.5, screen: shop}
      - {type: tap, at: 3, element: buyButton, press: true}
      - {type: screen, at: 5, screen: done}
    camera:
      - {at: 2.5, zoom: 1.7, focus: {element: buyButton}, qy: 1200, spring: fast, whoosh: true}

  - block: endCard
    bars: 3
    screen: home
    title: {lines: ["Say it *once.*"], at: 0, y: 585, size: 100}
    lockupAt: 2
    contactAt: 3
    hitAt: 4

sound: {key: A, progression: [Am, F, C, G]}

output: {file: out/ad.mp4}
`;

const CAPTURE = `# How to photograph your app. adkit never changes the app folder (isolate: copy works in .adkit/).
app:
  url: http://localhost:3000          # a site that is already running; or use dir + start (see README)
viewport: {width: 390, height: 844, scale: 3}
locale: en-US
timezone: UTC
clock: '2026-03-10T10:00:00Z'         # freezes dates so screenshots do not change
sets:
  main:
    screens:
      - name: home
        steps: [{goto: /}]
      - name: shop
        steps: [{goto: /shop}]
        elements:
          buyButton: 'button.buy'     # CSS / Playwright selector; the video can point at it
      - name: done
        steps: [{goto: /thanks}]
`;

export function init(dir: string) {
  const d = path.resolve(dir);
  if (fs.existsSync(path.join(d, 'ad.yaml'))) throw new CliError(`${path.join(d, 'ad.yaml')} already exists`);
  fs.mkdirSync(d, {recursive: true});
  fs.writeFileSync(path.join(d, 'ad.yaml'), AD);
  fs.writeFileSync(path.join(d, 'capture.yaml'), CAPTURE);
  fs.writeFileSync(path.join(d, '.gitignore'), '.adkit/\nout/\n');
  console.log(`adkit init     created ${path.relative(process.cwd(), d) || '.'}/ad.yaml and capture.yaml. Edit them, then run: adkit capture`);
}
