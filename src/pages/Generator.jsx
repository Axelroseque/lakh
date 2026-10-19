import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, Card, ErrorNote, Pill, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDateLong, todayJakarta } from '../lib/format.js';
import {
  TARGET_HOURS, WORK_HOURS, llkText, newKey, nextSlot, normTime, rowFromDraft, rowFromSaved,
  sortRows, summarizeRows, toApiItems, validateRows
} from '../lib/schedule.js';
import { useAsync } from '../lib/useAsync.js';

const TEMPLATE = 'Mulai apel pagi jam 07:30, dilanjutkan pemeliharaan server SIPP dan sinkronisasi data MA, siang ada sidang tindak pidana ringan / tilang, rehat dzuhur, sore deploy frontend Sekarbanyu dan tutup tiket trouble.';
const COLS = 'llk-cols';

function Metric({ label, icon, tone, children }) {
  return (
    <div className="relative backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] p-5 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] hover:border-white/[0.14] transition-all">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] mb-2">
        <span className="font-label text-[11px] uppercase tracking-wider text-slate-400 font-bold">{label}</span>
        <div className={'w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center ' + tone}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      {children}
    </div>
  );
}

function Compliance({ row, error, warning }) {
  if (error) return <Pill className="bg-rose-950/40 border border-rose-500/40 text-rose-300 font-bold"><Icon name="error" size={13} /> Perlu diperbaiki</Pill>;
  if (row.skip) return <Pill className="bg-white/[0.04] border border-white/[0.06] text-slate-400">Diabaikan</Pill>;
  if (row.status === 'Selesai') return <Pill className="bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 font-semibold"><Icon name="check_circle" size={13} /> Selesai</Pill>;
  if (row.status === 'Terunggah' || (row.evidenUrls && row.evidenUrls.length)) return <Pill className="bg-sky-500/15 border border-sky-400/30 text-sky-400 font-semibold"><Icon name="attach" size={13} /> Eviden terunggah</Pill>;
  if (row.evidenRequired) return <Pill className="bg-rose-500/15 border border-rose-500/30 text-[#ff4d5a] font-bold shadow-[0_0_10px_rgba(255,56,76,0.3)]"><span className="w-1.5 h-1.5 rounded-full bg-[#ff384c] animate-pulse" /> Perlu eviden foto</Pill>;
  return <Pill className="bg-sky-500/10 border border-sky-400/20 text-sky-300 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Terjadwal</Pill>;
}

function Field({ className = '', ...rest }) {
  return <input className={'w-full min-w-0 bg-black/50 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 text-sm placeholder:text-slate-500 transition-all shadow-inner ' + className} {...rest} />;
}

