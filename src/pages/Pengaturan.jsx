import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, ErrorNote, Spinner } from '../components/ui.jsx';
import { api, getToken, setToken } from '../lib/api.js';
import { download, toCsv } from '../lib/csv.js';
import { monthFolder, relTime, todayJakarta } from '../lib/format.js';
import { KB_DRAFT_KEY, kbCsvColumns } from '../lib/kb.js';
import { IDLE_CHOICES, PREF_DEFAULTS, setPrefs, usePrefs } from '../lib/prefs.js';
import { useAsync } from '../lib/useAsync.js';

const TABS = [['security', 'security', 'Umum & Keamanan'], ['gas', 'cloud_sync', 'Integrasi API & GAS'], ['ai', 'memory', 'Model AI'], ['data', 'database', 'Penyimpanan & Data']];
const inputCls = 'w-full rounded-xl bg-black/50 border border-white/[0.08] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 transition-all shadow-inner';
const roCls = 'w-full rounded-xl bg-black/30 border border-white/[0.05] px-3.5 py-2.5 text-sm text-slate-300 font-mono truncate';

function Panel({ icon, tone, title, subtitle, badge, children }) {
  return (
    <section className="rounded-2xl backdrop-blur-xl bg-[#0c1017]/80 border border-white/[0.08] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="p-space-md flex items-center justify-between gap-3 bg-black/40 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <span className={'w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center shrink-0 ' + tone}><Icon name={icon} size={22} /></span>
          <div className="min-w-0"><h2 className="text-lg font-bold text-white">{title}</h2><p className="font-label text-xs text-slate-400">{subtitle}</p></div>
        </div>
        {badge && <span className="hidden sm:inline px-2.5 py-0.5 rounded-full font-label text-xs bg-white/[0.04] border border-white/[0.08] text-slate-300 whitespace-nowrap">{badge}</span>}
      </div>
      <div className="p-space-md flex flex-col gap-space-md">{children}</div>
    </section>
  );
}
const Row = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5"><span className="font-label text-xs font-semibold text-slate-300">{label}</span>{children}{hint && <span className="font-label text-xs text-slate-500">{hint}</span>}</div>
);
function Toggle({ checked, onChange, label }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <div className="w-11 h-6 rounded-full bg-black/60 border border-white/[0.1] peer-checked:bg-[#ff384c] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#ff384c]" />
      <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-slate-300 peer-checked:translate-x-5 peer-checked:bg-white transition-all shadow-sm" />
    </label>
  );
}
const Flag = ({ ok, yes, no }) => <span className={'inline-flex items-center gap-1.5 font-label text-xs font-bold ' + (ok ? 'text-emerald-400' : 'text-[#ff4d5a]')}><Icon name={ok ? 'check_circle' : 'warning'} size={16} />{ok ? yes : no}</span>;

