import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, ErrorNote, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { download, toCsv } from '../lib/csv.js';
import { relTime, safeUrl, todayJakarta } from '../lib/format.js';
import { EMPTY_KB, KB_DRAFT_KEY, SEVERITY_BADGE, SEVERITY_OPTIONS, SISTEM_OPTIONS, hasTag, kbCsvColumns, kbPayload, kbStats, sortKb, tagCounts, validateKb } from '../lib/kb.js';
import { useAsync } from '../lib/useAsync.js';


const TAG_TONES = ['text-primary', 'text-secondary', 'text-tertiary'];
const inputCls = 'w-full rounded-lg bg-surface-container-lowest border border-outline-variant/40 px-3 py-2 text-body-md text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container';

const readDraft = () => { try { const d = JSON.parse(localStorage.getItem(KB_DRAFT_KEY) || 'null'); return d && typeof d === 'object' ? { ...EMPTY_KB, ...d } : null; } catch { return null; } };
const writeDraft = f => { try { localStorage.setItem(KB_DRAFT_KEY, JSON.stringify(f)); return true; } catch { return false; } };
const clearDraft = () => { try { localStorage.removeItem(KB_DRAFT_KEY); } catch { /* storage blocked */ } };

function Metric({ label, value, sub, icon, tone }) {
  return (
    <div className="rounded-2xl backdrop-blur-xl bg-[#0c1017]/80 border border-white/[0.08] p-5 flex items-start justify-between gap-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)] hover:border-white/[0.14] transition-all min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="font-label text-[11px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
        <span className="text-2xl font-extrabold text-white mt-1 truncate tracking-tight">{value}</span>
        <span className="font-label text-xs text-slate-400 mt-1 truncate">{sub}</span>
      </div>
      <div className={'w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center shrink-0 ' + tone}><Icon name={icon} size={20} /></div>
    </div>
  );
}

function Case({ k }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = safeUrl(k.evidenUrl);
  const [badge, badgeCls] = SEVERITY_BADGE[k.severity] || ['KASUS', 'bg-white/[0.05] text-slate-400 border border-white/[0.08]'];
  const lines = (k.stackTrace || '').split('\n');
  const long = lines.length > 4 || (k.stackTrace || '').length > 320;
  const copy = async () => {
    try { await navigator.clipboard.writeText(k.solusi); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <article className="rounded-2xl backdrop-blur-xl bg-[#0c1017]/80 border border-white/[0.08] p-5 space-y-3.5 hover:border-white/[0.14] transition-all shadow-[0_12px_32px_rgba(0,0,0,0.4)]" data-testid="kb-card">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.05]">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className={'px-2.5 py-0.5 rounded-full font-label text-xs font-bold tracking-wide border ' + badgeCls}>{badge}</span>
          {(k.tags || []).map((t, i) => <span key={t} className={'px-2 py-0.5 rounded-full bg-black/60 border border-white/[0.06] font-mono text-xs ' + TAG_TONES[i % 3]}>#{t}</span>)}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-xs text-slate-400 whitespace-nowrap"><Icon name="schedule" size={14} /> {relTime(k.timestamp)}</span>
      </div>
      <h2 className="text-lg font-bold text-white leading-snug break-words">{k.judul}</h2>
      {k.stackTrace && (
        <div className="rounded-xl bg-black/60 border border-white/[0.06] overflow-hidden shadow-inner">
          <div className="flex items-center justify-between px-3.5 py-2 bg-black/40 border-b border-white/[0.04] font-label text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300"><Icon name="bug" size={14} className="text-[#ff4d5a]" /> Error Log Snippet</span>
            <span className="font-mono text-xs">{k.id}</span>
          </div>
          <pre className={'px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-sky-300 whitespace-pre-wrap break-words ' + (open ? 'max-h-80 overflow-auto' : 'max-h-[5.5rem] overflow-hidden')}>{k.stackTrace}</pre>
          {long && <button type="button" onClick={() => setOpen(v => !v)} className="w-full px-3.5 py-1.5 text-left font-label text-xs font-semibold text-[#ff5c6a] hover:underline bg-black/30 border-t border-white/[0.04]">{open ? 'Ringkas log' : 'Tampilkan seluruh log'}</button>}
        </div>
      )}
      <div className="rounded-xl bg-black/40 border border-white/[0.05] p-3.5">
        <div className="flex items-center gap-1.5 font-label text-xs font-bold text-sky-400"><Icon name="check_circle" size={16} /> Solusi Konkret:</div>
        <p className="mt-1.5 text-sm text-slate-200 whitespace-pre-line break-words leading-relaxed">{k.solusi}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-label text-xs text-slate-400 border-t border-white/[0.04]">
        <span>{k.verifiedBy ? <>Diverifikasi oleh <strong className="text-on-surface">{k.verifiedBy}</strong></> : <span>{k.sistem} • {k.id}</span>}</span>
        <div className="flex items-center gap-3">
          {link && <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-secondary hover:underline"><Icon name="link" size={14} /> Eviden Drive</a>}
          <button type="button" onClick={copy} className="flex items-center gap-1 hover:text-on-surface"><Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Tersalin' : 'Salin Solusi'}</button>
        </div>
      </div>
    </article>
  );
}

function Field({ label, required, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2 font-label text-label-md text-on-surface-variant">
        <span>{label}{required && <span className="text-primary-container"> *</span>}</span>
        {hint && <span className="text-outline font-normal">{hint}</span>}
      </span>
      {children}
      {error && <span role="alert" className="font-label text-label-sm text-error">{error}</span>}
    </label>
  );
}

export default function ProblemSolve() {
  const today = todayJakarta();
  const all = useAsync(() => api.kbList({ limit: 200 }), []);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [tag, setTag] = useState('all');
  const [dir, setDir] = useState('desc');
  const [form, setForm] = useState(EMPTY_KB);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [draftInfo, setDraftInfo] = useState('');
  const searchRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const found = useAsync(() => (dq ? api.kbSearch(dq) : Promise.resolve(null)), [dq]);

  useEffect(() => {
    const d = readDraft();
    if (d) { setForm(d); setDraftInfo('Draf lokal dipulihkan.'); }
  }, []);
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current && searchRef.current.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const items = all.data ? all.data.items : [];
  const source = dq ? (found.data ? found.data.items : []) : items;
  const shown = useMemo(() => (dq ? source.filter(i => hasTag(i, tag)) : sortKb(source.filter(i => hasTag(i, tag)), dir)), [source, tag, dir, dq]);
  const tags = useMemo(() => tagCounts(items), [items]);
  const st = useMemo(() => kbStats(items, today), [items, today]);
  const errors = useMemo(() => validateKb(form), [form]);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setFeedback(null); };
  const busyList = all.loading && !all.data;

  const submit = async e => {
    e.preventDefault();
    setTouched(true); setProblem(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const r = await api.kbSave(kbPayload(form));
      clearDraft(); setForm(EMPTY_KB); setTouched(false); setDraftInfo('');
      setFeedback({ ok: true, text: `Tersimpan ke Knowledge Base. ID: ${r.id}` });
      all.reload();
    } catch (err) { setProblem(err); } finally { setSaving(false); }
  };
  const saveDraft = () => {
    const ok = writeDraft(form);
    setFeedback({ ok, text: ok ? 'Draf disimpan di browser ini.' : 'Browser memblokir penyimpanan lokal.' });
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) set('stackTrace', t.slice(0, 20000)); }
    catch { setFeedback({ ok: false, text: 'Clipboard tidak bisa dibaca. Tempel manual dengan Ctrl+V.' }); }
  };
  const exportCsv = () => download(`problem-solve-${today}.csv`, toCsv(shown, kbCsvColumns()));
  const focusForm = () => { titleRef.current && titleRef.current.focus(); titleRef.current && titleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const err = k => (touched ? errors[k] : '');

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label text-label-sm uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-surface-container-high font-semibold">KB // FR-06</span>
            <span className="font-label text-label-sm text-outline tracking-widest uppercase">Telemetri PN Kediri</span>
          </div>
          <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">Problem Solve Tracker &amp; Knowledge Base</h1>
          <p className="text-body-md text-on-surface-variant max-w-3xl">Dokumentasi teknis operasional server, troubleshooting SIPP, jaringan PN Kediri, dan coding Sekarbanyu.</p>
        </div>
        <Btn variant="primary" icon="add" onClick={focusForm} className="self-start lg:self-auto h-11 !px-5 font-semibold">Catat Problem Solve Baru</Btn>
      </div>

      <div className="flex flex-col gap-space-sm">
        <div className="relative">
          <Icon name="search" size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} aria-label="Cari kasus problem solve" placeholder="Cari error log, solusi, nama modul, IP..." className={inputCls + ' !pl-10 !pr-24 h-12'} />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {found.loading && dq && <Spinner />}
            <span className="hidden sm:block px-1.5 py-0.5 rounded bg-surface-container-high font-label text-label-sm text-outline">CTRL+K</span>
            {q && <button type="button" onClick={() => setQ('')} aria-label="Hapus pencarian" className="p-1 rounded text-outline hover:text-on-surface"><Icon name="close" size={18} /></button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tag">
          {[{ tag: 'all', count: items.length }, ...tags].map(t => (
            <button key={t.tag} type="button" onClick={() => setTag(t.tag)} aria-pressed={tag.toLowerCase() === t.tag.toLowerCase()}
              className={'px-3 py-1.5 rounded-full font-label text-label-md transition-colors ' + (tag.toLowerCase() === t.tag.toLowerCase() ? 'bg-primary-container text-on-primary font-bold' : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high')}>
              {t.tag === 'all' ? 'All' : '#' + t.tag} ({t.count})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter">
        <Metric label="Total Kasus" value={st.total} sub={st.thisMonth + ' kasus bulan ini'} icon="book" tone="text-secondary" />
        <Metric label="Severity High" value={st.high} sub={st.total ? Math.round((st.high / st.total) * 100) + '% dari seluruh kasus' : 'Belum ada data'} icon="warning" tone="text-primary-container" />
        <Metric label="Dengan Eviden" value={st.withEviden} sub={st.total ? Math.round((st.withEviden / st.total) * 100) + '% terlampir URL' : 'Belum ada data'} icon="link" tone="text-tertiary" />
        <Metric label="Sistem Terbanyak" value={st.topSistem ? st.topSistem.name : '—'} sub={st.topSistem ? st.topSistem.count + ' kasus tercatat' : 'Belum ada data'} icon="dns" tone="text-primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
        <div className="xl:col-span-7 flex flex-col gap-space-md min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-headline-md font-bold text-on-surface">Log Arsip Masalah &amp; Resolusi</h2>
              <span className="px-2 py-0.5 rounded bg-surface-container-high font-label text-label-sm text-secondary font-semibold whitespace-nowrap" data-testid="kb-count">{shown.length} {dq ? 'Kasus Ditemukan' : 'Kasus'}</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setDir(d => (d === 'desc' ? 'asc' : 'desc'))} disabled={!!dq} className="flex items-center gap-1 px-2 py-1.5 rounded bg-surface-container font-label text-label-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40" title="Urutkan waktu">
                <Icon name="timeline" size={16} /> {dq ? 'Relevansi' : dir === 'desc' ? 'Terbaru' : 'Terlama'}
              </button>
              <button type="button" onClick={exportCsv} disabled={!shown.length} className="flex items-center gap-1 px-2 py-1.5 rounded bg-surface-container font-label text-label-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40" title="Export CSV"><Icon name="upload" size={16} className="rotate-180" /> CSV</button>
            </div>
          </div>
          <ErrorNote error={all.error || found.error} onRetry={() => { all.reload(); found.reload(); }} />
          {busyList && <div className="flex items-center gap-2 text-outline p-space-md"><Spinner /> Memuat knowledge base...</div>}
          <div className="flex flex-col gap-space-md" data-testid="kb-list">
            {shown.map(k => <Case key={k.id} k={k} />)}
          </div>
          {!busyList && !all.error && !shown.length && (
            <div className="rounded-xl bg-surface-container p-space-lg text-center text-body-md text-outline">
              {dq ? `Tidak ada kasus yang cocok dengan "${dq}".` : tag !== 'all' ? `Belum ada kasus dengan tag #${tag}.` : 'Belum ada kasus. Catat problem solve pertama Anda di formulir.'}
            </div>
          )}
        </div>

        <form onSubmit={submit} noValidate className="xl:col-span-5 xl:sticky xl:top-20 rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-md min-w-0" aria-label="Formulir pencatatan solusi teknis">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-primary-container/15 text-primary-container"><Icon name="edit_note" size={20} /></span>
            <div className="min-w-0">
              <h2 className="text-headline-md font-bold text-on-surface">Formulir Pencatatan Solusi Teknis</h2>
              <p className="font-label text-label-sm text-on-surface-variant">Disimpan ke tab PROBLEM_SOLVE di Google Sheets</p>
            </div>
          </div>
          <Field label="Judul Insiden / Masalah" required error={err('judul')} hint="Singkat & presisi">
            <input ref={titleRef} className={inputCls} value={form.judul} onChange={e => set('judul', e.target.value)} maxLength={200} placeholder="cth: Timeout Query SIPP saat Batch Sinkronisasi" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
            <Field label="Sistem Terikat" required>
              <select className={inputCls} value={form.sistem} onChange={e => set('sistem', e.target.value)}>{SISTEM_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Field label="Tingkat Keparahan">
              <select className={inputCls} value={form.severity} onChange={e => set('severity', e.target.value)}>{SEVERITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
          </div>
          <Field label="Stack Trace / Log Error" error={err('stackTrace')}
            hint={<button type="button" onClick={paste} className="flex items-center gap-1 text-primary hover:underline"><Icon name="copy" size={13} /> Paste Clipboard</button>}>
            <textarea className={inputCls + ' font-mono text-[12px] min-h-24'} rows={4} value={form.stackTrace} onChange={e => set('stackTrace', e.target.value)} placeholder="[Paste log error atau stack trace di sini...]" spellCheck={false} />
          </Field>
          <Field label="Langkah Solusi Konkret" required error={err('solusi')} hint="Actionable steps">
            <textarea className={inputCls + ' min-h-24'} rows={4} value={form.solusi} onChange={e => set('solusi', e.target.value)} placeholder="Uraikan step by step agar teknisi lain dapat mereplikasi..." />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
            <Field label="Tags (pisahkan koma)"><input className={inputCls} value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="#SIPP, #DB, #Patch" /></Field>
            <Field label="Diverifikasi oleh"><input className={inputCls} value={form.verifiedBy} onChange={e => set('verifiedBy', e.target.value)} maxLength={80} placeholder="Nama teknisi" /></Field>
          </div>
          <Field label="Lampirkan URL Eviden" error={err('eviden')}>
            <input className={inputCls} value={form.eviden} onChange={e => set('eviden', e.target.value)} inputMode="url" placeholder="https://drive.google.com/..." />
          </Field>
          <div className="flex flex-col sm:flex-row gap-space-sm pt-1">
            <Btn type="submit" variant="primary" disabled={saving} icon={saving ? undefined : 'cloud_upload'} className="flex-1 justify-center font-bold !py-2.5">
              {saving && <Spinner className="border-on-primary/40 border-t-on-primary" />} {saving ? 'Menyimpan...' : 'Simpan ke Knowledge Base'}
            </Btn>
            <Btn type="button" variant="neutral" icon="save_as" onClick={saveDraft} className="justify-center">Draf Lokal</Btn>
          </div>
          {draftInfo && !feedback && <p className="font-label text-label-sm text-outline">{draftInfo}</p>}
          <ErrorNote error={problem} />
          {feedback && (
            <div role="status" className={'rounded-lg px-3 py-2 text-body-sm flex items-start gap-2 ' + (feedback.ok ? 'bg-secondary-container/20 text-on-surface' : 'bg-error-container/40 text-on-error-container')}>
              <Icon name={feedback.ok ? 'sync_alt' : 'error'} size={18} className="mt-0.5" /> <span>{feedback.text}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
