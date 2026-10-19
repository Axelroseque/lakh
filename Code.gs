/**
 * LAKH - LLK Automator & Knowledge Hub
 * Google Apps Script backend (I/O layer only: Sheets + Drive + Telegram).
 *
 * Heavy work (AI, image compression) stays in Vercel / VPS, per the PRD.
 *
 * ── DEPLOY ────────────────────────────────────────────────────────────
 * 1. script.google.com > New project. Paste this file as code.gs and
 *    appsscript.json (Project Settings > "Show appsscript.json").
 * 2. Run setupLakh() once and approve permissions. It creates the
 *    spreadsheet, tabs, Drive folder, cron trigger and generates AUTH_TOKEN
 *    (see View > Logs). Copy the token to Vercel as LAKH_GAS_KEY.
 * 3. Project Settings > Script Properties, add:
 *      TELEGRAM_BOT_TOKEN   token from BotFather
 *      TELEGRAM_CHAT_ID     your chat id
 *    Optional:
 *      WEBAPP_URL           https://... link of the Vercel app (in reminders)
 *      LEAD_MINUTES         0 | 5 | 15 (default 0)
 *      EVIDEN_SHARING       PRIVATE (default) | LINK (anyone with link)
 * 4. Deploy > New deployment > Web app. Execute as: Me. Access: Anyone.
 *    Put the /exec URL in Vercel as LAKH_GAS_URL.
 *
 * ── API CONTRACT ──────────────────────────────────────────────────────
 * POST <exec URL>   Content-Type: text/plain   (avoids CORS preflight)
 * Body (JSON): { "key": "<AUTH_TOKEN>", "action": "<ACTION>", ...params }
 * NOTE: Apps Script cannot read HTTP headers, so the token travels in the
 * body (or ?key= on GET). Call this only from the Vercel server route,
 * never from the browser, so the token stays secret.
 *
 * Response: { ok:true, action, data, ms }  |  { ok:false, error, code }
 *
 * Actions
 *   PING
 *   SCHEDULE_SAVE    { date, items:[{start,end,task,result?,evidenRequired?,skip?}] }
 *   SCHEDULE_GET     { date? }
 *   SCHEDULE_UPDATE  { id, task?, result?, status? }
 *   EVIDEN_SYNC      { scheduleId?, filename?, mimeType?, base64, originalBytes? }
 *   KB_SAVE          { judul, sistem, severity?, stackTrace?, solusi, tags?, eviden?, verifiedBy? }
 *   KB_LIST          { tag?, since?, limit?, offset? }
 *   KB_SEARCH        { q, tag?, limit? }
 *   STATS
 *   TELEGRAM_TEST
 *   CRON_PULSE       { dryRun? }
 *   FLUSH_CACHE
 *   LOG_LIST         { limit? }   newest first, from the SYNC_LOG tab (not logged itself)
 *   TELEGRAM_LOG_LIST { limit? }  newest first, from the TELEGRAM_LOG tab (not logged itself)
 *   TELEGRAM_STATUS  {}           getMe: bot username + latency (token never returned)
 *   SETTINGS_GET     {}           non-secret settings (token is reported only as tokenSet:true/false)
 *   SETTINGS_SET     { telegramToken?, telegramChatId?, leadMinutes?, silent?, webappUrl?, evidenSharing? }
 * GET supports: PING, SCHEDULE_GET, KB_LIST, KB_SEARCH, STATS, LOG_LIST,
 *   TELEGRAM_LOG_LIST, TELEGRAM_STATUS, SETTINGS_GET
 *   e.g. ?key=...&action=SCHEDULE_GET&date=2026-10-12
 */

var VERSION = '1.0.0';

var CFG = {
  TZ: 'Asia/Jakarta',
  SHEETS: {
    SCHEDULE: 'DATA_LLK_AUTOMATION',
    KB: 'PROBLEM_SOLVE',
    LOG: 'SYNC_LOG',
    TG: 'TELEGRAM_LOG',
    EVIDEN: 'EVIDEN_LOG'
  },
  ROOT_FOLDER_NAME: 'Eviden_LLK',
  MAX_UPLOAD_BYTES: 1024 * 1024,        // decoded image, PRD: < 1 MB
  MAX_BODY_CHARS: 2500000,
  WORK_START: '07:00',                  // cron is idle outside this window
  WORK_END: '16:30',
  CRON_MINUTES: 5,                      // must be 1, 5, 10, 15 or 30
  LOG_MAX_ROWS: 2000
};

var SCHEDULE_HEADERS = ['ID', 'Tanggal', 'Mulai', 'Selesai', 'Uraian', 'Hasil',
  'EvidenWajib', 'Status', 'EvidenURL', 'EvidenFileId', 'Reminder', 'CreatedAt', 'UpdatedAt'];
var KB_HEADERS = ['ID', 'Timestamp', 'Judul', 'Sistem', 'Severity', 'StackTrace',
  'Solusi', 'Tags', 'EvidenURL', 'VerifiedBy'];
var LOG_HEADERS = ['Waktu', 'Event', 'Ringkasan', 'HTTP', 'DurasiMs', 'Status'];
var TG_HEADERS = ['Waktu', 'Tipe', 'Agenda', 'ChatID', 'HTTP', 'Status'];
var EVIDEN_HEADERS = ['Waktu', 'FileId', 'ScheduleId', 'Nama', 'OriginalBytes', 'CompressedBytes', 'URL'];

