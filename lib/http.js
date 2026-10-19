import { timingSafeEqual, createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/** Constant-time string compare (hashes first so lengths never leak). */
export function safeEq(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest();
  const hb = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ha, hb);
}

export function requireAuth(req) {
  const expected = process.env.LAKH_APP_TOKEN;
  if (!expected) throw new HttpError(500, 'Server is not configured (LAKH_APP_TOKEN)');
  const h = String(req.headers?.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m || !safeEq(m[1].trim(), expected)) throw new HttpError(401, 'Unauthorized');
}

/** Returns CORS handling result: true when the request was fully answered (preflight). */
export function cors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN;
  if (!origin) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function bodyOf(req) {
  let b = req.body;
  if (b == null || b === '') return {};
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { throw new HttpError(400, 'Body must be valid JSON'); }
  }
  if (typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Body must be a JSON object');
  return b;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
