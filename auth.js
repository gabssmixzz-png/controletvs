/**
 * Auth helpers — senha com scrypt (built-in), tokens JWT-like com HMAC.
 */
const crypto = require('crypto');

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

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  randomCode,
  deviceToken,
  JWT_SECRET,
};