var STATUS_LIST = ['Terjadwal', 'Menunggu Eviden', 'Terunggah', 'Selesai', 'Diabaikan', 'Draf'];
var SISTEM_LIST = ['SIPP', 'CCTVbase', 'Sekarbanyu', 'Jaringan', 'Server', 'Hardware'];
var SEVERITY_LIST = ['High', 'Medium', 'Low'];

// ═══════════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════

var ROUTES = {
  PING:            { fn: actPing_,           write: false, get: true  },
  SCHEDULE_SAVE:   { fn: actScheduleSave_,   write: true,  get: false },
  SCHEDULE_GET:    { fn: actScheduleGet_,    write: false, get: true  },
  SCHEDULE_UPDATE: { fn: actScheduleUpdate_, write: true,  get: false },
  EVIDEN_SYNC:     { fn: actEvidenSync_,     write: false, get: false },
  KB_SAVE:         { fn: actKbSave_,         write: true,  get: false },
  KB_LIST:         { fn: actKbList_,         write: false, get: true  },
  KB_SEARCH:       { fn: actKbSearch_,       write: false, get: true  },
  STATS:           { fn: actStats_,          write: false, get: true  },
  TELEGRAM_TEST:   { fn: actTelegramTest_,   write: false, get: false },
  CRON_PULSE:      { fn: actCronPulse_,      write: false, get: false },
  FLUSH_CACHE:     { fn: actFlushCache_,     write: false, get: false },
  LOG_LIST:        { fn: actLogList_,        write: false, get: true, quiet: true }, // quiet: reading the log must not fill the log
  TELEGRAM_LOG_LIST: { fn: actTelegramLogList_, write: false, get: true, quiet: true },
  TELEGRAM_STATUS: { fn: actTelegramStatus_, write: false, get: true,  quiet: true },
  SETTINGS_GET:    { fn: actSettingsGet_,    write: false, get: true,  quiet: true },
  SETTINGS_SET:    { fn: actSettingsSet_,    write: true,  get: false }
};

function doPost(e) {
  var body = {};
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > CFG.MAX_BODY_CHARS) throw httpError_(413, 'Request body too large');
    try { body = JSON.parse(raw); } catch (x) { throw httpError_(400, 'Body must be valid JSON'); }
    if (!body || typeof body !== 'object') throw httpError_(400, 'Body must be a JSON object');
    return dispatch_(body, false);
  } catch (err) {
    return fail_(err, String(body && body.action || 'UNKNOWN').toUpperCase(), Date.now());
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.key && !p.action) {
    return json_({ ok: true, service: 'LAKH GAS', version: VERSION }); // bare health check, no data
  }
  return dispatch_(p, true);
}

function dispatch_(body, isGet) {
  var t0 = Date.now();
  var action = String(body.action || '').toUpperCase();
  try {
    authorize_(body.key);
    var route = ROUTES[action];
    if (!route) throw httpError_(400, 'Unknown action: ' + action);
    if (isGet && !route.get) throw httpError_(405, 'Action requires POST: ' + action);
    var data = route.write ? withLock_(function () { return route.fn(body); }) : route.fn(body);
    var ms = Date.now() - t0;
    if (!route.quiet) log_(action, summarize_(action, body, data), 200, ms, 'Success');
    return json_({ ok: true, action: action, data: data, ms: ms });
  } catch (err) {
    return fail_(err, action || 'UNKNOWN', t0);
  }
}

function fail_(err, action, t0) {
  var code = err && err.code ? err.code : 500;
  var msg = err && err.message ? err.message : 'Internal error';
  log_(action, msg, code, Date.now() - t0, 'Error');
  return json_({ ok: false, error: msg, code: code });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function httpError_(code, msg) {
  var e = new Error(msg);
  e.code = code;
  return e;
}

function authorize_(key) {
  var expected = prop_('AUTH_TOKEN', '');
  if (!expected) throw httpError_(500, 'AUTH_TOKEN not configured. Run setupLakh().');
  if (!safeEq_(key, expected)) throw httpError_(401, 'Unauthorized');
}

function safeEq_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw httpError_(503, 'Server busy, please retry');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function prop_(key, def) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === '') ? def : v;
}

function pad_(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

function nowStr_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }

function str_(v, max) {
  var s = (v === null || v === undefined) ? '' : String(v);
  s = s.replace(/^\s+|\s+$/g, '');
  return max && s.length > max ? s.substring(0, max) : s;
}

