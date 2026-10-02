// Tests du cœur (chiffrement, coffre, TOTP, CSV, correspondance). Lancer : node test/core.test.mjs
import assert from 'node:assert/strict';

const mk = () => {
  const m = new Map();
  return {
    get: async (k) => (typeof k === 'string' ? (m.has(k) ? { [k]: structuredClone(m.get(k)) } : {}) : {}),
    set: async (o) => { for (const [k, v] of Object.entries(o)) m.set(k, structuredClone(v)); },
    remove: async (k) => { for (const x of [].concat(k)) m.delete(x); },
    _m: m
  };
};
globalThis.chrome = { storage: { local: mk(), session: mk() } };

const V = await import('../extension/lib/vault.js');
const C = await import('../extension/lib/crypto.js');
const { totp, parseTotpInput } = await import('../extension/lib/totp.js');
const { itemsFromCsv, loginsToCsv, parseCsv } = await import('../extension/lib/csv.js');
const { siteMatches, hostOf, newItem } = await import('../extension/lib/items.js');
const { strength } = await import('../extension/lib/strength.js');
const { generatePassword } = await import('../extension/lib/generator.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

await t('TOTP : vecteurs RFC 6238 (SHA-1, 8 chiffres)', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  const cases = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [2000000000, '69279037']];
  for (const [s, code] of cases) {
    const r = await totp(`otpauth://totp/x?secret=${secret}&digits=8`, s * 1000);
    assert.equal(r.code, code);
  }
  assert.equal((await totp(secret, 59000)).code.length, 6);
  assert.equal((await totp(secret, 59000)).left, 1);
  assert.equal(parseTotpInput(''), null);
});

await t('Coffre : création, relecture, mauvais mot de passe', async () => {
  const { recoveryKey } = await V.setup('correct horse battery');
  assert.match(recoveryKey, /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  assert.equal(await V.isUnlocked(), true);
  await V.mutate((d) => { d.items.push(newItem('login', { name: 'GitHub', url: 'https://github.com', username: 'cyril', password: 'S3cret!' })); });
  assert.equal((await V.read()).items[0].password, 'S3cret!');
  await V.lock();
  assert.equal(await V.isUnlocked(), false);
  await assert.rejects(V.read(), /LOCKED/);
  await assert.rejects(V.unlock('mauvais'), /BAD_PASSWORD/);
  await V.unlock('correct horse battery');
  assert.equal((await V.read()).items.length, 1);
});

await t('Rien de lisible dans le stockage', async () => {
  const raw = JSON.stringify([...chrome.storage.local._m.values()]);
  assert.ok(!raw.includes('GitHub') && !raw.includes('S3cret') && !raw.includes('cyril'));
});

await t('Changement de mot de passe maître', async () => {
  await assert.rejects(V.changeMaster('faux', 'nouveau-mdp-123'), /BAD_PASSWORD/);
  await V.changeMaster('correct horse battery', 'nouveau-mdp-123');
  await V.lock();
  await assert.rejects(V.unlock('correct horse battery'), /BAD_PASSWORD/);
  await V.unlock('nouveau-mdp-123');
  assert.equal((await V.read()).items[0].name, 'GitHub');
});

await t('Récupération par clé de récupération', async () => {
  await V.wipe();
  const { recoveryKey } = await V.setup('premier-mdp-solide');
  await V.mutate((d) => d.items.push(newItem('note', { name: 'N', text: 'x' })));
  await V.lock();
  await assert.rejects(V.recover('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', 'z'), /BAD_RECOVERY/);
  await V.recover(recoveryKey.toLowerCase(), 'second-mdp-solide');
  assert.equal((await V.read()).items.length, 1);
  await V.lock();
  await V.unlock('second-mdp-solide');
});

await t('Sauvegarde : export chiffré puis import + fusion sans doublon', async () => {
  const file = await V.exportBackup();
  assert.ok(!file.includes('"N"'));
  await assert.rejects(V.readBackup(file, 'faux'), /BAD_PASSWORD/);
  await assert.rejects(V.readBackup('pas du json', 'x'), /BAD_FILE/);
  const data = await V.readBackup(file, 'second-mdp-solide');
  const live = await V.read();
  const r = V.mergeItems(live, data.items);
  assert.deepEqual(r, { added: 0, dup: 1 });
});

await t('Correspondance de sites (anti-hameçonnage)', () => {
  assert.ok(siteMatches('https://github.com', 'https://github.com/login'));
  assert.ok(siteMatches('github.com', 'https://www.github.com/'));
  assert.ok(siteMatches('https://github.com', 'https://gist.github.com'));
  assert.ok(!siteMatches('https://github.com', 'https://evil-github.com'));
  assert.ok(!siteMatches('https://github.com', 'https://github.com.evil.io'));
  assert.ok(!siteMatches('https://gist.github.com', 'https://github.com'));
  assert.ok(!siteMatches('', 'https://github.com'));
  assert.equal(hostOf('javascript:alert(1)'), '');
});

await t('CSV : Dashlane, Chrome, Bitwarden, notes, guillemets', () => {
  const dash = 'username,username2,username3,title,password,note,url,category,otpSecret\r\ncyril@x.fr,,,Netflix,"pa,ss""w",ma note,https://netflix.com,,JBSWY3DPEHPK3PXP\r\n';
  const d = itemsFromCsv(dash).items[0];
  assert.deepEqual([d.name, d.username, d.password, d.url, d.totp, d.notes], ['Netflix', 'cyril@x.fr', 'pa,ss"w', 'https://netflix.com', 'JBSWY3DPEHPK3PXP', 'ma note']);
  const chrome_ = itemsFromCsv('name,url,username,password,note\nGmail,https://mail.google.com,moi,abc,\n').items[0];
  assert.equal(chrome_.username, 'moi');
  const bw = itemsFromCsv('folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,Spotify,,,,https://spotify.com,u,p,\n').items[0];
  assert.deepEqual([bw.name, bw.url, bw.password], ['Spotify', 'https://spotify.com', 'p']);
  const notes = itemsFromCsv('title,note\nWifi,code 1234\n').items[0];
  assert.deepEqual([notes.type, notes.name, notes.text], ['note', 'Wifi', 'code 1234']);
  const out = loginsToCsv([d]);
  assert.equal(parseCsv(out)[1][3], 'pa,ss"w');
});

await t('Générateur : longueur, familles, pas de caractères ambigus', () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword({ length: 16 });
    assert.equal(p.length, 16);
    assert.match(p, /[A-Z]/); assert.match(p, /[a-z]/); assert.match(p, /\d/); assert.match(p, /[^A-Za-z0-9]/);
    assert.ok(!/[Il1O0]/.test(p));
  }
  assert.match(generatePassword({ length: 12, upper: false, symbols: false, digits: false }), /^[a-z]{12}$/);
  assert.notEqual(generatePassword(), generatePassword());
});