export default function Pengaturan() {
  const today = todayJakarta();
  const settings = useAsync(() => api.settings(), []);
  const ping = useAsync(async () => { const t0 = performance.now(); const d = await api.ping(); return { ...d, rtt: Math.round(performance.now() - t0) }; }, []);
  const ai = useAsync(() => api.aiStatus(), []);
  const prefs = usePrefs();

  const [tab, setTab] = useState('security');
  const [form, setForm] = useState(null);
  const [local, setLocal] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [toast, setToast] = useState(null);
  const [showTok, setShowTok] = useState(false);
  const [exporting, setExporting] = useState('');

  const s = settings.data;
  useEffect(() => { if (s) setForm({ webappUrl: s.webappUrl || '', evidenSharing: s.evidenSharing }); }, [s]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const urlErr = form && form.webappUrl.trim() && !/^https:\/\/[^\s<>"']{3,300}$/i.test(form.webappUrl.trim()) ? 'Harus berupa URL https://' : '';
  const serverDirty = !!form && !!s && (form.webappUrl.trim() !== (s.webappUrl || '') || form.evidenSharing !== s.evidenSharing);
  const localDirty = local.idleLogout !== prefs.idleLogout || local.idleMinutes !== prefs.idleMinutes;
  const dirty = serverDirty || localDirty;

  const save = async () => {
    if (!dirty || urlErr) return;
    setSaving(true); setProblem(null);
    try {
      if (serverDirty) {
        const patch = {};
        if (form.webappUrl.trim() !== (s.webappUrl || '')) patch.webappUrl = form.webappUrl.trim();
        if (form.evidenSharing !== s.evidenSharing) patch.evidenSharing = form.evidenSharing;
        await api.saveSettings(patch);
        settings.reload();
      }
      if (localDirty) setPrefs({ idleLogout: local.idleLogout, idleMinutes: local.idleMinutes });
      setToast({ ok: true, text: 'Pengaturan berhasil disimpan.' });
    } catch (e) { setProblem(e); } finally { setSaving(false); }
  };
  const restore = () => {
    setLocal({ ...PREF_DEFAULTS });
    setForm(f => ({ ...f, evidenSharing: 'PRIVATE' }));
    setToast({ ok: true, text: 'Nilai default dipulihkan di formulir. Klik "Simpan Semua Perubahan" untuk menerapkan.' });
  };

  const copyToken = async () => {
    try { await navigator.clipboard.writeText(getToken()); setToast({ ok: true, text: 'Token akses disalin ke clipboard.' }); }
    catch { setToast({ ok: false, text: 'Clipboard diblokir browser.' }); }
  };
  const doExport = async kind => {
    setExporting(kind); setProblem(null);
    try {
      const r = await api.kbList({ limit: 200 });
      if (kind === 'json') download(`problem-solve-${today}.json`, JSON.stringify(r.items, null, 2), 'application/json');
      else download(`problem-solve-${today}.csv`, toCsv(r.items, kbCsvColumns()));
      setToast({ ok: true, text: `${r.items.length} kasus diekspor${r.total > r.items.length ? ` (dari ${r.total}, maksimal 200 per ekspor)` : ''}.` });
    } catch (e) { setProblem(e); } finally { setExporting(''); }
  };
  const clearCache = () => {
    try { localStorage.removeItem(KB_DRAFT_KEY); setToast({ ok: true, text: 'Draf lokal dibersihkan. Sesi login tidak terpengaruh.' }); }
    catch { setToast({ ok: false, text: 'Browser memblokir akses penyimpanan lokal.' }); }
  };

  const pingOk = ping.data && /^ok:/.test(ping.data.sheets || '');
  const aiD = ai.data;
  const tok = useMemo(() => getToken(), []);
  const eviPreview = useMemo(() => '/' + (s ? s.drive.rootName : 'Eviden_LLK') + '/' + monthFolder(today).split('/').slice(-2).join('/'), [s, today]);

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm font-label text-label-sm uppercase tracking-wider text-primary">
            <span className="px-2 py-0.5 rounded bg-surface-container-high font-semibold">NFR Section 05: Compliance</span>
            {s && <span className="text-outline normal-case tracking-normal">GAS v{s.version} • {s.tz}</span>}
          </div>
          <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">Pengaturan Sistem &amp; Integrasi</h1>
          <p className="text-body-md text-on-surface-variant max-w-3xl">Keamanan akses, integrasi Google Apps Script dan Drive, status model AI, serta manajemen data lokal PN Kediri.</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm self-start lg:self-center">
          <Btn onClick={restore} icon="restart" className="h-10">Pulihkan Default</Btn>
          <Btn variant="primary" onClick={save} disabled={!dirty || saving || !!urlErr} icon={saving ? undefined : 'verified_user'} className="h-10 font-semibold">{saving && <Spinner className="border-on-primary/40 border-t-on-primary" />} Simpan Semua Perubahan</Btn>
        </div>
      </div>

      <div role="tablist" aria-label="Kategori pengaturan" className="flex gap-1 p-1 rounded-xl bg-surface-container w-full overflow-x-auto">
        {TABS.map(([id, icon, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={'px-space-md py-2 rounded-lg font-label text-label-lg flex items-center gap-2 whitespace-nowrap transition-all ' + (tab === id ? 'bg-surface-container-high text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface')}>
            <Icon name={icon} size={18} /> {label}
          </button>
        ))}
      </div>
      <ErrorNote error={settings.error} onRetry={settings.reload} />
      <ErrorNote error={problem} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
        <div className="xl:col-span-8 flex flex-col gap-space-md min-w-0" role="tabpanel">
          {tab === 'security' && (
            <Panel icon="shield" tone="text-primary-container" title="Keamanan & Akses" subtitle="Token akses aplikasi dan sesi operator" badge="SEC-LVL-1">
              <Row label="Token Akses (Authorization: Bearer)" hint="Token ini hanya tersimpan di browser ini. Untuk mengganti, ubah LAKH_APP_TOKEN di Vercel lalu deploy ulang.">
                <div className="flex flex-col sm:flex-row gap-space-sm">
                  <input readOnly type={showTok ? 'text' : 'password'} value={tok} aria-label="Token akses" className={roCls + ' flex-1'} />
                  <Btn onClick={() => setShowTok(v => !v)} icon={showTok ? 'block' : 'search'} className="justify-center">{showTok ? 'Sembunyi' : 'Tampil'}</Btn>
                  <Btn onClick={copyToken} icon="copy" className="justify-center" disabled={!tok}>Salin</Btn>
                </div>
              </Row>
              <Row label="Kunci Apps Script" hint="LAKH_GAS_KEY berada di server Vercel dan tidak pernah dikirim ke browser.">
                <Flag ok yes="Tersimpan di server (disembunyikan)" no="" />
              </Row>
              <div className="rounded-lg bg-surface-container-low p-space-sm flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0"><Icon name="timer" size={22} className="text-tertiary mt-0.5" />
                  <div><div className="font-label text-label-lg font-semibold text-on-surface">Keluar Otomatis Saat Tidak Aktif</div>
                    <div className="font-label text-label-sm text-on-surface-variant">Sesi di browser ini berakhir bila tidak ada aktivitas.</div></div></div>
                <Toggle checked={local.idleLogout} onChange={v => setLocal(l => ({ ...l, idleLogout: v }))} label="Keluar otomatis" />
              </div>
              {local.idleLogout && (
                <Row label="Batas waktu tidak aktif">
                  <div className="flex gap-space-sm" role="radiogroup" aria-label="Batas waktu tidak aktif">
                    {IDLE_CHOICES.map(m => (
                      <button key={m} type="button" role="radio" aria-checked={local.idleMinutes === m} onClick={() => setLocal(l => ({ ...l, idleMinutes: m }))}
                        className={'px-4 py-2 rounded-lg font-label text-label-md ' + (local.idleMinutes === m ? 'bg-primary-container text-on-primary font-bold' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface')}>{m} menit</button>
                    ))}
                  </div>
                </Row>
              )}
              <div className="flex justify-end"><Btn onClick={() => setToken('')} icon="logout">Keluar Sekarang</Btn></div>
            </Panel>
          )}

          {tab === 'gas' && (
            <Panel icon="folder" tone="text-secondary" title="Google Apps Script & Drive Sync" subtitle="Endpoint, spreadsheet, dan folder eviden" badge="DRIVE-V3">
              {!s || !form ? <div className="flex items-center gap-2 text-outline"><Spinner /> Memuat...</div> : (
                <>
                  <Row label="GAS Web App (doPost)" hint="URL /exec disimpan di server (LAKH_GAS_URL) dan tidak ditampilkan di sini.">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <Flag ok={!ping.error && !!ping.data} yes={ping.data ? `Terhubung (${ping.data.rtt} ms)` : 'Terhubung'} no={ping.loading ? 'Memeriksa...' : 'Tidak terjangkau'} />
                      <Flag ok={pingOk} yes="Spreadsheet OK" no="Spreadsheet bermasalah" />
                    </div>
                  </Row>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                    <Row label="Spreadsheet Target"><div className={roCls} title={s.sheets.name}>{s.sheets.name || '—'}</div></Row>
                    <Row label="Tab Data"><div className={roCls} title={s.sheets.tabs.join(', ')}>{s.sheets.tabs.length} tab: {s.sheets.tabs[0]}…</div></Row>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                    <Row label="Base Folder Drive Root"><div className={roCls}>/{s.drive.rootName}/</div></Row>
                    <Row label="Preview Path Dinamis Bulanan"><div className={roCls + ' text-secondary'}>{eviPreview}</div></Row>
                  </div>
                  <Row label="Hak Akses Berkas Eviden Baru" hint="PRIVATE: hanya pemilik akun Google. LINK: siapa pun dengan tautan dapat melihat. Berkas lama tidak berubah.">
                    <div className="flex gap-space-sm" role="radiogroup" aria-label="Hak akses eviden">
                      {[['PRIVATE', 'Privat'], ['LINK', 'Siapa pun dengan tautan']].map(([v, l]) => (
                        <button key={v} type="button" role="radio" aria-checked={form.evidenSharing === v} onClick={() => setForm(f => ({ ...f, evidenSharing: v }))}
                          className={'px-4 py-2 rounded-lg font-label text-label-md ' + (form.evidenSharing === v ? 'bg-primary-container text-on-primary font-bold' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface')}>{l}</button>
                      ))}
                    </div>
                  </Row>
                  <Row label="URL Aplikasi (tautan di pesan Telegram)">
                    <input className={inputCls} value={form.webappUrl} onChange={e => setForm(f => ({ ...f, webappUrl: e.target.value }))} inputMode="url" placeholder="https://lakh-anda.vercel.app" aria-label="URL aplikasi" />
                    {urlErr && <span role="alert" className="font-label text-label-sm text-error">{urlErr}</span>}
                  </Row>
                </>
              )}
            </Panel>
          )}

          {tab === 'ai' && (
            <Panel icon="memory" tone="text-tertiary" title="Model AI Inference (FR-01)" subtitle="Status VPS lokal untuk penyusunan jadwal" badge="VPS-NODE">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
                {[['Status', ai.loading && !aiD ? '...' : aiD ? (aiD.online ? 'Online' : aiD.configured ? 'Offline' : 'Belum diatur') : '—', aiD && aiD.online ? 'text-emerald-400' : 'text-primary-container'],
                  ['Model aktif', aiD ? aiD.model : '—', 'text-on-surface'], ['Latensi cek', aiD && aiD.ms != null ? aiD.ms + ' ms' : '—', 'text-on-surface'], ['Batas SLA', aiD ? aiD.limitMs / 1000 + ' detik' : '—', 'text-on-surface']].map(([l, v, c]) => (
                  <div key={l} className="rounded-lg bg-surface-container-low p-space-sm min-w-0"><div className="font-label text-label-sm text-outline uppercase tracking-wider">{l}</div><div className={'text-headline-md font-bold truncate ' + c} title={String(v)}>{v}</div></div>
                ))}
              </div>
              <div className="rounded-lg bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant space-y-1.5">
                <div className="font-label text-label-lg font-semibold text-on-surface flex items-center gap-1.5"><Icon name="info" size={16} className="text-primary" /> Diatur lewat Environment Variables Vercel</div>
                <p>Endpoint, model, dan batas waktu tidak diubah dari browser agar tidak ada yang bisa mengarahkan server ke alamat lain. Ubah di Vercel lalu deploy ulang:</p>
                <p className="font-mono text-[12px] text-secondary">AI_URL · AI_MODEL · AI_TIMEOUT_MS · AI_API_KEY · CF_ACCESS_CLIENT_ID / SECRET</p>
              </div>
              <div className="flex justify-end"><Btn onClick={ai.reload} icon="ping" disabled={ai.loading}>{ai.loading ? <Spinner /> : null} Ping VPS AI</Btn></div>
            </Panel>
          )}

          {tab === 'data' && (
            <Panel icon="database" tone="text-secondary" title="Manajemen Data & Cache" subtitle="Backup offline dan pembersihan penyimpanan browser">
              <Row label="Ekspor Arsip Problem Solve" hint="Maksimal 200 kasus terbaru per ekspor.">
                <div className="flex flex-col sm:flex-row gap-space-sm">
                  <Btn onClick={() => doExport('json')} disabled={!!exporting} icon={exporting === 'json' ? undefined : 'json'} className="flex-1 justify-center">{exporting === 'json' && <Spinner />} Export .JSON</Btn>
                  <Btn onClick={() => doExport('csv')} disabled={!!exporting} icon={exporting === 'csv' ? undefined : 'table'} className="flex-1 justify-center">{exporting === 'csv' && <Spinner />} Export .CSV</Btn>
                </div>
              </Row>
              <Row label="Cache Browser" hint="Menghapus draf Problem Solve yang tersimpan di browser ini. Token dan preferensi tidak ikut terhapus.">
                <div><Btn onClick={clearCache} icon="sweep">Bersihkan Draf Lokal</Btn></div>
              </Row>
            </Panel>
          )}
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-md min-w-0">
          <div className="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-sm">
            <div className="flex items-center justify-between"><span className="font-label text-label-md text-outline uppercase tracking-wider">Status Gateway Node</span>
              <span className={'flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-high font-label text-label-sm font-bold ' + (ping.data ? 'text-emerald-400' : 'text-primary-container')}><span className={'w-1.5 h-1.5 rounded-full ' + (ping.data ? 'bg-emerald-400' : 'bg-primary-container')} />{ping.loading && !ping.data ? '...' : ping.data ? 'ONLINE' : 'OFFLINE'}</span></div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div className="rounded-lg bg-surface-container-low p-space-sm"><div className="font-label text-label-sm text-outline">GAS Latency</div><div className="text-headline-md font-bold text-on-surface">{ping.data ? ping.data.rtt + 'ms' : '—'}</div></div>
              <div className="rounded-lg bg-surface-container-low p-space-sm"><div className="font-label text-label-sm text-outline">VPS AI</div><div className="text-headline-md font-bold text-on-surface">{aiD && aiD.online ? aiD.ms + 'ms' : aiD ? 'Offline' : '—'}</div></div>
            </div>
            <div className="font-label text-label-sm text-on-surface-variant space-y-1.5">
              <div className="flex justify-between gap-2"><span>Telegram:</span><span className="text-on-surface">{ping.data ? (ping.data.config.telegram ? 'Terkonfigurasi' : 'Belum') : '—'}</span></div>
              <div className="flex justify-between gap-2"><span>Cron trigger:</span><span className="text-on-surface">{ping.data ? (ping.data.config.cronTriggers > 0 ? 'Aktif' : 'Belum dipasang') : '—'}</span></div>
              <div className="flex justify-between gap-2"><span>Waktu server:</span><span className="text-on-surface font-mono">{ping.data ? relTime(ping.data.time) : '—'}</span></div>
            </div>
            <Btn onClick={() => { ping.reload(); ai.reload(); }} icon="refresh" className="justify-center">Periksa Ulang</Btn>
          </div>
          <div className="rounded-xl bg-surface-container-low p-space-md flex items-start gap-3 text-on-surface-variant">
            <Icon name="verified_user" size={22} className="text-secondary shrink-0 mt-0.5" />
            <div><div className="font-label text-label-lg font-semibold text-on-surface">Audit Kepatuhan</div>
              <p className="text-body-sm">Setiap perubahan pengaturan server dicatat ke SYNC_LOG (nama kolom yang berubah, tanpa nilai rahasia).</p></div>
          </div>
          <div className="rounded-xl bg-surface-container p-space-md font-label text-label-sm text-on-surface-variant space-y-1.5">
            <div className="flex justify-between"><span>App</span><span className="text-on-surface font-semibold">LAKH • {import.meta.env && import.meta.env.MODE === 'mock' ? 'demo' : 'production'}</span></div>
            <div className="flex justify-between"><span>Apps Script</span><span className="text-on-surface font-mono">{s ? 'v' + s.version : '—'}</span></div>
          </div>
        </div>
      </div>

      {toast && (
        <div role="status" className={'fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-50 rounded-lg px-4 py-3 shadow-xl flex items-start gap-2 text-body-sm ' + (toast.ok ? 'bg-surface-container-highest text-on-surface' : 'bg-error-container text-on-error-container')}>
          <Icon name={toast.ok ? 'check_circle' : 'error'} size={18} className={toast.ok ? 'text-secondary mt-0.5' : 'mt-0.5'} /> <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
