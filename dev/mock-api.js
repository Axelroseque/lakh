// In-memory stand-in for the real API so the UI can be developed without Google or the VPS.
// Used by `npm run dev:mock`. Access token: "demo".
import { normalizeSchedule } from '../lib/schedule.js';
import { checkImage } from '../lib/eviden.js';

const TZ = 'Asia/Jakarta';
const SISTEM = ['SIPP', 'CCTVbase', 'Sekarbanyu', 'Jaringan', 'Server', 'Hardware'];
const STATUS = ['Terjadwal', 'Menunggu Eviden', 'Terunggah', 'Selesai', 'Diabaikan', 'Draf'];

const ymd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const stamp = (d = new Date()) => ymd(d) + ' ' + new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
const daysAgo = (n, hm) => ymd(new Date(Date.now() - n * 86400000)) + ' ' + hm + ':00';
const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : -1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class MockError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function createMockState() {
  const today = ymd();
  const compact = today.replace(/-/g, '');
  const mk = (n, start, end, task, result, evidenRequired, status, urls = []) => ({
    id: `LLK-${compact}-${String(n).padStart(2, '0')}`, date: today, start, end, task, result,
    evidenRequired, status, evidenUrls: urls, reminder: ''
  });
  return {
    schedule: [
      mk(1, '07:30', '08:00', 'Apel Pagi & Briefing Tim IT', 'Koordinasi kesiapan sistem ruang sidang dan jaringan', true, 'Selesai', ['https://drive.google.com/file/d/mock-apel/view']),
      mk(2, '08:00', '10:00', 'Monitoring Server SIPP & Database Replikasi', 'Pengecekan load balance, deadlock query, dan sync mirror', true, 'Terjadwal'),
      mk(3, '10:00', '12:00', 'Sidang Tilang Elektronik & Dukungan Teknis Ruang Sidang', 'Operasional audio-video dan live link MA', true, 'Terjadwal'),
      mk(4, '12:00', '13:00', 'Istirahat & Ishoma', '', false, 'Diabaikan'),
      mk(5, '13:00', '15:30', 'Pengembangan Fitur Baru Aplikasi Sekarbanyu', 'Filter log audit dan migrasi styling ke Tailwind', true, 'Terjadwal'),
      mk(6, '15:30', '16:00', 'Rekapitulasi Tiket Helpdesk & Pengisian Portal MA', 'Finalisasi pelaporan harian internal', true, 'Draf')
    ],
    kb: [
      { id: 'KB-2026-006', timestamp: daysAgo(1, '14:10'), judul: 'Troubleshooting Database Lock SIPP v3.2.0', sistem: 'SIPP', severity: 'High', stackTrace: 'ERROR: deadlock detected', solusi: 'Kill idle transaction PID 4109 via pg_terminate_backend() dan refresh pool pgbouncer setelah beban register perkara memuncak.', tags: ['SIPP', 'PostgreSQL'], evidenUrl: 'https://drive.google.com/file/d/mock-kb1/view', verifiedBy: 'Adit IT' },
      { id: 'KB-2026-005', timestamp: daysAgo(1, '09:30'), judul: 'RTSP Stream Latency CCTVbase Ruang Sidang Utama', sistem: 'CCTVbase', severity: 'Medium', stackTrace: '', solusi: 'Switching UDP ke TCP transport stream & MTU buffer adjustment pada relay NVR Hikvision untuk mengatasi packet loss jaringan lokal.', tags: ['CCTVbase', 'Network'], evidenUrl: '', verifiedBy: 'Budi IT' },
      { id: 'KB-2026-004', timestamp: daysAgo(2, '16:45'), judul: 'Sekarbanyu Frontend Vercel Build Failure', sistem: 'Sekarbanyu', severity: 'Low', stackTrace: '', solusi: 'Update node runtime variable ke 20.x pada project settings Vercel dan selaraskan lockfile pnpm v9.', tags: ['Sekarbanyu', 'React'], evidenUrl: '', verifiedBy: 'Admin' },
      { id: 'KB-2026-003', timestamp: daysAgo(4, '11:05'), judul: 'Switch lantai 2 sering reboot sendiri', sistem: 'Jaringan', severity: 'Medium', stackTrace: '', solusi: 'Ganti PSU switch Cisco 2960, cek suhu ruang rak, dan pasang UPS online.', tags: ['Jaringan', 'Hardware'], evidenUrl: '', verifiedBy: 'Budi IT' },
      { id: 'KB-2026-002', timestamp: daysAgo(6, '08:20'), judul: 'Disk server aplikasi penuh karena log nginx', sistem: 'Server', severity: 'High', stackTrace: 'No space left on device', solusi: 'Aktifkan logrotate harian, kompres log lama, dan hapus core dump di /var/crash.', tags: ['Server', 'Linux'], evidenUrl: '', verifiedBy: 'Adit IT' },
      { id: 'KB-2026-001', timestamp: daysAgo(9, '13:15'), judul: 'Printer tilang tidak terdeteksi di SIPP', sistem: 'Hardware', severity: 'Low', stackTrace: '', solusi: 'Reinstall driver, set printer default, dan restart spooler service.', tags: ['Hardware', 'SIPP'], evidenUrl: '', verifiedBy: '' }
    ],
    settings: { tokenSet: true, chatId: '819204918', leadMinutes: 0, silent: false, webappUrl: 'https://lakh.example.vercel.app', evidenSharing: 'PRIVATE' },
    tgLog: [
      { time: daysAgo(0, '07:30').replace(/:00$/, ':01'), type: 'Schedule Alert', agenda: 'Apel Pagi & Briefing Tim IT', chatId: '819204918', http: 200, status: 'Delivered' },
      { time: daysAgo(0, '08:00').replace(/:00$/, ':02'), type: 'Eviden Reminder', agenda: 'Monitoring Server SIPP & Database Replikasi', chatId: '819204918', http: 200, status: 'Delivered' },
      { time: daysAgo(0, '10:00').replace(/:00$/, ':03'), type: 'Eviden Reminder', agenda: 'Sidang Tilang Elektronik', chatId: '819204918', http: 502, status: 'Failed: Bad Gateway' }
    ],
    evidenFiles: 84, origBytes: 84 * 4.6 * 1048576, compBytes: 84 * 0.42 * 1048576,
    llkRows: 1420, telegramToday: 3,
    log: [
      { time: daysAgo(0, '07:30').replace(/:00$/, ':05'), event: 'PING', summary: 'LAKH GAS vmock', http: 200, ms: 390, status: 'Success' },
      { time: daysAgo(0, '07:31').replace(/:00$/, ':12'), event: 'SCHEDULE_SAVE', summary: '6 rows -> ' + today, http: 200, ms: 1800, status: 'Success' },
      { time: daysAgo(0, '08:00').replace(/:00$/, ':03'), event: 'CRON', summary: 'sent=1 failed=0 due=1', http: 200, ms: 1100, status: 'Success' },
      { time: daysAgo(0, '09:58').replace(/:00$/, ':20'), event: 'EVIDEN_SYNC', summary: '420 KB -> Eviden_LLK/2026/10', http: 200, ms: 2400, status: 'Success' },
      { time: daysAgo(0, '10:30').replace(/:00$/, ':41'), event: 'EVIDEN_SYNC', summary: 'File exceeds 1024 KB after compression', http: 413, ms: 310, status: 'Error' },
      { time: daysAgo(0, '11:02').replace(/:00$/, ':09'), event: 'TELEGRAM_TEST', summary: 'ok', http: 200, ms: 640, status: 'Success' }
    ]
  };
}

