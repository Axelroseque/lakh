import { HttpError } from './http.js';
import { extractJson, normalizeSchedule } from './schedule.js';

const SYSTEM = `Kamu adalah asisten penyusun jadwal kerja harian (LLK) seorang teknisi IT di Pengadilan Negeri.
Ubah uraian pengguna menjadi jadwal harian.
ATURAN:
- Balas HANYA dengan JSON array, tanpa teks lain, tanpa markdown.
- Setiap elemen: {"start":"HH:MM","end":"HH:MM","task":"uraian singkat","evidenRequired":true|false}
- Jam kerja 07:30 sampai 16:00. Jangan keluar dari rentang ini.
- Istirahat/Ishoma 12:00-13:00: sertakan {"start":"12:00","end":"13:00","task":"Ishoma","skip":true}.
- Slot tidak boleh tumpang tindih dan harus berurutan.
- Pertahankan jam yang disebut pengguna; bagi sisa waktu secara wajar.
- Gunakan Bahasa Indonesia baku, uraian maksimal 120 karakter.`;

function aiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.AI_API_KEY) headers.Authorization = 'Bearer ' + process.env.AI_API_KEY;
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

/** Cheap liveness probe for the dashboard. Never throws: offline is a normal answer. */
export async function aiStatus() {
  const url = process.env.AI_URL;
  const model = process.env.AI_MODEL || 'qwen';
  if (!url) return { configured: false, online: false, model, limitMs: 10000 };
  const t0 = Date.now();
  try {
    const r = await fetch(url.replace(/\/chat\/completions\/?$/, '/models'), {
      headers: aiHeaders(),
      signal: AbortSignal.timeout(3000)
    });
    return { configured: true, online: r.ok, ms: Date.now() - t0, model, limitMs: 10000 };
  } catch {
    return { configured: true, online: false, ms: null, model, limitMs: 10000 };
  }
}

export async function generateSchedule(prompt, date) {
  const url = process.env.AI_URL;
  if (!url) throw new HttpError(500, 'Server is not configured (AI_URL)');

  const headers = aiHeaders();

  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'qwen',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: (date ? `Tanggal: ${date}\n` : '') + prompt }
        ]
      }),
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS) || 9000)
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new HttpError(504, 'AI did not answer in time');
    throw new HttpError(502, 'Cannot reach the AI server');
  }
  if (!r.ok) throw new HttpError(502, 'AI server error (HTTP ' + r.status + ')');

  let content;
  try {
    const j = await r.json();
    content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  } catch { /* handled below */ }
  const parsed = extractJson(content);
  if (parsed == null) throw new HttpError(502, 'AI answer is not valid JSON, try again');

  const { items, warnings } = normalizeSchedule(parsed);
  if (!items.length) throw new HttpError(502, 'AI returned no usable schedule' + (warnings[0] ? ': ' + warnings[0] : ''));
  return { items, warnings, aiMs: Date.now() - t0 };
}
