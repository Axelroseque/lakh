// When does autoDispatcherCron fire next? Mirrors code.gs: every 5 min, Mon-Fri 07:00-16:30 WIB.
export const CRON = { minutes: 5, start: 7 * 60, end: 16 * 60 + 30, handler: 'autoDispatcherCron()' };
const DAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function nextCronRun(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = t => parts.find(p => p.type === t).value;
  const day = DAYS[get('weekday')];
  const cur = Number(get('hour')) * 60 + Number(get('minute'));

  if (day < 5 && cur < CRON.end) {
    const next = cur < CRON.start ? CRON.start : (Math.floor(cur / CRON.minutes) + 1) * CRON.minutes;
    if (next <= CRON.end) return { minutes: next, daysAhead: 0 };
  }
  let ahead = 1;
  while ((day + ahead) % 7 > 4) ahead++;
  return { minutes: CRON.start, daysAhead: ahead };
}

export function fmtNextRun(r) {
  const t = String(Math.floor(r.minutes / 60)).padStart(2, '0') + ':' + String(r.minutes % 60).padStart(2, '0') + ' WIB';
  return r.daysAhead === 0 ? t : r.daysAhead === 1 ? 'Besok ' + t : `+${r.daysAhead} hari ${t}`;
}
