import { useEffect, useSyncExternalStore } from 'react';
import { setToken } from './api.js';

// Per-browser preferences (not secrets). Storage may be blocked, so everything has an in-memory fallback.
const KEY = 'lakh.prefs';
export const PREF_DEFAULTS = { idleLogout: false, idleMinutes: 30 };
export const IDLE_CHOICES = [15, 30, 60];
const listeners = new Set();

function read() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p === 'object') {
      return { idleLogout: p.idleLogout === true, idleMinutes: IDLE_CHOICES.includes(p.idleMinutes) ? p.idleMinutes : PREF_DEFAULTS.idleMinutes };
    }
  } catch { /* unreadable or blocked */ }
  return { ...PREF_DEFAULTS };
}
let current = read();

export const getPrefs = () => current;
export function setPrefs(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach(f => f());
}
export function usePrefs() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, getPrefs);
}

/** Signs the operator out after `minutes` without any interaction. */
export function useIdleLogout() {
  const { idleLogout, idleMinutes } = usePrefs();
  useEffect(() => {
    if (!idleLogout) return undefined;
    let t;
    const arm = () => { clearTimeout(t); t = setTimeout(() => setToken(''), idleMinutes * 60000); };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    evs.forEach(e => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => { clearTimeout(t); evs.forEach(e => window.removeEventListener(e, arm)); };
  }, [idleLogout, idleMinutes]);
}
