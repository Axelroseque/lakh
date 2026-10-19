import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/[...path].js';

let gas, ai, gasCalls, gasReply, aiReply, aiDelay;

function listen(fn) {
  return new Promise(resolve => {
    const s = http.createServer(fn).listen(0, '127.0.0.1', () => resolve(s));
  });
}
const port = s => s.address().port;

before(async () => {
  gas = await listen((req, res) => {
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => {
      gasCalls.push(JSON.parse(b));
      res.setHeader('Content-Type', 'text/plain');
      res.end(typeof gasReply === 'function' ? gasReply(JSON.parse(b)) : JSON.stringify(gasReply));
    });
  });
  ai = await listen((req, res) => {
    req.resume();
    req.on('end', () => setTimeout(() => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: aiReply } }] }));
    }, aiDelay));
  });
});
after(() => { gas.close(); ai.close(); });

beforeEach(() => {
  gasCalls = [];
  gasReply = { ok: true, data: { fine: true } };
  aiReply = '[]';
  aiDelay = 0;
  process.env.LAKH_APP_TOKEN = 'app-secret';
  process.env.LAKH_GAS_URL = `http://127.0.0.1:${port(gas)}/exec`;
  process.env.LAKH_GAS_KEY = 'gas-secret';
  process.env.AI_URL = `http://127.0.0.1:${port(ai)}/v1/chat/completions`;
  process.env.AI_TIMEOUT_MS = '500';
  delete process.env.ALLOWED_ORIGIN;
});

async function call(method, path, { body, token = 'app-secret' } = {}) {
  const req = {
    method, url: path,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-length': String(JSON.stringify(body).length) } : {}) },
    body
  };
  const out = { headers: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    end: s => { out.text = s; },
    set statusCode(v) { out.status = v; },
    get statusCode() { return out.status; }
  };
  await handler(req, res);
  out.json = out.text ? JSON.parse(out.text) : null;
  return out;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');

test('rejects missing or wrong bearer token, never touches GAS', async () => {
  assert.equal((await call('GET', '/api/ping', { token: null })).status, 401);
  assert.equal((await call('GET', '/api/ping', { token: 'nope' })).status, 401);
  assert.equal(gasCalls.length, 0);
});

test('unknown route is 404 only after auth; wrong method is 405', async () => {
  assert.equal((await call('GET', '/api/nothing', { token: null })).status, 401);
  assert.equal((await call('GET', '/api/nothing')).status, 404);
  assert.equal((await call('DELETE', '/api/schedule')).status, 405);
});

test('schedule GET forwards date and injects the GAS key', async () => {
  const r = await call('GET', '/api/schedule?date=2026-10-12');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, data: { fine: true } });
  assert.equal(gasCalls[0].action, 'SCHEDULE_GET');
  assert.equal(gasCalls[0].date, '2026-10-12');
  assert.equal(gasCalls[0].key, 'gas-secret');
});

test('client cannot override action or key, extra fields are dropped', async () => {
  await call('POST', '/api/schedule', {
    body: { date: '2026-10-12', items: [], action: 'FLUSH_CACHE', key: 'evil', admin: true }
  });
  const c = gasCalls[0];
  assert.equal(c.action, 'SCHEDULE_SAVE');
  assert.equal(c.key, 'gas-secret');
  assert.equal(c.admin, undefined);
});

test('PATCH schedule/:id uses the path id, not a body id', async () => {
  await call('PATCH', '/api/schedule/LLK-20261012-01', { body: { status: 'Selesai', id: 'OTHER' } });
  assert.equal(gasCalls[0].action, 'SCHEDULE_UPDATE');
  assert.equal(gasCalls[0].id, 'LLK-20261012-01');
  assert.equal(gasCalls[0].status, 'Selesai');
});

test('GAS 4xx passes through, GAS 401 becomes 502, GAS 5xx becomes 502', async () => {
  gasReply = { ok: false, error: 'Schedule id not found: X', code: 404 };
  assert.equal((await call('PATCH', '/api/schedule/X', { body: { status: 'Selesai' } })).status, 404);
  gasReply = { ok: false, error: 'Unauthorized', code: 401 };
  assert.equal((await call('GET', '/api/stats')).status, 502);
  gasReply = { ok: false, error: 'boom', code: 500 };
  assert.equal((await call('POST', '/api/ops/flush-cache', { body: {} })).status, 502);
});

test('non-JSON from GAS (login page) is a clear 502', async () => {
  gasReply = () => '<html>Sign in</html>';
  const r = await call('GET', '/api/ping');
  assert.equal(r.status, 502);
  assert.match(r.json.error, /non-JSON/);
});

test('reads are retried once on GAS 5xx, writes are not', async () => {
  gasReply = { ok: false, error: 'boom', code: 500 };
  await call('GET', '/api/kb');
  assert.equal(gasCalls.length, 2);
  gasCalls = [];
  await call('POST', '/api/kb', { body: { judul: 'x' } });
  assert.equal(gasCalls.length, 1);
});

test('KB search forwards q and tag', async () => {
  await call('GET', '/api/kb/search?q=sipp%20error&tag=db');
  assert.equal(gasCalls[0].action, 'KB_SEARCH');
  assert.equal(gasCalls[0].q, 'sipp error');
  assert.equal(gasCalls[0].tag, 'db');
});

