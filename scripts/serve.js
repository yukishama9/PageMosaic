#!/usr/bin/env node
/**
 * scripts/serve.js — Minimal static file server for PageMosaic
 * Usage: node scripts/serve.js [port]
 * Default port: 8765
 * Opens http://localhost:8765/builder/ automatically.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = parseInt(process.argv[2]) || 8765;
const ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.gif':   'image/gif',
  '.ico':   'image/x-icon',
  '.json':  'application/json',
  '.md':    'text/plain; charset=utf-8',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
};

const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url).pathname;
  const decoded  = decodeURIComponent(parsed);
  let   filePath = path.join(ROOT, decoded);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + decoded);
    return;
  }

  try {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://localhost:${PORT}/builder/`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║  PageMosaic Dev Server                   ║');
  console.log(`  ║  ${addr.padEnd(40)}║`);
  console.log('  ║  Press Ctrl+C to stop.                   ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // Try to open browser automatically
  const { exec } = require('child_process');
  const open = process.platform === 'win32'  ? `start "" "${addr}"` :
               process.platform === 'darwin' ? `open "${addr}"` :
                                               `xdg-open "${addr}"`;
  exec(open, (err) => { if (err) console.log('  → Open manually:', addr); });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ERROR: Port ${PORT} is already in use. Try: node scripts/serve.js 8766\n`);
  } else {
    console.error('\n  Server error:', e.message, '\n');
  }
  process.exit(1);
});