function validDate_(d) {
  d = str_(d, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw httpError_(400, 'date must be YYYY-MM-DD');
  var p = d.split('-');
  var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (dt.getFullYear() !== Number(p[0]) || dt.getMonth() !== Number(p[1]) - 1 || dt.getDate() !== Number(p[2])) {
    throw httpError_(400, 'date is not a real calendar date');
  }
  return d;
}

function toMin_(hhmm) {
  var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').replace(/^\s+|\s+$/g, ''));
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtTime_(min) { return pad_(Math.floor(min / 60), 2) + ':' + pad_(min % 60, 2); }

function slug_(s, max) {
  return String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, max || 40) || 'eviden';
}

function escHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function limit_(v, def, max) {
  var n = parseInt(v, 10);
  if (isNaN(n) || n < 1) return def;
  return Math.min(n, max);
}

function summarize_(action, body, data) {
  try {
    if (action === 'SCHEDULE_SAVE') return (data.saved || 0) + ' rows -> ' + data.date;
    if (action === 'SCHEDULE_GET') return (data.items || []).length + ' rows ' + data.date;
    if (action === 'EVIDEN_SYNC') return data.sizeKB + ' KB -> ' + data.fileId;
    if (action === 'KB_SAVE') return data.id;
    if (action === 'KB_LIST' || action === 'KB_SEARCH') return (data.items || []).length + ' items';
    if (action === 'SETTINGS_SET') return 'changed: ' + (data.changed || []).join(', ');
    if (action === 'CRON_PULSE') return 'sent=' + data.sent + ' due=' + data.due.length + (data.dryRun ? ' (dry)' : '');
    return action;
  } catch (e) { return action; }
}

// ── Spreadsheet ────────────────────────────────────────────────────────

function ss_() {
  var id = prop_('SPREADSHEET_ID', '');
  if (!id) throw httpError_(500, 'SPREADSHEET_ID not configured. Run setupLakh().');
  return SpreadsheetApp.openById(id);
}

function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeRows_(sh, rows) {
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  var rng = sh.getRange(start, 1, rows.length, rows[0].length);
  rng.setNumberFormat('@'); // plain text: keeps dates as text and blocks formula injection
  rng.setValues(rows);
}

function log_(event, summary, http, ms, status) {
  try {
    var sh = sheet_(CFG.SHEETS.LOG, LOG_HEADERS);
    writeRows_(sh, [[nowStr_(), event, String(summary).substring(0, 300), http, ms, status]]);
    if (sh.getLastRow() > CFG.LOG_MAX_ROWS + 200) sh.deleteRows(2, 200);
  } catch (e) { /* logging must never break a request */ }
}

// ── Schedule rows ──────────────────────────────────────────────────────

function rowToSchedule_(v, rowIdx) {
  var urls = v[8] ? v[8].split('\n') : [];
  var ids = v[9] ? v[9].split('\n') : [];
  return {
    id: v[0], date: v[1], start: v[2], end: v[3], task: v[4], result: v[5],
    evidenRequired: v[6] === 'YA', status: v[7], evidenUrls: urls, fileIds: ids,
    reminder: v[10], createdAt: v[11], updatedAt: v[12], _row: rowIdx
  };
}

function readSchedule_(date) {
  var sh = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, SCHEDULE_HEADERS.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (date && vals[i][1] !== date) continue;
    out.push(rowToSchedule_(vals[i], i + 2));
  }
  out.sort(function (a, b) { return toMin_(a.start) - toMin_(b.start); });
  return out;
}

function findRowById_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function publicItem_(it) {
  return {
    id: it.id, date: it.date, start: it.start, end: it.end, task: it.task, result: it.result,
    evidenRequired: it.evidenRequired, status: it.status, evidenUrls: it.evidenUrls, reminder: it.reminder
  };
}

function scheduleSummary_(items) {
  var minutes = 0, pending = 0, slots = 0;
  items.forEach(function (it) {
    if (it.status === 'Diabaikan') return;
    slots++;
    minutes += toMin_(it.end) - toMin_(it.start);
    if (it.evidenRequired && !it.evidenUrls.length) pending++;
  });
  return { slots: slots, effectiveHours: Math.round(minutes / 6) / 10, pendingEviden: pending };
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIONS: GENERAL
// ═══════════════════════════════════════════════════════════════════════

function actPing_() {
  var out = {
    service: 'LAKH GAS', version: VERSION, time: nowStr_(), tz: CFG.TZ,
    config: {
      spreadsheet: !!prop_('SPREADSHEET_ID', ''),
      telegram: !!(prop_('TELEGRAM_BOT_TOKEN', '') && prop_('TELEGRAM_CHAT_ID', '')),
      driveRoot: !!prop_('DRIVE_ROOT_FOLDER_ID', ''),
      cronTriggers: 0
    }
  };
  try {
    out.config.cronTriggers = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'autoDispatcherCron';
    }).length;
  } catch (e) { out.config.cronTriggers = -1; }
  try { out.sheets = 'ok: ' + ss_().getName(); } catch (e) { out.sheets = 'error: ' + e.message; }
  return out;
}

function actStats_() {
  var today = readSchedule_(today_());
  var sum = scheduleSummary_(today);

  var sched = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  var kb = sheet_(CFG.SHEETS.KB, KB_HEADERS);

  var files = 0, origBytes = 0, compBytes = 0;
  var ev = sheet_(CFG.SHEETS.EVIDEN, EVIDEN_HEADERS);
  if (ev.getLastRow() > 1) {
    var evVals = ev.getRange(2, 5, ev.getLastRow() - 1, 2).getValues();
    evVals.forEach(function (r) {
      files++;
      origBytes += Number(r[0]) || 0;
      compBytes += Number(r[1]) || 0;
    });
  }

  var tgToday = 0;
  var tg = sheet_(CFG.SHEETS.TG, TG_HEADERS);
  if (tg.getLastRow() > 1) {
    var d = today_();
    tg.getRange(2, 1, tg.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      if (String(r[0]).indexOf(d) === 0) tgToday++;
    });
  }

  return {
    today: { date: today_(), slots: sum.slots, effectiveHours: sum.effectiveHours, pendingEviden: sum.pendingEviden },
    totals: {
      llkRows: Math.max(0, sched.getLastRow() - 1),
      kbCases: Math.max(0, kb.getLastRow() - 1),
      evidenFiles: files,
      savedMB: Math.round((origBytes - compBytes) / 1048576 * 10) / 10,
      telegramToday: tgToday
    }
  };
}

