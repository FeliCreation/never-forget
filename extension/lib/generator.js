import { randInt } from './crypto.js';

const SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?'
};
const AMBIGUOUS = { upper: 'IO', lower: 'l', digits: '01' };

export const defaultGen = { length: 20, upper: true, lower: true, digits: true, symbols: true, ambiguous: false };

export function generatePassword(opts = {}) {
  const o = { ...defaultGen, ...opts };
  const pools = [];
  for (const k of ['upper', 'lower', 'digits', 'symbols']) {
    if (!o[k]) continue;
    pools.push(o.ambiguous ? SETS[k] + (AMBIGUOUS[k] || '') : SETS[k]);
  }
  if (!pools.length) pools.push(SETS.lower);
  const length = Math.min(128, Math.max(Math.max(4, pools.length), o.length | 0));
  const all = pools.join('');
  const out = [];
  // Au moins un caractère de chaque famille choisie, puis on complète.
  for (const p of pools) out.push(p[randInt(p.length)]);
  while (out.length < length) out.push(all[randInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
