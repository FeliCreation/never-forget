// Stockage du coffre. Utilisé par la page principale, la popup et le service worker.
// - Le coffre chiffré vit dans chrome.storage.local.
// - La clé de données déverrouillée vit dans chrome.storage.session : en mémoire seulement,
//   effacée à la fermeture du navigateur, inaccessible aux scripts de contenu.
import * as C from './crypto.js';

const K_ENV = 'nf_vault';
const K_SESS = 'nf_session';
const K_SET = 'nf_settings';

export const defaultSettings = {
  autoLockMin: 15,
  theme: 'auto',
  accent: '#0071E3',
  clipboardClearSec: 30,
  neverSave: [],
  gen: { length: 20, upper: true, lower: true, digits: true, symbols: true, ambiguous: false }
};

const local = () => chrome.storage.local;
const sess = () => chrome.storage.session;

export async function getEnvelope() {
  return (await local().get(K_ENV))[K_ENV] || null;
}
export const hasVault = async () => !!(await getEnvelope());

export async function getSettings() {
  const s = (await local().get(K_SET))[K_SET] || {};
  return { ...defaultSettings, ...s, gen: { ...defaultSettings.gen, ...(s.gen || {}) } };
}
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await local().set({ [K_SET]: next });
  return next;
}

// ---- Session ---------------------------------------------------------------

async function getSession() {
  const s = (await sess().get(K_SESS))[K_SESS];
  if (!s) return null;
  const { autoLockMin } = await getSettings();
  if (autoLockMin > 0 && Date.now() - s.last > autoLockMin * 60000) {
    await lock();
    return null;
  }
  return s;
}

export async function isUnlocked() {
  return !!(await getSession());
}

export async function lock() {
  await sess().remove(K_SESS);
}

async function startSession(dek) {
  await sess().set({ [K_SESS]: { dek: await C.exportDek(dek), last: Date.now() } });
}

export async function touch() {
  const s = await getSession();
  if (s) await sess().set({ [K_SESS]: { ...s, last: Date.now() } });
}

// ---- Création / déverrouillage --------------------------------------------

export async function setup(master) {
  if (await hasVault()) throw new Error('VAULT_EXISTS');
  const { envelope, dek, recoveryKey } = await C.createEnvelope(master, { items: [] });
  await local().set({ [K_ENV]: envelope });
  await startSession(dek);
  return { recoveryKey };
}

export async function unlock(master) {
  const env = await getEnvelope();
  if (!env) throw new Error('NO_VAULT');
  await startSession(await C.unlockWithMaster(env, master));
}

// Récupération : déverrouille avec la clé de récupération puis impose un nouveau mot de passe maître.
export async function recover(recoveryKey, newMaster) {
  const env = await getEnvelope();
  if (!env) throw new Error('NO_VAULT');
  const dek = await C.unlockWithRecovery(env, recoveryKey);
  const next = await C.rewrapMaster(env, dek, newMaster);
  await local().set({ [K_ENV]: { ...next, rev: (env.rev || 0) + 1 } });
  await startSession(dek);
}

export async function changeMaster(oldMaster, newMaster) {
  const env = await getEnvelope();
  const dek = await C.unlockWithMaster(env, oldMaster); // vérifie l'ancien mot de passe
  const next = await C.rewrapMaster(env, dek, newMaster);
  await local().set({ [K_ENV]: { ...next, rev: (env.rev || 0) + 1 } });
}

// ---- Lecture / écriture ----------------------------------------------------

export async function read() {
  const s = await getSession();
  if (!s) throw new Error('LOCKED');
  const env = await getEnvelope();
  const dek = await C.loadDek(s.dek);
  const data = await C.decryptData(dek, env);
  await touch();
  return data;
}

// Lit, applique `fn(data)`, rechiffre avec un IV neuf, écrit. Réessaie si une autre fenêtre a écrit entre-temps.
export async function mutate(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = await getSession();
    if (!s) throw new Error('LOCKED');
    const env = await getEnvelope();
    const dek = await C.loadDek(s.dek);
    const data = await C.decryptData(dek, env);
    const result = await fn(data);
    const data2 = await C.encryptData(dek, data);
    const cur = await getEnvelope();
    if ((cur.rev || 0) !== (env.rev || 0)) continue;
    await local().set({ [K_ENV]: { ...cur, data: data2, rev: (cur.rev || 0) + 1 } });
    await touch();
    return result;
  }
  throw new Error('CONFLICT');
}

// ---- Sauvegarde ------------------------------------------------------------

// Le fichier de sauvegarde est simplement l'enveloppe chiffrée : sûr à stocker n'importe où.
export async function exportBackup() {
  const s = await getSession();
  if (!s) throw new Error('LOCKED');
  return JSON.stringify(await getEnvelope());
}

// Déchiffre une sauvegarde avec son mot de passe maître et renvoie ses données.
export async function readBackup(text, master) {
  let env;
  try { env = JSON.parse(text); } catch { throw new Error('BAD_FILE'); }
  if (env.app !== 'never-forget' || !env.data) throw new Error('BAD_FILE');
  const dek = await C.unlockWithMaster(env, master);
  return C.decryptData(dek, env);
}

// Fusionne des éléments importés : ignore ceux qui existent déjà (même type, site, identifiant).
export function mergeItems(data, incoming) {
  const key = (i) => [i.type, i.url || i.name, i.username || ''].join('|').toLowerCase();
  const have = new Set(data.items.map(key));
  let added = 0, dup = 0;
  for (const it of incoming) {
    if (have.has(key(it))) { dup++; continue; }
    have.add(key(it));
    data.items.push(it);
    added++;
  }
  return { added, dup };
}

export async function wipe() {
  await local().remove([K_ENV]);
  await lock();
}
