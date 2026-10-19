import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs `fn` on mount and whenever `deps` change; keeps the previous data while reloading. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState(s => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(fn)
      .then(
        data => { if (id === seq.current) setState({ data, error: null, loading: false }); return data; },
        error => { if (id === seq.current) setState(s => ({ data: s.data, error, loading: false })); }
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