await t('Robustesse : cas courants', () => {
  assert.ok(strength('123456').score <= 1);
  assert.ok(strength('password').score <= 1);
  assert.ok(strength('azerty123').score <= 2);
  assert.ok(strength('Rq8#tLz!2vMw@9Kp$eXa').score >= 5);
  assert.equal(strength('').score, 0);
});

const { analyze, breachCount } = await import('../extension/lib/health.js');

await t('Santé : faibles, réutilisés, anciens, exposés, score', () => {
  const now = Date.now(), old = now - 400 * 86400000;
  const mkL = (name, password, extra = {}) => newItem('login', { name, password, pwChanged: now, ...extra });
  const items = [
    mkL('A', 'Rq8#tLz!2vMw@9Kp$eXa'),
    mkL('B', 'azerty123'), mkL('C', 'azerty123'),
    mkL('D', 'Zk4$mPq9!vLx2#Rt7w', { pwChanged: old }),
    mkL('E', 'Hn7!bQw3$zKp8@Vc5s', { breach: { count: 12, at: now } }),
    newItem('note', { name: 'N', text: 'x' })
  ];
  const H = analyze(items, now);
  assert.equal(H.n, 5);
  assert.deepEqual(H.counts, { breached: 1, reused: 2, weak: 2, old: 1 });
  assert.ok(H.risky.has(items[1].id) && !H.risky.has(items[0].id));
  assert.ok(H.score < 100 && H.score > 0);
  assert.equal(analyze([mkL('Z', 'Zk4$mPq9!vLx2#Rt7w')], now).score, 100);
  assert.equal(analyze([]).score, null);
  // une fuite ancienne n'est plus comptée si le mot de passe a changé depuis
  const fixed = mkL('F', 'Hn7!bQw3$zKp8@Vc5s', { breach: { count: 3, at: now - 1000 }, pwChanged: now });
  assert.equal(analyze([fixed], now).counts.breached, 0);
});

await t('Fuites : seul un préfixe de 5 caractères quitte l\'appareil', async () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  let url = '';
  const fake = async (u) => { url = u; return { ok: true, text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9999\r\n0000000000000000000000000000000000A:2' }; };
  assert.equal(await breachCount('password', new Map(), fake), 9999);
  assert.ok(url.endsWith('/range/5BAA6'));
  assert.equal(url.split('/range/')[1], '5BAA6'); // rien d'autre que le préfixe n'est envoyé
  const none = async () => ({ ok: true, text: async () => '0000000000000000000000000000000000A:2' });
  assert.equal(await breachCount('password', new Map(), none), 0);
  await assert.rejects(breachCount('x', new Map(), async () => ({ ok: false, status: 503 })), /HIBP/);
});

console.log(`\n${n} groupes de tests OK`);
