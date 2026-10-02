// Teste le service worker avec un faux chrome.* : lancer  node test/background.test.mjs
import assert from 'node:assert/strict';

const mk = () => {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? { [k]: structuredClone(m.get(k)) } : {}),
    set: async (o) => { for (const [k, v] of Object.entries(o)) m.set(k, structuredClone(v)); },
    remove: async (k) => { for (const x of [].concat(k)) m.delete(x); }
  };
};
let onMessage;
const noop = { addListener() {} };
globalThis.chrome = {
  storage: { local: mk(), session: mk() },
  runtime: { id: 'me', onInstalled: noop, onStartup: noop, onMessage: { addListener: (f) => { onMessage = f; } }, getURL: (p) => p },
  alarms: { get() {}, create() {}, onAlarm: noop },
  tabs: { onRemoved: noop, create() {} }
};
const V = await import('../extension/lib/vault.js');
const { newItem } = await import('../extension/lib/items.js');
await import('../extension/background.js');

const call = (msg, url = 'https://github.com/login', tabId = 7, id = 'me') =>
  new Promise((res) => { const keep = onMessage(msg, { id, url, tab: { id: tabId } }, res); if (!keep) res('IGNORED'); });

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

await t('sans coffre / verrouillé', async () => {
  assert.equal((await call({ type: 'nf:matches' })).state, 'novault');
  await V.setup('un-mot-de-passe-solide-1');
  await V.mutate((d) => d.items.push(
    newItem('login', { name: 'GitHub', url: 'https://github.com', username: 'cyril', password: 'Aa1!old-password' }),
    newItem('login', { name: 'Banque', url: 'https://banque.example', username: 'moi', password: 'xY9#banque-pw' })));
  await V.lock();
  assert.equal((await call({ type: 'nf:matches' })).state, 'locked');
  assert.equal((await call({ type: 'nf:fill', id: 'x' })).error, 'LOCKED');
});

await t('correspondances : seulement le site courant', async () => {
  await V.unlock('un-mot-de-passe-solide-1');
  const r = await call({ type: 'nf:matches' });
  assert.deepEqual(r.items.map((i) => i.name), ['GitHub']);
  assert.ok(!JSON.stringify(r).includes('Aa1!old'), 'le mot de passe ne part pas avec la liste');
  assert.equal((await call({ type: 'nf:matches' }, 'https://evil-github.com/')).items.length, 0);
});

await t('remplissage : site ≠ élément, http refusé, ok sur https', async () => {
  const data = await V.read();
  const gh = data.items.find((i) => i.name === 'GitHub'), bank = data.items.find((i) => i.name === 'Banque');
  assert.equal((await call({ type: 'nf:fill', id: bank.id })).error, 'mismatch'); // un site ne peut pas demander le mot de passe d'un autre
  assert.equal((await call({ type: 'nf:fill', id: gh.id }, 'http://github.com/')).error, 'insecure');
  assert.equal((await call({ type: 'nf:fill', id: gh.id }, 'https://evil-github.com/')).error, 'mismatch');
  assert.deepEqual(await call({ type: 'nf:fill', id: gh.id }), { username: 'cyril', password: 'Aa1!old-password' });
});

await t('messages non autorisés ignorés', async () => {
  assert.equal(await call({ type: 'nf:matches' }, 'https://github.com/', 7, 'autre-extension'), 'IGNORED');
  assert.equal(await call({ type: 'autre' }), 'IGNORED');
  assert.equal((await call({ type: 'nf:matches' }, 'chrome://settings')).error, 'bad_sender');
});

await t('capture : nouveau, mise à jour, identique, jamais', async () => {
  let r = await call({ type: 'nf:capture', username: 'nouveau', password: 'Pw-1!nouveau' }, 'https://github.com/session', 9);
  assert.equal(r.action, 'new');
  assert.equal((await call({ type: 'nf:pending' }, 'https://github.com/', 9)).action, 'new');
  assert.equal((await call({ type: 'nf:pending' }, 'https://github.com/', 10)).action, 'none'); // autre onglet
  assert.equal((await call({ type: 'nf:pending' }, 'https://autre.example/', 9)).action, 'none'); // autre site : purgé
  await call({ type: 'nf:capture', username: 'nouveau', password: 'Pw-1!nouveau' }, 'https://github.com/session', 9);
  assert.ok((await call({ type: 'nf:save-pending' }, 'https://github.com/', 9)).ok);
  assert.equal((await V.read()).items.filter((i) => i.url === 'https://github.com').length, 2);

  r = await call({ type: 'nf:capture', username: 'cyril', password: 'Nouveau-mdp-9!' }, 'https://github.com/settings', 9);
  assert.equal(r.action, 'update');
  await call({ type: 'nf:save-pending' }, 'https://github.com/', 9);
  const gh = (await V.read()).items.find((i) => i.username === 'cyril');
  assert.equal(gh.password, 'Nouveau-mdp-9!');

  assert.equal((await call({ type: 'nf:capture', username: 'cyril', password: 'Nouveau-mdp-9!' })).action, 'none'); // identique

  await call({ type: 'nf:capture', username: 'x', password: 'zzz-Pw-1!' }, 'https://tracker.example/', 11);
  await call({ type: 'nf:dismiss', never: true }, 'https://tracker.example/', 11);
  assert.equal((await call({ type: 'nf:capture', username: 'x', password: 'zzz-Pw-1!' }, 'https://tracker.example/', 11)).action, 'none');
  assert.deepEqual((await V.getSettings()).neverSave, ['tracker.example']);
});

await t('capture refusée si le coffre est verrouillé', async () => {
  await V.lock();
  assert.equal((await call({ type: 'nf:capture', username: 'a', password: 'b-Pw-1!zz' })).action, 'none');
});

console.log(`\n${n} groupes de tests OK`);
