import {parseArgs} from 'node:util';
import {CompileError} from '../engine/compile';
import {SpecError} from '../spec/load';
import {CliError} from './util';

const HELP = `adkit - make a professional motion-design product ad from one spec file (ad.yaml)

Usage: adkit <command> [ad.yaml | folder] [options]

  init <dir>     write a commented starter ad.yaml + capture.yaml
  capture        photograph the app (screens + element boxes), cached by app + capture spec
                   --force  --set NAME  --screen NAME
  build          compile the spec; write .adkit/plan.json, cues.json; synthesise the audio (cached)
  render         capture + build + render only the scenes that changed + encode
                   --out FILE  --force
  check          verify the video and the spec (size, grid, loudness, safe zones, text size, captures)
  tile           contact sheet PNG of the video (1 frame per second)
                   --from F --to T [--count N]  a frame range instead   --cols N  --out FILE
  studio         open Remotion Studio on the plan
  schema         print the path of the JSON Schema for ad.yaml

Logs: .adkit/logs/<step>.log next to ad.yaml. Exit code is non-zero on failure.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') { console.log(HELP); return; }
  const {values, positionals} = parseArgs({
    args: rest, allowPositionals: true,
    options: {
      force: {type: 'boolean'}, out: {type: 'string'}, set: {type: 'string'}, screen: {type: 'string'}, video: {type: 'string'},
      from: {type: 'string'}, to: {type: 'string'}, count: {type: 'string'}, cols: {type: 'string'}, 'no-warm': {type: 'boolean'},
    },
  });
  const num = (s?: string) => (s === undefined ? undefined : Number(s));
  if (cmd === 'init') {
    if (!positionals[0]) throw new CliError('usage: adkit init <dir>');
    (await import('./commands/init')).init(positionals[0]);
    return;
  }
  if (cmd === 'schema') { console.log(new URL('../../schema/ad.schema.json', import.meta.url).pathname); return; }
  const {openProject} = await import('./project');
  const p = openProject(positionals[0]);
  switch (cmd) {
    case 'capture': await (await import('./commands/capture')).capture(p, {force: values.force, set: values.set, screen: values.screen}); break;
    case 'build': await (await import('./commands/build')).build(p, {force: values.force}); break;
    case 'render': await (await import('./commands/render')).render(p, {force: values.force, out: values.out}); break;
    case 'check': { const r = await (await import('./commands/check')).check(p, {video: values.video, warm: !values['no-warm']}); if (r.failed) process.exitCode = 1; break; }
    case 'tile': await (await import('./commands/tile')).tile(p, {video: values.video, out: values.out, from: num(values.from), to: num(values.to), count: num(values.count), cols: num(values.cols)}); break;
    case 'studio': await (await import('./commands/studio')).studio(p); break;
    default: throw new CliError(`unknown command "${cmd}". Run "adkit help".`);
  }
}

main().then(() => process.exit(process.exitCode ?? 0), (e: unknown) => {
  if (e instanceof SpecError || e instanceof CompileError || e instanceof CliError) console.error(`adkit: ${e.message}`);
  else console.error('adkit: failed:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
