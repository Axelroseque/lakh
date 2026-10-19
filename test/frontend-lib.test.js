import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attempts, fitSize, jpgName, TARGET_BYTES, SERVER_LIMIT_BYTES } from '../src/lib/compress.js';
import { todayJakarta, nowMinutesJakarta, relTime, monthFolder, fmtBytes, isPending, safeUrl, toMin } from '../src/lib/format.js';
import { createMockHandler } from '../dev/mock-api.js';

test('fitSize never upscales and keeps the aspect ratio', () => {
  assert.deepEqual(fitSize(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(fitSize(800, 600, 1920), { width: 800, height: 600 });
  assert.deepEqual(fitSize(3000, 4000, 1280), { width: 960, height: 1280 });
  assert.deepEqual(fitSize(1, 5000, 1280), { width: 1, height: 1280 });
});

test('attempts: best quality first, shrinking, bounded, never empty canvas', () => {
  const list = [...attempts(4000, 3000, 1920)];
  assert.ok(list.length <= 25 && list.length >= 5);
  assert.equal(list[0].quality, 0.86);
  assert.equal(list[0].scale, 1);
  assert.ok(list.every(a => a.width >= 1 && a.height >= 1 && Math.max(a.width, a.height) <= 1920));
  assert.ok(list.at(-1).width < list[0].width);
  assert.ok(TARGET_BYTES < SERVER_LIMIT_BYTES);
});

test('jpgName sanitises names', () => {
  assert.equal(jpgName('foto kegiatan (1).PNG'), 'foto_kegiatan_1_.jpg');
  assert.equal(jpgName(''), 'eviden.jpg');
});

test('Jakarta date/time helpers use WIB, not the machine zone', () => {
  const d = new Date('2026-10-11T18:30:00Z'); // 01:30 on the 12th in WIB
  assert.equal(todayJakarta(d), '2026-10-12');
  assert.equal(nowMinutesJakarta(d), 90);
  assert.equal(monthFolder('2026-10-12'), '/Eviden_LLK/2026/10');
});

test('relTime matches the dashboard wording', () => {
  const now = new Date('2026-10-12T05:00:00Z'); // 12:00 WIB
  assert.equal(relTime('2026-10-12 14:10:00', now), '14:10');
  assert.equal(relTime('2026-10-11 09:30:00', now), 'Kemarin');
  assert.equal(relTime('2026-10-10 09:30:00', now), '2 hari lalu');
  assert.equal(relTime('', now), '');
});

test('format helpers', () => {
  assert.equal(fmtBytes(500 * 1024), '500 KB');
  assert.equal(fmtBytes(6.8 * 1048576), '6.8 MB');
  assert.equal(toMin('07:30'), 450);
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://drive.google.com/x'), 'https://drive.google.com/x');
  assert.equal(isPending({ status: 'Terjadwal', evidenRequired: true, evidenUrls: [] }), true);
  assert.equal(isPending({ status: 'Diabaikan', evidenRequired: true, evidenUrls: [] }), false);
  assert.equal(isPending({ status: 'Terunggah', evidenRequired: true, evidenUrls: ['https://x'] }), false);
});

test('mock API keeps evidence on slots with the same time when a schedule is re-saved (same rule as GAS)', async () => {
  const h = createMockHandler();
  const today = todayJakarta();
  const before = await h('GET', '/api/schedule', new URLSearchParams(), {});
  const apel = before.items.find(i => i.start === '07:30');
  assert.ok(apel.evidenUrls.length === 1);
  const saved = await h('PUT', '/api/schedule', new URLSearchParams(), {
    date: today,
    items: [{ start: '07:30', end: '08:00', task: 'Apel', evidenRequired: true }, { start: '08:00', end: '09:00', task: 'Baru', evidenRequired: true }]
  });
  assert.equal(saved.items[0].evidenUrls.length, 1);
  assert.equal(saved.items[1].evidenUrls.length, 0);
});

import { nextCronRun, fmtNextRun } from '../src/lib/cron.js';
import { validateRows, summarizeRows, toApiItems, llkText, normTime, nextSlot, sortRows } from '../src/lib/schedule.js';

const wib = (iso) => new Date(new Date(iso + ':00Z').getTime() - 7 * 3600000); // WIB wall clock -> Date

test('nextCronRun: every 5 min on weekdays 07:00-16:30 WIB, otherwise next weekday 07:00', () => {
  assert.deepEqual(nextCronRun(wib('2026-10-12T10:02')), { minutes: 10 * 60 + 5, daysAhead: 0 });   // Monday
  assert.deepEqual(nextCronRun(wib('2026-10-12T10:05')), { minutes: 10 * 60 + 10, daysAhead: 0 });
  assert.deepEqual(nextCronRun(wib('2026-10-12T06:10')), { minutes: 7 * 60, daysAhead: 0 });
  assert.deepEqual(nextCronRun(wib('2026-10-12T16:31')), { minutes: 7 * 60, daysAhead: 1 });
  assert.deepEqual(nextCronRun(wib('2026-10-16T17:00')), { minutes: 7 * 60, daysAhead: 3 });         // Friday evening -> Monday
  assert.deepEqual(nextCronRun(wib('2026-10-17T09:00')), { minutes: 7 * 60, daysAhead: 2 });         // Saturday
  assert.equal(fmtNextRun({ minutes: 14 * 60 + 35, daysAhead: 0 }), '14:35 WIB');
  assert.equal(fmtNextRun({ minutes: 420, daysAhead: 1 }), 'Besok 07:00 WIB');
});

const R = (start, end, task, extra = {}) => ({ key: start + end, start, end, task, result: '', evidenRequired: true, skip: false, evidenUrls: [], ...extra });

test('normTime understands common typing', () => {
  assert.equal(normTime('7.30'), '07:30');
  assert.equal(normTime('730'), '07:30');
  assert.equal(normTime('7:5'), '07:05');
  assert.equal(normTime('25:00'), '25:00');
  assert.equal(normTime('abc'), 'abc');
});

test('validateRows: format, order, empty task, overlap, window warning, evidence-moved warning', () => {
  const rows = [
    R('07:30', '08:00', 'Apel'),
    R('07:45', '09:00', 'Bentrok'),
    R('ab:cd', '10:00', 'Jam salah'),
    R('10:00', '09:00', 'Terbalik'),
    R('10:00', '11:00', '   '),
    R('16:00', '17:00', 'Lembur'),
    R('11:00', '12:00', 'Pindah', { orig: { start: '11:30', end: '12:00' }, evidenUrls: ['https://x'] })
  ];
  const v = validateRows(rows);
  assert.equal(v.ok, false);
  assert.match(v.errors['07:4509:00'], /Bentrok dengan 07:30-08:00/);
  assert.match(v.errors['ab:cd10:00'], /HH:MM/);
  assert.match(v.errors['10:0009:00'], /setelah mulai/);
  assert.match(v.errors['10:0011:00'], /wajib/);
  assert.match(v.warnings['16:0017:00'], /luar/);
  assert.match(v.warnings['11:0012:00'], /eviden/);
  assert.equal(validateRows([R('07:30', '08:00', 'A'), R('08:00', '09:00', 'B')]).ok, true);
  assert.equal(validateRows([]).ok, false);
});

test('summarizeRows counts effective hours and compliance, ignoring skipped rows', () => {
  const s = summarizeRows([
    R('07:30', '08:00', 'Apel'),
    R('08:00', '10:00', 'SIPP', { evidenUrls: ['https://x'] }),
    R('12:00', '13:00', 'Ishoma', { skip: true, evidenRequired: false }),
    R('13:00', '15:30', 'Coding', { evidenRequired: false })
  ]);
  assert.equal(s.slots, 3);
  assert.equal(s.hours, 5);
  assert.equal(s.ishoma, 1);
  assert.equal(s.evidenSlots, 2);
  assert.equal(s.noEviden, 1);
  assert.equal(s.pendingEviden, 1);
  assert.equal(s.firstPending.task, 'Apel');
});

test('toApiItems / llkText sort by time, trim, and never ask evidence for skipped rows', () => {
  const rows = [R('13:00', '14:00', ' Sore '), R('12:00', '13:00', 'Ishoma', { skip: true, evidenRequired: true }), R('07:30', '08:00', 'Pagi', { result: ' ok ' })];
  const items = toApiItems(rows);
  assert.deepEqual(items.map(i => i.start), ['07:30', '12:00', '13:00']);
  assert.equal(items[1].evidenRequired, false);
  assert.equal(items[2].task, 'Sore');
  assert.equal(llkText(rows), '07:30 - 08:00 | Pagi | ok\n13:00 - 14:00 | Sore');
  assert.deepEqual(nextSlot(rows), { start: '14:00', end: '14:30' });
  assert.deepEqual(nextSlot([]), { start: '07:30', end: '08:00' });
  assert.equal(sortRows(rows)[0].start, '07:30');
});

import { csvCell, toCsv } from '../src/lib/csv.js';
import { parseTags, tagCounts, hasTag, sortKb, kbStats, validateKb, kbPayload, EMPTY_KB, validateTelegram, maskChatId, deliveryStats, reminderPreview } from '../src/lib/kb.js';

test('csv: quotes, newlines, and formula injection are neutralised', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(42), '42');
  const out = toCsv([{ a: 1, b: '=x' }], [{ label: 'A', key: 'a' }, { label: 'B', key: 'b' }]);
  assert.equal(out, '﻿A,B\r\n1,\'=x\r\n');
});