function actLogList_(b) {
  var sh = sheet_(CFG.SHEETS.LOG, LOG_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return { total: 0, items: [] };
  var n = Math.min(limit_(b.limit, 50, 200), last - 1);
  var vals = sh.getRange(last - n + 1, 1, n, LOG_HEADERS.length).getDisplayValues().reverse(); // newest first
  return {
    total: last - 1,
    items: vals.map(function (v) {
      return { time: v[0], event: v[1], summary: v[2], http: Number(v[3]) || 0, ms: Number(v[4]) || 0, status: v[5] };
    })
  };
}

function actFlushCache_() {
  var cache = CacheService.getScriptCache();
  var keys = ['rootFolder'];
  var now = new Date();
  for (var i = 0; i < 24; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push('folder:' + Utilities.formatDate(d, CFG.TZ, 'yyyy/MM'));
  }
  cache.removeAll(keys);
  return { flushed: keys.length };
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIONS: SCHEDULE (FR-04)
// ═══════════════════════════════════════════════════════════════════════

function actScheduleSave_(b) {
  var date = validDate_(b.date || today_());
  var items = b.items;
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    throw httpError_(400, 'items must be an array of 1-30 entries');
  }

  var clean = items.map(function (it, i) {
    var s = toMin_(it && it.start), e = toMin_(it && it.end);
    if (s < 0 || e < 0 || e <= s) throw httpError_(400, 'items[' + i + ']: start/end must be HH:mm with end after start');
    var task = str_(it.task, 300);
    if (!task) throw httpError_(400, 'items[' + i + ']: task is required');
    var skip = !!it.skip || /\b(ishoma|istirahat)\b/i.test(task);
    var needEv = (it.evidenRequired === undefined || it.evidenRequired === null)
      ? (e - s >= 120) : !!it.evidenRequired;
    return { s: s, e: e, task: task, result: str_(it.result, 200), skip: skip, evidenRequired: !skip && needEv };
  });
  clean.sort(function (a, b2) { return a.s - b2.s; });
  for (var k = 1; k < clean.length; k++) {
    if (clean[k].s < clean[k - 1].e) throw httpError_(400, 'Slots overlap at ' + fmtTime_(clean[k].s));
  }

  var sh = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  var existing = readSchedule_(date);
  var keep = {};
  existing.forEach(function (x) { keep[x.start + '-' + x.end] = x; });

  existing.map(function (x) { return x._row; })
    .sort(function (a, b2) { return b2 - a; })
    .forEach(function (r) { sh.deleteRow(r); });

  var now = nowStr_();
  var compact = date.replace(/-/g, '');
  var rows = clean.map(function (c, i) {
    var old = keep[fmtTime_(c.s) + '-' + fmtTime_(c.e)];
    var hasEv = old && old.evidenUrls.length > 0;
    var status = c.skip ? 'Diabaikan' : (hasEv ? 'Terunggah' : (c.evidenRequired ? 'Menunggu Eviden' : 'Terjadwal'));
    return [
      'LLK-' + compact + '-' + pad_(i + 1, 2), date, fmtTime_(c.s), fmtTime_(c.e), c.task,
      c.result || (old ? old.result : ''), c.evidenRequired ? 'YA' : 'TIDAK', status,
      old ? old.evidenUrls.join('\n') : '', old ? old.fileIds.join('\n') : '',
      c.skip ? 'SKIP' : (old ? old.reminder : ''), old ? old.createdAt : now, now
    ];
  });
  writeRows_(sh, rows);

  var saved = readSchedule_(date);
  return { date: date, saved: rows.length, items: saved.map(publicItem_), summary: scheduleSummary_(saved) };
}

function actScheduleGet_(b) {
  var date = validDate_(b.date || today_());
  var items = readSchedule_(date);
  return { date: date, items: items.map(publicItem_), summary: scheduleSummary_(items) };
}

function actScheduleUpdate_(b) {
  var id = str_(b.id, 40);
  if (!id) throw httpError_(400, 'id is required');
  var sh = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  var row = findRowById_(sh, id);
  if (row < 0) throw httpError_(404, 'Schedule id not found: ' + id);

  var cols = { task: 5, result: 6, status: 8 };
  if (b.status !== undefined && STATUS_LIST.indexOf(b.status) < 0) {
    throw httpError_(400, 'status must be one of: ' + STATUS_LIST.join(', '));
  }
  var changed = [];
  Object.keys(cols).forEach(function (f) {
    if (b[f] === undefined) return;
    var val = f === 'status' ? b[f] : str_(b[f], f === 'task' ? 300 : 200);
    if (f === 'task' && !val) throw httpError_(400, 'task cannot be empty');
    var cell = sh.getRange(row, cols[f]);
    cell.setNumberFormat('@');
    cell.setValue(val);
    changed.push(f);
  });
  if (!changed.length) throw httpError_(400, 'Nothing to update (allowed: task, result, status)');
  var ts = sh.getRange(row, 13);
  ts.setNumberFormat('@');
  ts.setValue(nowStr_());
  var item = rowToSchedule_(sh.getRange(row, 1, 1, SCHEDULE_HEADERS.length).getDisplayValues()[0], row);
  return { updated: changed, item: publicItem_(item) };
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIONS: EVIDEN UPLOAD (FR-03)
// ═══════════════════════════════════════════════════════════════════════

function sniffImage_(bytes) {
  var b0 = bytes[0] & 255, b1 = bytes[1] & 255, b2 = bytes[2] & 255, b3 = bytes[3] & 255;
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 && bytes.length > 12 &&
      (bytes[8] & 255) === 0x57 && (bytes[9] & 255) === 0x45 && (bytes[10] & 255) === 0x42 && (bytes[11] & 255) === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function actEvidenSync_(b) {
  var b64 = String(b.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) throw httpError_(400, 'base64 is required');
  if (b64.length > Math.ceil(CFG.MAX_UPLOAD_BYTES * 4 / 3) + 16) {
    throw httpError_(413, 'File exceeds ' + Math.round(CFG.MAX_UPLOAD_BYTES / 1024) + ' KB after compression');
  }
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw httpError_(400, 'base64 is not valid'); }
  if (bytes.length < 16) throw httpError_(400, 'File is empty or corrupt');
  if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpError_(413, 'File exceeds ' + Math.round(CFG.MAX_UPLOAD_BYTES / 1024) + ' KB after compression');
  var kind = sniffImage_(bytes);
  if (!kind) throw httpError_(415, 'Only JPEG, PNG or WEBP images are accepted');

  // Resolve the schedule row (if any) to decide folder month and file name.
  var sh = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  var scheduleId = str_(b.scheduleId, 40);
  var date = today_(), label = '';
  if (scheduleId) {
    var r = findRowById_(sh, scheduleId);
    if (r < 0) throw httpError_(404, 'Schedule id not found: ' + scheduleId);
    var item = rowToSchedule_(sh.getRange(r, 1, 1, SCHEDULE_HEADERS.length).getDisplayValues()[0], r);
    date = item.date;
    label = item.start.replace(':', '') + '_' + slug_(item.task, 30);
  } else {
    label = slug_(String(b.filename || 'eviden').replace(/\.[^.]*$/, ''), 30);
  }

  var folder = evidenFolder_(date);
  var name = date + '_' + label + '_' + Utilities.formatDate(new Date(), CFG.TZ, 'HHmmss') + '.' + kind.ext;
  var file = folder.createFile(Utilities.newBlob(bytes, kind.mime, name));

  var sharing = 'private';
  if (String(prop_('EVIDEN_SHARING', 'PRIVATE')).toUpperCase() === 'LINK') {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sharing = 'anyone_with_link';
    } catch (e) { sharing = 'link_sharing_blocked_by_policy'; }
  }
  var url = file.getUrl();
  var fileId = file.getId();

  withLock_(function () {
    if (scheduleId) {
      var row = findRowById_(sh, scheduleId);
      if (row > 0) {
        var cur = sh.getRange(row, 8, 1, 3).getDisplayValues()[0]; // Status, URL, FileId
        var urls = cur[1] ? cur[1] + '\n' + url : url;
        var ids = cur[2] ? cur[2] + '\n' + fileId : fileId;
        var rng = sh.getRange(row, 8, 1, 3);
        rng.setNumberFormat('@');
        rng.setValues([['Terunggah', urls, ids]]);
        var ts = sh.getRange(row, 13);
        ts.setNumberFormat('@');
        ts.setValue(nowStr_());
      }
    }
    writeRows_(sheet_(CFG.SHEETS.EVIDEN, EVIDEN_HEADERS),
      [[nowStr_(), fileId, scheduleId, name, Number(b.originalBytes) || bytes.length, bytes.length, url]]);
  });

  return {
    fileId: fileId, url: url, name: name, sizeKB: Math.round(bytes.length / 1024),
    folder: CFG.ROOT_FOLDER_NAME + '/' + date.substring(0, 4) + '/' + date.substring(5, 7),
    sharing: sharing, scheduleId: scheduleId || null
  };
}

function rootFolder_() {
  var cache = CacheService.getScriptCache();
  var id = prop_('DRIVE_ROOT_FOLDER_ID', '') || cache.get('rootFolder');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var it = DriveApp.getRootFolder().getFoldersByName(CFG.ROOT_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(CFG.ROOT_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('DRIVE_ROOT_FOLDER_ID', folder.getId());
  cache.put('rootFolder', folder.getId(), 21600);
  return folder;
}

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// /Eviden_LLK/YYYY/MM  (monthly sub-folders keep Drive fast, per the PRD)
function evidenFolder_(date) {
  var y = date.substring(0, 4), m = date.substring(5, 7);
  var key = 'folder:' + y + '/' + m;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* stale, rebuild */ }
  }
  var f = childFolder_(childFolder_(rootFolder_(), y), m);
  cache.put(key, f.getId(), 21600);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIONS: KNOWLEDGE BASE (FR-06; FR-07 reads via KB_LIST on the VPS)
// ═══════════════════════════════════════════════════════════════════════

function normTags_(v) {
  var arr = Array.isArray(v) ? v : String(v || '').split(',');
  var seen = {}, out = [];
  arr.forEach(function (t) {
    t = str_(t, 40).replace(/^#+/, '');
    if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = true; out.push(t); }
  });
  return out.slice(0, 15);
}

function rowToKb_(v) {
  return {
    id: v[0], timestamp: v[1], judul: v[2], sistem: v[3], severity: v[4], stackTrace: v[5],
    solusi: v[6], tags: v[7] ? v[7].split(', ') : [], evidenUrl: v[8], verifiedBy: v[9]
  };
}

function readKb_() {
  var sh = sheet_(CFG.SHEETS.KB, KB_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, KB_HEADERS.length).getDisplayValues().map(rowToKb_);
}

function actKbSave_(b) {
  var judul = str_(b.judul, 200);
  var solusi = str_(b.solusi, 8000);
  var sistem = str_(b.sistem, 30);
  if (!judul) throw httpError_(400, 'judul is required');
  if (!solusi) throw httpError_(400, 'solusi is required');
  if (SISTEM_LIST.indexOf(sistem) < 0) throw httpError_(400, 'sistem must be one of: ' + SISTEM_LIST.join(', '));
  var severity = str_(b.severity || 'Medium', 10);
  if (SEVERITY_LIST.indexOf(severity) < 0) throw httpError_(400, 'severity must be one of: ' + SEVERITY_LIST.join(', '));
  var eviden = str_(b.eviden, 500);
  if (eviden && !/^https:\/\//i.test(eviden)) throw httpError_(400, 'eviden must be an https:// URL');

  var tags = normTags_(b.tags);
  if (tags.map(function (t) { return t.toLowerCase(); }).indexOf(sistem.toLowerCase()) < 0) tags.unshift(sistem);

  var sh = sheet_(CFG.SHEETS.KB, KB_HEADERS);
  var year = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy');
  var maxN = 0;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      var m = /^KB-\d{4}-(\d+)$/.exec(r[0]);
      if (m && Number(m[1]) > maxN) maxN = Number(m[1]);
    });
  }
  var id = 'KB-' + year + '-' + pad_(maxN + 1, 3);
  writeRows_(sh, [[id, nowStr_(), judul, sistem, severity, str_(b.stackTrace, 20000), solusi,
    tags.join(', '), eviden, str_(b.verifiedBy, 80)]]);
  return { id: id, tags: tags };
}

