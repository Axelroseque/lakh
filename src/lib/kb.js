import { toMin } from './format.js';

export const SISTEM_OPTIONS = [
  ['SIPP', 'SIPP MA-RI'], ['CCTVbase', 'CCTVbase Badilum'], ['Sekarbanyu', 'Sekarbanyu Portal'],
  ['Jaringan', 'Jaringan LAN & Router'], ['Server', 'Database Server OS'], ['Hardware', 'Hardware / Peripheral']
];
export const SEVERITY_OPTIONS = [['High', 'P1 - High (Layanan Berhenti)'], ['Medium', 'P2 - Medium (Sebagian Terganggu)'], ['Low', 'P3 - Low (Minor Bug/Cosmetic)']];
export const SEVERITY_BADGE = {
  High: ['CRITICAL', 'bg-primary-container/20 text-primary-container'],
  Medium: ['MEDIUM', 'bg-tertiary-container/20 text-tertiary'],
  Low: ['MINOR', 'bg-secondary-container/20 text-secondary']
};

export function parseTags(s) {
  const seen = new Set();
  return String(s || '').split(/[,\n]/).map(t => t.trim().replace(/^#+/, '').slice(0, 40))
    .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 15);
}

/** [{tag, count}] sorted by count desc then name. Tag matching elsewhere is case-insensitive. */
export function tagCounts(items) {
  const m = new Map();
  for (const it of items) for (const t of it.tags || []) {
    const k = t.toLowerCase();
    const cur = m.get(k) || { tag: t, count: 0 };
    cur.count++; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function hasTag(it, tag) {
  if (!tag || tag === 'all') return true;
  return (it.tags || []).some(t => t.toLowerCase() === String(tag).toLowerCase());
}

export function sortKb(items, dir = 'desc') {
  const s = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0) * s);
}

/** Real numbers for the metric banner (the mockup's fake percentages are not stored anywhere). */
export function kbStats(items, today) {
  const month = today.slice(0, 7);
  return {
    total: items.length,
    thisMonth: items.filter(i => String(i.timestamp).startsWith(month)).length,
    high: items.filter(i => i.severity === 'High').length,
    withEviden: items.filter(i => i.evidenUrl).length,
    topSistem: (() => { const c = {}; items.forEach(i => { c[i.sistem] = (c[i.sistem] || 0) + 1; }); const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? { name: e[0], count: e[1] } : null; })()
  };
}

export function validateKb(f) {
  const e = {};
  if (!f.judul.trim()) e.judul = 'Judul wajib diisi';
  else if (f.judul.trim().length > 200) e.judul = 'Maksimal 200 karakter';
  if (!f.solusi.trim()) e.solusi = 'Langkah solusi wajib diisi';
  else if (f.solusi.trim().length > 8000) e.solusi = 'Maksimal 8000 karakter';
  if (f.stackTrace.length > 20000) e.stackTrace = 'Maksimal 20.000 karakter';
  if (f.eviden.trim() && !/^https:\/\/\S+$/i.test(f.eviden.trim())) e.eviden = 'Harus berupa URL https://';
  return e;
}

export function kbPayload(f) {
  return {
    judul: f.judul.trim(), sistem: f.sistem, severity: f.severity, stackTrace: f.stackTrace.trim(),
    solusi: f.solusi.trim(), tags: parseTags(f.tags), eviden: f.eviden.trim(), verifiedBy: f.verifiedBy.trim()
  };
}

export const EMPTY_KB = { judul: '', sistem: 'SIPP', severity: 'Medium', stackTrace: '', solusi: '', tags: '', eviden: '', verifiedBy: '' };

export function kbCsvColumns() {
  return [
    { label: 'ID', key: 'id' }, { label: 'Waktu', key: 'timestamp' }, { label: 'Judul', key: 'judul' }, { label: 'Sistem', key: 'sistem' },
    { label: 'Severity', key: 'severity' }, { label: 'Tags', get: r => (r.tags || []).join(', ') }, { label: 'Solusi', key: 'solusi' },
    { label: 'Stack Trace', key: 'stackTrace' }, { label: 'URL Eviden', key: 'evidenUrl' }, { label: 'Diverifikasi', key: 'verifiedBy' }
  ];
}

// ── Telegram helpers ───────────────────────────────────────────────────
export const BOT_TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;
export const CHAT_ID_RE = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;

export function validateTelegram({ token, chatId }) {
  const e = {};
  if (token && !BOT_TOKEN_RE.test(token.trim())) e.token = 'Format token tidak valid (contoh 123456789:AA...)';
  if (!String(chatId || '').trim()) e.chatId = 'Chat ID wajib diisi';
  else if (!CHAT_ID_RE.test(String(chatId).trim())) e.chatId = 'Chat ID harus angka (boleh diawali -) atau @channel';
  return e;
}

export const maskChatId = id => { const s = String(id || ''); return s.length <= 4 ? s : s.slice(0, 2) + '•'.repeat(Math.max(0, s.length - 4)) + s.slice(-2); };

/** Delivery KPI over today's rows. rate is null when nothing was sent. */
export function deliveryStats(items, today) {
  const rows = items.filter(i => String(i.time).startsWith(today));
  const ok = rows.filter(i => i.status === 'Delivered').length;
  return { total: rows.length, ok, failed: rows.length - ok, rate: rows.length ? Math.round((ok / rows.length) * 1000) / 10 : null };
}

/** Same wording as buildReminder_ in code.gs, for the phone preview. */
export function reminderPreview(it) {
  const needs = it.evidenRequired && !(it.evidenUrls && it.evidenUrls.length);
  return needs
    ? { icon: 'camera', head: `[${it.start} WIB] Waktu Eviden`, body: `${it.task} (${it.start})\nAmbil foto dan unggah sekarang.`, link: true }
    : { icon: 'schedule', head: `[${it.start} WIB] Reminder LLK`, body: it.task, link: false };
}

/** Slots whose reminder fires from lead minutes before start (mirrors runReminders_). */
export function dueAt(it, lead) { return toMin(it.start) - lead; }

export const KB_DRAFT_KEY = 'lakh.kbdraft';
