import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, Card, ErrorNote, Pill, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CRON, fmtNextRun, nextCronRun } from '../lib/cron.js';
import { monthFolder, relTime, todayJakarta } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

const SHEET_TABS = ['DATA_LLK_AUTOMATION', 'PROBLEM_SOLVE', 'SYNC_LOG', 'TELEGRAM_LOG', 'EVIDEN_LOG'];
const GAS_LIMIT_MS = 360000;
const CELL_LIMIT = 10000000;
const EVENT_ICON = {
  PING: ['ping', 'text-secondary'], SCHEDULE_SAVE: ['save_as', 'text-tertiary'], SCHEDULE_GET: ['table', 'text-outline'],
  SCHEDULE_UPDATE: ['edit_note', 'text-tertiary'], EVIDEN_SYNC: ['cloud_upload', 'text-primary'], KB_SAVE: ['book', 'text-secondary'],
  CRON: ['update', 'text-secondary'], CRON_PULSE: ['bolt', 'text-primary'], TELEGRAM_TEST: ['send', 'text-primary-container'],
  FLUSH_CACHE: ['sweep', 'text-outline'], STATS: ['quota', 'text-outline']
};

function parseTs(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(ts || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5], +m[6]) : NaN; // log times are WIB (UTC+7)
}
const fmtTime = (ts, today) => (String(ts).startsWith(today) ? String(ts).slice(11, 19) : String(ts).slice(8, 10) + '/' + String(ts).slice(5, 7) + ' ' + String(ts).slice(11, 16));
const fmtMs = ms => (ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms');

function Kpi({ label, tone, badge, badgeClass = 'text-secondary', children, foot, footValue, footClass = 'text-on-surface' }) {
  return (
    <div className="rounded-xl bg-surface-container p-space-md flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
      <div className={'absolute -right-6 -top-6 w-24 h-24 rounded-full pointer-events-none ' + tone} />
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-label text-label-md text-outline uppercase tracking-wider">{label}</span>
          {badge && <span className={'px-2 py-0.5 rounded-full bg-surface-container-high font-label text-label-sm font-semibold flex items-center gap-1 ' + badgeClass}>{badge}</span>}
        </div>
        <div className="mt-1 min-w-0">{children}</div>
      </div>
      <div className="mt-4 pt-3 bg-surface-container-low/70 -mx-space-md -mb-space-md px-space-md pb-space-sm flex items-center justify-between gap-2 font-label text-label-sm">
        <span className="text-outline shrink-0">{foot}</span>
        <span className={'font-semibold truncate ' + footClass}>{footValue}</span>
      </div>
    </div>
  );
}

function Meter({ label, left, right, pct, bar, foot, icon, tone }) {
  return (
    <div className="rounded-xl bg-surface-container p-space-md flex flex-col justify-between">
      <div className="flex items-center gap-2"><Icon name={icon} size={20} className={tone} /><span className="font-label text-label-lg font-semibold text-on-surface">{label}</span></div>
      <div className="my-3">
        <div className="flex justify-between font-label text-label-sm mb-1"><span className="text-outline">{left}</span><span className="text-on-surface font-mono">{right}</span></div>
        <div className="h-2 rounded-full bg-surface-container-lowest overflow-hidden"><div className={'h-full rounded-full transition-all ' + bar} style={{ width: Math.max(1, Math.min(100, pct)) + '%' }} /></div>
      </div>
      <span className="font-label text-label-sm text-on-surface-variant">{foot}</span>
    </div>
  );
}

function ControlButton({ icon, tone, title, hint, busy, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="w-full text-left p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between group disabled:opacity-60">
      <div className="flex items-center gap-3 min-w-0">
        <span className={'p-2 rounded bg-surface-container shrink-0 ' + tone}>{busy ? <Spinner /> : <Icon name={icon} size={20} />}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-label text-label-lg font-semibold text-on-surface">{title}</span>
          <span className="font-label text-label-sm text-on-surface-variant">{hint}</span>
        </div>
      </div>
      <Icon name="arrow" size={18} className="text-outline group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

export default function GasTrigger() {
  const today = todayJakarta();
  const [probe, setProbe] = useState({ state: 'loading' });
  const [stream, setStream] = useState(true);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [armed, setArmed] = useState(false);
  const [tick, setTick] = useState(0);
  const armTimer = useRef(null);

  const stats = useAsync(() => api.stats(), []);
  const log = useAsync(() => api.opsLog(60), []);

  const doPing = useCallback(async () => {
    setProbe(p => ({ ...p, state: 'loading' }));
    const t0 = performance.now();
    try {
      const data = await api.ping();
      setProbe({ state: 'ok', ms: Math.round(performance.now() - t0), data, at: new Date() });
    } catch (e) {
      setProbe({ state: 'error', error: e, ms: Math.round(performance.now() - t0), at: new Date() });
    }
  }, []);
  useEffect(() => { doPing(); }, [doPing]);

  // live stream: refresh the audit trail and the "next run" clock
  useEffect(() => {
    const t = setInterval(() => { setTick(n => n + 1); if (stream) log.reload(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);
  useEffect(() => () => clearTimeout(armTimer.current), []);

  const run = async (id, fn, describe) => {
    setBusy(id); setResult(null);
    try {
      const r = await fn();
      setResult({ ok: true, text: describe(r), at: new Date() });
    } catch (e) {
      setResult({ ok: false, text: e.message, at: new Date() });
    } finally {
      setBusy('');
      log.reload(); stats.reload();
    }
  };

  const dueText = r => (r.due.length ? r.due.map(d => `${d.start} ${d.task}`).join('; ') : 'tidak ada slot aktif saat ini');
  const actions = {
    telegram: () => run('telegram', api.telegramTest, () => 'Pesan uji terkirim ke Telegram.'),
    flush: () => run('flush', api.flushCache, r => `${r.flushed} kunci cache dibersihkan.`),
    dry: () => run('dry', () => api.cronPulse(true), r => `Dry run: ${r.due.length} slot jatuh tempo (${dueText(r)}). Tidak ada pesan dikirim.`)
  };
  const force = () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(false);
    run('force', () => api.cronPulse(false), r => `Cron dijalankan: ${r.sent} terkirim, ${r.failed} gagal, ${r.due.length} jatuh tempo (${dueText(r)}).`);
  };

  const items = log.data ? log.data.items : [];
  const shown = onlyErrors ? items.filter(i => i.status !== 'Success') : items;
  const t = stats.data ? stats.data.totals : null;
  const cfg = probe.state === 'ok' ? probe.data.config : null;
  const sheetsOk = probe.state === 'ok' && /^ok:/.test(probe.data.sheets || '');
  const sheetName = sheetsOk ? probe.data.sheets.replace(/^ok:\s*/, '') : '—';
  const next = useMemo(() => fmtNextRun(nextCronRun()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => {
    const ok = items.filter(i => i.status === 'Success').length;
    const maxMs = items.reduce((a, i) => Math.max(a, i.ms), 0);
    const avgMs = items.length ? items.reduce((a, i) => a + i.ms, 0) / items.length : 0;
    return { ok, total: items.length, errors: items.length - ok, maxMs, avgMs, rate: items.length ? Math.round((ok / items.length) * 100) : 0 };
  }, [items]);
  const cells = t ? t.llkRows * 13 + t.kbCases * 10 + t.evidenFiles * 7 + (log.data ? log.data.total * 6 : 0) : 0;
  const lastLog = items[0] ? relTime(items[0].time) : '';
  const online = probe.state === 'ok';

  return (
    <div className="flex flex-col w-full gap-space-lg">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label text-label-sm uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-surface-container-high font-semibold">Subsystem FR-04 • FR-05</span>
            <span className="flex items-center gap-1.5 font-label text-label-sm text-on-surface-variant">
              <span className={'w-2 h-2 rounded-full ' + (probe.state === 'loading' ? 'bg-outline animate-pulse' : online ? 'bg-emerald-400 animate-ping' : 'bg-primary-container')} />
              {probe.state === 'loading' ? 'Memeriksa node...' : online ? 'Node Online • Sinkronisasi aktif' : 'Node tidak terjangkau'}
            </span>
          </div>
          <h1 className="text-headline-xl text-on-surface font-bold tracking-tight">GAS Trigger Sync &amp; Sheets Logger</h1>
          <p className="text-body-md text-on-surface-variant max-w-3xl">Pantau endpoint Google Apps Script (doPost), jejak audit sinkronisasi Google Sheets, dan cron pengirim reminder Telegram.</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm self-start lg:self-center">
          <Btn onClick={doPing} disabled={probe.state === 'loading'} icon={probe.state === 'loading' ? undefined : 'ping'} className="h-10 shadow-sm">
            {probe.state === 'loading' && <Spinner />} Ping GAS Endpoint
          </Btn>
          <Btn variant="primary" onClick={force} disabled={busy === 'force'} icon={busy === 'force' ? undefined : 'bolt'} className={'h-10 !px-5 font-semibold ' + (armed ? 'ring-2 ring-on-surface' : '')}>
            {busy === 'force' && <Spinner className="border-on-primary/40 border-t-on-primary" />}
            {armed ? 'Yakin? Klik lagi untuk kirim' : 'Jalankan Cron Sekarang'}
          </Btn>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
        <Kpi
          label="GAS Webhook Endpoint" tone="bg-secondary-container/10"
          badge={<><span className={'w-1.5 h-1.5 rounded-full ' + (online ? 'bg-secondary' : 'bg-primary-container')} />{probe.state === 'loading' ? '...' : online ? '200 OK' : probe.error && probe.error.status ? probe.error.status : 'Gagal'}</>}
          badgeClass={online ? 'text-secondary' : 'text-primary-container'}
          foot="Layanan" footValue={online ? `${probe.data.service} v${probe.data.version}` : probe.state === 'error' ? probe.error.message : '—'}
        >
          <div className="flex items-baseline gap-2"><span className="text-headline-lg font-bold text-on-surface">{probe.ms ?? '—'}</span><span className="text-body-sm text-on-surface-variant font-normal">ms round trip</span></div>
        </Kpi>
        <Kpi
          label="Target Google Sheets" tone="bg-primary-container/10"
          badge={<><Icon name="table" size={13} /> {sheetsOk ? 'Terhubung' : probe.state === 'loading' ? '...' : 'Bermasalah'}</>}
          badgeClass={sheetsOk ? 'text-primary' : 'text-primary-container'}
          foot="Log terakhir" footValue={lastLog ? `${lastLog}` : '—'}
        >
          <div className="flex flex-col"><span className="text-headline-md font-bold text-on-surface truncate" title={sheetName}>{sheetName}</span><span className="font-label text-label-md text-on-surface-variant">{SHEET_TABS.length} tab: <span className="text-secondary font-semibold">{SHEET_TABS[0]}</span> +{SHEET_TABS.length - 1}</span></div>
        </Kpi>
        <Kpi
          label="Time-Driven Cron" tone="bg-tertiary-container/10"
          badge={<><span className={'w-1.5 h-1.5 rounded-full ' + (cfg && cfg.cronTriggers > 0 ? 'bg-emerald-400' : 'bg-primary-container')} />{!cfg ? '...' : cfg.cronTriggers > 0 ? 'Aktif' : cfg.cronTriggers === 0 ? 'Belum dipasang' : 'Tidak diketahui'}</>}
          badgeClass={cfg && cfg.cronTriggers > 0 ? 'text-emerald-400' : 'text-primary-container'}
          foot="Jalan berikutnya" footValue={next} footClass="text-tertiary font-mono"
        >
          <div className="flex flex-col"><span className="text-headline-lg font-bold text-on-surface">{CRON.minutes}-Min<span className="text-body-sm text-on-surface-variant ml-1 font-normal">interval</span></span>
            <span className="font-label text-label-sm text-on-surface-variant">Trigger: <span className="text-on-surface font-mono">{CRON.handler}</span> • Sen-Jum 07:00-16:30</span></div>
        </Kpi>
        <Kpi
          label="Storage Drive Path" tone="bg-secondary/5"
          badge="Google Drive" badgeClass="text-secondary-fixed"
          foot="Folder aktif" footValue={monthFolder(today)} footClass="text-on-surface font-mono"
        >
          <div className="flex items-baseline gap-2"><span className="text-headline-lg font-bold text-on-surface">{t ? t.evidenFiles.toLocaleString('id-ID') : '—'}</span><span className="text-body-sm text-on-surface-variant">berkas tertaut</span></div>
        </Kpi>
      </div>
      <ErrorNote error={stats.error} onRetry={stats.reload} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
        <div className="xl:col-span-8 flex flex-col gap-space-md">
          {/* Audit trail */}
          <div className="rounded-xl bg-surface-container p-space-md shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-sm">
              <div className="flex items-center gap-space-sm min-w-0">
                <Icon name="terminal" size={20} className="text-primary" />
                <div>
                  <h2 className="text-headline-md font-bold text-on-surface">Live Execution &amp; Sync Audit Trail</h2>
                  <p className="font-label text-label-sm text-on-surface-variant">Log dari tab SYNC_LOG, diperbarui tiap 15 detik</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={onlyErrors} onClick={() => setOnlyErrors(v => !v)} className={'px-2.5 py-1 rounded font-label text-label-sm transition-colors ' + (onlyErrors ? 'bg-primary-container text-on-primary font-semibold' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface')}>Hanya error{m.errors ? ` (${m.errors})` : ''}</button>
                <button type="button" aria-pressed={stream} onClick={() => setStream(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low font-label text-label-sm text-on-surface-variant hover:text-on-surface" title={stream ? 'Jeda pembaruan otomatis' : 'Lanjutkan pembaruan otomatis'}>
                  <Icon name={stream ? 'pause' : 'play'} size={14} /> Stream: {stream ? 'Aktif' : 'Jeda'}
                  <span className={'w-2 h-2 rounded-full ' + (stream ? 'bg-emerald-400 animate-pulse' : 'bg-outline')} />
                </button>
                <button type="button" onClick={log.reload} className="p-1.5 rounded bg-surface-container-low text-on-surface-variant hover:text-on-surface" aria-label="Muat ulang log" title="Muat ulang log"><Icon name="refresh" size={16} className={log.loading ? 'animate-spin' : ''} /></button>
              </div>
            </div>
            <ErrorNote error={log.error} onRetry={log.reload} className="mb-2" />
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="bg-surface-container-low text-outline font-label text-label-sm uppercase tracking-wider">
                    <th className="py-2.5 px-3 rounded-l-lg font-semibold">Waktu</th><th className="py-2.5 px-3 font-semibold">Event / Request</th><th className="py-2.5 px-3 font-semibold">Ringkasan</th>
                    <th className="py-2.5 px-3 font-semibold">HTTP</th><th className="py-2.5 px-3 font-semibold">Durasi</th><th className="py-2.5 px-3 rounded-r-lg font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="text-body-sm">
                  {shown.map((r, i) => {
                    const [ic, tone] = EVENT_ICON[r.event] || ['bolt', 'text-primary'];
                    const good = r.status === 'Success';
                    return (
                      <tr key={r.time + r.event + i} className={'hover:bg-surface-container-high/60 transition-colors group ' + (i % 2 ? 'bg-surface-container-low/20' : '')}>
                        <td className="py-3 px-3 font-mono text-outline group-hover:text-on-surface whitespace-nowrap">{fmtTime(r.time, today)}</td>
                        <td className="py-3 px-3 font-semibold text-on-surface"><span className="flex items-center gap-2 whitespace-nowrap"><Icon name={ic} size={16} className={tone} /> {r.event}</span></td>
                        <td className="py-3 px-3 text-on-surface-variant font-mono text-[11px] max-w-[260px] truncate" title={r.summary}>{r.summary}</td>
                        <td className="py-3 px-3"><span className={'px-2 py-0.5 rounded bg-surface-container-high font-label text-label-sm font-mono font-bold ' + (r.http < 400 ? 'text-emerald-400' : 'text-error')}>{r.http}{r.http === 200 ? ' OK' : ''}</span></td>
                        <td className="py-3 px-3 font-mono text-on-surface">{fmtMs(r.ms)}</td>
                        <td className="py-3 px-3 text-right"><span className={'inline-flex items-center gap-1 font-label text-label-sm font-semibold ' + (good ? 'text-emerald-400' : 'text-error')}><Icon name={good ? 'check_circle' : 'error'} size={14} /> {good ? 'Success' : 'Error'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {log.loading && !log.data && <div className="flex items-center gap-2 text-outline text-body-sm p-4"><Spinner /> Memuat log...</div>}
              {log.data && !shown.length && <div className="text-center text-outline text-body-sm p-6">{onlyErrors ? 'Tidak ada error di log terakhir.' : 'Belum ada aktivitas tercatat.'}</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <Meter icon="quota" tone="text-primary" label="Tingkat Sukses" left="Log terakhir" right={`${m.ok} / ${m.total} req`} pct={m.rate} bar="bg-primary" foot={m.total ? (m.errors ? `${m.errors} permintaan gagal` : 'Semua permintaan berhasil') : 'Belum ada data'} />
            <Meter icon="hourglass_empty" tone="text-tertiary" label="GAS Timeout Safety" left={`Maks ${GAS_LIMIT_MS / 1000}s`} right={`${fmtMs(m.avgMs)} rata-rata`} pct={(m.maxMs / GAS_LIMIT_MS) * 100} bar="bg-tertiary-container" foot={`Terlama ${fmtMs(m.maxMs)} • batas run 6 menit`} />
            <Meter icon="database" tone="text-secondary" label="Kapasitas Sheets" left="Perkiraan sel" right={`${cells.toLocaleString('id-ID')} / 10 juta`} pct={(cells / CELL_LIMIT) * 100} bar="bg-secondary-container" foot={`Terpakai ${((cells / CELL_LIMIT) * 100).toFixed(2)}% dari batas spreadsheet`} />
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-md">
          <div className="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Icon name="tune" size={20} className="text-primary-container" /><h3 className="text-headline-md font-bold text-on-surface">Control Action Center</h3></div>
              <span className="px-2 py-0.5 rounded font-label text-label-sm bg-surface-container-high text-outline">Operasional</span>
            </div>
            <div className="flex flex-col gap-space-sm">
              <ControlButton icon="send" tone="text-primary-container" title="Kirim Pesan Uji Telegram" hint="Pastikan bot dan chat ID benar" busy={busy === 'telegram'} onClick={actions.telegram} />
              <ControlButton icon="alarm" tone="text-tertiary" title="Simulasikan Panggilan Cron (Dry Run)" hint="Cek slot jatuh tempo tanpa mengirim" busy={busy === 'dry'} onClick={actions.dry} />
              <ControlButton icon="sweep" tone="text-outline" title="Flush Apps Script Cache" hint="Reset cache ID folder Drive" busy={busy === 'flush'} onClick={actions.flush} />
            </div>
            {result && (
              <div role="status" className={'p-space-sm rounded-lg text-body-sm flex items-start gap-2 ' + (result.ok ? 'bg-primary-container/20 text-on-surface' : 'bg-error-container/40 text-on-error-container')}>
                <Icon name={result.ok ? 'info' : 'error'} size={18} className={'mt-0.5 ' + (result.ok ? 'text-primary-container' : '')} />
                <span>{result.text}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Icon name="code" size={20} className="text-secondary" /><h3 className="text-headline-md font-bold text-on-surface">doPost Structure Specs</h3></div>
              <span className="font-label text-label-sm font-mono text-outline">{online ? 'v' + probe.data.version : ''}</span>
            </div>
            <p className="text-body-sm text-on-surface-variant">Kontrak permintaan dari server Vercel ke Apps Script:</p>
            <div className="rounded-lg bg-surface-container-lowest p-space-sm font-mono text-[11px] text-on-surface-variant space-y-1 overflow-x-auto whitespace-pre">
              <div className="text-outline">// POST &lt;exec URL&gt; (text/plain)</div>
              <div>{'{ "key": "<AUTH_TOKEN>",'}</div>
              <div>{'  "action": "SCHEDULE_SAVE", ... }'}</div>
              <div className="text-outline pt-1">// aksi tersedia</div>
              <div className="text-secondary">{'PING STATS SCHEDULE_SAVE\nSCHEDULE_GET SCHEDULE_UPDATE\nEVIDEN_SYNC KB_SAVE KB_LIST\nKB_SEARCH LOG_LIST CRON_PULSE\nTELEGRAM_TEST FLUSH_CACHE'}</div>
            </div>
            <div className="pt-2 flex items-center justify-between text-outline font-label text-label-sm gap-2">
              <span>Token dikirim lewat body, bukan header</span>
              <span className={'flex items-center gap-1 font-semibold ' + (online ? 'text-emerald-400' : 'text-primary-container')}><span className={'w-1.5 h-1.5 rounded-full ' + (online ? 'bg-emerald-400' : 'bg-primary-container')} />{online ? 'Terverifikasi' : 'Tidak terverifikasi'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
