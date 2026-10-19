import { HttpError, send, requireAuth, cors, bodyOf, pick } from '../lib/http.js';
import { callGas } from '../lib/gas.js';
import { generateSchedule, aiStatus } from '../lib/ai.js';
import { checkImage } from '../lib/eviden.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const q = (sp, ...names) => Object.fromEntries(names.filter(n => sp.get(n) != null && sp.get(n) !== '').map(n => [n, sp.get(n)]));

/**
 * Route table. `path` segments starting with ":" are params.
 * Every handler returns plain data; the router wraps it as { ok:true, data }.
 * Client fields are WHITELISTED before they reach Apps Script.
 */
const ROUTES = [
  { m: 'GET', path: 'ping', run: () => callGas('PING', {}, { retry: true }) },
  { m: 'GET', path: 'stats', run: () => callGas('STATS', {}, { retry: true }) },

  // ── FR-01 AI generator (VPS) ─────────────────────────────────────────
  { m: 'GET', path: 'ai/status', run: () => aiStatus() },
  {
    m: 'POST', path: 'schedule/generate',
    run: async ({ body }) => {
      const prompt = String(body.prompt ?? '').trim();
      if (prompt.length < 5) throw new HttpError(400, 'prompt is too short');
      if (prompt.length > 4000) throw new HttpError(400, 'prompt is too long (max 4000 characters)');
      return generateSchedule(prompt, body.date ? String(body.date).slice(0, 10) : '');
    }
  },

  // ── FR-04 schedule log ───────────────────────────────────────────────
  { m: 'GET', path: 'schedule', run: ({ sp }) => callGas('SCHEDULE_GET', q(sp, 'date'), { retry: true }) },
  {
    m: ['POST', 'PUT'], path: 'schedule',
    run: ({ body }) => callGas('SCHEDULE_SAVE', pick(body, ['date', 'items']))
  },
  {
    m: 'PATCH', path: 'schedule/:id',
    run: ({ params, body }) => callGas('SCHEDULE_UPDATE', { ...pick(body, ['task', 'result', 'status']), id: params.id })
  },

  // ── FR-02/03 eviden upload (already compressed by the browser) ──────
  {
    m: 'POST', path: 'eviden',
    run: ({ body }) => {
      const img = checkImage(body.base64);
      return callGas('EVIDEN_SYNC', {
        ...pick(body, ['scheduleId', 'filename', 'originalBytes']),
        base64: img.base64,
        mimeType: img.mimeType // from magic bytes, never trusting the client's claim
      });
    }
  },

  // ── FR-05/07 knowledge base ──────────────────────────────────────────
  { m: 'GET', path: 'kb', run: ({ sp }) => callGas('KB_LIST', q(sp, 'tag', 'since', 'limit', 'offset'), { retry: true }) },
  { m: 'GET', path: 'kb/search', run: ({ sp }) => callGas('KB_SEARCH', q(sp, 'q', 'tag', 'limit'), { retry: true }) },
  {
    m: 'POST', path: 'kb',
    run: ({ body }) => callGas('KB_SAVE', pick(body, ['judul', 'sistem', 'severity', 'stackTrace', 'solusi', 'tags', 'eviden', 'verifiedBy']))
  },

  // ── FR-06 / control panel ────────────────────────────────────────────
  { m: 'GET', path: 'ops/log', run: ({ sp }) => callGas('LOG_LIST', q(sp, 'limit'), { retry: true }) },
  { m: 'POST', path: 'ops/telegram-test', run: () => callGas('TELEGRAM_TEST') },
  { m: 'POST', path: 'ops/cron-pulse', run: ({ body }) => callGas('CRON_PULSE', { dryRun: body.dryRun === true }) },
  { m: 'POST', path: 'ops/flush-cache', run: () => callGas('FLUSH_CACHE') },

  // ── FR-05 Telegram + settings (secrets are write-only: the bot token is never returned) ──
  { m: 'GET', path: 'telegram/status', run: () => callGas('TELEGRAM_STATUS', {}, { retry: true }) },
  { m: 'GET', path: 'telegram/log', run: ({ sp }) => callGas('TELEGRAM_LOG_LIST', q(sp, 'limit'), { retry: true }) },
  { m: 'GET', path: 'settings', run: () => callGas('SETTINGS_GET', {}, { retry: true }) },
  {
    m: 'PUT', path: 'settings',
    run: ({ body }) => callGas('SETTINGS_SET', pick(body, ['telegramToken', 'telegramChatId', 'leadMinutes', 'silent', 'webappUrl', 'evidenSharing']))
  }
];

function match(method, segs) {
  let pathMatched = false;
  for (const r of ROUTES) {
    const parts = r.path.split('/');
    if (parts.length !== segs.length) continue;
    const params = {};
    const ok = parts.every((p, i) => (p[0] === ':' ? ((params[p.slice(1)] = segs[i]), true) : p === segs[i]));
    if (!ok) continue;
    pathMatched = true;
    if ([].concat(r.m).includes(method)) return { route: r, params };
  }
  if (pathMatched) throw new HttpError(405, 'Method not allowed');
  throw new HttpError(404, 'Not found');
}

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    requireAuth(req); // before routing, so unauthenticated callers learn nothing

    const len = Number(req.headers?.['content-length'] || 0);
    if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');

    const url = new URL(req.url, 'http://localhost');
    const segs = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(s => decodeURIComponent(s));
    const { route, params } = match(req.method, segs);
    const body = req.method === 'GET' ? {} : bodyOf(req);

    const data = await route.run({ sp: url.searchParams, body, params });
    send(res, 200, { ok: true, data });
  } catch (err) {
    const code = err instanceof HttpError ? err.code : 500;
    if (!(err instanceof HttpError)) console.error('[lakh-api]', err);
    send(res, code, { ok: false, error: err instanceof HttpError ? err.message : 'Internal error', code });
  }
}
