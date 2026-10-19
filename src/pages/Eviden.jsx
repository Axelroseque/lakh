import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, Card, ErrorNote, Pill, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { ACCEPT, MAX_INPUT_BYTES, PROFILES, SERVER_LIMIT_BYTES, TARGET_BYTES, blobToBase64, compressImage } from '../lib/compress.js';
import { fmtBytes, isPending, monthFolder, safeUrl, todayJakarta } from '../lib/format.js';
import { useLocation } from '../lib/router.js';
import { useAsync } from '../lib/useAsync.js';

let seq = 0;
const uid = () => 'f' + Date.now().toString(36) + (seq++).toString(36);
const dash = '—';

function Kpi({ label, badge, badgeClass = 'bg-white/[0.05] text-slate-300', value, valueClass = 'text-headline-xl', unit, unitClass = 'text-slate-400', foot, footValue, icon }) {
  return (
    <div className="relative backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] p-5 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] hover:border-white/[0.14] transition-all flex flex-col justify-between overflow-hidden group">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-label text-[11px] uppercase tracking-wider text-slate-400 font-bold">{label}</span>
        {badge && <Pill className={badgeClass + ' font-semibold'}>{badge}</Pill>}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={valueClass + ' text-white font-extrabold tracking-tight truncate'}>{value}</span>
        {unit && <span className={'font-label text-xs ' + unitClass}>{unit}</span>}
      </div>
      <div className="mt-3.5 bg-black/35 backdrop-blur-sm border border-white/[0.05] rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{foot}</span>
        <span className="text-white font-mono font-semibold text-right truncate">{footValue}</span>
      </div>
      <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none text-white"><Icon name={icon} size={72} /></div>
    </div>
  );
}

