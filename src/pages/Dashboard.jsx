import Icon from '../components/Icon.jsx';
import ScheduleGenerator, { effectiveStatus } from '../components/ScheduleGenerator.jsx';
import KnowledgePanel, { SISTEM } from '../components/KnowledgePanel.jsx';
import { Card, ErrorNote, Pill, STATUS_COLOR } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDateLong, isPending, monthFolder, nowMinutesJakarta, toMin, todayJakarta } from '../lib/format.js';
import { useLocation } from '../lib/router.js';
import { useAsync } from '../lib/useAsync.js';

const DAY_START = 7 * 60 + 30;
const DAY_END = 16 * 60;
const dash = '—';

function MetricCard({ label, value, sub, children }) {
  return (
    <div className="relative bg-surface-container-low rounded-xl p-space-lg flex flex-col justify-between shadow-xl overflow-hidden hover:bg-surface-container transition-colors min-h-[210px]">
      <div className="space-y-space-xs">
        <span className="font-label text-label-md uppercase tracking-wider text-outline font-semibold">{label}</span>
        <div className="text-headline-xl text-on-surface font-extrabold tracking-tight">{value}</div>
        <div className="flex items-center pt-0.5 font-label text-label-sm text-outline min-h-[14px] min-w-0"><span className="truncate">{sub}</span></div>
      </div>
      <div className="mt-space-md">{children}</div>
    </div>
  );
}

/** The working day as a strip: one segment per slot, coloured by status. */
function DayStrip({ items, nowMin }) {
  const slots = items.filter(i => i.status !== 'Diabaikan');
  const span = DAY_END - DAY_START;
  const nowPct = Math.min(100, Math.max(0, ((nowMin - DAY_START) / span) * 100));
  return (
    <div>
      <div className="relative h-8 rounded bg-surface-container-lowest overflow-hidden" role="img" aria-label="Linimasa jadwal hari ini">
        {slots.map(it => {
          const s = Math.max(DAY_START, toMin(it.start)), e = Math.min(DAY_END, toMin(it.end));
          if (e <= s) return null;
          return (
            <div
              key={it.id}
              title={`${it.start}-${it.end} ${it.task} (${effectiveStatus(it, nowMin)})`}
              className={'absolute top-1 bottom-1 rounded-sm ' + (STATUS_COLOR[effectiveStatus(it, nowMin)] || 'bg-outline/60')}
              style={{ left: ((s - DAY_START) / span) * 100 + '%', width: ((e - s) / span) * 100 + '%' }}
            />
          );
        })}
        {nowMin >= DAY_START && nowMin <= DAY_END && <div className="absolute top-0 bottom-0 w-0.5 bg-on-surface/80" style={{ left: nowPct + '%' }} />}
      </div>
      <div className="flex justify-between font-label text-label-sm text-outline mt-1"><span>07:30</span><span>12:00</span><span>16:00</span></div>
    </div>
  );
}

function PendingList({ pending, nowMin }) {
  if (!pending.length) return <div className="font-label text-label-sm text-secondary flex items-center gap-1.5"><Icon name="check_circle" size={16} /> Semua eviden sudah lengkap</div>;
  return (
    <ul className="space-y-1.5">
      {pending.slice(0, 3).map(it => (
        <li key={it.id} className="flex items-center gap-2 bg-surface-container-lowest rounded px-2 py-1.5">
          <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + (toMin(it.end) <= nowMin ? 'bg-primary-container animate-pulse' : 'bg-outline')} />
          <span className="font-mono font-label text-label-sm text-secondary shrink-0">{it.start}</span>
          <span className="text-body-sm truncate">{it.task}</span>
        </li>
      ))}
    </ul>
  );
}

