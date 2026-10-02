// Primitives de chiffrement. Uniquement WebCrypto : aucune dépendance, tout reste sur l'appareil.
// Schéma : une clé de données (DEK) aléatoire chiffre le coffre (AES-256-GCM).
// La DEK est elle-même chiffrée deux fois : par une clé dérivée du mot de passe maître
// (PBKDF2-SHA256) et par une clé dérivée de la clé de récupération.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITER = 600000;
const RECOVERY_ITER = 10000; // la clé de récupération fait 160 bits : pas besoin de plus
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const b64 = {
  enc(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
};

export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export function randInt(max) {
  // Entier uniforme dans [0, max) sans biais de modulo.
  const lim = Math.floor(0x100000000 / max) * max;
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % max;
}

const norm = (s) => s.normalize('NFKC');

async function pbkdf2(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function seal(key, bytes) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

async function open(key, box) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(box.iv) }, key, b64.dec(box.ct)));
}

const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
export const exportDek = async (dek) => b64.enc(await crypto.subtle.exportKey('raw', dek));
export const loadDek = (str) => importDek(b64.dec(str));

export function newRecoveryKey() {
  const bytes = rand(20);
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join('-');
}

const cleanRecovery = (k) => k.toUpperCase().replace(/[^A-Z2-7]/g, '');

export async function createEnvelope(master, plainData) {
  const dekRaw = rand(32);
  const dek = await importDek(dekRaw);
  const salt = rand(16), rsalt = rand(16);
  const recoveryKey = newRecoveryKey();
  const kek = await pbkdf2(norm(master), salt, KDF_ITER);
  const rkek = await pbkdf2(cleanRecovery(recoveryKey), rsalt, RECOVERY_ITER);
  const envelope = {
    app: 'never-forget', v: 1, rev: 0, created: Date.now(),
    kdf: { iter: KDF_ITER, salt: b64.enc(salt) },
    master: await seal(kek, dekRaw),
    recovery: { iter: RECOVERY_ITER, salt: b64.enc(rsalt), ...(await seal(rkek, dekRaw)) },
    data: null
  };
  envelope.data = await encryptData(dek, plainData);
  return { envelope, dek, recoveryKey };
}

export async function encryptData(dek, plainData) {
  return seal(dek, enc.encode(JSON.stringify(plainData)));
}

export async function decryptData(dek, envelope) {
  return JSON.parse(dec.decode(await open(dek, envelope.data)));
}

export async function unlockWithMaster(envelope, master) {
  try {
    const kek = await pbkdf2(norm(master), b64.dec(envelope.kdf.salt), envelope.kdf.iter);
    return await importDek(await open(kek, envelope.master));
  } catch {
    throw new Error('BAD_PASSWORD');
  }
}

export async function unlockWithRecovery(envelope, recoveryKey) {
  try {
    const r = envelope.recovery;
    const rkek = await pbkdf2(cleanRecovery(recoveryKey), b64.dec(r.salt), r.iter);
    return await importDek(await open(rkek, r));
  } catch {
    throw new Error('BAD_RECOVERY');
  }
}

// Remplace le mot de passe maître (et son sel) sans toucher aux données.
export async function rewrapMaster(envelope, dek, newMaster) {
  const salt = rand(16);
  const kek = await pbkdf2(norm(newMaster), salt, KDF_ITER);
  const raw = b64.dec(await exportDek(dek));
  return { ...envelope, kdf: { iter: KDF_ITER, salt: b64.enc(salt) }, master: await seal(kek, raw) };
}
