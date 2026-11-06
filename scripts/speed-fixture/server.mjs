// Fixture app for scripts/speed.sh: a busy page (many shadowed cards, a pulsing dot, a slide-in sheet). Usage: node server.mjs PORT
import {createServer} from 'node:http';
const cards = Array.from({length: 120}, (_, i) => `<div class="c" style="top:${(i % 20) * 60}px;left:${(i % 3) * 120 + 10}px;background:linear-gradient(135deg,hsl(${i * 7},70%,80%),hsl(${i * 7 + 40},70%,60%))">${i}</div>`).join('');
const PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
body{margin:0;font:14px sans-serif;overflow-x:hidden;height:1300px}.c{position:absolute;width:100px;height:50px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.25);color:#222;padding:6px;box-sizing:border-box}
#dot{position:fixed;left:20px;top:20px;width:24px;height:24px;border-radius:12px;background:#d00}
#sheet{position:fixed;left:0;right:0;bottom:0;height:420px;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.3);transform:translateY(100%);transition:transform 400ms cubic-bezier(.2,.8,.2,1)}
#sheet.open{transform:none}#go,#back{position:fixed;right:10px;top:10px;padding:10px}</style>
${cards}<div id=dot></div><button id=go onclick="sheet.classList.add('open')">go</button><button id=back style="top:60px" onclick="sheet.classList.remove('open')">back</button><div id=sheet>sheet</div>
<script>(function f(){dot.style.transform='translateX('+(Math.sin(performance.now()/250)*80+80)+'px)';requestAnimationFrame(f)})()</script>`;
const port = Number(process.argv[2] || process.env.PORT || 4173);
createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); }).listen(port);
