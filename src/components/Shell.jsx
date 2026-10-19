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
  { group: 'System', items: [
    { to: '/gas-trigger', label: 'GAS Trigger Sync', icon: 'sync_alt', ready: true },
    { to: '/telegram', label: 'Telegram Bot', icon: 'bot', ready: true },
    { to: '/pengaturan', label: 'Pengaturan', icon: 'settings', ready: true }
  ] }
];

function Logo() {
  return (
    <div className="flex items-center gap-space-sm">
      <div className="h-8 w-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-extrabold text-body-lg">L</div>
      <div className="flex flex-col">
        <span className="text-headline-md tracking-tight font-bold leading-tight">LAKH</span>
        <span className="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">PN Kediri Hub</span>
      </div>
    </div>
  );
}

function Sidebar({ open, onClose, path }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={'fixed left-0 top-0 h-screen w-64 bg-surface-container-lowest border-r border-outline-variant/30 z-50 flex flex-col justify-between select-none transition-transform duration-200 lg:translate-x-0 ' + (open ? 'translate-x-0' : '-translate-x-full')}
        aria-label="Navigasi utama"
      >
        <div className="flex flex-col min-h-0">
          <div className="h-16 px-space-md flex items-center justify-between border-b border-outline-variant/20 shrink-0">
            <Logo />
            <button type="button" onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high" aria-label="Tutup menu">
              <Icon name="close" size={20} />
            </button>
          </div>
          <nav className="px-space-sm py-space-md space-y-space-md overflow-y-auto">
            {NAV.map(g => (
              <div key={g.group} className="space-y-1">
                <div className="px-space-sm pb-1 font-label text-label-sm uppercase tracking-wider text-outline font-semibold">{g.group}</div>
                {g.items.map(it => {
                  const active = it.to === '/' ? path === '/' : path.startsWith(it.to);
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={'flex items-center gap-space-sm px-space-sm py-2 rounded-lg font-label text-label-lg transition-colors ' + (active
                        ? 'bg-primary-container text-on-primary font-bold shadow-[0_0_12px_rgba(255,83,88,0.25)]'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface')}
                    >
                      <Icon name={it.icon} size={20} />
                      <span className="flex-1">{it.label}</span>
                      {!it.ready && !active && <span className="text-[9px] uppercase tracking-wide text-outline">segera</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div className="p-space-sm border-t border-outline-variant/20 bg-surface-container-low/50 shrink-0">
          <div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between border border-outline-variant/30">
            <div className="flex items-center gap-2">
              <Icon name="shield" size={18} className="text-secondary" />
              <div className="flex flex-col">
                <span className="font-label text-label-sm text-on-surface font-semibold">MA-RI Network</span>
                <span className="font-label text-label-sm text-on-surface-variant">PN Kediri Node</span>
              </div>
            </div>
            <Icon name="lock" size={16} className="text-primary-container" />
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
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/20 z-30 px-space-md sm:px-space-lg flex items-center justify-between gap-3">
      <div className="flex items-center gap-space-sm min-w-0">
        <button type="button" onClick={onMenu} className="lg:hidden p-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface-variant" aria-label="Buka menu">
          <Icon name="menu" size={20} />
        </button>
        <div className="hidden md:flex flex-col min-w-0">
          <span className="font-label text-label-lg font-semibold">Hi, welcome back!</span>
          <span className="font-label text-label-sm text-on-surface-variant truncate">Sistem Telemetri &amp; Otomasi Pengadilan Negeri Kediri</span>
        </div>
      </div>
      <div className="flex items-center gap-space-sm sm:gap-space-md">
        <form onSubmit={submit} className="relative flex items-center w-40 sm:w-64 xl:w-80" role="search">
          <Icon name="search" size={18} className="absolute left-3 text-outline pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cari solusi, error, modul..."
            aria-label="Cari di knowledge base"
            className="w-full h-10 pl-9 pr-10 rounded-lg bg-surface-container text-on-surface placeholder:text-outline/70 text-body-sm border border-outline-variant/40 focus:outline-none focus:border-primary-container transition-colors"
          />
          <button type="submit" className="absolute right-1.5 h-7 w-7 rounded bg-primary-container text-on-primary flex items-center justify-center hover:bg-primary-container/90" aria-label="Cari">
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <div className="hidden sm:block h-6 w-px bg-outline-variant/30" />
        <div className="flex items-center gap-space-sm">
          <div className="hidden lg:flex flex-col text-right">
            <span className="font-label text-label-md font-semibold">Admin IT Kediri</span>
            <span className="font-label text-label-sm text-primary">Level 1 Operator</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Icon name="person" size={18} className="text-on-primary" />
          </div>
          <button
            type="button"
            onClick={() => setToken('')}
            className="p-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
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
    <div className="min-h-screen bg-background text-on-surface">
      <Sidebar open={open} onClose={() => setOpen(false)} path={path} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="pt-16 min-h-screen">
          <div className="px-space-md sm:px-space-lg py-space-lg">{children}</div>
        </main>
      </div>
    </div>
  );
}