function Row({ it, slotId, slots, onSlot, onUpload, onRemove }) {
  const pct = it.bytes ? Math.round((1 - it.bytes / it.originalBytes) * 100) : 0;
  const url = it.result ? safeUrl(it.result.url) : '';
  const locked = it.status === 'uploading' || it.status === 'saved';
  return (
    <div className="p-4 rounded-xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-black/35 backdrop-blur-sm border border-white/[0.06] hover:bg-black/55 hover:border-white/[0.12] transition-all" data-status={it.status}>
      <div className="flex items-center gap-4 xl:w-[340px] shrink-0 min-w-0">
        <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/[0.08] shrink-0 relative overflow-hidden flex items-center justify-center shadow-inner">
          {it.previewUrl && <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            {it.status === 'compressing' && <Spinner />}
            {it.status === 'uploading' && <Spinner />}
            {it.status === 'saved' && <Icon name="check_circle" size={22} className="text-emerald-400" />}
            {it.status === 'failed' && <Icon name="error" size={22} className="text-[#ff4d5a]" />}
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-label text-sm text-white font-bold truncate" title={it.name}>{it.name}</span>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5 text-xs">
            <span className={'text-slate-400 ' + (it.bytes ? 'line-through' : '')}>{fmtBytes(it.originalBytes)}</span>
            {it.bytes && <>
              <span className="text-white font-mono font-semibold">{fmtBytes(it.bytes)}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ff384c]/20 text-[#ff5c6a] border border-[#ff384c]/30 font-mono">-{pct}%</span>
              <span className="text-slate-400 font-mono text-xs hidden sm:inline">{it.width}×{it.height}</span>
            </>}
          </div>
        </div>
      </div>

      <div className={'flex flex-col xl:w-72 min-w-0 ' + (it.status === 'failed' && !it.bytes ? 'invisible hidden xl:flex' : '')}>
        <label htmlFor={'slot-' + it.id} className="font-label text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Kegiatan LLK terhubung</label>
        <select
          id={'slot-' + it.id}
          value={slotId || ''}
          disabled={locked}
          onChange={e => onSlot(it.id, e.target.value)}
          className="w-full bg-black/50 border border-white/[0.08] text-white text-xs rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 disabled:opacity-50"
        >
          <option value="">— Simpan tanpa kegiatan —</option>
          {slots.map(s => (
            <option key={s.id} value={s.id}>{s.start} • {s.task}{s.evidenUrls && s.evidenUrls.length ? ' (sudah ada eviden)' : ''}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between xl:justify-end gap-4 xl:w-[300px] shrink-0">
        <div className="flex flex-col items-start xl:items-end min-w-0">
          {it.status === 'compressing' && <span className="font-label text-xs text-violet-400 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" /> Mengompres...</span>}
          {it.status === 'ready' && <span className="font-label text-xs text-sky-400 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" /> Siap Unggah</span>}
          {it.status === 'uploading' && <span className="font-label text-xs text-sky-300 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-300 animate-pulse" /> Mengunggah...</span>}
          {it.status === 'saved' && <>
            <span className="font-label text-xs text-emerald-400 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Tersimpan di Drive</span>
            <span className="font-mono text-[11px] text-slate-400 truncate max-w-[220px]" title={it.result.name}>{it.result.folder} • {it.result.sizeKB} KB</span>
          </>}
          {it.status === 'failed' && <span className="font-label text-xs text-rose-400 max-w-[240px]" role="alert">{it.error}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(it.status === 'ready' || (it.status === 'failed' && it.bytes)) && (
            <button type="button" onClick={() => onUpload(it.id)} className="px-3 py-1.5 bg-gradient-to-r from-[#ff384c] to-[#ff2b40] text-white hover:brightness-110 shadow-[0_0_15px_rgba(255,43,64,0.35)] rounded-xl font-label text-xs font-bold flex items-center gap-1.5 transition-all">
              <Icon name="cloud_upload" size={16} /> {it.status === 'failed' ? 'Coba lagi' : 'Unggah'}
            </button>
          )}
          {it.status === 'saved' && url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] text-white rounded-xl font-label text-xs font-semibold transition-all flex items-center gap-1">
              <Icon name="open" size={15} className="text-sky-400" /> Lihat Link
            </a>
          )}
          <button type="button" disabled={it.status === 'uploading'} onClick={() => onRemove(it.id)} className="p-1.5 text-slate-400 hover:text-[#ff4d5a] hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40" title="Hapus dari daftar" aria-label={'Hapus ' + it.name}>
            <Icon name="delete" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Eviden() {
  const date = todayJakarta();
  const { search } = useLocation();
  const slotParam = search.get('slot') || '';
  const sched = useAsync(() => api.scheduleGet(date), [date]);
  const stats = useAsync(() => api.stats(), []);
  const ping = useAsync(() => api.ping(), []);

  const [profile, setProfile] = useState('fhd');
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState('');
  const [bulk, setBulk] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const files = useRef({});
  const chain = useRef(Promise.resolve());
  const cameraRef = useRef(null);

  const patch = (id, p) => setItems(l => l.map(i => (i.id === id ? { ...i, ...p } : i)));

  // Revoke preview URLs when leaving the page.
  useEffect(() => () => { itemsRef.current.forEach(i => i.previewUrl && URL.revokeObjectURL(i.previewUrl)); }, []);

  const slots = useMemo(() => (sched.data ? sched.data.items.filter(i => i.status !== 'Diabaikan') : []), [sched.data]);

  // Slot for each queue item: explicit choice wins, otherwise the next slot still missing eviden.
  const resolved = useMemo(() => {
    const taken = new Set(items.filter(i => i.slotId !== undefined && i.slotId !== '').map(i => i.slotId));
    const queue = slots.filter(isPending).map(s => s.id).filter(id => !taken.has(id));
    const fromParam = queue.indexOf(slotParam);
    if (fromParam > 0) queue.unshift(queue.splice(fromParam, 1)[0]);
    const out = {};
    for (const i of items) {
      if (i.status === 'failed' && !i.bytes) { out[i.id] = ''; continue; }
      out[i.id] = i.slotId !== undefined ? i.slotId : queue.shift() || '';
    }
    return out;
  }, [items, slots, slotParam]);
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  const compress = async f => {
    try {
      const r = await compressImage(files.current[f.id], { maxEdge: f.maxEdge });
      if (!itemsRef.current.some(i => i.id === f.id)) return; // removed meanwhile
      patch(f.id, { status: 'ready', blob: r.blob, bytes: r.bytes, width: r.width, height: r.height, ms: r.ms, name: r.name, previewUrl: URL.createObjectURL(r.blob) });
    } catch (e) {
      patch(f.id, { status: 'failed', error: e.message });
    } finally {
      delete files.current[f.id];
    }
  };

  const addFiles = list => {
    const errs = [];
    const fresh = [];
    for (const f of Array.from(list || [])) {
      if (!ACCEPT.includes(f.type)) { errs.push(`${f.name}: format tidak didukung (JPG, PNG, WEBP)`); continue; }
      if (f.size > MAX_INPUT_BYTES) { errs.push(`${f.name}: lebih dari 15 MB`); continue; }
      const id = uid();
      files.current[id] = f;
      fresh.push({ id, name: f.name, originalBytes: f.size, status: 'compressing', maxEdge: PROFILES[profile].maxEdge });
    }
    setNote(errs.join(' • '));
    if (!fresh.length) return;
    setItems(l => [...l, ...fresh]);
    fresh.forEach(f => { chain.current = chain.current.then(() => compress(f)); }); // one at a time keeps memory low
  };

  const upload = async id => {
    const it = itemsRef.current.find(i => i.id === id);
    if (!it || !it.blob || (it.status !== 'ready' && it.status !== 'failed')) return;
    const slotId = resolvedRef.current[id] || '';
    patch(id, { status: 'uploading', error: null, slotId });
    try {
      const base64 = await blobToBase64(it.blob);
      const r = await api.evidenUpload({ scheduleId: slotId || undefined, filename: it.name, base64, originalBytes: it.originalBytes });
      patch(id, { status: 'saved', result: r });
      sched.reload();
      stats.reload();
    } catch (e) {
      patch(id, { status: 'failed', error: e.message });
    }
  };

  const uploadAll = async () => {
    setBulk(true);
    for (const i of itemsRef.current.filter(x => x.status === 'ready')) await upload(i.id);
    setBulk(false);
  };

  const remove = id => {
    const it = itemsRef.current.find(i => i.id === id);
    if (it && it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    delete files.current[id];
    setItems(l => l.filter(i => i.id !== id));
  };

  const clearSaved = () => {
    itemsRef.current.filter(i => i.status === 'saved').forEach(i => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems(l => l.filter(i => i.status !== 'saved'));
  };

  // Numbers
  const sized = items.filter(i => i.bytes);
  const sumOrig = sized.reduce((a, i) => a + i.originalBytes, 0);
  const sumComp = sized.reduce((a, i) => a + i.bytes, 0);
  const ratio = sumOrig ? 1 - sumComp / sumOrig : 0;
  const avgMs = sized.length ? sized.reduce((a, i) => a + i.ms, 0) / sized.length : 0;
  const biggest = sized.reduce((a, i) => Math.max(a, i.bytes), 0);
  const readyCount = items.filter(i => i.status === 'ready').length;
  const savedCount = items.filter(i => i.status === 'saved').length;
  const t = stats.data ? stats.data.totals : null;
  const gasOk = !!ping.data && !ping.error;
  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date());

  const rescan = () => { sched.reload(); stats.reload(); ping.reload(); };

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] p-6 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill className="bg-[#ff384c]/15 text-[#ff5c6a] border-[#ff384c]/30 font-bold tracking-wider uppercase">FR-02 • FR-03 Pipeline</Pill>
            <Pill className={gasOk ? 'bg-sky-500/15 text-sky-400 border-sky-400/30 font-semibold' : 'bg-rose-500/15 text-rose-400 border-rose-400/30'}>
              <span className={'w-1.5 h-1.5 rounded-full ' + (gasOk ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse' : 'bg-[#ff384c]')} />
              {ping.loading && !ping.data ? 'Memeriksa GAS...' : gasOk ? 'GAS Webhook Active' : 'GAS tidak terjangkau'}
            </Pill>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">Eviden Uploader &amp; Auto-Compressor</h1>
          <p className="text-xs text-slate-400">Kompresi gambar instan di browser (&lt; 500 KB) sebelum diunggah ke Google Drive lewat Google Apps Script.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex flex-col items-end">
            <span className="font-label text-xs text-slate-400 uppercase tracking-wider font-semibold">Target Storage</span>
            <span className="font-label text-sm text-white font-bold flex items-center gap-1.5"><Icon name="cloud_done" size={16} className="text-sky-400" /> Google Drive PN Kediri</span>
          </div>
          <Btn onClick={rescan} icon="sync" disabled={sched.loading || stats.loading} variant="neutral">Trigger Rescan</Btn>
        </div>
      </div>

      <ErrorNote error={sched.error || stats.error} onRetry={rescan} />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Kompresi Rata-rata" icon="compress"
          badge={sized.length ? 'Sesi ini' : undefined} badgeClass="bg-[#ff384c]/15 text-[#ff5c6a] border-[#ff384c]/30"
          value={sized.length ? (ratio * 100).toFixed(1) + '%' : dash} unit="Efisiensi"
          foot="Sampel" footValue={sized.length ? `${fmtBytes(sumOrig)} → ${fmtBytes(sumComp)}` : 'Belum ada berkas'}
        />
        <Kpi
          label="Waktu Kompresi Klien" icon="speed"
          badge="< 3.0s SLA" badgeClass="bg-sky-500/15 text-sky-400 border-sky-400/30"
          value={sized.length ? (avgMs / 1000).toFixed(1) + 's' : dash}
          unit={sized.length ? (avgMs <= 3000 ? 'Dalam SLA' : 'Di atas SLA') : ''} unitClass={avgMs <= 3000 ? 'text-sky-400' : 'text-[#ff4d5a]'}
          foot="Engine" footValue="Canvas 2D / JPEG"
        />
        <Kpi
          label="Drive Kuota Tersimpan" icon="inventory" badge={monthName}
          value={t ? String(t.savedMB) : dash} unit="MB Net Saved"
          foot="Total berkas" footValue={t ? `${t.evidenFiles} eviden` : dash}
        />
        <Kpi
          label="Folder Aktif Drive" icon="folder_special" badge="Sub-folder bulanan" badgeClass="bg-violet-500/15 text-violet-300 border-violet-400/30"
          value={monthFolder(date)} valueClass="text-headline-md font-mono" foot="Status" footValue={gasOk ? '● Sync Ready' : '● Offline'}
        />
      </div>

      {/* Uploader */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <Card className="p-6 flex flex-col gap-6 shadow-md">
            <label
              htmlFor="eviden-file-input"
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              className={'relative group rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer min-h-[290px] transition-all duration-200 border-2 border-dashed ' + (drag ? 'bg-black/60 border-[#ff384c] shadow-[0_0_25px_rgba(255,56,76,0.25)]' : 'bg-black/35 hover:bg-black/50 border-white/[0.12] hover:border-[#ff384c]/50')}
            >
              <input
                id="eviden-file-input"
                data-testid="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#ff384c]/20 to-[#ff384c]/5 border border-[#ff384c]/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,56,76,0.2)] relative">
                <Icon name="add_photo" size={40} className="text-[#ff4d5a]" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-black/80 border border-white/10 flex items-center justify-center"><Icon name="cloud_upload" size={16} className="text-sky-400" /></div>
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Tarik foto eviden kerja ke sini</h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">atau <span className="text-[#ff5c6a] font-bold underline decoration-[#ff384c]/40">pilih berkas</span> dari perangkat Anda</p>
              <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                {['JPG', 'PNG', 'WEBP'].map(x => <span key={x} className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/[0.08] text-slate-300">{x}</span>)}
                <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/[0.08] text-sky-400 font-semibold">Max: 15 MB/file</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#ff384c]/20 border border-[#ff384c]/30 text-[#ff5c6a] font-bold">Auto &lt; 500 KB</span>
              </div>
            </label>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-black/35 backdrop-blur-sm border border-white/[0.06] p-4 rounded-xl">
              <div className="flex flex-col">
                <span className="font-label text-sm text-white font-bold flex items-center gap-1.5"><Icon name="tune" size={18} className="text-sky-400" /> Profil Resolusi Klien</span>
                <span className="text-xs text-slate-400">Berlaku untuk berkas yang ditambahkan berikutnya</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/50 border border-white/[0.06] p-1 rounded-lg self-start sm:self-auto" role="group" aria-label="Profil resolusi">
                {Object.entries(PROFILES).map(([k, p]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={profile === k}
                    onClick={() => setProfile(k)}
                    className={'px-3 py-1.5 rounded-lg font-label text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ' + (profile === k ? 'bg-gradient-to-r from-[#ff384c] to-[#ff5263] text-white font-bold shadow-[0_0_12px_rgba(255,56,76,0.35)] border border-rose-400/30' : 'text-slate-400 hover:text-white')}
                  >
                    {profile === k && <Icon name="check" size={14} />} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <Btn onClick={() => cameraRef.current && cameraRef.current.click()} icon="camera" className="sm:hidden" variant="neutral">Ambil dari Kamera</Btn>
            {note && <div role="alert" className="rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs px-3.5 py-2.5">{note}</div>}
          </Card>

          <Card className="p-5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0"><Icon name="security" size={22} /></div>
              <div className="flex flex-col min-w-0">
                <span className="font-label text-label-md text-on-surface font-semibold">Diproses lokal di browser</span>
                <span className="text-body-sm text-outline">Foto asli tidak pernah dikirim. Hanya hasil kompresi yang diunggah, lewat API Anda sendiri ke Google Drive.</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card className="p-6 flex flex-col gap-5 h-full shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Icon name="memory" size={20} className="text-primary-container" /><h2 className="text-headline-md text-on-surface">Client Compression Engine</h2></div>
              <Pill className="bg-secondary/10 text-secondary font-mono">{PROFILES[profile].maxEdge}px</Pill>
            </div>
            <div className="bg-surface-container p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between font-label text-label-sm text-outline"><span>Alur pemrosesan eviden</span><span className="font-mono text-on-surface">Target &lt; {TARGET_BYTES / 1024} KB</span></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['camera', 'text-outline', '1. Capture', 'Foto asli'],
                  ['filter', 'text-primary-container', '2. Canvas', 'Resize + JPEG'],
                  ['cloud_upload', 'text-secondary', '3. Upload', '< 1 MB payload']
                ].map(([ic, tone, a, b]) => (
                  <div key={a} className="bg-surface-container-lowest p-2.5 rounded-lg flex flex-col items-center gap-1">
                    <Icon name={ic} size={20} className={tone} />
                    <span className={'font-label text-label-sm font-semibold ' + (tone === 'text-outline' ? 'text-on-surface' : tone)}>{a}</span>
                    <span className="font-label text-label-sm text-outline">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-body-sm"><span className="text-outline">Batas unggah server</span><span className="text-on-surface font-mono font-medium">{fmtBytes(biggest)} / 1 MB</span></div>
              <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden"><div className="bg-secondary h-full rounded-full transition-all" style={{ width: Math.min(100, (biggest / SERVER_LIMIT_BYTES) * 100) + '%' }} /></div>
              <div className="flex items-center justify-between text-body-sm pt-2"><span className="text-outline">Efisiensi antrean saat ini</span>
                <span className="text-primary-container font-mono font-bold">{sized.length ? `-${(ratio * 100).toFixed(1)}% (${fmtBytes(sumOrig)} → ${fmtBytes(sumComp)})` : dash}</span>
              </div>
              <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden"><div className="bg-primary-container h-full rounded-full transition-all" style={{ width: Math.max(0, ratio * 100) + '%' }} /></div>
            </div>
            <div className="p-3.5 rounded-lg bg-surface-container-highest/60 flex items-start gap-3">
              <Icon name="verified_user" size={20} className="text-tertiary mt-0.5" />
              <div className="flex flex-col"><span className="font-label text-label-md text-on-surface font-semibold">Integrasi LLK otomatis</span>
                <p className="text-body-sm text-outline leading-snug">Tautan Google Drive langsung ditulis ke baris jadwal yang dipilih, tanpa input manual.</p></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Queue */}
      <Card className="overflow-hidden flex flex-col shadow-md">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={'w-3 h-3 rounded-full shrink-0 ' + (readyCount ? 'bg-primary-container animate-pulse' : 'bg-outline/50')} />
            <div className="flex flex-col"><h2 className="text-headline-md text-on-surface">Antrean Eviden Aktif</h2>
              <span className="text-body-sm text-outline">Hubungkan setiap foto ke kegiatan LLK, lalu unggah</span></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-label text-label-sm text-outline uppercase font-semibold tracking-wider">Total: {items.length} berkas</span>
            <Btn variant="primary" icon={bulk ? undefined : 'cloud_upload'} onClick={uploadAll} disabled={!readyCount || bulk}>
              {bulk && <Spinner className="border-on-primary/40 border-t-on-primary" />} Unggah Semua ({readyCount})
            </Btn>
            <Btn variant="ghost" icon="clear_all" onClick={clearSaved} disabled={!savedCount}>Kosongkan Selesai</Btn>
          </div>
        </div>
        <div className="flex flex-col">
          {items.length === 0 && (
            <div className="px-6 pb-8 pt-2 text-center text-outline text-body-sm">
              Belum ada berkas. {slots.some(isPending) ? `${slots.filter(isPending).length} kegiatan hari ini menunggu eviden.` : 'Tambahkan foto lewat area di atas.'}
            </div>
          )}
          {items.map(it => (
            <Row key={it.id} it={it} slotId={resolved[it.id]} slots={slots} onSlot={(id, v) => patch(id, { slotId: v })} onUpload={upload} onRemove={remove} />
          ))}
        </div>
      </Card>
    </div>
  );
}
