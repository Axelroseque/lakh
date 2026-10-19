import { useState } from 'react';
import Icon from './Icon.jsx';
import { api, setToken } from '../lib/api.js';
import { Spinner } from './ui.jsx';

export default function Login() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      await api.ping(t); // verifies the token against the API before storing it
      setToken(t);
    } catch (err) {
      setError(err.status === 401 ? 'Token akses tidak valid atau salah.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060709] flex items-center justify-center p-4 relative overflow-hidden selection:bg-[#ff384c]/30 selection:text-white">
      {/* Volumetric ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-radial from-[#ff384c]/15 via-[#38bdf8]/05 to-transparent rounded-full blur-3xl pointer-events-none" />

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md backdrop-blur-2xl bg-[#0b0e16]/85 border border-white/[0.09] shadow-[0_24px_70px_rgba(0,0,0,0.8)] rounded-3xl p-8 space-y-6"
      >
        {/* Card subtle top highlight */}
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        <div className="flex items-center gap-3.5 pb-5 border-b border-white/[0.06]">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#ff384c] to-[#ff6b7a] text-white flex items-center justify-center font-extrabold text-xl shadow-[0_0_24px_rgba(255,56,76,0.45)] border border-rose-300/30 shrink-0">
            L
          </div>
          <div className="min-w-0">
            <div className="text-xl font-extrabold tracking-tight text-white leading-tight flex items-center gap-2">
              LAKH
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-300">
                v1.1
              </span>
            </div>
            <div className="font-label text-xs text-slate-400 uppercase tracking-wider mt-0.5 font-semibold">
              PN Kediri LLK &amp; Telemetri Hub
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="token" className="font-label text-xs uppercase tracking-wider text-slate-400 font-bold block">
            Token Akses Aplikasi
          </label>
          <div className="relative">
            <Icon name="lock" size={18} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Masukkan LAKH_APP_TOKEN..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-black/50 text-white placeholder:text-slate-500 text-sm border border-white/[0.09] focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 transition-all shadow-inner"
            />
          </div>
          <div className="bg-black/30 border border-white/[0.04] rounded-xl p-2.5 text-[11px] text-slate-400 leading-relaxed font-label">
            Token disimpan di browser lokal ini dan diotentikasi ke API serverless pada setiap request.
          </div>
        </div>

        {error && (
          <div role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
            <Icon name="error" size={16} className="text-[#ff4d5a] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-[#ff384c] to-[#ff2b40] text-white font-label font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 shadow-[0_0_24px_rgba(255,43,64,0.4)] hover:shadow-[0_0_32px_rgba(255,43,64,0.6)] disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] cursor-pointer"
        >
          {busy ? <Spinner /> : <Icon name="arrow" size={18} />} Masuk ke Dashboard
        </button>

        <div className="pt-2 flex items-center justify-between text-[11px] font-label text-slate-500 border-t border-white/[0.05]">
          <span className="flex items-center gap-1.5">
            <Icon name="shield" size={14} className="text-sky-400" /> Pengadilan Negeri Kediri
          </span>
          <span className="font-mono">Node ID: MA-KDR-01</span>
        </div>
      </form>
    </div>
  );
}
