// Analyse de santé du coffre + vérification de fuites (k-anonymité, haveibeenpwned.com).
import { strength } from './strength.js';

const YEAR = 365 * 86400000;

export function analyze(items, now = Date.now()) {
  const logins = items.filter((i) => (i.type === 'login' || i.type === 'wifi') && i.password);
  const byPw = new Map();
  for (const i of logins) byPw.set(i.password, (byPw.get(i.password) || 0) + 1);
  const issues = new Map(); // id -> [{kind, text}]
  const add = (i, kind, text) => { if (!issues.has(i.id)) issues.set(i.id, []); issues.get(i.id).push({ kind, text }); };
  const c = { breached: 0, reused: 0, weak: 0, old: 0 };
  for (const i of logins) {
    if (i.breach && i.breach.count > 0 && i.breach.at >= (i.pwChanged || 0)) { c.breached++; add(i, 'breached', `Exposé dans ${i.breach.count.toLocaleString('fr-FR')} fuites`); }
    const n = byPw.get(i.password);
    if (n > 1) { c.reused++; add(i, 'reused', `Réutilisé sur ${n} éléments`); }
    const s = strength(i.password);
    if (s.score <= 2) { c.weak++; add(i, 'weak', `${s.label} · ${i.password.length} caractères`); }
    if (now - (i.pwChanged || i.created || now) > YEAR) { c.old++; add(i, 'old', 'Inchangé depuis plus d\'un an'); }
  }
  const n = logins.length;
  let score = null;
  if (n) {
    const pen = 60 * (c.breached / n) + 45 * (c.weak / n) + 30 * (c.reused / n) + 10 * (c.old / n);
    score = Math.max(0, Math.round(100 - pen * 1.4));
  }
  return { n, score, counts: c, issues, risky: new Set(issues.keys()) };
}

async function sha1Hex(text) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Ne transmet que les 5 premiers caractères de l'empreinte SHA-1 ; la comparaison se fait ici.
export async function breachCount(password, cache = new Map(), fetchFn = fetch) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5), suffix = hash.slice(5);
  if (!cache.has(prefix)) {
    const res = await fetchFn('https://api.pwnedpasswords.com/range/' + prefix, { headers: { 'Add-Padding': 'true' } });
    if (!res.ok) throw new Error('HIBP ' + res.status);
    cache.set(prefix, await res.text());
  }
  for (const line of cache.get(prefix).split(/\r?\n/)) {
    const [s, n] = line.split(':');
    if (s === suffix) return Number(n) || 0;
  }
  return 0;
}
