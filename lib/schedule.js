// Normalises whatever the LLM returns into a clean schedule (FR-01).

export const WINDOW = { start: 7 * 60 + 30, end: 16 * 60 };      // 07:30 - 16:00
export const ISHOMA = { start: 12 * 60, end: 13 * 60 };           // 12:00 - 13:00
const MAX_ITEMS = 30;
const ISHOMA_RE = /ishoma|istirahat|rehat|dzuhur|zuhur|makan siang/i;

export function toMin(v) {
  const m = /^(\d{1,2})\s*[:.]\s*(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return -1;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? -1 : h * 60 + mi;
}

export function fmt(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/** Pull a JSON value out of free text (handles ```json fences and chatter around it). */
export function extractJson(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const candidates = [fenced && fenced[1], s];
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a >= 0 && b > a) candidates.push(s.slice(a, b + 1));
  const c = s.indexOf('{'), d = s.lastIndexOf('}');
  if (c >= 0 && d > c) candidates.push(s.slice(c, d + 1));
  for (const cand of candidates) {
    if (!cand) continue;
    try { return JSON.parse(cand.trim()); } catch { /* try next */ }
  }
  return null;
}

/**
 * @returns {{items: object[], warnings: string[]}}
 */
export function normalizeSchedule(raw) {
  const warnings = [];
  let list = Array.isArray(raw) ? raw : raw && (raw.items || raw.jadwal || raw.schedule);
  if (!Array.isArray(list)) return { items: [], warnings: ['AI output has no schedule array'] };

  let rows = [];
  list.slice(0, MAX_ITEMS).forEach((it, i) => {
    if (!it || typeof it !== 'object') return;
    let s = toMin(it.start ?? it.mulai);
    let e = toMin(it.end ?? it.selesai);
    const task = String(it.task ?? it.uraian ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (s < 0 || e < 0 || e <= s || !task) { warnings.push(`Item ${i + 1} dropped (invalid time or empty task)`); return; }
    if (e <= WINDOW.start || s >= WINDOW.end) { warnings.push(`"${task}" dropped (outside 07:30-16:00)`); return; }
    if (s < WINDOW.start || e > WINDOW.end) {
      warnings.push(`"${task}" trimmed to 07:30-16:00`);
      s = Math.max(s, WINDOW.start);
      e = Math.min(e, WINDOW.end);
    }
    const skip = it.skip === true || ISHOMA_RE.test(task);
    rows.push({
      s, e, task,
      result: String(it.result ?? it.hasil ?? '').trim().slice(0, 500),
      evidenRequired: skip ? false : typeof it.evidenRequired === 'boolean' ? it.evidenRequired : true,
      skip
    });
  });

  rows.sort((a, b) => a.s - b.s);
  const clean = [];
  for (const r of rows) {
    const prev = clean[clean.length - 1];
    if (prev && r.s < prev.e) { warnings.push(`"${r.task}" dropped (overlaps "${prev.task}")`); continue; }
    clean.push(r);
  }

  // Make sure Ishoma is visible when the day spans it and the slot is free.
  const hasSkip = clean.some(r => r.skip);
  const free = !clean.some(r => r.s < ISHOMA.end && r.e > ISHOMA.start);
  const before = clean.some(r => r.e <= ISHOMA.start);
  const after = clean.some(r => r.s >= ISHOMA.end);
  if (!hasSkip && free && before && after) {
    clean.push({ s: ISHOMA.start, e: ISHOMA.end, task: 'Ishoma (Istirahat, Sholat, Makan Siang)', result: '', evidenRequired: false, skip: true });
    clean.sort((a, b) => a.s - b.s);
  }

  const items = clean.map(r => ({
    start: fmt(r.s), end: fmt(r.e), task: r.task, result: r.result,
    evidenRequired: r.evidenRequired, skip: r.skip
  }));
  return { items, warnings };
}