function filterKb_(items, b) {
  var tag = str_(b.tag, 40).replace(/^#+/, '').toLowerCase();
  if (tag && tag !== 'all') {
    items = items.filter(function (x) {
      return x.tags.some(function (t) { return t.toLowerCase() === tag; });
    });
  }
  if (b.since) {
    var since = str_(b.since, 19);
    items = items.filter(function (x) { return x.timestamp > since; });
  }
  return items;
}

function actKbList_(b) {
  var items = filterKb_(readKb_(), b).reverse(); // newest first
  var total = items.length;
  var off = Math.max(0, parseInt(b.offset, 10) || 0);
  var lim = limit_(b.limit, 50, 200);
  return { total: total, items: items.slice(off, off + lim) };
}

function actKbSearch_(b) {
  var q = str_(b.q, 200).toLowerCase();
  if (!q) throw httpError_(400, 'q is required');
  var tokens = q.split(/\s+/).filter(Boolean).slice(0, 8);
  var scored = [];
  filterKb_(readKb_(), b).forEach(function (x) {
    var score = 0;
    var title = x.judul.toLowerCase(), tags = x.tags.join(' ').toLowerCase();
    var body = (x.solusi + ' ' + x.stackTrace + ' ' + x.sistem).toLowerCase();
    tokens.forEach(function (t) {
      if (title.indexOf(t) >= 0) score += 3;
      if (tags.indexOf(t) >= 0) score += 2;
      if (body.indexOf(t) >= 0) score += 1;
    });
    if (score > 0) scored.push({ score: score, item: x });
  });
  scored.sort(function (a, c) { return c.score - a.score || (c.item.timestamp > a.item.timestamp ? 1 : -1); });
  var lim = limit_(b.limit, 20, 100);
  return {
    total: scored.length,
    items: scored.slice(0, lim).map(function (s) { s.item.score = s.score; return s.item; })
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TELEGRAM + CRON (FR-05)
// ═══════════════════════════════════════════════════════════════════════

function sendTelegram_(text, type, agenda) {
  var token = prop_('TELEGRAM_BOT_TOKEN', '');
  var chatId = prop_('TELEGRAM_CHAT_ID', '');
  if (!token || !chatId) throw httpError_(500, 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in Script Properties');

  var silent = String(prop_('TELEGRAM_SILENT', 'false')).toLowerCase() === 'true';
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chatId, text: text, parse_mode: 'HTML',
      disable_notification: silent, disable_web_page_preview: true
    })
  });
  var code = res.getResponseCode();
  var parsed = {};
  try { parsed = JSON.parse(res.getContentText()); } catch (e) { /* non-JSON error page */ }
  var ok = code === 200 && parsed.ok === true;
  try {
    writeRows_(sheet_(CFG.SHEETS.TG, TG_HEADERS),
      [[nowStr_(), type, agenda || '', chatId, code, ok ? 'Delivered' : 'Failed: ' + (parsed.description || 'unknown')]]);
  } catch (e) { /* ignore log failure */ }
  return { ok: ok, code: code, description: parsed.description || null };
}

