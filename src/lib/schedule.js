// Editable schedule matrix helpers (Generator page). Pure functions, covered by tests.
import { toMin } from './format.js';

export const WINDOW = { start: 7 * 60 + 30, end: 16 * 60 };   // 07:30 - 16:00 WIB
export const WORK_HOURS = (WINDOW.end - WINDOW.start) / 60;     // 8.5
export const TARGET_HOURS = 7.0;
export const MAX_ROWS = 30;

let keySeq = 0;
export const newKey = () => 'r' + Date.now().toString(36) + (keySeq++).toString(36);

/** "7.30" / "730" / "7:5" -> "07:30" (returns the input unchanged when it can't be understood). */
export function normTime(v) {
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})\s*[:.]\s*(\d{1,2})$/.exec(s);
  if (!m) { const d = /^(\d{1,2})(\d{2})$/.exec(s); if (d) m = d; }
  if (!m) return s;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return s;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

export function rowFromSaved(it) {
  return {
    key: newKey(), id: it.id, start: it.start, end: it.end, task: it.task, result: it.result || '',
    evidenRequired: !!it.evidenRequired, skip: it.status === 'Diabaikan', status: it.status,
    evidenUrls: it.evidenUrls || [], orig: { start: it.start, end: it.end }
  };
}

export function rowFromDraft(it) {
  return {
    key: newKey(), start: it.start, end: it.end, task: it.task, result: it.result || '',
    evidenRequired: !!it.evidenRequired && !it.skip, skip: !!it.skip, status: it.skip ? 'Diabaikan' : 'Draf', evidenUrls: []
  };
}

export const sortRows = rows => [...rows].sort((a, b) => (toMin(a.start) - toMin(b.start)) || (toMin(a.end) - toMin(b.end)));

/** @returns {{errors: Record<string,string>, warnings: Record<string,string>, ok: boolean}} keyed by row.key */
export function validateRows(rows) {
  const errors = {}, warnings = {};
  if (rows.length > MAX_ROWS) errors._ = `Maksimal ${MAX_ROWS} slot`;
  const timed = [];
  for (const r of rows) {
    const s = toMin(r.start), e = toMin(r.end);
    if (s < 0 || e < 0) errors[r.key] = 'Jam harus HH:MM';
    else if (e <= s) errors[r.key] = 'Jam selesai harus setelah mulai';
    else if (!String(r.task || '').trim()) errors[r.key] = 'Uraian wajib diisi';
    else {
      timed.push({ r, s, e });
      if (s < WINDOW.start || e > WINDOW.end) warnings[r.key] = 'Di luar 07:30 - 16:00';
      const moved = r.orig && (r.orig.start !== r.start || r.orig.end !== r.end);
      if (moved && r.evidenUrls && r.evidenUrls.length) warnings[r.key] = 'Jam berubah: eviden terunggah tidak ikut terbawa';
    }
    if (!errors[r.key] && String(r.task || '').length > 300) errors[r.key] = 'Uraian maksimal 300 karakter';
  }
  timed.sort((a, b) => a.s - b.s);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].s < timed[i - 1].e) errors[timed[i].r.key] = `Bentrok dengan ${timed[i - 1].r.start}-${timed[i - 1].r.end}`;
  }
  const ok = !rows.length ? false : Object.keys(errors).length === 0;
  return { errors, warnings, ok };
}

export function summarizeRows(rows) {
  const live = rows.filter(r => !r.skip && toMin(r.end) > toMin(r.start) && toMin(r.start) >= 0);
  const minutes = live.reduce((a, r) => a + (toMin(r.end) - toMin(r.start)), 0);
  const hours = Math.round(minutes / 6) / 10;
  const needEviden = live.filter(r => r.evidenRequired && !(r.evidenUrls && r.evidenUrls.length));
  return {
    slots: live.length, hours, minutes,
    ishoma: rows.filter(r => r.skip).length,
    evidenSlots: live.filter(r => r.evidenRequired).length,
    noEviden: live.filter(r => !r.evidenRequired).length,
    pendingEviden: needEviden.length,
    firstPending: needEviden[0] || null,
    targetPct: Math.round((hours / TARGET_HOURS) * 100)
  };
}

export function toApiItems(rows) {
  return sortRows(rows).map(r => ({
    start: r.start, end: r.end, task: String(r.task).trim(), result: String(r.result || '').trim(),
    evidenRequired: !r.skip && !!r.evidenRequired, skip: !!r.skip
  }));
}

export function llkText(rows) {
  return sortRows(rows).filter(r => !r.skip)
    .map(r => `${r.start} - ${r.end} | ${String(r.task).trim()}${r.result ? ' | ' + String(r.result).trim() : ''}`).join('\n');
}

/** First free half hour after the last slot (or the start of the day). */
export function nextSlot(rows) {
  const ends = rows.map(r => toMin(r.end)).filter(m => m >= 0);
  const s = ends.length ? Math.max(...ends) : WINDOW.start;
  const e = Math.min(s + 30, 23 * 60 + 59);
  const f = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  return { start: f(s), end: f(e) };
}
