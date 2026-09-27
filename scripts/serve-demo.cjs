const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || __dirname);
const port = Number(process.argv[3] || 4399);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.wasm':'application/wasm', '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8', '.zip':'application/zip', '.jar':'application/java-archive', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.woff':'font/woff', '.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + name);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {res.writeHead(403).end(); return;}
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      if (path.extname(file)) { res.writeHead(404).end('Asset not found'); return; }
      file = path.join(root, 'index.html');
    }
    if (!fs.existsSync(file)) {res.writeHead(503).end('Build output is not ready.'); return;}
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch (_) {res.writeHead(400).end('Invalid request');}
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open the existing demo or select another port.` : error.message); process.exitCode = 1;});
server.listen(port, '127.0.0.1', () => console.log(`Demo: http://127.0.0.1:${port}/\nServing ${root}\nPress Ctrl+C to stop.`));

