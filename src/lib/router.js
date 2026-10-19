// Tiny History-API router (two real pages, the rest are placeholders), so no extra dependency is needed.
import { createElement, useSyncExternalStore } from 'react';

const listeners = new Set();
const notify = () => listeners.forEach(f => f());
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', to);
  notify();
  window.scrollTo(0, 0);
}

export function useLocation() {
  const href = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => location.pathname + location.search
  );
  const i = href.indexOf('?');
  return { path: i < 0 ? href : href.slice(0, i), search: new URLSearchParams(i < 0 ? '' : href.slice(i)) };
}

export function Link({ to, onClick, children, ...rest }) {
  return createElement('a', {
    href: to,
    ...rest,
    onClick: e => {
      onClick && onClick(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    }
  }, children);
}
