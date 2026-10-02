// Estimation de robustesse volontairement prudente (heuristique, pas une garantie).

const COMMON = new Set(('password motdepasse azerty qwerty qwertz azertyuiop 123456 1234567 12345678 123456789 1234567890 111111 000000 ' +
  'abc123 iloveyou admin welcome login letmein monkey dragon football soleil bonjour marseille doudou chouchou ' +
  'master superman princess sunshine shadow trustno1 passw0rd p@ssw0rd changeme secret user test').split(' '));
const SEQ = ['abcdefghijklmnopqrstuvwxyz', 'azertyuiop', 'qsdfghjklm', 'qwertyuiop', 'asdfghjkl', '0123456789'];

export function entropyBits(pw) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 2));

  // Caractères répétés : on ne compte que les caractères distincts à plein tarif.
  const distinct = new Set(pw).size;
  bits *= 0.5 + 0.5 * (distinct / pw.length);

  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[0-9!@#$%^&*._-]+$/g, '').replace(/@/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/\$/g, 's');
  if (COMMON.has(lower) || COMMON.has(stripped)) return Math.min(bits, 12);
  for (const s of SEQ) {
    for (let i = 0; i + 4 <= s.length; i++) {
      const chunk = s.slice(i, i + 4);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(''))) { bits -= 8; break; }
    }
  }
  if (/^\d+$/.test(pw)) bits = Math.min(bits, pw.length * 3.3);
  return Math.max(0, bits);
}

export function strength(pw) {
  const bits = entropyBits(pw);
  let score, label;
  if (!pw) { score = 0; label = '—'; }
  else if (bits < 28) { score = 1; label = 'Très faible'; }
  else if (bits < 45) { score = 2; label = 'Faible'; }
  else if (bits < 64) { score = 3; label = 'Correct'; }
  else if (bits < 90) { score = 4; label = 'Fort'; }
  else { score = 5; label = 'Très fort'; }
  return { bits: Math.round(bits), score, label };
}