function IconToggle({ on, onClick, icon, title, tone = 'text-primary-container' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      aria-label={title}
      className={'p-1.5 rounded transition-colors ' + (on ? 'bg-surface-container-high ' + tone : 'text-outline hover:text-on-surface hover:bg-surface-container')}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

export default function Generator() {
  const [date, setDate] = useState(todayJakarta());
  const sched = useAsync(() => api.scheduleGet(date), [date]);
  const ai = useAsync(() => api.aiStatus(), []);

  const [prompt, setPrompt] = useState('');
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState('');
  const [aiWarnings, setAiWarnings] = useState([]);
  const [lastAi, setLastAi] = useState(null);
  const [focusKey, setFocusKey] = useState('');

  // Working copy follows what is saved for the chosen date.
  useEffect(() => {
    if (sched.data && sched.data.date === date) {
      setRows(sortRows(sched.data.items.map(rowFromSaved)));
      setDirty(false);
      setAiWarnings([]);
    }
  }, [sched.data, date]);

  useEffect(() => {
    if (!dirty) return undefined;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const check = useMemo(() => validateRows(rows), [rows]);
  const sum = useMemo(() => summarizeRows(rows), [rows]);
  const savedCount = sched.data ? sched.data.items.length : 0;

  const edit = (key, patch) => { setRows(l => l.map(r => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); setNotice(''); };
  const commitTime = (key, field, value) => {
    setRows(l => sortRows(l.map(r => (r.key === key ? { ...r, [field]: normTime(value) } : r))));
    setDirty(true);
  };
  const remove = key => { setRows(l => l.filter(r => r.key !== key)); setDirty(true); setNotice(''); };
  const addSlot = () => {
    const key = newKey();
    setRows(l => [...l, { key, ...nextSlot(l), task: '', result: '', evidenRequired: true, skip: false, status: 'Draf', evidenUrls: [] }]);
    setFocusKey(key);
    setDirty(true);
  };

  const changeDate = v => {
    if (!v || v === date) return;
    if (dirty && !window.confirm('Perubahan yang belum disimpan akan hilang. Lanjutkan?')) return;
    setNotice(''); setProblem(null); setDate(v);
  };

  const generate = async () => {
    if (prompt.trim().length < 5) { setProblem(new Error('Tulis rencana aktivitas dulu (minimal 5 karakter).')); return; }
    if (dirty && !window.confirm('Draf yang sedang diedit akan diganti hasil AI. Lanjutkan?')) return;
    setGenerating(true); setProblem(null); setNotice('');
    try {
      const r = await api.generate(prompt.trim(), date);
      setRows(sortRows(r.items.map(rowFromDraft)));
      setAiWarnings(r.warnings || []);
      setLastAi({ ms: r.aiMs, count: r.items.length });
      setDirty(true);
    } catch (e) { setProblem(e); } finally { setGenerating(false); }
  };

  const save = async () => {
    if (!check.ok) return;
    setSaving(true); setProblem(null); setNotice('');
    try {
      const r = await api.scheduleSave(date, toApiItems(rows));
      setNotice(`${r.saved} baris tersimpan ke Google Sheets untuk ${fmtDateLong(date)}.`);
      setDirty(false);
      sched.reload(); // working copy refreshes from the saved data
    } catch (e) { setProblem(e); } finally { setSaving(false); }
  };

  const copy = async () => {
    const text = llkText(rows);
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setNotice('Format teks LLK disalin ke clipboard.'); }
    catch { setProblem(new Error('Browser menolak akses clipboard.')); }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ date, items: toApiItems(rows) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `llk-${date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const aiOnline = ai.data ? ai.data.online : undefined;
  const pct = Math.min(100, Math.round((sum.hours / WORK_HOURS) * 100));

  return (
    <div className="flex flex-col w-full gap-gutter">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
        <div className="space-y-space-xs min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm">
            <Pill className="bg-primary-container/20 text-primary-container font-label-md tracking-wider uppercase font-semibold">FR-01 Subsystem</Pill>
            <span className="text-outline font-label text-label-sm tracking-widest uppercase">PN Kediri • Otomasi LLK</span>
          </div>
          <h1 className="text-headline-xl text-on-surface tracking-tight">AI Schedule Generator &amp; LLK Breakdown</h1>
          <p className="text-body-md text-on-surface-variant max-w-3xl">Pecah agenda kerja harian menjadi slot jadwal LLK Mahkamah Agung (07:30 – 16:00 WIB), periksa drafnya, lalu simpan ke Google Sheets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm p-space-xs rounded-xl bg-surface-container-low shadow-sm self-start">
          <div className="flex items-center gap-space-xs px-space-sm py-1.5 rounded-lg bg-surface-container">
            <span className="relative flex h-2 w-2">
              {aiOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />}
              <span className={'relative inline-flex rounded-full h-2 w-2 ' + (aiOnline === false ? 'bg-primary-container' : 'bg-secondary')} />
            </span>
            <div className="flex flex-col">
              <span className="font-label text-label-sm text-on-surface font-semibold">{ai.data && ai.data.configured ? ai.data.model + ' (Local VPS)' : 'VPS AI'}</span>
              <span className={'font-label text-[9px] leading-none ' + (aiOnline === false ? 'text-primary-container' : 'text-secondary')}>
                {ai.loading && !ai.data ? 'Memeriksa...' : aiOnline ? `Latency: ${(ai.data.ms / 1000).toFixed(1)}s` : ai.data && !ai.data.configured ? 'AI_URL belum diatur' : 'Tidak terjangkau'}
              </span>
            </div>
          </div>
          <button type="button" onClick={ai.reload} className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors" title="Periksa ulang VPS AI" aria-label="Periksa ulang VPS AI">
            <Icon name="cached" size={18} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter" aria-label="Ringkasan draf">
        <Metric label="Total Jam Efektif" icon="timer" tone="text-secondary">
          <div className="mt-2 flex items-baseline gap-2"><span className="text-headline-lg text-on-surface font-bold">{sum.hours}</span><span className="font-label text-label-sm text-on-surface-variant">/ {WORK_HOURS} jam kerja</span></div>
          <div className="mt-3 w-full bg-surface-container rounded-full h-1.5 overflow-hidden"><div className="bg-secondary h-1.5 rounded-full transition-all" style={{ width: pct + '%' }} /></div>
          <div className="mt-2 flex justify-between font-label text-[10px] text-on-surface-variant">
            <span>Target: {TARGET_HOURS.toFixed(1)} jam min</span>
            <span className={sum.hours >= TARGET_HOURS ? 'text-secondary font-semibold' : 'text-primary-container font-semibold'}>{sum.hours >= TARGET_HOURS ? 'Tercapai' : 'Belum'} ({sum.targetPct}%)</span>
          </div>
        </Metric>
        <Metric label="Slot Agenda" icon="timeline" tone="text-tertiary">
          <div className="mt-2 flex items-baseline gap-2"><span className="text-headline-lg text-on-surface font-bold">{sum.slots}</span><span className="font-label text-label-sm text-on-surface-variant">item terpetakan</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 font-label text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface">{sum.evidenSlots} wajib eviden</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface">{sum.noEviden} tanpa eviden</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface">{sum.ishoma} diabaikan</span>
          </div>
        </Metric>
        <Metric label="Eviden Compliance" icon="assignment" tone="text-primary-container">
          <div className="mt-2 flex items-baseline gap-2"><span className={'text-headline-lg font-bold ' + (sum.pendingEviden ? 'text-primary-container' : 'text-secondary')}>{sum.pendingEviden} Slot</span><span className="font-label text-label-sm text-on-surface-variant">perlu foto fisik</span></div>
          <div className="mt-3 flex items-center gap-2">
            <span className={'w-2 h-2 rounded-full ' + (sum.pendingEviden ? 'bg-primary-container animate-pulse' : 'bg-secondary')} />
            <span className="font-label text-[11px] text-on-surface-variant truncate">{sum.firstPending ? sum.firstPending.task : 'Semua eviden lengkap'}</span>
          </div>
        </Metric>
        <Metric label="Inference Speed" icon="bolt" tone="text-secondary">
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-headline-lg text-on-surface font-bold">{lastAi ? (lastAi.ms / 1000).toFixed(1) + 's' : '—'}</span>
            {lastAi && <span className={'font-label text-label-sm font-semibold ' + (lastAi.ms <= 10000 ? 'text-secondary' : 'text-error')}>{lastAi.ms <= 10000 ? 'Dalam SLA' : 'Lewat SLA'}</span>}
          </div>
          <div className="mt-3 flex items-center justify-between font-label text-[10px] text-outline"><span>Generasi terakhir</span><span>Batas 10s</span></div>
        </Metric>
      </div>

      {/* Prompt workspace */}
      <Card className="p-space-lg shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-space-sm gap-space-sm">
          <div className="flex items-center gap-space-sm min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-container/15 text-primary-container flex items-center justify-center shrink-0"><Icon name="bot" size={20} /></div>
            <div className="min-w-0">
              <h2 className="text-headline-md text-on-surface font-semibold">Natural Language Prompt Parser</h2>
              <p className="text-body-sm text-on-surface-variant">Tuliskan rencana aktivitas apa adanya, AI membaginya ke slot LLK.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-label text-label-md text-on-surface-variant">
              <Icon name="calendar" size={16} className="text-outline" />
              <span className="sr-only">Tanggal jadwal</span>
              <input
                type="date"
                value={date}
                onChange={e => changeDate(e.target.value)}
                aria-label="Tanggal jadwal"
                className="bg-surface-container rounded-lg px-2.5 py-1.5 text-on-surface [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            </label>
            <Btn variant="ghost" icon="article" onClick={() => setPrompt(TEMPLATE)} className="!px-space-sm !py-1.5 text-label-md">Contoh Prompt</Btn>
            <Btn variant="ghost" icon="restart" onClick={() => setPrompt('')} className="!px-space-sm !py-1.5 text-label-md" disabled={!prompt}>Reset</Btn>
          </div>
        </div>
        <div className="relative mt-space-sm">
          <textarea
            id="prompt-input"
            aria-label="Rencana aktivitas"
            rows={3}
            value={prompt}
            maxLength={4000}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); } }}
            placeholder="Contoh: Hari ini ada sidang tilang, monitoring SIPP, perbaikan kabel LAN ruang perdata, dan lanjut coding frontend Sekarbanyu"
            className="w-full p-space-md pb-9 rounded-xl bg-surface-container text-body-md text-on-surface placeholder:text-outline/70 focus:outline-none focus:ring-1 focus:ring-primary-container resize-y"
          />
          <span className="absolute right-3 bottom-3 px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label text-label-sm pointer-events-none hidden sm:block">Ctrl + Enter untuk generate</span>
        </div>
        <div className="mt-space-md flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center gap-2 text-on-surface-variant font-label text-label-sm">
            <span className="text-outline uppercase tracking-wider font-semibold">Parameter:</span>
            <span className="px-2 py-1 rounded bg-surface-container">Jendela 07:30 - 16:00</span>
            <span className="px-2 py-1 rounded bg-surface-container">Auto-Break Ishoma 12:00 - 13:00</span>
            <span className="px-2 py-1 rounded bg-surface-container">Temp 0.2</span>
          </div>
          <Btn variant="primary" onClick={generate} disabled={generating} icon={generating ? undefined : 'bolt'} className="!py-2.5 font-bold shadow-lg shadow-primary-container/20">
            {generating && <Spinner className="border-on-primary/40 border-t-on-primary" />}
            {generating ? 'Menyusun jadwal...' : 'Generate Jadwal Otomatis (Local VPS AI)'}
          </Btn>
        </div>
        <ErrorNote error={problem} className="mt-space-md" />
      </Card>

      {/* Matrix */}
      <Card className="overflow-hidden shadow-md">
        <div className="p-space-md bg-surface-container-high/40 flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm min-w-0">
            <div className="w-7 h-7 rounded bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0"><Icon name="table" size={18} /></div>
            <div className="min-w-0">
              <h3 className="text-headline-md text-on-surface font-semibold">Tabel Matriks LLK • {fmtDateLong(date)}</h3>
              <p className="font-label text-label-sm text-on-surface-variant">
                {dirty ? 'Draf belum disimpan. Periksa lalu sinkronkan ke spreadsheet.' : savedCount ? `${savedCount} baris tersimpan di Google Sheets.` : 'Belum ada jadwal tersimpan untuk tanggal ini.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Pill className="bg-primary-container/20 text-primary-container font-semibold">Belum disimpan</Pill>}
            <Btn variant="ghost" icon="add_outline" onClick={addSlot} className="text-secondary !py-1.5 text-label-md" disabled={rows.length >= 30}>Tambah Slot</Btn>
          </div>
        </div>

        <div className={'hidden md:grid ' + COLS + ' gap-3 px-space-md py-3 bg-surface-container-high/20 font-label text-label-md text-outline uppercase tracking-wider'}>
          <span>Jam (WIB)</span><span>Uraian Kegiatan LLK</span><span>Hasil</span><span>Status Kepatuhan</span><span className="text-right">Aksi</span>
        </div>

        <ErrorNote error={sched.error} onRetry={sched.reload} className="m-space-md" />
        {check.errors._ && <div role="alert" className="m-space-md text-body-sm text-error">{check.errors._}</div>}

        <div className="divide-y divide-surface-container-highest/30" role="list">
          {sched.loading && !sched.data && <div className="flex items-center gap-2 text-outline text-body-sm p-space-md"><Spinner /> Memuat jadwal...</div>}
          {!rows.length && !sched.loading && !sched.error && (
            <div className="p-space-lg text-center text-outline text-body-sm">Belum ada slot. Generate dengan AI di atas, atau tambah slot manual.</div>
          )}
          {rows.map((r, i) => {
            const err = check.errors[r.key], warn = check.warnings[r.key];
            return (
              <div key={r.key} role="listitem" className={'grid grid-cols-1 ' + COLS + ' gap-2 md:gap-3 items-start md:items-center px-space-md py-3 transition-colors ' + (r.skip ? 'bg-surface-container-lowest/70 text-outline' : 'hover:bg-surface-container/50')}>
                <div className="flex items-center gap-1 font-mono text-[13px] text-secondary">
                  <Field value={r.start} onChange={e => edit(r.key, { start: e.target.value })} onBlur={e => commitTime(r.key, 'start', e.target.value)} aria-label={`Jam mulai slot ${i + 1}`} inputMode="numeric" maxLength={5} className="!w-[62px] text-center" />
                  <span aria-hidden="true">–</span>
                  <Field value={r.end} onChange={e => edit(r.key, { end: e.target.value })} onBlur={e => commitTime(r.key, 'end', e.target.value)} aria-label={`Jam selesai slot ${i + 1}`} inputMode="numeric" maxLength={5} className="!w-[62px] text-center" />
                </div>
                <Field value={r.task} onChange={e => edit(r.key, { task: e.target.value })} aria-label={`Uraian slot ${i + 1}`} placeholder="Uraian kegiatan" autoFocus={r.key === focusKey} maxLength={300} className={'text-body-md ' + (r.skip ? 'italic' : 'font-semibold')} />
                <Field value={r.result} onChange={e => edit(r.key, { result: e.target.value })} aria-label={`Hasil slot ${i + 1}`} placeholder="Hasil / keterangan" maxLength={200} className="text-body-sm" />
                <div className="flex flex-col gap-1 items-start min-w-0">
                  <Compliance row={r} error={err} warning={warn} />
                  {err && <span role="alert" className="font-label text-label-sm text-error">{err}</span>}
                  {!err && warn && <span className="font-label text-label-sm text-primary-fixed">{warn}</span>}
                </div>
                <div className="flex items-center md:justify-end gap-1">
                  <IconToggle on={r.evidenRequired && !r.skip} icon="camera" title={`Wajib eviden foto, slot ${i + 1}`} onClick={() => edit(r.key, { evidenRequired: !r.evidenRequired })} />
                  <IconToggle on={r.skip} icon="block" tone="text-outline" title={`Abaikan dari LLK (Ishoma), slot ${i + 1}`} onClick={() => edit(r.key, { skip: !r.skip, ...(r.skip ? {} : { evidenRequired: false }) })} />
                  <button type="button" onClick={() => remove(r.key)} className="p-1.5 rounded text-outline hover:text-primary-container hover:bg-surface-container transition-colors" title={`Hapus slot ${i + 1}`} aria-label={`Hapus slot ${i + 1}`}>
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {(aiWarnings.length > 0) && (
        <div className="rounded-lg bg-surface-container-highest/60 px-4 py-3 text-body-sm text-on-surface-variant space-y-1">
          <div className="flex items-center gap-1.5 font-semibold"><Icon name="info" size={16} className="text-primary" /> Catatan dari penyusun jadwal</div>
          {aiWarnings.map((w, i) => <div key={i} className="text-outline">• {w}</div>)}
        </div>
      )}

      {/* Toolbar */}
      <Card className="p-space-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <Btn variant="ghost" icon="copy" onClick={copy} disabled={!rows.length} className="font-semibold">Salin Format Teks LLK MA</Btn>
          <Btn variant="ghost" icon="json" onClick={exportJson} disabled={!check.ok} className="font-semibold">Export JSON Draf</Btn>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm md:justify-end">
          {notice && <span role="status" className="font-label text-label-sm text-secondary flex items-center gap-1.5"><Icon name="cloud_sync" size={16} /> {notice}</span>}
          {dirty && savedCount > 0 && !notice && <span className="font-label text-label-sm text-primary-fixed">Menyimpan menggantikan {savedCount} baris yang ada (eviden pada jam yang sama tetap).</span>}
          <Btn variant="blue" onClick={save} disabled={!dirty || !check.ok || saving} icon={saving ? undefined : 'cloud_sync'} className="font-bold !py-2.5" title={!dirty ? 'Tidak ada perubahan' : !check.ok ? 'Perbaiki baris yang bermasalah dulu' : ''}>
            {saving && <Spinner />}
            {saving ? 'Menyimpan...' : 'Finalisasi & Sync ke Google Sheets'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