function actTelegramTest_() {
  var r = sendTelegram_('🔧 <b>[TEST PING]</b> LAKH backend terhubung.\n' + nowStr_() + ' WIB', 'Test Ping', 'Manual Trigger');
  if (!r.ok) throw httpError_(502, 'Telegram rejected the message: ' + (r.description || r.code));
  return r;
}

function buildReminder_(it) {
  var url = prop_('WEBAPP_URL', '');
  var link = /^https:\/\//i.test(url) ? '\n<a href="' + escHtml_(url) + '">Buka Eviden Uploader</a>' : '';
  if (it.evidenRequired && !it.evidenUrls.length) {
    return '📸 <b>Waktu eviden</b>\n' + escHtml_(it.task) + ' (' + it.start + ')\nAmbil foto dan unggah sekarang.' + link;
  }
  return '🔔 <b>[' + it.start + ' WIB] Reminder LLK</b>\n' + escHtml_(it.task) + link;
}

function runReminders_(opt) {
  var now = new Date();
  var today = Utilities.formatDate(now, CFG.TZ, 'yyyy-MM-dd');
  var dow = Number(Utilities.formatDate(now, CFG.TZ, 'u')); // 1=Mon ... 7=Sun
  var nowMin = toMin_(Utilities.formatDate(now, CFG.TZ, 'HH:mm'));
  var result = { date: today, time: nowStr_(), dryRun: !!opt.dryRun, due: [], sent: 0, failed: 0, skipped: '' };

  if (!opt.force && dow > 5) { result.skipped = 'weekend'; return result; }
  if (!opt.force && (nowMin < toMin_(CFG.WORK_START) || nowMin > toMin_(CFG.WORK_END))) {
    result.skipped = 'outside work hours';
    return result;
  }

  var lead = Math.max(0, Math.min(60, parseInt(prop_('LEAD_MINUTES', '0'), 10) || 0));
  var sh = sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);

  readSchedule_(today).forEach(function (it) {
    if (it.status === 'Diabaikan' || it.reminder) return;
    var s = toMin_(it.start), e = toMin_(it.end);
    if (nowMin < s - lead || nowMin >= e) return; // not yet due, or slot already over
    result.due.push({ id: it.id, start: it.start, task: it.task });
    if (opt.dryRun) return;
    try {
      var r = sendTelegram_(buildReminder_(it), it.evidenRequired ? 'Eviden Reminder' : 'Schedule Alert', it.task);
      if (r.ok) {
        var cell = sh.getRange(it._row, 11);
        cell.setNumberFormat('@');
        cell.setValue('SENT ' + nowStr_());
        result.sent++;
      } else {
        result.failed++; // stays unmarked, retried on the next tick
      }
    } catch (err) {
      result.failed++;
    }
  });
  return result;
}

