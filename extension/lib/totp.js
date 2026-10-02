// Codes à usage unique (RFC 6238) : HMAC-SHA1, 30 s, 6 chiffres par défaut.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Secret TOTP invalide');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

// Accepte un secret brut ou une URI otpauth://totp/...?secret=...&period=...&digits=...
export function parseTotpInput(input) {
  const s = (input || '').trim();
  if (!s) return null;
  if (/^otpauth:\/\//i.test(s)) {
    const u = new URL(s);
    return {
      secret: (u.searchParams.get('secret') || '').replace(/\s/g, ''),
      period: Number(u.searchParams.get('period')) || 30,
      digits: Number(u.searchParams.get('digits')) || 6
    };
  }
  return { secret: s.replace(/\s/g, ''), period: 30, digits: 6 };
}

export async function totp(input, nowMs = Date.now()) {
  const p = parseTotpInput(input);
  if (!p || !p.secret) return null;
  const key = await crypto.subtle.importKey('raw', base32Decode(p.secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = Math.floor(nowMs / 1000 / p.period);
  const msg = new ArrayBuffer(8);
  const dv = new DataView(msg);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  const code = String(bin % 10 ** p.digits).padStart(p.digits, '0');
  const left = p.period - (Math.floor(nowMs / 1000) % p.period);
  return { code, left, period: p.period };
}
