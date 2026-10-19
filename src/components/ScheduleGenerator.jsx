import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Btn, Card, ErrorNote, Pill, SectionTitle, Spinner, StatusBadge } from './ui.jsx';
import { Link } from '../lib/router.js';
import { api } from '../lib/api.js';
import { isPending, nowMinutesJakarta, safeUrl, toMin } from '../lib/format.js';

/** Status to display: a required-but-missing eviden on a slot that already ended is urgent. */
export function effectiveStatus(it, nowMin) {
  if (isPending(it) && (it.status === 'Terjadwal' || it.status === 'Menunggu Eviden') && toMin(it.end) <= nowMin) {
    return 'Menunggu Eviden';
  }
  return it.status;
}

function SavedRow({ it, nowMin, onDone, busy }) {
  const status = effectiveStatus(it, nowMin);
  const ignored = it.status === 'Diabaikan';
  const urls = (it.evidenUrls || []).map(safeUrl).filter(Boolean);
  return (
    <div
      className={
        'rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border transition-all ' +
        (ignored
          ? 'bg-black/20 border-white/[0.03] opacity-60'
          : 'bg-black/35 border-white/[0.06] hover:bg-black/50 hover:border-white/[0.12] shadow-sm')
      }
    >
      <div className="flex items-start md:items-center gap-3 min-w-0">
        <span
          className={
            'px-2.5 py-1 rounded-lg bg-black/60 border border-white/[0.08] font-mono text-xs shrink-0 font-semibold ' +
            (status === 'Menunggu Eviden'
              ? 'text-[#ff4d5a] border-rose-500/30'
              : 'text-sky-400')
          }
        >
          {it.start} - {it.end}
        </span>
        <div className="min-w-0">
          <div className={'text-sm font-semibold ' + (ignored ? 'text-slate-400 line-through' : 'text-white')}>
            {it.task}
          </div>
          {it.result && <div className="font-label text-xs text-slate-400 mt-0.5">{it.result}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 self-end md:self-auto shrink-0">
        {ignored ? (
          <Pill className="bg-white/[0.04] text-slate-400 border-white/[0.06]">Diabaikan</Pill>
        ) : (
          <>
            <StatusBadge status={status} />
            {urls.length > 0 && (
              <a
                href={urls[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-300 font-label text-xs hover:text-white hover:bg-white/[0.1] transition-all"
              >
                <Icon name="attach" size={14} className="text-sky-400" />
                <span>Terunggah ✓{urls.length > 1 ? ` (${urls.length})` : ''}</span>
              </a>
            )}
            {isPending(it) && (
              <Link
                to={'/eviden?slot=' + encodeURIComponent(it.id)}
                className="px-3 py-1 rounded-lg bg-[#ff384c]/15 border border-[#ff384c]/30 hover:bg-[#ff384c]/25 text-[#ff5c6a] hover:text-white font-label text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(255,56,76,0.15)]"
              >
                <Icon name="camera" size={14} /> Unggah Cepat
              </Link>
            )}
            {it.status === 'Terunggah' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDone(it)}
                className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 hover:bg-emerald-500/25 text-emerald-300 font-label text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Icon name="check_circle" size={14} /> Tandai Selesai
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DraftRow({ it, onChange, onRemove }) {
  return (
    <div
      className={
        'rounded-xl p-3 flex items-center gap-3 border ' +
        (it.skip
          ? 'bg-black/20 border-white/[0.03] opacity-60'
          : 'bg-black/35 border-white/[0.06]')
      }
    >
      <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/[0.08] font-mono text-xs font-semibold text-sky-400 shrink-0">
        {it.start} - {it.end}
      </span>
      <input
        value={it.task}
        onChange={e => onChange({ ...it, task: e.target.value })}
        aria-label={`Uraian ${it.start}-${it.end}`}
        maxLength={300}
        className="flex-1 min-w-0 bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 transition-all shadow-inner"
      />
      {it.skip ? (
        <Pill className="bg-white/[0.04] text-slate-400 border-white/[0.06] shrink-0">Diabaikan</Pill>
      ) : (
        <label className="hidden sm:flex items-center gap-1.5 font-label text-xs text-slate-400 shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!it.evidenRequired}
            onChange={e => onChange({ ...it, evidenRequired: e.target.checked })}
            className="accent-[#ff384c] rounded cursor-pointer"
          />
          Eviden
        </label>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-slate-400 hover:text-[#ff4d5a] hover:bg-rose-500/10 rounded-lg transition-colors"
        aria-label="Hapus slot"
        title="Hapus slot"
      >
        <Icon name="delete" size={16} />
      </button>
    </div>
  );
}

export default function ScheduleGenerator({ date, saved, loading, error, reload, aiReady }) {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState('');

  const nowMin = nowMinutesJakarta();
  const items = saved ? saved.items : [];
  const slots = draft ? draft.items.filter(i => !i.skip).length : saved ? saved.summary.slots : 0;

  const generate = async () => {
    if (prompt.trim().length < 5) {
      setProblem(new Error('Tulis aktivitas hari ini (minimal 5 karakter).'));
      return;
    }
    setGenerating(true);
    setProblem(null);
    setNotice('');
    try {
      const r = await api.generate(prompt.trim(), date);
      setDraft({ items: r.items.map((it, i) => ({ ...it, key: i })), warnings: r.warnings || [], aiMs: r.aiMs });
    } catch (e) {
      setProblem(e);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const list = draft.items.filter(i => i.task.trim());
    if (!list.length) {
      setProblem(new Error('Tidak ada slot untuk disimpan.'));
      return;
    }
    setSaving(true);
    setProblem(null);
    setNotice('');
    try {
      const r = await api.scheduleSave(date, list.map(i => ({
        start: i.start, end: i.end, task: i.task.trim(), result: i.result || '', evidenRequired: !!i.evidenRequired, skip: !!i.skip
      })));
      setDraft(null);
      setNotice(`${r.saved} baris tersimpan ke Google Sheets.`);
      reload();
    } catch (e) {
      setProblem(e);
    } finally {
      setSaving(false);
    }
  };

  const markDone = async it => {
    setBusyId(it.id);
    setProblem(null);
    try {
      await api.scheduleUpdate(it.id, { status: 'Selesai' });
      reload();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusyId('');
    }
  };

  const copy = async () => {
    const src = draft ? draft.items : items.filter(i => i.status !== 'Diabaikan');
    const text = src.filter(i => !i.skip).map(i => `${i.start} - ${i.end} | ${i.task}${i.result ? ' | ' + i.result : ''}`).join('\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Format LLK disalin ke clipboard.');
    } catch {
      setProblem(new Error('Browser menolak akses clipboard.'));
    }
  };

  const updateDraft = (key, next) => setDraft(d => ({ ...d, items: d.items.map(i => (i.key === key ? next : i)) }));
  const removeDraft = key => setDraft(d => ({ ...d, items: d.items.filter(i => i.key !== key) }));

  const hasRows = draft ? draft.items.length > 0 : items.length > 0;
  const savedHasData = items.length > 0;

  return (
    <Card className="p-space-lg space-y-space-md xl:col-span-7">
      <SectionTitle
        icon="magic"
        title="Quick AI Schedule Generator"
        subtitle="Otomatisasi distribusi jadwal harian LLK (07:30 - 16:00)"
        right={
          <div className={'hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full font-label text-xs border border-white/[0.08] ' + (aiReady === false ? 'bg-white/[0.03] text-slate-400' : 'bg-sky-500/10 text-sky-300 border-sky-400/25')}>
            <span className={'w-2 h-2 rounded-full ' + (aiReady === false ? 'bg-slate-500' : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse')} />
            {aiReady === false ? 'VPS AI offline' : 'VPS AI Ready'}
          </div>
        }
      />

      <div className="bg-black/35 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-space-md space-y-space-sm shadow-inner">
        <label htmlFor="promptInput" className="block font-label text-xs uppercase font-bold tracking-wider text-slate-400">
          Aktivitas hari ini (bahasa natural):
        </label>
        <textarea
          id="promptInput"
          rows={2}
          value={prompt}
          maxLength={4000}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Contoh: Hari ini ada sidang tilang, monitoring server SIPP, deploy Sekarbanyu dan backup database"
          className="w-full bg-black/50 text-white text-sm rounded-xl p-3 border border-white/[0.08] resize-none focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 placeholder:text-slate-500 transition-all shadow-inner"
        />
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-1">
          <div className="flex items-center gap-2 font-label text-xs">
            <span className="text-slate-500 font-medium">Aturan:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-slate-300 font-semibold">SKP Mahkamah Agung</span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-slate-400 font-mono">07:30 - 16:00</span>
          </div>
          <Btn variant="primary" onClick={generate} disabled={generating} icon={generating ? undefined : 'bolt'}>
            {generating && <Spinner className="border-white/30 border-t-white" />}
            {generating ? 'Menyusun jadwal...' : 'Generate Jadwal Otomatis (VPS AI)'}
          </Btn>
        </div>
      </div>

      <ErrorNote error={problem} />
      <ErrorNote error={error} onRetry={reload} />
      {notice && (
        <div role="status" className="rounded-xl bg-sky-950/30 border border-sky-400/30 text-sky-200 text-xs px-3.5 py-2.5 flex items-center gap-2">
          <Icon name="check_circle" size={16} className="text-sky-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="space-y-space-xs">
        <div className="flex items-center justify-between px-1">
          <span className="font-label text-xs font-bold uppercase tracking-wider text-slate-400">
            {draft ? 'Draf AI (belum disimpan)' : 'Breakdown jadwal & status eviden'}
          </span>
          <span className="font-mono text-xs text-slate-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-full">
            {slots} slot waktu
          </span>
        </div>

        {draft && (
          <div className="rounded-xl bg-black/40 border border-white/[0.07] px-3.5 py-3 text-xs text-slate-300 space-y-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Icon name="edit_note" size={16} className="text-[#ff4d5a]" />
              <span>Periksa dan ubah uraian bila perlu, lalu sinkronkan ke Google Sheets.</span>
              {draft.aiMs ? <span className="font-mono text-slate-400 text-[11px]">({(draft.aiMs / 1000).toFixed(1)}s)</span> : null}
            </div>
            {savedHasData && (
              <div className="text-rose-400 text-[11px] font-medium">
                Menyimpan akan menggantikan {items.length} baris jadwal hari ini. Eviden pada slot dengan jam yang sama tetap dipertahankan.
              </div>
            )}
            {draft.warnings.map((w, i) => (
              <div key={i} className="text-slate-400 text-[11px]">• {w}</div>
            ))}
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {loading && !saved && !draft && (
            <div className="flex items-center gap-2 text-slate-400 text-xs p-4 bg-black/20 rounded-xl border border-white/[0.04]">
              <Spinner /> Memuat jadwal dari Google Sheets...
            </div>
          )}
          {!hasRows && !loading && !error && (
            <div className="rounded-xl bg-black/30 border border-white/[0.05] text-slate-400 text-xs p-6 text-center">
              Belum ada jadwal untuk hari ini. Tulis aktivitas di atas lalu generate.
            </div>
          )}
          {draft
            ? draft.items.map(it => <DraftRow key={it.key} it={it} onChange={n => updateDraft(it.key, n)} onRemove={() => removeDraft(it.key)} />)
            : items.map(it => <SavedRow key={it.id} it={it} nowMin={nowMin} onDone={markDone} busy={busyId === it.id} />)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm pt-2 border-t border-white/[0.06]">
        <Btn onClick={copy} icon="copy" disabled={!hasRows} variant="neutral">
          Salin ke Format LLK MA
        </Btn>
        <div className="flex items-center gap-2.5">
          {draft && <Btn variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Buang Draf</Btn>}
          <Btn variant="blue" onClick={save} disabled={!draft || saving} icon={saving ? undefined : 'cloud_sync'} title={draft ? '' : 'Generate jadwal dulu'}>
            {saving && <Spinner />}
            {saving ? 'Menyimpan...' : 'Sync ke Google Sheets (GAS)'}
          </Btn>
        </div>
      </div>
    </Card>
  );
}
