/**
 * School Roku CMS — Backend API (Node.js puro, sem dependências npm)
 * Porta padrão: 3080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { load, save, id, now } = require('./db');
const {
  verifyPassword,
  signToken,
  verifyToken,
  randomCode,
  deviceToken,
} = require('./auth');
const { seed } = require('./seed');

const PORT = process.env.PORT || 3080;
const STORAGE_DIR = process.env.STORAGE_DIR || __dirname;
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime']);
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 150 * 1024 * 1024;

seed();
fs.mkdirSync(path.join(UPLOAD_DIR, 'images'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'videos'), { recursive: true });

console.log('Boot ok - se esta mensagem aparecer no log do Render, o Start Command esta certo');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  if (req.url === '/api/health') {
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }
  // Redireciona handler completo se existir; fallback minimo
  try {
    const full = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
    if ((req.url === '/' || req.url === '/admin' || req.url.startsWith('/admin')) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(full);
      return;
    }
  } catch (e) {}
  res.end('School Roku CMS backend online. Use /api/health');
});

server.on('error', (err) => {
  console.error('Erro no servidor HTTP:', err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('School Roku CMS API em 0.0.0.0:' + PORT);
  console.log('PUBLIC_BASE_URL=' + PUBLIC_BASE);
});