test('kb helpers: tags parse/dedupe, counts, filter, sort, stats', () => {
  assert.deepEqual(parseTags('#SIPP, db,  SIPP ,,#Patch'), ['SIPP', 'db', 'Patch']);
  const items = [
    { id: 'a', tags: ['SIPP', 'DB'], timestamp: '2026-10-01 10:00:00', severity: 'High', sistem: 'SIPP', evidenUrl: 'https://x' },
    { id: 'b', tags: ['sipp'], timestamp: '2026-10-05 09:00:00', severity: 'Low', sistem: 'SIPP', evidenUrl: '' },
    { id: 'c', tags: ['Network'], timestamp: '2026-09-30 09:00:00', severity: 'High', sistem: 'Jaringan', evidenUrl: '' }
  ];
  const c = tagCounts(items);
  assert.deepEqual(c.map(x => [x.tag.toLowerCase(), x.count]), [['sipp', 2], ['db', 1], ['network', 1]]);
  assert.equal(hasTag(items[1], 'SIPP'), true);
  assert.equal(hasTag(items[2], 'SIPP'), false);
  assert.equal(hasTag(items[2], 'all'), true);
  assert.deepEqual(sortKb(items).map(i => i.id), ['b', 'a', 'c']);
  assert.deepEqual(sortKb(items, 'asc').map(i => i.id), ['c', 'a', 'b']);
  const s = kbStats(items, '2026-10-16');
  assert.deepEqual([s.total, s.thisMonth, s.high, s.withEviden, s.topSistem.name], [3, 2, 2, 1, 'SIPP']);
  assert.equal(kbStats([], '2026-10-16').topSistem, null);
});

