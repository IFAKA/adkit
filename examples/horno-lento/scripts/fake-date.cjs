// Preloaded into the shop's Node server (NODE_OPTIONS=--require ...) so the server agrees with the browser's frozen clock.
// FAKE_NOW=<ISO time>: new Date() and Date.now() start at that time and then run normally.
const target = Date.parse(process.env.FAKE_NOW || '');
if (!Number.isNaN(target)) {
  const RealDate = Date;
  const offset = target - RealDate.now();
  const now = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    construct: (t, args, nt) => (args.length === 0 ? new t(now()) : Reflect.construct(t, args, nt)),
    get: (t, k) => (k === 'now' ? now : t[k]),
    apply: (t) => new t(now()).toString(),
  });
}
