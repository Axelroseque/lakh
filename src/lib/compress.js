// FR-02: client-side image compression. Everything happens in the browser; only the result is uploaded.

export const TARGET_BYTES = 500 * 1024;          // goal: < 500 KB
export const SERVER_LIMIT_BYTES = 1024 * 1024;   // hard limit enforced by the API / Apps Script
export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // per original file
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export const PROFILES = {
  fhd: { label: '1080p Web-ready', maxEdge: 1920 },
  hd: { label: '720p Mobile Quick', maxEdge: 1280 }
};

const QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54];
const SCALES = [1, 0.85, 0.7, 0.55, 0.4];

export function fitSize(w, h, maxEdge, scale = 1) {
  const s = Math.min(1, maxEdge / Math.max(w, h)) * scale;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Pure plan of what to try, best quality first. Exported for tests. */
export function* attempts(w, h, maxEdge) {
  for (const scale of SCALES) {
    const { width, height } = fitSize(w, h, maxEdge, scale);
    for (const quality of QUALITIES) yield { width, height, quality, scale };
  }
}

const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Gagal membaca berkas'));
    fr.readAsDataURL(blob);
  });
}

export function jpgName(name) {
  return String(name || 'eviden').replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) + '.jpg';
}

/**
 * @returns {{blob:Blob,width:number,height:number,quality:number,originalBytes:number,bytes:number,ms:number,name:string}}
 */
export async function compressImage(file, { maxEdge = PROFILES.fhd.maxEdge, target = TARGET_BYTES } = {}) {
  if (!ACCEPT.includes(file.type)) throw new Error('Format tidak didukung (hanya JPG, PNG, WEBP)');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ukuran asli melebihi 15 MB');
  const t0 = performance.now();

  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Gambar rusak atau tidak bisa dibaca'); }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    let best = null;
    let lastScale = -1, skipScale = false;

    for (const a of attempts(bmp.width, bmp.height, maxEdge)) {
      if (a.scale !== lastScale) { lastScale = a.scale; skipScale = false; }
      if (skipScale) continue;
      canvas.width = a.width;
      canvas.height = a.height;
      ctx.fillStyle = '#fff'; // PNG transparency -> white
      ctx.fillRect(0, 0, a.width, a.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, a.width, a.height);

      const blob = await toBlob(canvas, 'image/jpeg', a.quality);
      if (!blob || blob.type !== 'image/jpeg') throw new Error('Browser tidak bisa mengompres gambar ini');
      if (!best || blob.size < best.blob.size) best = { blob, ...a };
      if (blob.size <= target) break;
      // Far above target at mid quality: lowering quality alone won't help, shrink the canvas instead.
      if (a.quality <= 0.78 && blob.size > target * 3) skipScale = true;
    }

    if (!best || best.blob.size > SERVER_LIMIT_BYTES) throw new Error('Tidak bisa dikompres di bawah 1 MB');
    return {
      blob: best.blob, width: best.width, height: best.height, quality: best.quality,
      originalBytes: file.size, bytes: best.blob.size, ms: Math.round(performance.now() - t0), name: jpgName(file.name)
    };
  } finally {
    bmp.close && bmp.close();
  }
}
