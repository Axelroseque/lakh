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

/**
 * MetricCard: High-end glassmorphism card with distinct translucent sub-boxes
 * to keep label, stat, descriptive sub-text, and chart/list cleanly isolated.
 */
function MetricCard({ label, value, sub, children }) {
  return (
    <div className="relative backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] p-5 flex flex-col justify-between shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] hover:border-white/[0.14] transition-all overflow-hidden min-h-[250px] group">
      {/* Top accent light reflection */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="font-label text-[11px] uppercase tracking-wider text-slate-400 font-bold">{label}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff384c]/70 group-hover:bg-[#ff384c] shadow-[0_0_6px_rgba(255,56,76,0.6)] transition-all" />
        </div>

        <div className="text-3xl font-extrabold text-white tracking-tight mt-1.5">
          {value}
        </div>

        {/* Dedicated translucent container for subtitle to eliminate any text overlapping */}
        <div className="bg-black/35 backdrop-blur-sm border border-white/[0.05] rounded-xl px-3 py-2 text-xs text-slate-300 font-label flex items-center min-h-[38px] mt-2.5">
          <span className="truncate">{sub}</span>
        </div>
      </div>

      {/* Visual content container */}
      <div className="mt-3.5 bg-black/30 backdrop-blur-sm border border-white/[0.05] rounded-xl p-3">
        {children}
      </div>
    </div>
  );
}

/** The working day as a strip: one segment per slot, coloured by status with live scrubber */
function DayStrip({ items, nowMin }) {
  const slots = items.filter(i => i.status !== 'Diabaikan');
  const span = DAY_END - DAY_START;
  const nowPct = Math.min(100, Math.max(0, ((nowMin - DAY_START) / span) * 100));
  return (
    <div>
      <div className="relative h-7 rounded-lg bg-black/50 overflow-hidden border border-white/[0.05]" role="img" aria-label="Linimasa jadwal hari ini">
        {slots.map(it => {
          const s = Math.max(DAY_START, toMin(it.start)), e = Math.min(DAY_END, toMin(it.end));
          if (e <= s) return null;
          return (
            <div
              key={it.id}
              title={`${it.start}-${it.end} ${it.task} (${effectiveStatus(it, nowMin)})`}
              className={'absolute top-1 bottom-1 rounded-sm transition-all ' + (STATUS_COLOR[effectiveStatus(it, nowMin)] || 'bg-slate-500/60')}
              style={{ left: ((s - DAY_START) / span) * 100 + '%', width: ((e - s) / span) * 100 + '%' }}
            />
          );
        })}
        {nowMin >= DAY_START && nowMin <= DAY_END && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"
            style={{ left: nowPct + '%' }}
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-slate-400 mt-1.5 px-0.5">
        <span>07:30</span>
        <span>12:00</span>
        <span>16:00</span>
      </div>
    </div>
  );
}

function PendingList({ pending, nowMin }) {
  if (!pending.length) {
    return (
      <div className="font-label text-xs text-sky-400 flex items-center gap-1.5 py-1">
        <Icon name="check_circle" size={16} /> Semua eviden sudah lengkap
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {pending.slice(0, 3).map(it => (
        <li key={it.id} className="flex items-center gap-2 bg-black/40 border border-white/[0.04] rounded-lg px-2.5 py-1.5">
          <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + (toMin(it.end) <= nowMin ? 'bg-[#ff384c] shadow-[0_0_8px_rgba(255,56,76,0.8)] animate-pulse' : 'bg-slate-500')} />
          <span className="font-mono text-xs text-sky-400 font-semibold shrink-0">{it.start}</span>
          <span className="text-xs text-slate-200 truncate">{it.task}</span>
        </li>
      ))}
    </ul>
  );
}

function SistemBar({ items }) {
  const counts = SISTEM.map(s => [s, items.filter(k => k.sistem === s).length]).filter(([, n]) => n > 0);
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const colors = ['bg-[#ff384c]', 'bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400', 'bg-slate-400'];
  if (!total) return <div className="font-label text-xs text-slate-400 py-1">Belum ada data sistem</div>;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-black/50 border border-white/[0.05]" role="img" aria-label="Sebaran kasus per sistem">
        {counts.map(([s, n]) => (
          <div
            key={s}
            title={`${s}: ${n}`}
            className={colors[SISTEM.indexOf(s) % colors.length]}
            style={{ width: (n / total) * 100 + '%' }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2 font-label text-[11px] text-slate-400">
        {counts.map(([s, n]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={'w-1.5 h-1.5 rounded-full ' + colors[SISTEM.indexOf(s) % colors.length]} />
            {s} <strong className="text-white font-mono">{n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, sub, extra }) {
  return (
    <div className="relative backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] p-4 flex items-center gap-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] hover:border-white/[0.14] transition-all group">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff384c]/20 to-[#ff384c]/5 border border-[#ff384c]/30 flex items-center justify-center text-[#ff4d5a] shadow-[0_0_15px_rgba(255,56,76,0.18)] shrink-0 group-hover:scale-105 transition-transform">
        <Icon name={icon} size={22} />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-label text-[11px] uppercase tracking-wider text-slate-400 font-semibold truncate">{label}</span>
        <div className="flex items-center gap-2 min-w-0 mt-0.5">
          <span className="text-lg font-bold text-white truncate">{value}</span>
          {extra}
        </div>
        <span className="font-label text-xs text-slate-400 truncate mt-0.5">{sub}</span>
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
      {/* Date & Timezone Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 font-label text-sm text-slate-300">
          <div className="w-2 h-2 rounded-full bg-[#ff384c] shadow-[0_0_8px_rgba(255,56,76,0.8)]" />
          <Icon name="calendar" size={16} className="text-[#ff4d5a]" />
          <span className="font-semibold text-white">{fmtDateLong(date)}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">Zona Asia/Jakarta (WIB)</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400 bg-white/[0.03] border border-white/[0.06] px-3 py-1 rounded-full backdrop-blur-sm">
          <span>Folder: <strong className="text-slate-200">{monthFolder(date)}</strong></span>
        </div>
      </div>

      <ErrorNote error={stats.error || sched.error} onRetry={reloadAll} />

      {/* Row 1: Key Metrics with Glassmorphism cards and distinct translucent sub-boxes */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter" aria-label="Ringkasan hari ini">
        <MetricCard
          label="LLK Hari Ini"
          value={sched.data ? `${done} / ${summary.slots}` : dash}
          sub={sched.data ? (summary.slots ? <>
            <span className="text-sky-400 font-bold">{summary.effectiveHours} jam efektif</span> · selesai dari total slot
          </> : 'Belum ada jadwal hari ini') : 'Memuat data jadwal...'}
        >
          <DayStrip items={items} nowMin={nowMin} />
        </MetricCard>

        <MetricCard
          label="Pending Eviden"
          value={sched.data ? `${pending.length} Item` : dash}
          sub={pending.length ? <><span className="text-[#ff4d5a] font-bold">Terdekat:</span> {pending[0].task} ({pending[0].start})</> : sched.data ? 'Semua eviden foto lengkap ✓' : 'Memuat...'}
        >
          {sched.data && <PendingList pending={pending} nowMin={nowMin} />}
        </MetricCard>

        <MetricCard
          label="Knowledge Base Solved"
          value={t ? `${t.kbCases} Case` : dash}
          sub={topSistem && topSistem[1] ? <><span className="text-sky-400 font-bold">Terbanyak:</span> {topSistem[0]} ({topSistem[1]} kasus)</> : 'Troubleshooting SIPP, CCTV & lainnya'}
        >
          <SistemBar items={kbItems} />
        </MetricCard>

        <MetricCard
          label="Drive Storage Saved"
          value={t ? `${t.savedMB} MB` : dash}
          sub={t ? `${t.evidenFiles} berkas eviden dikompresi` : 'Memuat data storage...'}
        >
          <dl className="grid grid-cols-2 gap-2 font-label text-xs">
            <div className="bg-black/40 border border-white/[0.04] rounded-lg px-2.5 py-1.5">
              <dt className="text-slate-400 text-[10px] uppercase font-semibold">Target / Foto</dt>
              <dd className="text-white font-mono font-semibold mt-0.5">&lt; 500 KB</dd>
            </div>
            <div className="bg-black/40 border border-white/[0.04] rounded-lg px-2.5 py-1.5">
              <dt className="text-slate-400 text-[10px] uppercase font-semibold">Kompresi</dt>
              <dd className="text-white font-semibold mt-0.5">Client-side</dd>
            </div>
            <div className="bg-black/40 border border-white/[0.04] rounded-lg px-2.5 py-1.5 col-span-2">
              <dt className="text-slate-400 text-[10px] uppercase font-semibold">Folder Aktif</dt>
              <dd className="text-white font-mono font-semibold mt-0.5 truncate">{monthFolder(date)}</dd>
            </div>
          </dl>
        </MetricCard>
      </section>

      {/* Row 2: Secondary Telemetry Status Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter" aria-label="Status sistem">
        <MiniCard
          icon="folder"
          label="Total LLK Entries"
          value={t ? `${t.llkRows.toLocaleString('id-ID')} Baris` : dash}
          sub="Seluruh periode di Sheets"
        />
        <MiniCard
          icon="assignment"
          label="Eviden Terkompresi"
          value={t ? `${t.evidenFiles.toLocaleString('id-ID')} Foto` : dash}
          sub={t ? `${t.savedMB} MB ruang Google Drive dihemat` : ''}
        />
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
          extra={aiData && aiData.configured ? <Pill className="bg-white/10 text-sky-300 font-mono text-[10px]">{aiData.model}</Pill> : null}
          sub={aiData && aiData.online ? `Latency ${(aiData.ms / 1000).toFixed(1)}s < ${aiData.limitMs / 1000}s` : ''}
        />
      </section>

      {/* Row 3: Core Workspace Grid (Strict 12-column system) */}
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

      {/* Row 4: Status Telemetry Footer Bar */}
      <Card className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="relative flex w-3.5 h-3.5 shrink-0">
            <span className={'absolute inline-flex h-full w-full rounded-full opacity-60 ' + (gasOk ? 'bg-sky-400 animate-ping' : 'bg-[#ff384c]')} />
            <span className={'relative inline-flex rounded-full w-3.5 h-3.5 ' + (gasOk ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-[#ff384c] shadow-[0_0_10px_rgba(255,56,76,0.8)]')} />
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="font-label text-sm font-bold text-white">GAS Endpoint &amp; Google Sheets Sync</span>
              <Pill className={gasOk ? 'bg-sky-500/15 text-sky-400 border-sky-400/30 font-semibold' : 'bg-rose-500/15 text-rose-400 border-rose-400/30 font-semibold'}>
                {ping.loading && !ping.data ? 'Memeriksa...' : gasOk ? 'Connected' : 'Tidak terjangkau'}
              </Pill>
            </div>
            <span className="font-label text-xs text-slate-400 mt-0.5">
              {gasOk ? `Last ping: ${ping.data.time} • Folder: ${monthFolder(date)}` : ping.error ? ping.error.message : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
          <div className="flex items-center gap-2 bg-black/40 border border-white/[0.06] px-3 py-1.5 rounded-xl backdrop-blur-sm">
            <Icon name="send" size={16} className="text-[#ff4d5a]" />
            <span className="font-label text-xs font-semibold text-slate-300">Telegram Bot</span>
            <Pill className="bg-white/[0.05] text-sky-300 text-[10px]">{cfg ? (cfg.telegram ? 'Terkonfigurasi' : 'Belum diatur') : dash}</Pill>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-slate-400 font-label text-xs px-2.5 py-1 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <Icon name="security" size={15} className="text-[#ff4d5a]" />
            <span>PN Kediri Security Node</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