function summary(items) {
  let minutes = 0, pending = 0, slots = 0;
  for (const it of items) {
    if (it.status === 'Diabaikan') continue;
    slots++;
    minutes += toMin(it.end) - toMin(it.start);
    if (it.evidenRequired && !it.evidenUrls.length) pending++;
  }
  return { slots, effectiveHours: Math.round(minutes / 6) / 10, pendingEviden: pending };
}

function settingsView(state) {
  const st = state.settings;
  return {
    version: 'mock', tz: TZ,
    telegram: { tokenSet: st.tokenSet, chatId: st.chatId, leadMinutes: st.leadMinutes, silent: st.silent },
    webappUrl: st.webappUrl, evidenSharing: st.evidenSharing,
    drive: { rootName: 'Eviden_LLK', rootSet: true },
    sheets: { name: 'LAKH (mock)', tabs: ['DATA_LLK_AUTOMATION', 'PROBLEM_SOLVE', 'SYNC_LOG', 'TELEGRAM_LOG', 'EVIDEN_LOG'] },
    cron: { minutes: 5, start: '07:00', end: '16:30' }
  };
}

function aiFixture(prompt) {
  return [
    { start: '07:00', end: '08:00', task: 'Apel pagi dan briefing tim IT' },
    { start: '08:00', end: '10:00', task: /sipp/i.test(prompt) ? 'Monitoring server SIPP dan replikasi database' : 'Pemeliharaan server aplikasi' },
    { start: '10:00', end: '12:00', task: /sidang|tilang/i.test(prompt) ? 'Dukungan teknis sidang tilang elektronik' : 'Dukungan teknis ruang sidang' },
    { start: '13:00', end: '15:30', task: /sekarbanyu|frontend|coding/i.test(prompt) ? 'Pengembangan frontend Sekarbanyu' : 'Pengembangan aplikasi internal' },
    { start: '15:30', end: '16:00', task: 'Rekapitulasi tiket helpdesk dan pengisian portal MA', evidenRequired: false }
  ];
}

