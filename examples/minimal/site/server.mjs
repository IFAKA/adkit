// Tiny static server for the demo page. Usage: node server.mjs PORT
// THEME=sage|plum|ink changes the colours (used by the "skins" part of the ad).
import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const theme = process.env.THEME || 'clay';
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml'};
const pages = {'/': 'index.html', '/checkout': 'checkout.html', '/thanks': 'thanks.html'};

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const file = join(root, pages[path] ?? path.slice(1));
  if (!file.startsWith(root) || !existsSync(file) || file === root) { res.writeHead(404); return res.end('not found'); }
  let body = readFileSync(file);
  if (extname(file) === '.html') body = Buffer.from(body.toString().replace('<html', `<html data-theme="${theme}"`));
  res.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream'});
  res.end(body);
}).listen(port, () => console.log(`demo page on http://localhost:${port} (theme ${theme})`));
