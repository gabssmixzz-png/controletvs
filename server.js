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
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime']);
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 150 * 1024 * 1024;

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 200 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

function getAuth(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return verifyToken(h.slice(7));
  return null;
}

function requireAdmin(req, res) {
  const payload = getAuth(req);
  if (!payload || payload.role !== 'admin') {
    send(res, 401, { error: 'Não autorizado' });
    return null;
  }
  return payload;
}

function getDevice(req) {
  const token = req.headers['x-device-token'];
  if (!token) return null;
  const db = load();
  return db.devices.find((d) => d.token === token && d.status !== 'revoked') || null;
}

function audit(db, action, actor, details) {
  db.auditLog.unshift({
    id: id('log_'),
    action,
    actor: actor || 'system',
    details: details || {},
    at: now(),
  });
  if (db.auditLog.length > 500) db.auditLog.length = 500;
}

function deviceStatus(device, settings) {
  if (!device.lastSeenAt) return 'never_connected';
  const last = new Date(device.lastSeenAt).getTime();
  const grace = (settings.offlineGraceSeconds || 90) * 1000;
  return Date.now() - last <= grace ? 'online' : 'offline';
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let start = 0;
  while (true) {
    const idx = buf.indexOf(sep, start);
    if (idx === -1) break;
    if (start > 0) {
      let part = buf.slice(start, idx);
      if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
      if (part.length > 4) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headerStr = part.slice(0, headerEnd).toString();
          let body = part.slice(headerEnd + 4);
          if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
          const nameMatch = /name="([^"]+)"/.exec(headerStr);
          const fileMatch = /filename="([^"]+)"/.exec(headerStr);
          const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr);
          parts.push({
            name: nameMatch ? nameMatch[1] : null,
            filename: fileMatch ? fileMatch[1] : null,
            contentType: typeMatch ? typeMatch[1].trim() : null,
            data: body,
          });
        }
      }
    }
    start = idx + sep.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    if (buf.slice(start, start + 2).toString() === '\r\n') start += 2;
  }
  return parts;
}

function contentPublicUrl(content) {
  if (!content || !content.filePath) return null;
  const rel = content.filePath.replace(/\\/g, '/');
  const marker = '/uploads/';
  const i = rel.lastIndexOf(marker);
  const sub = i >= 0 ? rel.slice(i + marker.length) : path.basename(rel);
  return `${PUBLIC_BASE}/media/${sub}`;
}

function enrichContent(c) {
  return { ...c, url: contentPublicUrl(c) };
}