export function createMockHandler(state = createMockState()) {
  return async function handle(method, path, query, body) {
    const seg = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const route = seg.join('/');

    if (method === 'GET' && route === 'ping') {
      return { service: 'LAKH GAS (mock)', version: 'mock', time: stamp(), tz: TZ, config: { spreadsheet: true, telegram: true, driveRoot: true, cronTriggers: 1 }, sheets: 'ok: LAKH (mock)' };
    }
    if (method === 'GET' && route === 'stats') {
      const s = summary(state.schedule);
      return {
        today: { date: ymd(), ...s },
        totals: { llkRows: state.llkRows, kbCases: state.kb.length, evidenFiles: state.evidenFiles, savedMB: Math.round((state.origBytes - state.compBytes) / 1048576 * 10) / 10, telegramToday: state.telegramToday }
      };
    }
    if (method === 'GET' && route === 'ai/status') {
      await sleep(150);
      return { configured: true, online: true, ms: 2100 + Math.round(Math.random() * 100), model: 'Hermes', limitMs: 10000 };
    }
    if (route === 'schedule/generate' && method === 'POST') {
      const prompt = String(body.prompt || '').trim();
      if (prompt.length < 5) throw new MockError(400, 'prompt is too short');
      await sleep(900);
      return { ...normalizeSchedule(aiFixture(prompt)), aiMs: 900 };
    }
    if (route === 'schedule' && method === 'GET') {
      const date = query.get('date') || ymd();
      const items = state.schedule.filter(i => i.date === date);
      return { date, items, summary: summary(items) };
    }
    if (route === 'schedule' && (method === 'PUT' || method === 'POST')) {
      const date = body.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new MockError(400, 'date must be YYYY-MM-DD');
      if (!Array.isArray(body.items) || !body.items.length) throw new MockError(400, 'items must be an array of 1-30 entries');
      const old = state.schedule.filter(i => i.date === date);
      const keep = new Map(old.map(i => [i.start + '-' + i.end, i]));
      state.schedule = state.schedule.filter(i => i.date !== date);
      const compact = date.replace(/-/g, '');
      const rows = [...body.items].sort((a, b) => toMin(a.start) - toMin(b.start)).map((x, n) => {
        const prev = keep.get(x.start + '-' + x.end);
        return {
          id: `LLK-${compact}-${String(n + 1).padStart(2, '0')}`, date, start: x.start, end: x.end, task: String(x.task).slice(0, 300),
          result: x.result || '', evidenRequired: x.skip ? false : !!x.evidenRequired,
          status: x.skip ? 'Diabaikan' : prev ? prev.status : 'Terjadwal', evidenUrls: prev ? prev.evidenUrls : [], reminder: ''
        };
      });
      state.schedule.push(...rows);
      state.llkRows += rows.length;
      return { date, saved: rows.length, items: rows, summary: summary(rows) };
    }
    if (seg[0] === 'schedule' && seg.length === 2 && method === 'PATCH') {
      const it = state.schedule.find(i => i.id === decodeURIComponent(seg[1]));
      if (!it) throw new MockError(404, 'Schedule id not found: ' + seg[1]);
      if (body.status !== undefined && !STATUS.includes(body.status)) throw new MockError(400, 'status must be one of: ' + STATUS.join(', '));
      for (const k of ['task', 'result', 'status']) if (body[k] !== undefined) it[k] = body[k];
      return { updated: Object.keys(body), item: it };
    }
    if (route === 'eviden' && method === 'POST') {
      const img = checkImage(body.base64);
      await sleep(600);
      let date = ymd();
      if (body.scheduleId) {
        const it = state.schedule.find(i => i.id === body.scheduleId);
        if (!it) throw new MockError(404, 'Schedule id not found: ' + body.scheduleId);
        date = it.date;
      }
      const fileId = 'mock' + Math.random().toString(36).slice(2, 12);
      const url = `https://drive.google.com/file/d/${fileId}/view`;
      if (body.scheduleId) {
        const it = state.schedule.find(i => i.id === body.scheduleId);
        it.evidenUrls.push(url);
        it.status = 'Terunggah';
      }
      state.evidenFiles++;
      state.origBytes += Number(body.originalBytes) || img.bytes;
      state.compBytes += img.bytes;
      return { fileId, url, name: `${date}_${(body.filename || 'eviden').replace(/\.[^.]*$/, '')}.jpg`, sizeKB: Math.round(img.bytes / 1024), folder: `Eviden_LLK/${date.slice(0, 4)}/${date.slice(5, 7)}`, sharing: 'private', scheduleId: body.scheduleId || null };
    }
    if (route === 'kb' && method === 'GET') {
      const tag = (query.get('tag') || '').replace(/^#/, '').toLowerCase();
      let items = state.kb.filter(k => !tag || tag === 'all' || k.tags.some(t => t.toLowerCase() === tag));
      const lim = Math.min(200, Number(query.get('limit')) || 50);
      return { total: items.length, items: items.slice(0, lim) };
    }
    if (route === 'kb/search' && method === 'GET') {
      const q = (query.get('q') || '').toLowerCase();
      if (!q) throw new MockError(400, 'q is required');
      const tag = (query.get('tag') || '').toLowerCase();
      const items = state.kb
        .filter(k => !tag || k.tags.some(t => t.toLowerCase() === tag))
        .filter(k => (k.judul + ' ' + k.solusi + ' ' + k.tags.join(' ') + ' ' + k.stackTrace).toLowerCase().includes(q));
      return { total: items.length, items };
    }
    if (route === 'kb' && method === 'POST') {
      if (!body.judul || !body.solusi) throw new MockError(400, 'judul and solusi are required');
      if (!SISTEM.includes(body.sistem)) throw new MockError(400, 'sistem must be one of: ' + SISTEM.join(', '));
      const id = 'KB-2026-' + String(state.kb.length + 1).padStart(3, '0');
      const seen = new Set();
      const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
        .map(t => String(t).trim().replace(/^#+/, '').slice(0, 40)).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 15);
      if (!tags.some(t => t.toLowerCase() === body.sistem.toLowerCase())) tags.unshift(body.sistem);
      if (body.eviden && !/^https:\/\//i.test(body.eviden)) throw new MockError(400, 'eviden must be an https:// URL');
      state.kb.unshift({ id, timestamp: stamp(), judul: body.judul, sistem: body.sistem, severity: body.severity || 'Medium', stackTrace: body.stackTrace || '', solusi: body.solusi, tags, evidenUrl: body.eviden || '', verifiedBy: body.verifiedBy || '' });
      return { id, tags };
    }
    if (route === 'telegram/status' && method === 'GET') {
      await sleep(250);
      return state.settings.tokenSet
        ? { configured: true, ok: true, chatSet: !!state.settings.chatId, username: 'LAKH_Kediri_Bot', name: 'LAKH PN Kediri Bot', ms: 42 }
        : { configured: false, ok: false, chatSet: !!state.settings.chatId, error: 'Bot token belum diisi' };
    }
    if (route === 'telegram/log' && method === 'GET') {
      const lim = Math.min(200, Number(query.get('limit')) || 50);
      return { total: state.tgLog.length, items: [...state.tgLog].reverse().slice(0, lim) };
    }
    if (route === 'settings' && method === 'GET') return settingsView(state);
    if (route === 'settings' && method === 'PUT') {
      const st = state.settings, changed = [];
      if (body.telegramToken) {
        if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(body.telegramToken)) throw new MockError(400, 'Format bot token tidak valid');
        st.tokenSet = true; changed.push('telegramToken');
      }
      if (body.telegramChatId !== undefined) {
        if (!/^-?\d{1,20}$/.test(body.telegramChatId) && !/^@[A-Za-z0-9_]{5,32}$/.test(body.telegramChatId)) throw new MockError(400, 'Chat ID harus angka (boleh diawali -) atau @channel');
        st.chatId = body.telegramChatId; changed.push('telegramChatId');
      }
      if (body.leadMinutes !== undefined) {
        if (![0, 5, 15].includes(Number(body.leadMinutes))) throw new MockError(400, 'leadMinutes harus 0, 5 atau 15');
        st.leadMinutes = Number(body.leadMinutes); changed.push('leadMinutes');
      }
      if (body.silent !== undefined) {
        if (typeof body.silent !== 'boolean') throw new MockError(400, 'silent harus boolean');
        st.silent = body.silent; changed.push('silent');
      }
      if (body.webappUrl !== undefined) {
        if (body.webappUrl && !/^https:\/\/[^\s<>"']{3,300}$/i.test(body.webappUrl)) throw new MockError(400, 'webappUrl harus berupa URL https://');
        st.webappUrl = body.webappUrl; changed.push('webappUrl');
      }
      if (body.evidenSharing !== undefined) {
        if (!['PRIVATE', 'LINK'].includes(body.evidenSharing)) throw new MockError(400, 'evidenSharing harus PRIVATE atau LINK');
        st.evidenSharing = body.evidenSharing; changed.push('evidenSharing');
      }
      if (!changed.length) throw new MockError(400, 'Tidak ada pengaturan yang diubah');
      state.log.push({ time: stamp(), event: 'SETTINGS_SET', summary: 'changed: ' + changed.join(', '), http: 200, ms: 400, status: 'Success' });
      return { ...settingsView(state), changed };
    }
    if (route === 'ops/log' && method === 'GET') {
      const lim = Math.min(200, Number(query.get('limit')) || 50);
      return { total: state.log.length, items: [...state.log].reverse().slice(0, lim) };
    }
    const addLog = (event, summary, http, ms, status) => state.log.push({ time: stamp(), event, summary, http, ms, status });
    if (route === 'ops/telegram-test' && method === 'POST') {
      await sleep(500);
      addLog('TELEGRAM_TEST', 'ok', 200, 500, 'Success');
      state.tgLog.push({ time: stamp(), type: 'Test Ping', agenda: 'Manual Trigger', chatId: state.settings.chatId, http: 200, status: 'Delivered' });
      state.telegramToday++;
      return { ok: true, code: 200, description: null };
    }
    if (route === 'ops/cron-pulse' && method === 'POST') {
      await sleep(700);
      const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const due = state.schedule.filter(i => i.date === ymd() && i.status !== 'Diabaikan' && toMin(hm) >= toMin(i.start) && toMin(hm) < toMin(i.end)).map(i => ({ id: i.id, start: i.start, task: i.task }));
      const dry = body.dryRun === true;
      if (!dry) { due.forEach(d => state.tgLog.push({ time: stamp(), type: 'Eviden Reminder', agenda: d.task, chatId: state.settings.chatId, http: 200, status: 'Delivered' })); state.telegramToday += due.length; addLog('CRON_PULSE', `sent=${due.length} failed=0 due=${due.length}`, 200, 700, 'Success'); }
      return { date: ymd(), time: stamp(), dryRun: dry, due, sent: dry ? 0 : due.length, failed: 0, skipped: '' };
    }
    if (route === 'ops/flush-cache' && method === 'POST') {
      await sleep(300);
      addLog('FLUSH_CACHE', 'flushed 25 keys', 200, 300, 'Success');
      return { flushed: 25 };
    }
    throw new MockError(404, 'Not found');
  };
}

const defaultHandler = createMockHandler();

/** Connect/Vite middleware. */
export async function mockMiddleware(req, res, next) {
  if (!req.url.startsWith('/api/')) return next();
  const send = (status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
  try {
    if (!/^Bearer demo$/i.test(String(req.headers.authorization || ''))) throw new MockError(401, 'Unauthorized');
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, 'http://localhost');
    const data = await defaultHandler(req.method, url.pathname, url.searchParams, body);
    send(200, { ok: true, data });
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    send(code, { ok: false, error: e.message || 'Internal error', code });
  }
}
