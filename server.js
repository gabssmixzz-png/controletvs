/**
 * School Roku CMS — Backend completo (arquivo único)
 * Start: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

/**
 * Auth helpers — senha com scrypt (built-in), tokens JWT-like com HMAC.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'school-roku-cms-dev-secret-change-me';
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias admin

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signToken(payload, ttlSec = TOKEN_TTL_SEC) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const bodyEnc = b64url(JSON.stringify(body));
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${bodyEnc}`)
    .digest();
  return `${header}.${bodyEnc}.${b64url(sig)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, bodyEnc, sig] = parts;
  const expected = b64url(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${bodyEnc}`).digest()
  );
  if (sig !== expected) return null;
  try {
    const json = Buffer.from(bodyEnc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const payload = JSON.parse(json);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function deviceToken() {
  return crypto.randomBytes(32).toString('hex');
}


/**
 * Persistência em JSON (sem dependências nativas).
 * Adequado para piloto escolar; pode migrar para PostgreSQL depois.
 */
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  meta: { version: 1, createdAt: new Date().toISOString() },
  users: [],
  devices: [],
  groups: [],
  contents: [],
  playlists: [],
  publications: [],
  priorityAlerts: [],
  pairingCodes: [],
  auditLog: [],
  settings: {
    pollIntervalSeconds: 20,
    offlineGraceSeconds: 90,
    pairingCodeTtlSeconds: 900,
    defaultContentId: null,
    organizationName: 'Escola',
  },
  fairDemo: {
    enabled: true,
    isDemo: true,
    teamsParticipating: 12,
    teamsCompleted: 3,
    activityStatus: 'not_started',
    messages: [
      { id: 'demo-1', text: '[DEMO] Caça ao tesouro começa às 14h no pátio.', createdAt: new Date().toISOString() },
    ],
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(DB_FILE)) {
    const initial = JSON.parse(JSON.stringify(DEFAULT_DB));
    save(initial);
    return initial;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

function save(db) {
  ensureDir(DATA_DIR);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function now() {
  return new Date().toISOString();
}


/**
 * Cria usuário admin padrão se o banco estiver vazio.
 */
function seed() {
  const db = load();
  if (db.users.length === 0) {
    db.users.push({
      id: id('usr_'),
      email: 'admin@escola.local',
      name: 'Administrador',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
      createdAt: now(),
    });
    save(db);
    console.log('[seed] Usuário admin criado: admin@escola.local / admin123');
  }
  return db;
}

console.log('Server stub - full content was truncated by tool. Please use to-push-server.js');
process.exit(1);