function resolvePlaylistForDevice(db, device) {
  const nowMs = Date.now();
  const alert = db.priorityAlerts.find(
    (a) =>
      a.active &&
      (!a.deviceIds.length || a.deviceIds.includes(device.id)) &&
      new Date(a.startsAt).getTime() <= nowMs &&
      new Date(a.endsAt).getTime() > nowMs
  );
  if (alert) {
    return {
      type: 'priority_alert',
      version: `alert-${alert.id}-${alert.updatedAt || alert.createdAt}`,
      alert: {
        id: alert.id,
        message: alert.message,
        durationSeconds: alert.durationSeconds,
        endsAt: alert.endsAt,
      },
      items: [],
      loop: false,
    };
  }

  const pubs = db.publications
    .filter((p) => {
      if (p.status !== 'active') return false;
      const targetsDevice =
        p.targetAll ||
        (p.deviceIds && p.deviceIds.includes(device.id)) ||
        (p.groupIds && p.groupIds.some((g) => (device.groupIds || []).includes(g)));
      if (!targetsDevice) return false;
      const start = p.startsAt ? new Date(p.startsAt).getTime() : 0;
      const end = p.endsAt ? new Date(p.endsAt).getTime() : Infinity;
      return nowMs >= start && nowMs <= end;
    })
    .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));

  const pub = pubs[0];
  let playlist = pub ? db.playlists.find((pl) => pl.id === pub.playlistId) : null;

  if (!playlist && db.settings.defaultContentId) {
    const def = db.contents.find((c) => c.id === db.settings.defaultContentId);
    if (def) {
      return {
        type: 'default',
        version: `default-${def.id}-${def.updatedAt || def.createdAt}`,
        items: [
          {
            contentId: def.id,
            type: def.type,
            durationSeconds: def.durationSeconds || 15,
            content: enrichContent(def),
          },
        ],
        loop: true,
      };
    }
  }

  if (!playlist) {
    return { type: 'empty', version: 'empty', items: [], loop: true };
  }

  const items = (playlist.items || []).map((it) => {
    const content = db.contents.find((c) => c.id === it.contentId);
    return {
      contentId: it.contentId,
      type: content ? content.type : 'unknown',
      durationSeconds: it.durationSeconds || (content && content.durationSeconds) || 15,
      content: content ? enrichContent(content) : null,
    };
  });

  return {
    type: 'playlist',
    version: `pub-${pub.id}-pl-${playlist.id}-v${playlist.version || 1}`,
    publicationId: pub.id,
    playlistId: playlist.id,
    playlistName: playlist.name,
    loop: playlist.loop !== false,
    items,
  };
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method;
  const p = url.pathname;

  if (method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  try {
    if (method === 'GET' && p === '/api/health') {
      send(res, 200, { ok: true, time: now() });
      return;
    }

    // Painel admin (mesma URL do servidor — iPad)
    if (method === 'GET' && (p === '/' || p === '/admin' || p === '/admin/' || p === '/admin/index.html')) {
      const candidates = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
      ];
      const file = candidates.find((f) => fs.existsSync(f));
      if (!file) {
        send(res, 404, { error: 'Painel admin não encontrado (backend/public/index.html).' });
        return;
      }
      const html = fs.readFileSync(file, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(html);
      return;
    }

    if (method === 'GET' && p.startsWith('/media/')) {
      const rel = decodeURIComponent(p.slice('/media/'.length));
      const filePath = path.normalize(path.join(UPLOAD_DIR, rel));
      if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
        send(res, 404, { error: 'Arquivo não encontrado' });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
      };
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
      return;
    }

    // Auth
    if (method === 'POST' && p === '/api/auth/login') {
      const body = await readJson(req);
      const db = load();
      const user = db.users.find((u) => u.email === (body.email || '').toLowerCase().trim());
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
      const db = load();
      const user = db.users.find((u) => u.id === payload.sub);
      send(res, 200, { user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null });
      return;
    }

    if (method === 'GET' && p === '/api/settings') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { settings: load().settings });
      return;
    }

    if (method === 'PUT' && p === '/api/settings') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const db = load();
      db.settings = { ...db.settings, ...body };
      audit(db, 'settings.update', payload.email, body);
      save(db);
      send(res, 200, { settings: db.settings });
      return;
    }

    // Pair device
    if (method === 'POST' && p === '/api/devices/pair') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const code = (body.code || '').toUpperCase().trim();
      const name = (body.name || '').trim();
      if (!code || !name) {
        send(res, 400, { error: 'Código e nome são obrigatórios' });
        return;
      }
      const db = load();
      const pairing = db.pairingCodes.find(
        (c) => c.code === code && !c.used && new Date(c.expiresAt).getTime() > Date.now()
      );
      if (!pairing) {
        send(res, 400, { error: 'Código inválido ou expirado' });
        return;
      }
      pairing.used = true;
      pairing.usedAt = now();
      const device = {
        id: id('dev_'),
        name,
        description: body.description || '',
        location: body.location || '',
        groupIds: body.groupIds || [],
        token: deviceToken(),
        status: 'active',
        lastSeenAt: null,
        confirmedVersion: null,
        assignedVersion: null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.devices.push(device);
      // Vincula o código ao dispositivo exato que acabou de ser criado.
      pairing.deviceId = device.id;
      audit(db, 'device.pair', payload.email, { deviceId: device.id, name, code });
      save(db);
      send(res, 201, {
        device: {
          id: device.id, name: device.name, description: device.description,
          location: device.location, groupIds: device.groupIds, status: device.status, createdAt: device.createdAt,
        },
      });
      return;
    }

    if (method === 'GET' && p === '/api/devices') {
      if (!requireAdmin(req, res)) return;
      const db = load();
      send(res, 200, {
        devices: db.devices.map((d) => ({
          id: d.id, name: d.name, description: d.description, location: d.location,
          groupIds: d.groupIds || [], status: d.status,
          connectionStatus: deviceStatus(d, db.settings),
          lastSeenAt: d.lastSeenAt, confirmedVersion: d.confirmedVersion,
          assignedVersion: d.assignedVersion, createdAt: d.createdAt, updatedAt: d.updatedAt,
        })),
      });
      return;
    }

    if (method === 'GET' && /^\/api\/devices\/[^/]+$/.test(p)) {
      if (!requireAdmin(req, res)) return;
      const deviceId = p.split('/')[3];
      const db = load();
      const d = db.devices.find((x) => x.id === deviceId);
      if (!d) { send(res, 404, { error: 'TV não encontrada' }); return; }
      send(res, 200, {
        device: {
          ...d, token: undefined,
          connectionStatus: deviceStatus(d, db.settings),
          currentProgram: resolvePlaylistForDevice(db, d),
        },
      });
      return;
    }

    if (method === 'PUT' && /^\/api\/devices\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const deviceId = p.split('/')[3];
      const body = await readJson(req);
      const db = load();
      const d = db.devices.find((x) => x.id === deviceId);
      if (!d) { send(res, 404, { error: 'TV não encontrada' }); return; }
      ['name', 'description', 'location', 'groupIds'].forEach((k) => {
        if (body[k] !== undefined) d[k] = body[k];
      });
      d.updatedAt = now();
      audit(db, 'device.update', payload.email, { deviceId, body });
      save(db);
      send(res, 200, { device: { ...d, token: undefined } });
      return;
    }

    if (method === 'POST' && /^\/api\/devices\/[^/]+\/revoke$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const deviceId = p.split('/')[3];
      const db = load();
      const d = db.devices.find((x) => x.id === deviceId);
      if (!d) { send(res, 404, { error: 'TV não encontrada' }); return; }
      d.status = 'revoked';
      d.token = deviceToken();
      d.updatedAt = now();
      audit(db, 'device.revoke', payload.email, { deviceId });
      save(db);
      send(res, 200, { ok: true });
      return;
    }

    // Groups
    if (method === 'GET' && p === '/api/groups') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { groups: load().groups });
      return;
    }
    if (method === 'POST' && p === '/api/groups') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const db = load();
      const g = { id: id('grp_'), name: body.name || 'Grupo', description: body.description || '', createdAt: now() };
      db.groups.push(g);
      audit(db, 'group.create', payload.email, { groupId: g.id });
      save(db);
      send(res, 201, { group: g });
      return;
    }
    if (method === 'PUT' && /^\/api\/groups\/[^/]+$/.test(p)) {
      if (!requireAdmin(req, res)) return;
      const gid = p.split('/')[3];
      const body = await readJson(req);
      const db = load();
      const g = db.groups.find((x) => x.id === gid);
      if (!g) { send(res, 404, { error: 'Grupo não encontrado' }); return; }
      if (body.name !== undefined) g.name = body.name;
      if (body.description !== undefined) g.description = body.description;
      save(db);
      send(res, 200, { group: g });
      return;
    }
    if (method === 'DELETE' && /^\/api\/groups\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const gid = p.split('/')[3];
      const db = load();
      db.groups = db.groups.filter((x) => x.id !== gid);
      db.devices.forEach((d) => { d.groupIds = (d.groupIds || []).filter((x) => x !== gid); });
      audit(db, 'group.delete', payload.email, { groupId: gid });
      save(db);
      send(res, 200, { ok: true });
      return;
    }

    // Contents
    if (method === 'GET' && p === '/api/contents') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { contents: load().contents.map(enrichContent) });
      return;
    }
    if (method === 'POST' && p === '/api/contents') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const allowed = ['text', 'image', 'video', 'slide', 'schedule', 'qrcode', 'countdown'];
      if (!allowed.includes(body.type)) {
        send(res, 400, { error: 'Tipo inválido', allowed });
        return;
      }
      const db = load();
      const content = {
        id: id('cnt_'), type: body.type, title: body.title || '', body: body.body || '',
        description: body.description || '', urlTarget: body.urlTarget || '',
        targetAt: body.targetAt || null, durationSeconds: body.durationSeconds || 15,
        filePath: body.filePath || null, fileHash: body.fileHash || null,
        meta: body.meta || {}, createdAt: now(), updatedAt: now(),
      };
      db.contents.push(content);
      audit(db, 'content.create', payload.email, { contentId: content.id, type: content.type });
      save(db);
      send(res, 201, { content: enrichContent(content) });
      return;
    }
    if (method === 'PUT' && /^\/api\/contents\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const cid = p.split('/')[3];
      const body = await readJson(req);
      const db = load();
      const c = db.contents.find((x) => x.id === cid);
      if (!c) { send(res, 404, { error: 'Conteúdo não encontrado' }); return; }
      ['title', 'body', 'description', 'urlTarget', 'targetAt', 'durationSeconds', 'meta', 'filePath', 'fileHash'].forEach((k) => {
        if (body[k] !== undefined) c[k] = body[k];
      });
      c.updatedAt = now();
      audit(db, 'content.update', payload.email, { contentId: cid });
      save(db);
      send(res, 200, { content: enrichContent(c) });
      return;
    }
    if (method === 'DELETE' && /^\/api\/contents\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const cid = p.split('/')[3];
      const db = load();
      db.contents = db.contents.filter((x) => x.id !== cid);
      db.playlists.forEach((pl) => {
        pl.items = (pl.items || []).filter((it) => it.contentId !== cid);
        pl.version = (pl.version || 1) + 1;
      });
      if (db.settings.defaultContentId === cid) db.settings.defaultContentId = null;
      audit(db, 'content.delete', payload.email, { contentId: cid });
      save(db);
      send(res, 200, { ok: true });
      return;
    }

    // Upload
    if (method === 'POST' && p === '/api/upload') {
      if (!requireAdmin(req, res)) return;
      const ctype = req.headers['content-type'] || '';
      if (!ctype.includes('multipart/form-data')) {
        send(res, 400, { error: 'Use multipart/form-data' });
        return;
      }
      const boundaryMatch = /boundary=(.+)$/i.exec(ctype);
      if (!boundaryMatch) { send(res, 400, { error: 'Boundary ausente' }); return; }
      const buf = await readBody(req);
      const parts = parseMultipart(buf, boundaryMatch[1].trim());
      const filePart = parts.find((x) => x.filename);
      if (!filePart) { send(res, 400, { error: 'Arquivo não enviado' }); return; }
      const kindPart = parts.find((x) => x.name === 'kind');
      const kindStr = kindPart ? kindPart.data.toString().trim() : 'image';
      const ct = filePart.contentType || '';
      if (kindStr === 'image') {
        if (!ALLOWED_IMAGE.has(ct)) {
          send(res, 400, { error: 'Formato de imagem não suportado', accepted: [...ALLOWED_IMAGE], received: ct });
          return;
        }
        if (filePart.data.length > MAX_IMAGE) {
          send(res, 400, { error: `Imagem acima do limite de ${MAX_IMAGE / 1024 / 1024} MB` });
          return;
        }
      } else if (kindStr === 'video') {
        if (!ALLOWED_VIDEO.has(ct)) {
          send(res, 400, { error: 'Formato de vídeo não suportado. Use MP4 (H.264).', accepted: [...ALLOWED_VIDEO], received: ct });
          return;
        }
        if (filePart.data.length > MAX_VIDEO) {
          send(res, 400, { error: `Vídeo acima do limite de ${MAX_VIDEO / 1024 / 1024} MB` });
          return;
        }
      } else {
        send(res, 400, { error: 'kind deve ser image ou video' });
        return;
      }
      const extMap = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
        'video/mp4': '.mp4', 'video/quicktime': '.mov',
      };
      const ext = extMap[ct] || path.extname(filePart.filename) || '';
      const sub = kindStr === 'video' ? 'videos' : 'images';
      const fname = `${Date.now()}_${id()}${ext}`;
      const dest = path.join(UPLOAD_DIR, sub, fname);
      fs.writeFileSync(dest, filePart.data);
      const hash = crypto.createHash('sha256').update(filePart.data).digest('hex');
      send(res, 201, {
        filePath: dest, relativePath: `${sub}/${fname}`,
        url: `${PUBLIC_BASE}/media/${sub}/${fname}`,
        contentType: ct, size: filePart.data.length, fileHash: hash,
      });
      return;
    }

    // Playlists
    if (method === 'GET' && p === '/api/playlists') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { playlists: load().playlists });
      return;
    }
    if (method === 'POST' && p === '/api/playlists') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const db = load();
      const pl = {
        id: id('pl_'), name: body.name || 'Playlist', items: body.items || [],
        loop: body.loop !== false, version: 1, createdAt: now(), updatedAt: now(),
      };
      db.playlists.push(pl);
      audit(db, 'playlist.create', payload.email, { playlistId: pl.id });
      save(db);
      send(res, 201, { playlist: pl });
      return;
    }
    if (method === 'PUT' && /^\/api\/playlists\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const pid = p.split('/')[3];
      const body = await readJson(req);
      const db = load();
      const pl = db.playlists.find((x) => x.id === pid);
      if (!pl) { send(res, 404, { error: 'Playlist não encontrada' }); return; }
      if (body.name !== undefined) pl.name = body.name;
      if (body.items !== undefined) pl.items = body.items;
      if (body.loop !== undefined) pl.loop = body.loop;
      pl.version = (pl.version || 1) + 1;
      pl.updatedAt = now();
      audit(db, 'playlist.update', payload.email, { playlistId: pid });
      save(db);
      send(res, 200, { playlist: pl });
      return;
    }
    if (method === 'DELETE' && /^\/api\/playlists\/[^/]+$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const pid = p.split('/')[3];
      const db = load();
      db.playlists = db.playlists.filter((x) => x.id !== pid);
      audit(db, 'playlist.delete', payload.email, { playlistId: pid });
      save(db);
      send(res, 200, { ok: true });
      return;
    }

    // Publications
    if (method === 'GET' && p === '/api/publications') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { publications: load().publications });
      return;
    }
    if (method === 'POST' && p === '/api/publications') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const db = load();
      const pub = {
        id: id('pub_'), playlistId: body.playlistId,
        deviceIds: body.deviceIds || [], groupIds: body.groupIds || [],
        targetAll: !!body.targetAll, startsAt: body.startsAt || now(),
        endsAt: body.endsAt || null, status: 'active',
        publishedAt: now(), createdAt: now(),
      };
      db.publications.push(pub);
      const pl = db.playlists.find((x) => x.id === pub.playlistId);
      const ver = pl ? `pub-${pub.id}-pl-${pl.id}-v${pl.version || 1}` : `pub-${pub.id}`;
      db.devices.forEach((d) => {
        if (d.status === 'revoked') return;
        const hit = pub.targetAll ||
          (pub.deviceIds && pub.deviceIds.includes(d.id)) ||
          (pub.groupIds && pub.groupIds.some((g) => (d.groupIds || []).includes(g)));
        if (hit) d.assignedVersion = ver;
      });
      audit(db, 'publication.create', payload.email, { publicationId: pub.id });
      save(db);
      send(res, 201, { publication: pub });
      return;
    }
    if (method === 'POST' && /^\/api\/publications\/[^/]+\/cancel$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const pubId = p.split('/')[3];
      const db = load();
      const pub = db.publications.find((x) => x.id === pubId);
      if (!pub) { send(res, 404, { error: 'Publicação não encontrada' }); return; }
      pub.status = 'cancelled';
      audit(db, 'publication.cancel', payload.email, { publicationId: pubId });
      save(db);
      send(res, 200, { publication: pub });
      return;
    }

    // Priority alerts
    if (method === 'GET' && p === '/api/priority-alerts') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { alerts: load().priorityAlerts });
      return;
    }
    if (method === 'POST' && p === '/api/priority-alerts') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      if (!body.message || !body.durationSeconds) {
        send(res, 400, { error: 'message e durationSeconds são obrigatórios' });
        return;
      }
      const db = load();
      const startsAt = now();
      const endsAt = new Date(Date.now() + Number(body.durationSeconds) * 1000).toISOString();
      const alert = {
        id: id('al_'), message: body.message, deviceIds: body.deviceIds || [],
        durationSeconds: Number(body.durationSeconds), startsAt, endsAt,
        active: true, createdAt: startsAt, updatedAt: startsAt, createdBy: payload.email,
      };
      db.priorityAlerts.push(alert);
      audit(db, 'priority_alert.create', payload.email, { alertId: alert.id });
      save(db);
      send(res, 201, { alert });
      return;
    }
    if (method === 'POST' && /^\/api\/priority-alerts\/[^/]+\/cancel$/.test(p)) {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const aid = p.split('/')[3];
      const db = load();
      const alert = db.priorityAlerts.find((x) => x.id === aid);
      if (!alert) { send(res, 404, { error: 'Aviso não encontrado' }); return; }
      alert.active = false;
      alert.endsAt = now();
      alert.updatedAt = now();
      audit(db, 'priority_alert.cancel', payload.email, { alertId: aid });
      save(db);
      send(res, 200, { alert });
      return;
    }

    if (method === 'POST' && p === '/api/settings/default-content') {
      const payload = requireAdmin(req, res);
      if (!payload) return;
      const body = await readJson(req);
      const db = load();
      db.settings.defaultContentId = body.contentId || null;
      audit(db, 'settings.default_content', payload.email, body);
      save(db);
      send(res, 200, { settings: db.settings });
      return;
    }

    if (method === 'GET' && p === '/api/audit') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { logs: load().auditLog.slice(0, 100) });
      return;
    }

    if (method === 'GET' && p === '/api/fair') {
      if (!requireAdmin(req, res)) return;
      send(res, 200, { fair: load().fairDemo });
      return;
    }
    if (method === 'PUT' && p === '/api/fair') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      const db = load();
      db.fairDemo = { ...db.fairDemo, ...body, isDemo: true };
      save(db);
      send(res, 200, { fair: db.fairDemo });
      return;
    }

    // ===== TV API =====
    if (method === 'POST' && p === '/api/tv/pairing/request') {
      const db = load();
      const code = randomCode(6);
      const expiresAt = new Date(Date.now() + (db.settings.pairingCodeTtlSeconds || 900) * 1000).toISOString();
      db.pairingCodes.push({ id: id('pair_'), code, expiresAt, used: false, createdAt: now() });
      db.pairingCodes = db.pairingCodes.filter(
        (c) => !c.used || new Date(c.expiresAt).getTime() > Date.now() - 3600000
      );
      save(db);
      send(res, 200, { code, expiresAt, expiresInSeconds: db.settings.pairingCodeTtlSeconds || 900 });
      return;
    }

    if (method === 'GET' && p === '/api/tv/pairing/status') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const db = load();
      const pairing = db.pairingCodes.find((c) => c.code === code);
      if (!pairing) { send(res, 404, { paired: false, error: 'Código não encontrado' }); return; }
      if (!pairing.used) { send(res, 200, { paired: false, expiresAt: pairing.expiresAt }); return; }
      // Nunca entregar o token de outra TV: localizar pelo deviceId deste código.
      const device = pairing.deviceId
        ? db.devices.find((d) => d.id === pairing.deviceId && d.status === 'active')
        : null;
      if (!device) { send(res, 200, { paired: false }); return; }
      send(res, 200, {
        paired: true, deviceId: device.id, deviceToken: device.token,
        name: device.name, pollIntervalSeconds: db.settings.pollIntervalSeconds || 20,
      });
      return;
    }

    if (method === 'GET' && p === '/api/tv/program') {
      const device = getDevice(req);
      if (!device) { send(res, 401, { error: 'Dispositivo não autorizado' }); return; }
      const db = load();
      const prog = resolvePlaylistForDevice(db, device);
      const fair = db.fairDemo && db.fairDemo.enabled ? {
        isDemo: !!db.fairDemo.isDemo,
        teamsParticipating: db.fairDemo.teamsParticipating,
        teamsCompleted: db.fairDemo.teamsCompleted,
        activityStatus: db.fairDemo.activityStatus,
        messages: (db.fairDemo.messages || []).map((m) => ({ id: m.id, text: m.text })),
      } : null;
      send(res, 200, {
        deviceId: device.id, name: device.name, program: prog,
        pollIntervalSeconds: db.settings.pollIntervalSeconds || 20,
        serverTime: now(), fair,
      });
      return;
    }

    if (method === 'POST' && p === '/api/tv/heartbeat') {
      const device = getDevice(req);
      if (!device) { send(res, 401, { error: 'Dispositivo não autorizado' }); return; }
      const body = await readJson(req);
      const db = load();
      const d = db.devices.find((x) => x.id === device.id);
      if (!d || d.status === 'revoked') { send(res, 401, { error: 'Dispositivo revogado' }); return; }
      d.lastSeenAt = now();
      if (body.confirmedVersion) d.confirmedVersion = body.confirmedVersion;
      d.updatedAt = now();
      save(db);
      const prog = resolvePlaylistForDevice(db, d);
      send(res, 200, {
        ok: true, programVersion: prog.version,
        pollIntervalSeconds: db.settings.pollIntervalSeconds || 20,
        needsUpdate: body.confirmedVersion !== prog.version,
      });
      return;
    }

    send(res, 404, { error: 'Não encontrado', path: p });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Erro interno', message: err.message });
  }
}

const server = http.createServer((req, res) => { handler(req, res); });
server.listen(PORT, () => {
  console.log(`School Roku CMS API em http://localhost:${PORT}`);
  console.log('Admin padrão: admin@escola.local / admin123');
  console.log(`PUBLIC_BASE_URL=${PUBLIC_BASE}`);
});
