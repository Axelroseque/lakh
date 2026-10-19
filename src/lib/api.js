// Browser -> Vercel API (same origin). The Apps Script key never reaches this code.
import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'lakh.token';
const BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || '';
const listeners = new Set();

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  memoryToken = t || '';
  listeners.forEach(f => f());
}
let memoryToken = getToken(); // fallback when storage is blocked
export function useToken() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => getToken() || memoryToken
  );
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function request(method, path, { body, query, token, timeout = 35000 } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : '';
  let res;
  try {
    res = await fetch(`${BASE}/api${path}${qs}`, {
      method,
      headers: {
        Authorization: 'Bearer ' + (token ?? (getToken() || memoryToken)),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    throw new ApiError(0, e && e.name === 'TimeoutError' ? 'Server tidak merespons tepat waktu' : 'Tidak bisa terhubung ke server');
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!json) throw new ApiError(res.status, 'Respons API tidak valid (HTTP ' + res.status + '). Pastikan folder api/ ikut ter-deploy.');
  if (!json.ok) {
    if (res.status === 401 && token === undefined) setToken('');
    throw new ApiError(res.status, json.error || 'Terjadi kesalahan');
  }
  return json.data;
}

export const api = {
  ping: token => request('GET', '/ping', { token }),
  stats: () => request('GET', '/stats'),
  aiStatus: () => request('GET', '/ai/status'),
  scheduleGet: date => request('GET', '/schedule', { query: { date } }),
  scheduleSave: (date, items) => request('PUT', '/schedule', { body: { date, items } }),
  scheduleUpdate: (id, patch) => request('PATCH', '/schedule/' + encodeURIComponent(id), { body: patch }),
  generate: (prompt, date) => request('POST', '/schedule/generate', { body: { prompt, date }, timeout: 15000 }),
  evidenUpload: payload => request('POST', '/eviden', { body: payload, timeout: 60000 }),
  kbList: (q = {}) => request('GET', '/kb', { query: q }),
  opsLog: (limit = 50) => request('GET', '/ops/log', { query: { limit } }),
  telegramTest: () => request('POST', '/ops/telegram-test', { body: {} }),
  cronPulse: dryRun => request('POST', '/ops/cron-pulse', { body: { dryRun: !!dryRun } }),
  flushCache: () => request('POST', '/ops/flush-cache', { body: {} }),
  kbSave: payload => request('POST', '/kb', { body: payload }),
  telegramStatus: () => request('GET', '/telegram/status'),
  telegramLog: (limit = 100) => request('GET', '/telegram/log', { query: { limit } }),
  settings: () => request('GET', '/settings'),
  saveSettings: patch => request('PUT', '/settings', { body: patch }),
  kbSearch: (q, tag) => request('GET', '/kb/search', { query: { q, tag, limit: 20 } })
};
