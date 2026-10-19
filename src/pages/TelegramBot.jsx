import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Btn, ErrorNote, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CRON, fmtNextRun, nextCronRun } from '../lib/cron.js';
import { download, toCsv } from '../lib/csv.js';
import { toMin, todayJakarta } from '../lib/format.js';
import { deliveryStats, maskChatId, reminderPreview, validateTelegram } from '../lib/kb.js';
import { useAsync } from '../lib/useAsync.js';

const LEADS = [[0, 'Tepat Waktu', '0 menit (saat agenda tiba)'], [5, '5 Menit Sebelum', 'Rekomendasi agenda apel'], [15, '15 Menit Sebelum', 'Persiapan sidang & SIPP']];
const inputCls = 'w-full rounded-lg bg-surface-container-lowest border border-outline-variant/40 pl-10 pr-3 py-2.5 text-body-md text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container';
const fmtTime = (ts, today) => (String(ts).startsWith(today) ? String(ts).slice(11, 19) : String(ts).slice(8, 10) + '/' + String(ts).slice(5, 7) + ' ' + String(ts).slice(11, 16));
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

function Stat({ label, tag, tagCls = 'text-sky-400', title, sub, foot, bar }) {
  return (
    <div className="rounded-2xl backdrop-blur-xl bg-[#0c1017]/80 border border-white/[0.08] p-5 flex flex-col justify-between gap-3 min-w-0 shadow-[0_12px_32px_rgba(0,0,0,0.5)] hover:border-white/[0.14] transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="font-label text-[11px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
        {tag && <span className={'px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] font-label text-xs font-semibold ' + tagCls}>{tag}</span>}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-white truncate" title={typeof title === 'string' ? title : undefined}>{title}</div>
        <div className="font-label text-xs text-slate-400 truncate mt-0.5">{sub}</div>
      </div>
      {bar != null
        ? <div className="h-1.5 rounded-full bg-black/60 border border-white/[0.06] overflow-hidden"><div className="h-full bg-sky-400 rounded-full" style={{ width: bar + '%' }} /></div>
        : <div className="font-label text-xs text-slate-400 flex items-center gap-1.5">{foot}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <div className="w-11 h-6 rounded-full bg-black/60 border border-white/[0.1] peer-checked:bg-[#ff384c] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#ff384c]" />
      <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-slate-300 peer-checked:translate-x-5 peer-checked:bg-white transition-all shadow-sm" />
    </label>
  );
}

export default function TelegramBot() {
  const today = todayJakarta();
  const settings = useAsync(() => api.settings(), []);
  const status = useAsync(() => api.telegramStatus(), []);
  const log = useAsync(() => api.telegramLog(100), []);
  const sched = useAsync(() => api.scheduleGet(today), [today]);

  const [form, setForm] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [problem, setProblem] = useState(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [pings, setPings] = useState([]);
  const [tick, setTick] = useState(0);

  const saved = settings.data ? settings.data.telegram : null;
  useEffect(() => {
    if (saved) setForm({ token: '', chatId: saved.chatId || '', leadMinutes: saved.leadMinutes, silent: saved.silent });
  }, [saved]);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 20000); return () => clearInterval(t); }, []);

  const errors = useMemo(() => (form ? validateTelegram({ token: form.token, chatId: form.chatId }) : {}), [form]);
  const dirty = !!form && !!saved && (form.token.trim() !== '' || form.chatId.trim() !== (saved.chatId || '') || form.leadMinutes !== saved.leadMinutes || form.silent !== saved.silent);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setBanner(null); };

  const save = async () => {
    if (!form || !dirty || Object.keys(errors).length) return;
    setSaving(true); setProblem(null); setBanner(null);
    const patch = {};
    if (form.token.trim()) patch.telegramToken = form.token.trim();
    if (form.chatId.trim() !== (saved.chatId || '')) patch.telegramChatId = form.chatId.trim();
    if (form.leadMinutes !== saved.leadMinutes) patch.leadMinutes = form.leadMinutes;
    if (form.silent !== saved.silent) patch.silent = form.silent;
    try {
      await api.saveSettings(patch);
      setShowToken(false);
      setBanner({ ok: true, text: 'Konfigurasi tersimpan di Script Properties.' });
      settings.reload();
      if (patch.telegramToken) status.reload();
    } catch (e) { setProblem(e); } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setProblem(null); setBanner(null);
    try {
      await api.telegramTest();
      const now = new Date();
      setPings(p => [...p, new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)]);
      setBanner({ ok: true, text: `Pesan uji coba berhasil dikirim ke Telegram Chat ID ${maskChatId(saved ? saved.chatId : '')}.` });
    } catch (e) { setBanner({ ok: false, text: e.message }); } finally { setTesting(false); log.reload(); }
  };

  const resetDefaults = () => { setForm(f => ({ ...f, leadMinutes: 0, silent: false })); setBanner(null); };

  const items = log.data ? log.data.items : [];
  const shown = onlyFailed ? items.filter(i => i.status !== 'Delivered') : items;
  const kpi = useMemo(() => deliveryStats(items, today), [items, today]);
  const next = useMemo(() => fmtNextRun(nextCronRun()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const bot = status.data;
  const slots = sched.data ? sched.data.items.filter(i => i.status !== 'Diabaikan') : [];
  const lead = form ? form.leadMinutes : 0;
  const exportCsv = () => download(`telegram-log-${today}.csv`, toCsv(shown, [
    { label: 'Waktu', key: 'time' }, { label: 'Agenda', key: 'agenda' }, { label: 'Tipe', key: 'type' }, { label: 'Chat ID', key: 'chatId' }, { label: 'HTTP', key: 'http' }, { label: 'Status', key: 'status' }
  ]));

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label text-label-sm uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-surface-container-high font-semibold">Module FR-05</span>
            <span className="flex items-center gap-1.5 font-label text-label-sm text-on-surface-variant">
              <span className={'w-2 h-2 rounded-full ' + (status.loading && !bot ? 'bg-outline animate-pulse' : bot && bot.ok ? 'bg-emerald-400' : 'bg-primary-container')} />
              Telegram Bot Gateway
            </span>
          </div>
          <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">Telegram Reminder Bot Service</h1>
          <p className="text-body-md text-on-surface-variant max-w-3xl">Pengaturan bot pengingat agenda kerja harian dan notifikasi eviden terjadwal PN Kediri.</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm self-start lg:self-center">
          <Btn variant="blue" onClick={test} disabled={testing} icon={testing ? undefined : 'send'} className="h-10 font-semibold">{testing && <Spinner />} Kirim Pesan Uji Coba</Btn>
          <Btn variant="primary" onClick={save} disabled={!dirty || saving || Object.keys(errors).length > 0} icon={saving ? undefined : 'verified'} className="h-10 font-semibold">{saving && <Spinner className="border-on-primary/40 border-t-on-primary" />} Simpan Konfigurasi</Btn>
        </div>
      </div>

      {banner && (
        <div role="status" className={'rounded-lg px-4 py-3 flex items-center justify-between gap-3 text-body-sm ' + (banner.ok ? 'bg-secondary-container/20 text-on-surface' : 'bg-error-container/40 text-on-error-container')}>
          <span className="flex items-center gap-2"><Icon name={banner.ok ? 'check_circle' : 'error'} size={18} /> {banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Tutup" className="p-1"><Icon name="close" size={16} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
        <Stat label="Bot Identity" tag={bot ? (bot.ok ? '24/7 Node' : 'Bermasalah') : '...'} tagCls={bot && bot.ok ? 'text-secondary' : 'text-primary-container'}
          title={bot && bot.ok ? '@' + bot.username : bot && !bot.configured ? 'Belum dikonfigurasi' : status.loading ? 'Memeriksa...' : 'Tidak terhubung'}
          sub={bot && bot.ok ? bot.name : bot && bot.error ? bot.error : '—'}
          foot={<><span className={'w-1.5 h-1.5 rounded-full ' + (bot && bot.ok ? 'bg-emerald-400' : 'bg-primary-container')} />{bot && bot.ms != null ? `Latensi ${bot.ms} ms ke Telegram API` : 'Menunggu respons'}</>} />
        <Stat label="Target Telegram Chat" tag={saved && saved.chatId ? 'Terkunci' : 'Kosong'} tagCls={saved && saved.chatId ? 'text-secondary' : 'text-primary-container'}
          title={saved && saved.chatId ? maskChatId(saved.chatId) : '—'} sub="Penerima semua pengingat"
          foot={<><Icon name="lock" size={14} /> Hanya satu chat tujuan</>} />
        <Stat label="Cron Dispatcher" tag="Time-driven" title={`${CRON.minutes}-Min Trigger`} sub={`Sen-Jum ${hhmm(CRON.start)}-${hhmm(CRON.end)} WIB`}
          foot={<>Jalan berikutnya: <span className="text-tertiary font-mono font-semibold">{next}</span></>} />
        <Stat label="Delivery Rate" tag={kpi.rate == null ? 'Belum ada' : kpi.rate === 100 ? 'KPI Met' : 'Perlu dicek'} tagCls={kpi.rate === 100 || kpi.rate == null ? 'text-secondary' : 'text-primary-container'}
          title={kpi.rate == null ? '—' : kpi.rate + '%'} sub={kpi.total ? `${kpi.ok} dari ${kpi.total} terkirim hari ini` : 'Belum ada pengiriman hari ini'} bar={kpi.rate == null ? 0 : kpi.rate} />
      </div>
      <ErrorNote error={settings.error || status.error || log.error} onRetry={() => { settings.reload(); status.reload(); log.reload(); }} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
        <div className="xl:col-span-7 rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-md min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="p-2 rounded-lg bg-primary-container/15 text-primary-container"><Icon name="tune" size={20} /></span>
              <div><h2 className="text-headline-md font-bold text-on-surface">Bot Configuration Settings</h2><p className="font-label text-label-sm text-on-surface-variant">Disimpan di Script Properties Google Apps Script</p></div></div>
            <span className="hidden sm:inline px-2 py-0.5 rounded font-label text-label-sm bg-surface-container-high text-outline">SECURE STORAGE</span>
          </div>
          {!form && <div className="flex items-center gap-2 text-outline"><Spinner /> Memuat konfigurasi...</div>}
          {form && (
            <form className="flex flex-col gap-space-md" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between font-label text-label-md text-on-surface-variant"><span>Bot API Token (BotFather)</span>
                  <span className={saved.tokenSet ? 'text-secondary' : 'text-primary-container'}>{saved.tokenSet ? 'Token terpasang' : 'Belum diisi'}</span></span>
                <div className="relative">
                  <Icon name="lock" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <input type={showToken ? 'text' : 'password'} value={form.token} onChange={e => set('token', e.target.value)} autoComplete="off" spellCheck={false}
                    placeholder={saved.tokenSet ? '•••••••• (kosongkan agar tidak berubah)' : '123456789:AAF...'} className={inputCls + ' pr-20 font-mono text-[13px]'} aria-label="Bot API Token" />
                  <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded font-label text-label-sm text-on-surface-variant hover:text-on-surface">{showToken ? 'Sembunyi' : 'Tampil'}</button>
                </div>
                {errors.token && <span role="alert" className="font-label text-label-sm text-error">{errors.token}</span>}
                <span className="font-label text-label-sm text-outline">Token hanya dikirim ke server dan tidak pernah ditampilkan kembali.</span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-md text-on-surface-variant">Default Telegram Chat ID / Channel ID</span>
                <div className="relative"><Icon name="bot" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <input value={form.chatId} onChange={e => set('chatId', e.target.value)} inputMode="numeric" className={inputCls + ' font-mono'} aria-label="Telegram Chat ID" placeholder="819204918" /></div>
                {errors.chatId && <span role="alert" className="font-label text-label-sm text-error">{errors.chatId}</span>}
              </label>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="font-label text-label-md text-on-surface-variant mb-1.5">Reminder Lead Time</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                  {LEADS.map(([v, t, d]) => (
                    <label key={v} className={'relative cursor-pointer rounded-lg p-space-sm border transition-colors flex flex-col gap-0.5 ' + (form.leadMinutes === v ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high')}>
                      <input type="radio" name="lead_time" value={v} checked={form.leadMinutes === v} onChange={() => set('leadMinutes', v)} className="sr-only" />
                      <span className="font-label text-label-lg font-semibold text-on-surface">{t}</span>
                      <span className="font-label text-label-sm text-on-surface-variant">{d}</span>
                      {form.leadMinutes === v && <Icon name="check_circle" size={16} className="absolute right-2 top-2 text-primary-container" />}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="rounded-lg bg-surface-container-low p-space-sm flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="font-label text-label-lg font-semibold text-on-surface">Silent Notification Mode</div>
                  <div className="font-label text-label-sm text-on-surface-variant">Kirim tanpa suara/getar (disable_notification).</div></div>
                <Toggle checked={form.silent} onChange={v => set('silent', v)} label="Silent Notification Mode" />
              </div>
              <ErrorNote error={problem} />
              <div className="flex items-center justify-between gap-2 pt-1">
                <button type="button" onClick={resetDefaults} className="px-3 py-2 rounded-lg font-label text-label-md text-on-surface-variant hover:bg-surface-container-high">Reset ke Default</button>
                <Btn type="submit" variant="primary" disabled={!dirty || saving || Object.keys(errors).length > 0} icon={saving ? undefined : 'save_as'} className="font-bold">{saving && <Spinner className="border-on-primary/40 border-t-on-primary" />} Simpan Konfigurasi</Btn>
              </div>
            </form>
          )}
        </div>

        <div className="xl:col-span-5 rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-sm min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-label text-label-md font-semibold text-on-surface"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Pratinjau Pesan (agenda hari ini)</span>
            <span className="font-label text-label-sm text-outline">Telegram Mobile</span>
          </div>
          <div className="rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-lowest flex flex-col">
            <div className="px-3 py-2.5 bg-surface-container-high flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-label-md">LK</div>
              <div className="min-w-0"><div className="flex items-center gap-1 font-label text-label-lg font-semibold text-on-surface truncate">{bot && bot.ok ? bot.name : 'LAKH PN Kediri Bot'} <Icon name="verified" size={14} className="text-secondary" /></div>
                <div className="font-label text-label-sm text-on-surface-variant">bot • {bot && bot.ok ? 'aktif' : 'tidak aktif'}</div></div>
            </div>
            <div className="p-3 flex flex-col gap-2.5 max-h-[26rem] overflow-y-auto" data-testid="tg-preview">
              <div className="self-center px-2.5 py-0.5 rounded-full bg-surface-container font-label text-label-sm text-on-surface-variant">Hari ini • Pengadilan Negeri Kediri</div>
              {sched.loading && !sched.data && <div className="self-center flex items-center gap-2 text-outline text-body-sm"><Spinner /> Memuat agenda...</div>}
              {sched.data && !slots.length && <div className="self-center text-body-sm text-outline text-center py-4">Belum ada jadwal hari ini. Buat di Generator Jadwal.</div>}
              {slots.map(it => {
                const p = reminderPreview(it);
                const at = lead > 0 ? hhmm(Math.max(0, toMin(it.start) - lead)) : it.start;
                return (
                  <div key={it.id} className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-surface-container px-3 py-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 font-label text-label-md font-semibold text-secondary"><Icon name={p.icon} size={15} /> {p.head}</div>
                    <p className="text-body-sm text-on-surface whitespace-pre-line break-words">{p.body}</p>
                    {p.link && <div className="flex items-center gap-1 font-label text-label-sm text-primary"><Icon name="link" size={13} /> Buka Eviden Uploader</div>}
                    <div className="self-end font-label text-[10px] text-outline">{at}</div>
                  </div>
                );
              })}
              {pings.map((t, i) => (
                <div key={i} className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-surface-container px-3 py-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-label text-label-md font-semibold text-primary"><Icon name="ping" size={15} /> [TEST PING]</div>
                  <p className="text-body-sm text-on-surface">LAKH backend terhubung.</p>
                  <div className="self-end font-label text-[10px] text-outline">{t}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="font-label text-label-sm text-outline">Isi pesan mengikuti format yang dikirim backend. Agenda berstatus Diabaikan tidak dikirimi pengingat.</p>
        </div>
      </div>

      <div className="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-2"><span className="p-2 rounded-lg bg-surface-container-high text-secondary"><Icon name="update" size={20} /></span>
            <div><h2 className="text-headline-md font-bold text-on-surface">Dispatched Notifications History</h2><p className="font-label text-label-sm text-on-surface-variant">Rekaman pengiriman dari tab TELEGRAM_LOG</p></div></div>
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={onlyFailed} onClick={() => setOnlyFailed(v => !v)} className={'px-2.5 py-1.5 rounded font-label text-label-sm ' + (onlyFailed ? 'bg-primary-container text-on-primary font-semibold' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface')}>Hanya gagal{kpi.failed ? ` (${items.filter(i => i.status !== 'Delivered').length})` : ''}</button>
            <button type="button" onClick={exportCsv} disabled={!shown.length} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-surface-container-low font-label text-label-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40"><Icon name="upload" size={14} className="rotate-180" /> Export CSV</button>
            <button type="button" onClick={log.reload} aria-label="Muat ulang riwayat" className="p-1.5 rounded bg-surface-container-low text-on-surface-variant hover:text-on-surface"><Icon name="refresh" size={16} className={log.loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[620px]">
            <thead><tr className="bg-surface-container-low text-outline font-label text-label-sm uppercase tracking-wider">
              <th className="py-2.5 px-3 rounded-l-lg font-semibold">Waktu Kirim</th><th className="py-2.5 px-3 font-semibold">Agenda</th><th className="py-2.5 px-3 font-semibold">Tipe Pesan</th>
              <th className="py-2.5 px-3 font-semibold">Chat ID</th><th className="py-2.5 px-3 rounded-r-lg font-semibold">Status Telegram API</th></tr></thead>
            <tbody className="text-body-sm">
              {shown.map((r, i) => {
                const good = r.status === 'Delivered';
                return (
                  <tr key={r.time + i} className={'hover:bg-surface-container-high/60 ' + (i % 2 ? 'bg-surface-container-low/20' : '')}>
                    <td className="py-3 px-3 font-mono text-outline whitespace-nowrap">{fmtTime(r.time, today)}</td>
                    <td className="py-3 px-3 font-semibold text-on-surface max-w-[260px] truncate" title={r.agenda}>{r.agenda || '—'}</td>
                    <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-surface-container-high font-label text-label-sm text-secondary whitespace-nowrap">{r.type}</span></td>
                    <td className="py-3 px-3 font-mono text-on-surface-variant">{maskChatId(r.chatId)}</td>
                    <td className="py-3 px-3"><span className={'inline-flex items-center gap-1.5 font-label text-label-sm font-semibold ' + (good ? 'text-emerald-400' : 'text-error')} title={r.status}><span className={'w-1.5 h-1.5 rounded-full ' + (good ? 'bg-emerald-400' : 'bg-error')} />{good ? `Delivered (${r.http} OK)` : `Gagal (${r.http})`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {log.loading && !log.data && <div className="flex items-center gap-2 text-outline text-body-sm p-4"><Spinner /> Memuat riwayat...</div>}
          {log.data && !shown.length && <div className="text-center text-outline text-body-sm p-6">{onlyFailed ? 'Tidak ada pengiriman gagal.' : 'Belum ada pesan terkirim.'}</div>}
        </div>
      </div>
    </div>
  );
}
