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
      setError(err.status === 401 ? 'Token salah.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-space-md">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface-container-low rounded-xl shadow-xl p-space-lg space-y-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="h-10 w-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-extrabold text-body-lg">L</div>
          <div>
            <div className="text-headline-md font-bold leading-tight">LAKH</div>
            <div className="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">PN Kediri Hub</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="token" className="font-label text-label-md uppercase tracking-wider text-outline">Token Akses</label>
          <div className="relative">
            <Icon name="lock" size={16} className="absolute left-3 top-3 text-outline" />
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="LAKH_APP_TOKEN"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-lowest text-on-surface text-body-md border border-outline-variant/40 focus:outline-none focus:border-primary-container"
            />
          </div>
          <p className="text-body-sm text-outline">Token disimpan di browser ini saja dan dikirim ke API Vercel pada setiap permintaan.</p>
        </div>
        {error && <div role="alert" className="text-body-sm text-error bg-error-container/40 rounded-lg px-3 py-2">{error}</div>}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full h-10 rounded-lg bg-primary-container text-on-primary font-label text-label-lg flex items-center justify-center gap-2 hover:bg-primary-container/90 disabled:opacity-50"
        >
          {busy ? <Spinner /> : <Icon name="arrow" />} Masuk
        </button>
      </form>
    </div>
  );
}
