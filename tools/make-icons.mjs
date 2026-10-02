// Génère les icônes PNG de l'extension sans dépendance. Lancer : node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
mkdirSync(out, { recursive: true });

const inRound = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

function shade(u, v) {
  // renvoie [r,g,b,a] pour le point (u,v) dans [0,1]²
  if (!inRound(u, v, 0, 0, 1, 1, 0.23)) return [0, 0, 0, 0];
  let c = [10 + 20 * v, 132 - 40 * v, 255 - 30 * v]; // dégradé bleu
  const body = inRound(u, v, 0.26, 0.47, 0.74, 0.79, 0.07);
  const d = Math.hypot(u - 0.5, v - 0.47);
  const shackle = (v <= 0.47 && d <= 0.2 && d >= 0.115) || (v > 0.47 && v < 0.5 && ((Math.abs(u - 0.5 - 0.1575) < 0.0425) || (Math.abs(u - 0.5 + 0.1575) < 0.0425)));
  if (body || shackle) c = [255, 255, 255];
  const key = Math.hypot(u - 0.5, v - 0.6) <= 0.045 || (Math.abs(u - 0.5) < 0.016 && v >= 0.6 && v <= 0.7);
  if (body && key) c = [20, 100, 230];
  return [...c, 255];
}

function png(size) {
  const S = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const [pr, pg, pb, pa] = shade((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round(a / (S * S));
    }
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const cs = Buffer.alloc(4); cs.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, cs]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(join(out, `icon${s}.png`), png(s));
console.log('Icônes générées dans', out);