test('kb form validation and payload', () => {
  assert.deepEqual(Object.keys(validateKb(EMPTY_KB)).sort(), ['judul', 'solusi']);
  assert.match(validateKb({ ...EMPTY_KB, judul: 'x', solusi: 'y', eviden: 'http://insecure' }).eviden, /https/);
  assert.deepEqual(validateKb({ ...EMPTY_KB, judul: 'x', solusi: 'y', eviden: 'https://drive.google.com/a' }), {});
  const p = kbPayload({ ...EMPTY_KB, judul: ' J ', solusi: ' S ', tags: '#a, b', sistem: 'Server' });
  assert.deepEqual([p.judul, p.solusi, p.tags, p.sistem], ['J', 'S', ['a', 'b'], 'Server']);
});

test('telegram validation, masking, delivery KPI, reminder preview', () => {
  assert.deepEqual(validateTelegram({ token: '', chatId: '819204918' }), {});
  assert.deepEqual(validateTelegram({ token: '123456789:' + 'A'.repeat(35), chatId: '-100123' }), {});
  assert.deepEqual(validateTelegram({ token: '', chatId: '@kanal_pn' }), {});
  assert.ok(validateTelegram({ token: 'bad', chatId: '1' }).token);
  assert.ok(validateTelegram({ token: '', chatId: '' }).chatId);
  assert.ok(validateTelegram({ token: '', chatId: 'abc def' }).chatId);
  assert.equal(maskChatId('819204918'), '81•••••18');
  assert.equal(maskChatId('123'), '123');
  const rows = [
    { time: '2026-10-16 07:30:01', status: 'Delivered' }, { time: '2026-10-16 08:00:02', status: 'Delivered' },
    { time: '2026-10-16 10:00:03', status: 'Failed: Bad Gateway' }, { time: '2026-10-15 08:00:00', status: 'Failed: x' }
  ];
  assert.deepEqual(deliveryStats(rows, '2026-10-16'), { total: 3, ok: 2, failed: 1, rate: 66.7 });
  assert.equal(deliveryStats([], '2026-10-16').rate, null);
  assert.equal(reminderPreview({ start: '08:00', task: 'SIPP', evidenRequired: true, evidenUrls: [] }).icon, 'camera');
  assert.equal(reminderPreview({ start: '08:00', task: 'SIPP', evidenRequired: true, evidenUrls: ['u'] }).icon, 'schedule');
  assert.equal(reminderPreview({ start: '12:00', task: 'Ishoma', evidenRequired: false, evidenUrls: [] }).link, false);
});
