// Games are no longer inlined in the hub: the page downloads a game document
// over HTTP when its card is opened, which a file:// page cannot do. Every
// suite therefore serves the repository over loopback the way GitHub Pages
// serves it, so the tests exercise the real path a player takes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(root, pathname);
    // A request that escapes the repository is not a game document.
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    resolve({ origin, url: origin + '/index.html', close: () => new Promise(done => server.close(done)) });
  }));
}

module.exports = { serve };
