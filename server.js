/**
 * School Roku CMS — Backend (flat layout for Render)
 * Start: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { load, save, id, now } = require('./db');
const {
  verifyPassword, signToken, verifyToken, randomCode, deviceToken,
} = require('./auth');
const { seed } = require('./seed');

const PORT = Number(process.env.PORT) || 3080;
const STORAGE_DIR = process.env.STORAGE_DIR || __dirname;
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

seed();
fs.mkdirSync(path.join(UPLOAD_DIR, 'images'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'videos'), { recursive: true });

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token',
    ...headers,
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function requireAdmin(req, res) {
  const token = getBearer(req);
  const payload = token && verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    send(res, 401, { error: 'Não autorizado' });
    return null;
  }
  return payload;
}

function getDevice(req) {
  const t = req.headers['x-device-token'] || '';
  if (!t) return null;
  const db = load();
  return db.devices.find((d) => d.token === t && d.status !== 'revoked') || null;
}

function resolveProgram(db, device) {
  const alert = (db.priorityAlerts || []).find((a) => a.active && (!a.deviceIds || !a.deviceIds.length || a.deviceIds.includes(device.id)));
  if (alert) {
    return { version: 'alert-' + alert.id, type: 'priority', alert, items: [] };
  }
  const pubs = (db.publications || []).filter((p) => p.status === 'active' && (!p.deviceIds || !p.deviceIds.length || p.deviceIds.includes(device.id)));
  pubs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const pub = pubs[0];
  if (pub) {
    const pl = (db.playlists || []).find((x) => x.id === pub.playlistId);
    const items = ((pl && pl.items) || []).map((it) => {
      const c = (db.contents || []).find((x) => x.id === it.contentId);
      return c ? { ...c, durationSeconds: it.durationSeconds || 10 } : null;
    }).filter(Boolean);
    return { version: pub.id + '-' + (pub.updatedAt || ''), type: 'playlist', items };
  }
  const def = db.settings && db.settings.defaultContentId
    ? (db.contents || []).find((c) => c.id === db.settings.defaultContentId)
    : null;
  if (def) return { version: 'default-' + def.id, type: 'default', items: [{ ...def, durationSeconds: 15 }] };
  return { version: 'empty', type: 'empty', items: [] };
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') { send(res, 204, ''); return; }
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const method = req.method;

  try {
    if (method === 'GET' && p === '/api/health') {
      send(res, 200, { ok: true, time: now() });
      return;
    }

    if (method === 'GET' && (p === '/' || p === '/admin' || p === '/admin/' || p === '/admin/index.html')) {
      const file = path.join(__dirname, 'index.html');
      if (!fs.existsSync(file)) { send(res, 404, { error: 'Painel não encontrado' }); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(fs.readFileSync(file, 'utf8'));
      return;
    }

    if (method === 'GET' && p.startsWith('/media/')) {
      const rel = decodeURIComponent(p.slice('/media/'.length));
      const filePath = path.resolve(UPLOAD_DIR, rel);
      if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
        send(res, 404, { error: 'Arquivo não encontrado' });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (method === 'POST' && p === '/api/auth/login') {
      const body = await readJson(req);
      const db = load();
      const user = db.users.find((x) => x.email === String(body.email || '').toLowerCase().trim());
      if (!user || !verifyPassword(body.password || '', user.passwordHash)) {
        send(res, 401, { error: 'Credenciais inválidas' });
        return;
      }
      const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
      send(res, 200, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
      return;
    }

    if (method === 'GET' && p === '/api/auth/me') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const user = load().users.find((x) => x.id === payload.sub);
      send(res, 200, { user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null });
      return;
    }

    if (method === 'GET' && p === '/api/devices') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { devices: load().devices });
      return;
    }

    if (method === 'POST' && p === '/api/pairing/claim') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      const code = String(body.code || '').toUpperCase().trim();
      const entry = (db.pairingCodes || []).find((c) => c.code === code && c.expiresAt > now());
      if (!entry) { send(res, 400, { error: 'Código inválido ou expirado' }); return; }
      const token = deviceToken();
      const device = {
        id: id('tv_'),
        name: body.name || 'TV',
        token,
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
        lastSeenAt: null,
        confirmedVersion: null,
      };
      db.devices.push(device);
      db.pairingCodes = db.pairingCodes.filter((c) => c.code !== code);
      db.claimedCodes = db.claimedCodes || {};
      db.claimedCodes[code] = { token, deviceId: device.id, name: device.name, claimedAt: now() };
      save(db);
      send(res, 201, { device: { id: device.id, name: device.name, status: device.status }, token });
      return;
    }

    if (method === 'POST' && /^\/api\/devices\/[^/]+\/revoke$/.test(p)) {
      if (!requireAdmin(req, res)) return;
      const deviceId = p.split('/')[3];
      const db = load();
      const d = db.devices.find((x) => x.id === deviceId);
      if (!d) { send(res, 404, { error: 'TV não encontrada' }); return; }
      d.status = 'revoked';
      d.updatedAt = now();
      save(db);
      send(res, 200, { device: d });
      return;
    }

    if (method === 'GET' && p === '/api/contents') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { contents: load().contents });
      return;
    }

    if (method === 'POST' && p === '/api/contents') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      const content = {
        id: id('cnt_'),
        type: body.type || 'text',
        title: body.title || 'Sem título',
        body: body.body || body.text || '',
        mediaUrl: body.mediaUrl || null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.contents.push(content);
      save(db);
      send(res, 201, { content });
      return;
    }

    if (method === 'GET' && p === '/api/playlists') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { playlists: load().playlists });
      return;
    }

    if (method === 'POST' && p === '/api/playlists') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      const playlist = {
        id: id('pl_'),
        name: body.name || 'Playlist',
        items: body.items || [],
        createdAt: now(),
        updatedAt: now(),
      };
      db.playlists.push(playlist);
      save(db);
      send(res, 201, { playlist });
      return;
    }

    if (method === 'POST' && p === '/api/publications') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      const pub = {
        id: id('pub_'),
        playlistId: body.playlistId,
        deviceIds: body.deviceIds || [],
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
      };
      db.publications = (db.publications || []).map((x) => {
        if (x.status !== 'active') return x;
        if (!pub.deviceIds.length) return { ...x, status: 'cancelled' };
        return x;
      });
      db.publications.push(pub);
      save(db);
      send(res, 201, { publication: pub });
      return;
    }

    if (method === 'GET' && p === '/api/publications') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { publications: load().publications || [] });
      return;
    }

    if (method === 'POST' && p === '/api/priority-alerts') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      (db.priorityAlerts || []).forEach((a) => { a.active = false; });
      const alert = {
        id: id('al_'),
        title: body.title || 'Aviso',
        body: body.body || body.text || '',
        deviceIds: body.deviceIds || [],
        active: true,
        createdAt: now(),
      };
      db.priorityAlerts = db.priorityAlerts || [];
      db.priorityAlerts.push(alert);
      save(db);
      send(res, 201, { alert });
      return;
    }

    if (method === 'POST' && /^\/api\/priority-alerts\/[^/]+\/end$/.test(p)) {
      if (!requireAdmin(req, res)) return;
      const alertId = p.split('/')[3];
      const db = load();
      const a = (db.priorityAlerts || []).find((x) => x.id === alertId);
      if (!a) { send(res, 404, { error: 'Aviso não encontrado' }); return; }
      a.active = false;
      save(db);
      send(res, 200, { alert: a });
      return;
    }

    if (method === 'GET' && p === '/api/priority-alerts') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { alerts: load().priorityAlerts || [] });
      return;
    }

    if (method === 'GET' && p === '/api/tv/program') {
      const device = getDevice(req);
      if (!device) { send(res, 401, { error: 'Dispositivo não autorizado' }); return; }
      const db = load();
      const d = db.devices.find((x) => x.id === device.id);
      if (!d || d.status === 'revoked') { send(res, 401, { error: 'Revogado' }); return; }
      d.lastSeenAt = now();
      save(db);
      const prog = resolveProgram(db, d);
      const items = (prog.items || []).map((it) => {
        if (it.mediaUrl && it.mediaUrl.startsWith('/')) {
          return { ...it, mediaUrl: PUBLIC_BASE + it.mediaUrl };
        }
        return it;
      });
      send(res, 200, { ...prog, items, pollIntervalSeconds: db.settings.pollIntervalSeconds || 20 });
      return;
    }

    if (method === 'POST' && p === '/api/tv/heartbeat') {
      const device = getDevice(req);
      if (!device) { send(res, 401, { error: 'Dispositivo não autorizado' }); return; }
      const body = await readJson(req);
      const db = load();
      const d = db.devices.find((x) => x.id === device.id);
      if (!d || d.status === 'revoked') { send(res, 401, { error: 'Revogado' }); return; }
      d.lastSeenAt = now();
      if (body.confirmedVersion) d.confirmedVersion = body.confirmedVersion;
      d.updatedAt = now();
      save(db);
      const prog = resolveProgram(db, d);
      send(res, 200, {
        ok: true,
        programVersion: prog.version,
        pollIntervalSeconds: db.settings.pollIntervalSeconds || 20,
        needsUpdate: body.confirmedVersion !== prog.version,
      });
      return;
    }

    if (method === 'POST' && p === '/api/tv/pairing-code') {
      const db = load();
      const code = randomCode(6);
      const entry = {
        code,
        expiresAt: new Date(Date.now() + (db.settings.pairingCodeTtlSeconds || 900) * 1000).toISOString(),
        createdAt: now(),
      };
      db.pairingCodes = (db.pairingCodes || []).filter((c) => c.expiresAt > now());
      db.pairingCodes.push(entry);
      save(db);
      send(res, 200, { code, expiresAt: entry.expiresAt, pollUrl: '/api/tv/pairing-status?code=' + code });
      return;
    }

    if (method === 'GET' && p === '/api/tv/pairing-status') {
      const code = String(u.searchParams.get('code') || '').toUpperCase();
      const db = load();
      const pending = (db.pairingCodes || []).find((c) => c.code === code);
      if (pending) {
        send(res, 200, { status: 'pending' });
        return;
      }
      const claimed = (db.claimedCodes || {})[code];
      if (claimed) {
        send(res, 200, { status: 'claimed', token: claimed.token, deviceId: claimed.deviceId, name: claimed.name });
        return;
      }
      send(res, 200, { status: 'unknown' });
      return;
    }

    send(res, 404, { error: 'Não encontrado', path: p });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Erro interno', message: err.message });
  }
}

const server = http.createServer((req, res) => { handler(req, res); });
server.on('error', (err) => {
  console.error('Erro HTTP:', err);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('School Roku CMS em 0.0.0.0:' + PORT);
  console.log('PUBLIC_BASE_URL=' + PUBLIC_BASE);
  console.log('Login: admin@escola.local / admin123');
});
