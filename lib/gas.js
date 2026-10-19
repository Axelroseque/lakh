import { HttpError } from './http.js';

/**
 * Calls the Apps Script web app. `action` and `key` are applied LAST so a
 * caller-supplied field can never override them.
 * Only idempotent reads may pass {retry:true}; writes are never retried.
 */
export async function callGas(action, params = {}, { retry = false } = {}) {
  const url = process.env.LAKH_GAS_URL;
  const key = process.env.LAKH_GAS_KEY;
  if (!url || !key) throw new HttpError(500, 'Server is not configured (LAKH_GAS_URL / LAKH_GAS_KEY)');

  const timeout = Number(process.env.LAKH_GAS_TIMEOUT_MS) || 25000;
  const payload = JSON.stringify({ ...params, action, key });
  const attempts = retry ? 2 : 1;
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    try {
      // text/plain avoids a CORS preflight; Apps Script answers POST with a 302 that fetch follows.
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout)
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch {
        throw new HttpError(502, 'Apps Script returned a non-JSON response (check the deployment: Execute as Me, Access Anyone)');
      }
      if (json && json.ok) return json.data;

      const code = Number(json && json.code) || 500;
      const msg = (json && json.error) || 'Apps Script error';
      if (code === 401) throw new HttpError(502, 'Apps Script rejected the key (LAKH_GAS_KEY does not match AUTH_TOKEN)');
      if (code >= 400 && code < 500) throw new HttpError(code, msg);
      throw new HttpError(502, 'Apps Script error: ' + msg);
    } catch (err) {
      if (err instanceof HttpError) {
        // upstream 5xx is the only HttpError worth retrying
        if (err.code === 502 && i < attempts - 1 && /Apps Script error:/.test(err.message)) { lastErr = err; continue; }
        throw err;
      }
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        lastErr = new HttpError(504, 'Apps Script timed out');
      } else {
        lastErr = new HttpError(502, 'Cannot reach Apps Script');
      }
      if (i === attempts - 1) throw lastErr;
    }
  }
  throw lastErr;
}