function SistemBar({ items }) {
  const counts = SISTEM.map(s => [s, items.filter(k => k.sistem === s).length]).filter(([, n]) => n > 0);
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const colors = ['bg-primary-container', 'bg-secondary', 'bg-tertiary-container', 'bg-primary-fixed', 'bg-on-surface-variant', 'bg-outline'];
  if (!total) return <div className="font-label text-label-sm text-outline">Belum ada data sistem</div>;
  return (
    <div>
      <div className="flex h-3 rounded overflow-hidden bg-surface-container-lowest" role="img" aria-label="Sebaran kasus per sistem">
        {counts.map(([s, n]) => <div key={s} title={`${s}: ${n}`} className={colors[SISTEM.indexOf(s) % colors.length]} style={{ width: (n / total) * 100 + '%' }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 font-label text-label-sm text-outline">
        {counts.map(([s, n]) => (
          <span key={s} className="flex items-center gap-1"><span className={'w-2 h-2 rounded-sm ' + colors[SISTEM.indexOf(s) % colors.length]} />{s} {n}</span>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, sub, extra }) {
  return (
    <div className="bg-surface-container-low rounded-xl p-space-md flex items-center gap-space-md shadow-md hover:bg-surface-container transition-colors">
      <div className="w-14 h-14 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
        <Icon name={icon} size={24} className="text-primary-container" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-label text-label-sm text-outline truncate">{label}</span>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-headline-md font-bold text-on-surface truncate">{value}</span>
          {extra}
        </div>
        <span className="font-label text-label-sm text-outline truncate">{sub}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const date = todayJakarta();
  const { search } = useLocation();
  const nowMin = nowMinutesJakarta();

  const sched = useAsync(() => api.scheduleGet(date), [date]);
  const stats = useAsync(() => api.stats(), []);
  const ping = useAsync(() => api.ping(), []);
  const ai = useAsync(() => api.aiStatus(), []);
  const kb = useAsync(() => api.kbList({ limit: 100 }), []);

  const reloadAll = () => { sched.reload(); stats.reload(); };

  const items = sched.data ? sched.data.items : [];
  const summary = sched.data ? sched.data.summary : null;
  const pending = items.filter(isPending).sort((a, b) => toMin(a.start) - toMin(b.start));
  const done = items.filter(i => i.status === 'Selesai').length;
  const t = stats.data ? stats.data.totals : null;
  const cfg = ping.data ? ping.data.config : null;
  const kbItems = kb.data ? kb.data.items : [];
  const topSistem = SISTEM.map(s => [s, kbItems.filter(k => k.sistem === s).length]).sort((a, b) => b[1] - a[1])[0];
  const aiData = ai.data;
  const gasOk = !!ping.data && !ping.error;

  return (
    <div className="flex flex-col w-full space-y-space-lg">
      <div className="flex flex-wrap items-center gap-2 font-label text-label-md text-outline">
        <Icon name="calendar" size={16} /> {fmtDateLong(date)}
        <span className="text-outline/50">•</span> Zona waktu Asia/Jakarta (WIB)
      </div>

      <ErrorNote error={stats.error || sched.error} onRetry={reloadAll} />

      {/* Row 1: key numbers, each with a real visual (no fabricated trend lines) */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter" aria-label="Ringkasan hari ini">
        <MetricCard
          label="LLK Hari Ini"
          value={sched.data ? `${done} / ${summary.slots}` : dash}
          sub={sched.data ? (summary.slots ? <>
            <span className="text-secondary font-bold">{summary.effectiveHours} jam efektif</span> · selesai dari total slot
          </> : 'Belum ada jadwal hari ini') : 'Memuat...'}
        >
          <DayStrip items={items} nowMin={nowMin} />
        </MetricCard>

        <MetricCard
          label="Pending Eviden"
          value={sched.data ? `${pending.length} Item` : dash}
          sub={pending.length ? <><span className="text-primary-container font-bold">Terdekat:</span> {pending[0].task} ({pending[0].start})</> : sched.data ? 'Tidak ada tunggakan' : 'Memuat...'}
        >
          {sched.data && <PendingList pending={pending} nowMin={nowMin} />}
        </MetricCard>

        <MetricCard
          label="Knowledge Base Solved"
          value={t ? `${t.kbCases} Case` : dash}
          sub={topSistem && topSistem[1] ? <><span className="text-secondary font-bold">Terbanyak:</span> {topSistem[0]} ({topSistem[1]})</> : 'Troubleshooting SIPP, CCTVbase & lainnya'}
        >
          <SistemBar items={kbItems} />
        </MetricCard>

        <MetricCard
          label="Drive Storage Saved"
          value={t ? `${t.savedMB} MB` : dash}
          sub={t ? `${t.evidenFiles} berkas eviden` : 'Memuat...'}
        >
          <dl className="grid grid-cols-2 gap-2 font-label text-label-sm">
            <div className="bg-surface-container-lowest rounded px-2 py-1.5"><dt className="text-outline">Target / foto</dt><dd className="text-on-surface font-semibold">&lt; 500 KB</dd></div>
            <div className="bg-surface-container-lowest rounded px-2 py-1.5"><dt className="text-outline">Kompresi</dt><dd className="text-on-surface font-semibold">Client-side</dd></div>
            <div className="bg-surface-container-lowest rounded px-2 py-1.5 col-span-2"><dt className="text-outline">Folder aktif</dt><dd className="text-on-surface font-semibold font-mono">{monthFolder(date)}</dd></div>
          </dl>
        </MetricCard>
      </section>

      {/* Row 2 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter" aria-label="Status sistem">
        <MiniCard icon="folder" label="Total LLK Entries" value={t ? `${t.llkRows.toLocaleString('id-ID')} Baris` : dash} sub="Seluruh periode di Sheets" />
        <MiniCard icon="assignment" label="Eviden Terkompresi" value={t ? `${t.evidenFiles.toLocaleString('id-ID')} Foto` : dash} sub={t ? `${t.savedMB} MB dihemat` : ''} />
        <MiniCard
          icon="send"
          label="Telegram Reminders"
          value={t ? `${t.telegramToday} Terkirim` : dash}
          sub={cfg ? (cfg.telegram ? `Cron ${cfg.cronTriggers > 0 ? 'aktif (5 mnt)' : 'belum dipasang'}` : 'Bot belum dikonfigurasi') : ''}
        />
        <MiniCard
          icon="dns"
          label="VPS AI Local Status"
          value={aiData ? (aiData.online ? 'Online' : aiData.configured ? 'Offline' : 'Belum diatur') : dash}
          extra={aiData && aiData.configured ? <Pill className="bg-surface-container text-secondary">{aiData.model}</Pill> : null}
          sub={aiData && aiData.online ? `Latency ${(aiData.ms / 1000).toFixed(1)}s < ${aiData.limitMs / 1000}s` : ''}
        />
      </section>

      {/* Core workspace */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
        <ScheduleGenerator
          date={date}
          saved={sched.data}
          loading={sched.loading}
          error={sched.error}
          reload={reloadAll}
          aiReady={aiData ? aiData.online : undefined}
        />
        <KnowledgePanel initialQuery={search.get('q') || ''} />
      </section>

      {/* Status strip */}
      <Card className="p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm">
          <span className="relative flex w-3 h-3">
            <span className={'absolute inline-flex h-full w-full rounded-full opacity-60 ' + (gasOk ? 'bg-secondary animate-ping' : 'bg-primary-container')} />
            <span className={'relative inline-flex rounded-full w-3 h-3 ' + (gasOk ? 'bg-secondary' : 'bg-primary-container')} />
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-label text-label-md font-bold">GAS Endpoint &amp; Google Sheets Sync</span>
              <Pill className="bg-surface-container text-secondary">{ping.loading && !ping.data ? 'Memeriksa...' : gasOk ? 'Connected' : 'Tidak terjangkau'}</Pill>
            </div>
            <span className="font-label text-label-sm text-outline">
              {gasOk ? `Last ping: ${ping.data.time} • Target folder: ${monthFolder(date)}` : ping.error ? ping.error.message : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg">
            <Icon name="send" size={18} className="text-primary-container" />
            <span className="font-label text-label-sm font-semibold">Telegram Bot</span>
            <Pill className="bg-surface-container-high text-secondary">{cfg ? (cfg.telegram ? 'Terkonfigurasi' : 'Belum diatur') : dash}</Pill>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-outline font-label text-label-sm">
            <Icon name="security" size={16} /> PN Kediri
          </div>
        </div>
      </Card>
    </div>
  );
}