function actCronPulse_(b) {
  return withLock_(function () {
    return runReminders_({ dryRun: !!b.dryRun, force: true });
  });
}

/** Time-driven trigger target. Do not rename: installTriggers() references it. */
function autoDispatcherCron() {
  var t0 = Date.now();
  try {
    var r = withLock_(function () { return runReminders_({ dryRun: false, force: false }); });
    if (r.due.length || r.failed) log_('CRON', 'sent=' + r.sent + ' failed=' + r.failed + ' due=' + r.due.length, 200, Date.now() - t0, r.failed ? 'Error' : 'Success');
  } catch (err) {
    log_('CRON', err.message, err.code || 500, Date.now() - t0, 'Error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TELEGRAM STATUS / HISTORY / SETTINGS
// ═══════════════════════════════════════════════════════════════════════

function actTelegramLogList_(b) {
  var sh = sheet_(CFG.SHEETS.TG, TG_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return { total: 0, items: [] };
  var n = Math.min(limit_(b.limit, 50, 200), last - 1);
  var vals = sh.getRange(last - n + 1, 1, n, TG_HEADERS.length).getDisplayValues().reverse();
  return { total: last - 1, items: vals.map(function (v) {
    return { time: v[0], type: v[1], agenda: v[2], chatId: v[3], http: Number(v[4]) || 0, status: v[5] };
  }) };
}

/** Never throws for Telegram problems: "offline" is a normal answer. The token is never returned. */
function actTelegramStatus_() {
  var token = prop_('TELEGRAM_BOT_TOKEN', '');
  var chatId = prop_('TELEGRAM_CHAT_ID', '');
  if (!token) return { configured: false, ok: false, chatSet: !!chatId, error: 'Bot token belum diisi' };
  var t0 = Date.now();
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', { muteHttpExceptions: true });
    var parsed = {};
    try { parsed = JSON.parse(res.getContentText()); } catch (e) { /* non-JSON */ }
    if (res.getResponseCode() === 200 && parsed.ok && parsed.result) {
      return { configured: true, ok: true, chatSet: !!chatId, username: parsed.result.username || '', name: parsed.result.first_name || '', ms: Date.now() - t0 };
    }
    return { configured: true, ok: false, chatSet: !!chatId, ms: Date.now() - t0, error: String(parsed.description || 'HTTP ' + res.getResponseCode()) };
  } catch (e) {
    return { configured: true, ok: false, chatSet: !!chatId, ms: Date.now() - t0, error: String(e.message || e).split(token).join('***') };
  }
}

function settingsView_() {
  var lead = parseInt(prop_('LEAD_MINUTES', '0'), 10);
  var sharing = String(prop_('EVIDEN_SHARING', 'PRIVATE')).toUpperCase();
  var sheetName = '';
  try { sheetName = ss_().getName(); } catch (e) { /* not set up */ }
  return {
    version: VERSION,
    tz: CFG.TZ,
    telegram: {
      tokenSet: !!prop_('TELEGRAM_BOT_TOKEN', ''),
      chatId: prop_('TELEGRAM_CHAT_ID', ''),
      leadMinutes: [0, 5, 15].indexOf(lead) >= 0 ? lead : 0,
      silent: String(prop_('TELEGRAM_SILENT', 'false')).toLowerCase() === 'true'
    },
    webappUrl: prop_('WEBAPP_URL', ''),
    evidenSharing: sharing === 'LINK' ? 'LINK' : 'PRIVATE',
    drive: { rootName: CFG.ROOT_FOLDER_NAME, rootSet: !!prop_('DRIVE_ROOT_FOLDER_ID', '') },
    sheets: { name: sheetName, tabs: [CFG.SHEETS.SCHEDULE, CFG.SHEETS.KB, CFG.SHEETS.LOG, CFG.SHEETS.TG, CFG.SHEETS.EVIDEN] },
    cron: { minutes: CFG.CRON_MINUTES, start: CFG.WORK_START, end: CFG.WORK_END }
  };
}

function actSettingsGet_() { return settingsView_(); }

/** Allow-listed, validated writes to Script Properties. Secrets are write-only. */
function actSettingsSet_(b) {
  var p = PropertiesService.getScriptProperties();
  var changed = [];
  if (b.telegramToken !== undefined && b.telegramToken !== '') {
    var tok = String(b.telegramToken).trim();
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(tok)) throw httpError_(400, 'Format bot token tidak valid');
    p.setProperty('TELEGRAM_BOT_TOKEN', tok); changed.push('telegramToken');
  }
  if (b.telegramChatId !== undefined) {
    var cid = String(b.telegramChatId).trim();
    if (!/^-?\d{1,20}$/.test(cid) && !/^@[A-Za-z0-9_]{5,32}$/.test(cid)) throw httpError_(400, 'Chat ID harus angka (boleh diawali -) atau @channel');
    p.setProperty('TELEGRAM_CHAT_ID', cid); changed.push('telegramChatId');
  }
  if (b.leadMinutes !== undefined) {
    var lead = Number(b.leadMinutes);
    if ([0, 5, 15].indexOf(lead) < 0) throw httpError_(400, 'leadMinutes harus 0, 5 atau 15');
    p.setProperty('LEAD_MINUTES', String(lead)); changed.push('leadMinutes');
  }
  if (b.silent !== undefined) {
    if (typeof b.silent !== 'boolean') throw httpError_(400, 'silent harus boolean');
    p.setProperty('TELEGRAM_SILENT', b.silent ? 'true' : 'false'); changed.push('silent');
  }
  if (b.webappUrl !== undefined) {
    var url = String(b.webappUrl).trim();
    if (url && !/^https:\/\/[^\s<>"']{3,300}$/i.test(url)) throw httpError_(400, 'webappUrl harus berupa URL https://');
    if (url) p.setProperty('WEBAPP_URL', url); else p.deleteProperty('WEBAPP_URL');
    changed.push('webappUrl');
  }
  if (b.evidenSharing !== undefined) {
    var sh = String(b.evidenSharing).toUpperCase();
    if (sh !== 'PRIVATE' && sh !== 'LINK') throw httpError_(400, 'evidenSharing harus PRIVATE atau LINK');
    p.setProperty('EVIDEN_SHARING', sh); changed.push('evidenSharing');
  }
  if (!changed.length) throw httpError_(400, 'Tidak ada pengaturan yang diubah');
  var out = settingsView_();
  out.changed = changed;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP (run from the Apps Script editor)
// ═══════════════════════════════════════════════════════════════════════

function setupLakh() {
  var p = PropertiesService.getScriptProperties();

  if (!p.getProperty('AUTH_TOKEN')) {
    var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    p.setProperty('AUTH_TOKEN', token);
    Logger.log('AUTH_TOKEN (copy into Vercel env LAKH_GAS_KEY, shown once): ' + token);
  } else {
    Logger.log('AUTH_TOKEN already set (read it in Project Settings > Script Properties).');
  }

  if (!p.getProperty('SPREADSHEET_ID')) {
    var ss = SpreadsheetApp.create('LAKH_Database');
    p.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('Spreadsheet created: ' + ss.getUrl());
  }

  sheet_(CFG.SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  sheet_(CFG.SHEETS.KB, KB_HEADERS);
  sheet_(CFG.SHEETS.LOG, LOG_HEADERS);
  sheet_(CFG.SHEETS.TG, TG_HEADERS);
  sheet_(CFG.SHEETS.EVIDEN, EVIDEN_HEADERS);
  var blank = ss_().getSheetByName('Sheet1');
  if (blank && ss_().getSheets().length > 1 && blank.getLastRow() === 0) ss_().deleteSheet(blank);

  Logger.log('Drive root folder: ' + rootFolder_().getUrl());
  installTriggers();

  var missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].filter(function (k) { return !p.getProperty(k); });
  if (missing.length) Logger.log('TODO: add Script Properties: ' + missing.join(', '));
  Logger.log('Setup finished. Next: Deploy > New deployment > Web app (Execute as Me, Access Anyone).');
}

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('autoDispatcherCron').timeBased().everyMinutes(CFG.CRON_MINUTES).create();
  Logger.log('Cron trigger installed: autoDispatcherCron every ' + CFG.CRON_MINUTES + ' min.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoDispatcherCron') ScriptApp.deleteTrigger(t);
  });
}
