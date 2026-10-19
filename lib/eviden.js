import { HttpError } from './http.js';

export const MAX_BYTES = 1024 * 1024; // PRD: < 1 MB after client-side compression

/** Validates a Base64 image (JPEG/PNG/WEBP by magic bytes). Returns the clean base64 + byte size. */
export function checkImage(b64raw) {
  let b64 = String(b64raw ?? '').trim();
  const m = /^data:([\w/+.-]+);base64,/i.exec(b64);
  if (m) b64 = b64.slice(m[0].length);
  b64 = b64.replace(/\s+/g, '');
  if (!b64) throw new HttpError(400, 'base64 is required');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, 'base64 is not valid');

  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_BYTES) throw new HttpError(413, 'File exceeds 1024 KB after compression');
  if (bytes < 16) throw new HttpError(400, 'File is empty or corrupt');

  const head = Buffer.from(b64.slice(0, 24), 'base64');
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new HttpError(415, 'Only JPEG, PNG or WEBP images are accepted');
  return { base64: b64, bytes, mimeType: isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp' };
}