test('eviden: rejects non-images and oversize, forwards valid PNG with sniffed mime', async () => {
  const bad = await call('POST', '/api/eviden', { body: { base64: Buffer.from('hello world, not an image').toString('base64') } });
  assert.equal(bad.status, 415);
  const big = await call('POST', '/api/eviden', { body: { base64: 'A'.repeat(1_500_000) } });
  assert.equal(big.status, 413);
  const ok = await call('POST', '/api/eviden', {
    body: { base64: 'data:image/png;base64,' + PNG, mimeType: 'text/html', scheduleId: 'LLK-1', filename: 'a.png' }
  });
  assert.equal(ok.status, 200);
  assert.equal(gasCalls[0].mimeType, 'image/png');
  assert.equal(gasCalls[0].base64, PNG);
  assert.equal(gasCalls[0].scheduleId, 'LLK-1');
});

test('generate: parses fenced JSON, trims to window, drops overlaps, adds Ishoma', async () => {
  aiReply = 'Ini jadwalnya:\n```json\n' + JSON.stringify([
    { start: '07.00', end: '08:00', task: 'Apel pagi' },
    { start: '08:00', end: '11:30', task: 'Pemeliharaan server SIPP' },
    { start: '11:00', end: '11:45', task: 'Tumpang tindih' },
    { start: '13:00', end: '16:30', task: 'Deploy frontend Sekarbanyu', evidenRequired: false }
  ]) + '\n```';
  const r = await call('POST', '/api/schedule/generate', { body: { prompt: 'apel, server, deploy', date: '2026-10-12' } });
  assert.equal(r.status, 200);
  const { items, warnings } = r.json.data;
  assert.deepEqual(items.map(i => [i.start, i.end]), [['07:30', '08:00'], ['08:00', '11:30'], ['12:00', '13:00'], ['13:00', '16:00']]);
  assert.equal(items[2].skip, true);
  assert.equal(items[2].evidenRequired, false);
  assert.equal(items[3].evidenRequired, false);
  assert.equal(items[0].evidenRequired, true);
  assert.ok(warnings.some(w => /overlaps/.test(w)));
  assert.ok(warnings.some(w => /trimmed/.test(w)));
  assert.equal(gasCalls.length, 0, 'generate never writes to GAS');
});

test('generate: junk answer is 502, slow AI is 504, short prompt is 400', async () => {
  aiReply = 'maaf saya tidak bisa';
  assert.equal((await call('POST', '/api/schedule/generate', { body: { prompt: 'buat jadwal' } })).status, 502);
  aiReply = '[]';
  aiDelay = 800;
  assert.equal((await call('POST', '/api/schedule/generate', { body: { prompt: 'buat jadwal' } })).status, 504);
  assert.equal((await call('POST', '/api/schedule/generate', { body: { prompt: 'hi' } })).status, 400);
});

test('CORS preflight only when ALLOWED_ORIGIN is set', async () => {
  const off = await call('OPTIONS', '/api/ping', { token: null });
  assert.equal(off.status, 401);
  process.env.ALLOWED_ORIGIN = 'https://lakh.example';
  const on = await call('OPTIONS', '/api/ping', { token: null });
  assert.equal(on.status, 204);
  assert.equal(on.headers['Access-Control-Allow-Origin'], 'https://lakh.example');
});

test('ai/status reports online, then offline, without ever throwing', async () => {
  process.env.AI_URL = `http://127.0.0.1:${port(ai)}/v1/chat/completions`;
  let r = await call('GET', '/api/ai/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.online, true);
  assert.equal(typeof r.json.data.ms, 'number');
  process.env.AI_URL = 'http://127.0.0.1:9/v1/chat/completions'; // nothing listens on port 9
  r = await call('GET', '/api/ai/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.online, false);
  assert.equal(r.json.data.configured, true);
});

test('ops/log forwards the limit to LOG_LIST; ops actions map to their GAS actions', async () => {
  await call('GET', '/api/ops/log?limit=30');
  assert.equal(gasCalls[0].action, 'LOG_LIST');
  assert.equal(gasCalls[0].limit, '30');
  gasCalls = [];
  await call('POST', '/api/ops/cron-pulse', { body: { dryRun: true } });
  await call('POST', '/api/ops/telegram-test', { body: {} });
  await call('POST', '/api/ops/flush-cache', { body: {} });
  assert.deepEqual(gasCalls.map(c => c.action), ['CRON_PULSE', 'TELEGRAM_TEST', 'FLUSH_CACHE']);
  assert.equal(gasCalls[0].dryRun, true);
});

test('telegram + settings routes: whitelist fields, never retry writes, bot token only goes one way', async () => {
  await call('GET', '/api/telegram/status');
  await call('GET', '/api/telegram/log?limit=40');
  await call('GET', '/api/settings');
  assert.deepEqual(gasCalls.map(c => c.action), ['TELEGRAM_STATUS', 'TELEGRAM_LOG_LIST', 'SETTINGS_GET']);
  assert.equal(gasCalls[1].limit, '40');
  gasCalls = [];
  const r = await call('PUT', '/api/settings', { body: { leadMinutes: 5, silent: true, telegramToken: '123456:' + 'a'.repeat(35), evil: 'x', key: 'hijack', action: 'FLUSH_CACHE' } });
  assert.equal(r.json.ok, true);
  assert.equal(gasCalls.length, 1);
  assert.equal(gasCalls[0].action, 'SETTINGS_SET');
  assert.equal(gasCalls[0].key, 'gas-secret');
  assert.equal(gasCalls[0].evil, undefined);
  assert.equal(gasCalls[0].leadMinutes, 5);
  assert.equal(gasCalls[0].telegramToken, '123456:' + 'a'.repeat(35));
  assert.equal((await call('POST', '/api/settings', { body: {} })).status, 405);
  assert.equal((await call('GET', '/api/settings', { token: null })).status, 401);
});
