export const TZ = 'Asia/Jakarta';

/** yyyy-MM-dd in Asia/Jakarta, regardless of the browser's own time zone. */
export function todayJakarta(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Minutes since midnight in Asia/Jakarta. */
export function nowMinutesJakarta(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

export function monthFolder(date) {
  const [y, m] = String(date).split('-');
  return `/Eviden_LLK/${y}/${m}`;
}

export function fmtBytes(n) {
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

export function fmtDateLong(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y) return String(date || '');
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** "yyyy-MM-dd HH:mm:ss" (Asia/Jakarta, as written by Apps Script) -> "14:10", "Kemarin", "2 hari lalu", ... */
export function relTime(ts, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(ts || ''));
  if (!m) return '';
  const then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const [ty, tm, td] = todayJakarta(now).split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - then) / 86400000);
  if (days <= 0) return `${m[4]}:${m[5]}`;
  if (days === 1) return 'Kemarin';
  if (days < 31) return `${days} hari lalu`;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** An item still needs evidence when it requires one and nothing has been uploaded. */
export function isPending(it) {
  return !!it && it.status !== 'Diabaikan' && !!it.evidenRequired && !(it.evidenUrls && it.evidenUrls.length);
}

export function safeUrl(u) {
  return /^https:\/\//i.test(String(u || '')) ? String(u) : '';
}
