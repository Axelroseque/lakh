import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Link, navigate, useLocation } from '../lib/router.js';
import { setToken } from '../lib/api.js';

export const NAV = [
  { group: 'Main Menu', items: [
    { to: '/', label: 'Dashboard', icon: 'grid', ready: true },
    { to: '/generator', label: 'Generator Jadwal', icon: 'calendar', ready: true },
    { to: '/eviden', label: 'Eviden Uploader', icon: 'upload', ready: true }
  ] },
  { group: 'Knowledge', items: [
    { to: '/problem-solve', label: 'Problem Solve Tracker', icon: 'bug', ready: true }
  ] },
  { group: 'System & Sync', items: [
    { to: '/gas-trigger', label: 'GAS Trigger Sync', icon: 'sync_alt', ready: true },
    { to: '/telegram', label: 'Telegram Bot', icon: 'bot', ready: true },
    { to: '/pengaturan', label: 'Pengaturan', icon: 'settings', ready: true }
  ] }
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#ff384c] to-[#ff6b7a] text-white flex items-center justify-center font-extrabold text-body-lg shadow-[0_0_18px_rgba(255,56,76,0.45)] border border-rose-300/30">
        L
      </div>
      <div className="flex flex-col">
        <span className="text-headline-md tracking-tight font-extrabold leading-tight text-white flex items-center gap-1.5">
          LAKH
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff384c] shadow-[0_0_8px_rgba(255,56,76,0.8)]" />
        </span>
        <span className="font-label text-[10px] text-slate-400 uppercase tracking-widest font-semibold">PN Kediri Hub</span>
      </div>
    </div>
  );
}

function Sidebar({ open, onClose, path }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={'fixed left-0 top-0 h-screen w-64 bg-[#080b10]/90 backdrop-blur-2xl border-r border-white/[0.07] z-50 flex flex-col justify-between select-none transition-transform duration-200 lg:translate-x-0 shadow-[4px_0_24px_rgba(0,0,0,0.5)] ' + (open ? 'translate-x-0' : '-translate-x-full')}
        aria-label="Navigasi utama"
      >
        <div className="flex flex-col min-h-0">
          <div className="h-16 px-space-md flex items-center justify-between border-b border-white/[0.06] shrink-0">
            <Logo />
            <button type="button" onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white" aria-label="Tutup menu">
              <Icon name="close" size={20} />
            </button>
          </div>
          <nav className="px-3 py-4 space-y-5 overflow-y-auto">
            {NAV.map(g => (
              <div key={g.group} className="space-y-1">
                <div className="px-3 pb-1 font-label text-[10px] uppercase tracking-widest text-slate-500 font-bold">{g.group}</div>
                {g.items.map(it => {
                  const active = it.to === '/' ? path === '/' : path.startsWith(it.to);
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={'flex items-center gap-3 px-3 py-2.5 rounded-xl font-label text-label-lg transition-all ' + (active
                        ? 'bg-gradient-to-r from-[#ff384c] to-[#ff5263] text-white font-bold shadow-[0_0_20px_rgba(255,56,76,0.35)] border border-rose-400/30'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')}
                    >
                      <Icon name={it.icon} size={18} className={active ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
                      <span className="flex-1">{it.label}</span>
                      {!it.ready && !active && <span className="text-[9px] uppercase tracking-wide text-slate-500 px-1.5 py-0.5 rounded bg-white/[0.04]">segera</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div className="p-3 border-t border-white/[0.06] bg-black/40 shrink-0">
          <div className="p-2.5 rounded-xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/25 flex items-center justify-center shrink-0">
                <Icon name="shield" size={16} className="text-sky-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label text-xs text-white font-semibold truncate">MA-RI Network</span>
                <span className="font-label text-[11px] text-slate-400 truncate">PN Kediri Node</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu }) {
  const { path, search } = useLocation();
  const [q, setQ] = useState(search.get('q') || '');
  useEffect(() => { if (path === '/') setQ(search.get('q') || ''); }, [path, search]);

  const submit = e => {
    e.preventDefault();
    const v = q.trim();
    navigate(v ? '/?q=' + encodeURIComponent(v) : '/');
  };

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[#080b10]/85 backdrop-blur-2xl border-b border-white/[0.07] z-30 px-space-md sm:px-space-lg flex items-center justify-between gap-4 shadow-sm">
      <div className="flex items-center gap-space-sm min-w-0">
        <button
          type="button"
          onClick={onMenu}
          className="lg:hidden p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors"
          aria-label="Buka menu"
        >
          <Icon name="menu" size={20} />
        </button>
        <div className="hidden md:flex flex-col min-w-0">
          <span className="font-label text-label-lg font-bold text-white flex items-center gap-2">
            Hi, welcome back!
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff384c] animate-pulse" />
          </span>
          <span className="font-label text-label-sm text-slate-400 truncate">Sistem Telemetri &amp; Otomasi Pengadilan Negeri Kediri</span>
        </div>
      </div>
      <div className="flex items-center gap-space-sm sm:gap-space-md">
        <form onSubmit={submit} className="relative flex items-center w-44 sm:w-64 xl:w-80" role="search">
          <Icon name="search" size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cari solusi, error, modul..."
            aria-label="Cari di knowledge base"
            className="w-full h-10 pl-9 pr-10 rounded-xl bg-black/40 text-white placeholder:text-slate-500 text-body-sm border border-white/[0.08] focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 transition-all shadow-inner"
          />
          <button
            type="submit"
            className="absolute right-1.5 h-7 w-7 rounded-lg bg-[#ff384c] text-white flex items-center justify-center hover:brightness-110 shadow-[0_0_10px_rgba(255,56,76,0.4)] transition-all"
            aria-label="Cari"
          >
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <div className="hidden sm:block h-6 w-px bg-white/[0.08]" />
        <div className="flex items-center gap-space-sm">
          <div className="hidden lg:flex flex-col text-right">
            <span className="font-label text-label-md font-bold text-white">Admin IT Kediri</span>
            <span className="font-label text-label-sm text-[#ff5c6a] font-medium">Level 1 Operator</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/15 flex items-center justify-center shadow-sm">
            <Icon name="person" size={18} className="text-white" />
          </div>
          <button
            type="button"
            onClick={() => setToken('')}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 transition-all"
            title="Keluar"
            aria-label="Keluar"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function Shell({ children }) {
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#060709] text-on-surface relative selection:bg-[#ff384c]/30 selection:text-white">
      <Sidebar open={open} onClose={() => setOpen(false)} path={path} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="pt-16 min-h-screen relative z-10">
          <div className="px-space-md sm:px-space-lg py-space-lg max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
