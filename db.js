/**
 * Persistência em JSON (sem dependências nativas).
 * Adequado para piloto escolar; pode migrar para PostgreSQL depois.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    activityStatus: 'not_started', // not_started | running | finished
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
    const initial = structuredClone(DEFAULT_DB);
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

module.exports = { load, save, id, now, DATA_DIR, DB_FILE };
