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
    <div className={'rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ' + (ignored ? 'bg-surface-container/60 opacity-75' : 'bg-surface-container hover:bg-surface-container-high')}>
      <div className="flex items-start md:items-center gap-3 min-w-0">
        <span className={'px-2 py-1 rounded bg-surface-container-lowest font-label text-label-sm font-mono shrink-0 ' + (status === 'Menunggu Eviden' ? 'text-secondary' : 'text-outline')}>
          {it.start} - {it.end}
        </span>
        <div className="min-w-0">
          <div className={'text-body-md font-semibold ' + (ignored ? 'text-on-surface-variant' : 'text-on-surface')}>{it.task}</div>
          {it.result && <div className="font-label text-label-sm text-outline">{it.result}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 self-end md:self-auto shrink-0">
        {ignored ? (
          <Pill className="bg-surface-container-high text-outline">Diabaikan dari LLK</Pill>
        ) : (
          <>
            <StatusBadge status={status} />
            {urls.length > 0 && (
              <a href={urls[0]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label text-label-sm hover:text-on-surface">
                <Icon name="attach" size={14} /> Terunggah ✓{urls.length > 1 ? ` (${urls.length})` : ''}
              </a>
            )}
            {isPending(it) && (
              <Link to={'/eviden?slot=' + encodeURIComponent(it.id)} className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label text-label-sm flex items-center gap-1 transition-colors">
                <Icon name="camera" size={14} /> Unggah Cepat
              </Link>
            )}
            {it.status === 'Terunggah' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDone(it)}
                className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label text-label-sm flex items-center gap-1 transition-colors disabled:opacity-50"
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
    <div className={'rounded-lg p-3 flex items-center gap-3 ' + (it.skip ? 'bg-surface-container/60 opacity-80' : 'bg-surface-container')}>
      <span className="px-2 py-1 rounded bg-surface-container-lowest font-label text-label-sm font-mono text-secondary shrink-0">{it.start} - {it.end}</span>
      <input
        value={it.task}
        onChange={e => onChange({ ...it, task: e.target.value })}
        aria-label={`Uraian ${it.start}-${it.end}`}
        maxLength={300}
        className="flex-1 min-w-0 bg-surface-container-lowest rounded px-2 py-1.5 text-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
      />
      {it.skip ? (
        <Pill className="bg-surface-container-high text-outline shrink-0">Diabaikan</Pill>
      ) : (
        <label className="hidden sm:flex items-center gap-1.5 font-label text-label-sm text-outline shrink-0 cursor-pointer">
          <input type="checkbox" checked={!!it.evidenRequired} onChange={e => onChange({ ...it, evidenRequired: e.target.checked })} className="accent-primary-container" />
          Eviden
        </label>
      )}
      <button type="button" onClick={onRemove} className="p-1.5 text-outline hover:text-primary-container rounded" aria-label="Hapus slot" title="Hapus slot">
        <Icon name="delete" size={18} />
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
    if (prompt.trim().length < 5) { setProblem(new Error('Tulis aktivitas hari ini (minimal 5 karakter).')); return; }
    setGenerating(true); setProblem(null); setNotice('');
    try {
      const r = await api.generate(prompt.trim(), date);
      setDraft({ items: r.items.map((it, i) => ({ ...it, key: i })), warnings: r.warnings || [], aiMs: r.aiMs });
    } catch (e) { setProblem(e); } finally { setGenerating(false); }
  };

  const save = async () => {
    if (!draft) return;
    const list = draft.items.filter(i => i.task.trim());
    if (!list.length) { setProblem(new Error('Tidak ada slot untuk disimpan.')); return; }
    setSaving(true); setProblem(null); setNotice('');
    try {
      const r = await api.scheduleSave(date, list.map(i => ({
        start: i.start, end: i.end, task: i.task.trim(), result: i.result || '', evidenRequired: !!i.evidenRequired, skip: !!i.skip
      })));
      setDraft(null);
      setNotice(`${r.saved} baris tersimpan ke Google Sheets.`);
      reload();
    } catch (e) { setProblem(e); } finally { setSaving(false); }
  };

  const markDone = async it => {
    setBusyId(it.id); setProblem(null);
    try { await api.scheduleUpdate(it.id, { status: 'Selesai' }); reload(); }
    catch (e) { setProblem(e); } finally { setBusyId(''); }
  };

  const copy = async () => {
    const src = draft ? draft.items : items.filter(i => i.status !== 'Diabaikan');
    const text = src.filter(i => !i.skip).map(i => `${i.start} - ${i.end} | ${i.task}${i.result ? ' | ' + i.result : ''}`).join('\n');
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setNotice('Format LLK disalin ke clipboard.'); }
    catch { setProblem(new Error('Browser menolak akses clipboard.')); }
  };

  const updateDraft = (key, next) => setDraft(d => ({ ...d, items: d.items.map(i => (i.key === key ? next : i)) }));
  const removeDraft = key => setDraft(d => ({ ...d, items: d.items.filter(i => i.key !== key) }));

  const hasRows = draft ? draft.items.length > 0 : items.length > 0;
  const savedHasData = items.length > 0;
  const aiPill = useMemo(() => (aiReady === false ? 'bg-surface-container text-outline' : 'bg-surface-container text-on-surface-variant'), [aiReady]);

  return (
    <Card className="p-space-lg space-y-space-md xl:col-span-7">
      <SectionTitle
        icon="magic"
        title="Quick AI Schedule Generator"
        subtitle="Otomatisasi distribusi jadwal harian LLK (07:30 - 16:00)"
        right={
          <div className={'hidden sm:flex items-center gap-1 px-2.5 py-1 rounded font-label text-label-sm ' + aiPill}>
            <span className={'w-2 h-2 rounded-full ' + (aiReady === false ? 'bg-outline' : 'bg-secondary animate-pulse')} />
            {aiReady === false ? 'VPS AI tidak terjangkau' : 'VPS AI siap'}
          </div>
        }
      />

      <div className="bg-surface-container rounded-lg p-space-md space-y-space-sm">
        <label htmlFor="promptInput" className="block font-label text-label-sm uppercase font-semibold text-outline">Aktivitas hari ini (bahasa natural):</label>
        <textarea
          id="promptInput"
          rows={2}
          value={prompt}
          maxLength={4000}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Contoh: Hari ini ada sidang tilang, monitoring SIPP, dan lanjut coding frontend Sekarbanyu"
          className="w-full bg-surface-container-lowest text-on-surface text-body-md rounded-lg p-space-sm resize-none focus:outline-none focus:ring-1 focus:ring-secondary placeholder:text-outline/60"
        />
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          <div className="flex items-center gap-2 font-label text-label-sm">
            <span className="text-outline">Mode:</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface">SKP Mahkamah Agung</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">07:30 - 16:00</span>
          </div>
          <Btn variant="primary" onClick={generate} disabled={generating} icon={generating ? undefined : 'bolt'}>
            {generating && <Spinner className="border-on-primary/40 border-t-on-primary" />}
            {generating ? 'Menyusun jadwal...' : 'Generate Jadwal Otomatis (VPS AI)'}
          </Btn>
        </div>
      </div>

      <ErrorNote error={problem} />
      <ErrorNote error={error} onRetry={reload} />
      {notice && <div role="status" className="rounded-lg bg-surface-container text-secondary text-body-sm px-3 py-2">{notice}</div>}

      <div className="space-y-space-xs">
        <div className="flex items-center justify-between px-space-xs">
          <span className="font-label text-label-md font-bold uppercase tracking-wider text-outline">
            {draft ? 'Draf AI (belum disimpan)' : 'Breakdown jadwal & status eviden'}
          </span>
          <span className="font-label text-label-sm text-outline">{slots} slot waktu</span>
        </div>

        {draft && (
          <div className="rounded-lg bg-surface-container-highest/60 px-3 py-2 text-body-sm text-on-surface-variant space-y-1">
            <div className="flex items-center gap-1.5"><Icon name="edit_note" size={16} className="text-primary" /> Periksa dan ubah uraian bila perlu, lalu sinkronkan ke Google Sheets.{draft.aiMs ? ` (AI ${(draft.aiMs / 1000).toFixed(1)}s)` : ''}</div>
            {savedHasData && <div className="text-primary-container">Menyimpan akan menggantikan {items.length} baris jadwal hari ini. Eviden pada slot dengan jam yang sama tetap dipertahankan.</div>}
            {draft.warnings.map((w, i) => <div key={i} className="text-outline">• {w}</div>)}
          </div>
        )}

        <div className="space-y-2">
          {loading && !saved && !draft && <div className="flex items-center gap-2 text-outline text-body-sm p-3"><Spinner /> Memuat jadwal...</div>}
          {!hasRows && !loading && !error && (
            <div className="rounded-lg bg-surface-container text-outline text-body-sm p-4 text-center">Belum ada jadwal untuk hari ini. Tulis aktivitas di atas lalu generate.</div>
          )}
          {draft
            ? draft.items.map(it => <DraftRow key={it.key} it={it} onChange={n => updateDraft(it.key, n)} onRemove={() => removeDraft(it.key)} />)
            : items.map(it => <SavedRow key={it.id} it={it} nowMin={nowMin} onDone={markDone} busy={busyId === it.id} />)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
        <Btn onClick={copy} icon="copy" disabled={!hasRows}>Salin ke Format LLK MA</Btn>
        <div className="flex items-center gap-2">
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
