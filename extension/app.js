import * as V from './lib/vault.js';
import { TYPES, TYPE_ORDER, newItem, hostOf, tileColor, tileLetter, searchItems, subtitle } from './lib/items.js';
import { strength } from './lib/strength.js';
import { generatePassword } from './lib/generator.js';
import { totp } from './lib/totp.js';
import { analyze, breachCount } from './lib/health.js';
import { itemsFromCsv, loginsToCsv } from './lib/csv.js';
import { h, icon, ICONS, toast, copyText, download, modal, ask, fmtDate } from './ui/dom.js';

const root = document.getElementById('app');
const S = { settings: null, data: null, H: null, view: 'all', cat: 'all', filter: 'all', sort: 'name', q: '', sel: null, reveal: new Set() };
let timers = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
const mount = (node) => { clearTimers(); root.replaceChildren(node); };
const dialogOpen = () => !!document.querySelector('dialog[open]');

function applyTheme() {
  const r = document.documentElement;
  if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme);
  r.style.setProperty('--accent', S.settings.accent);
}

const bars = (score) => h('div', { class: 'bars s' + score }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= score ? 'on' : '' })));
const logoBox = (cls = '') => h('span', { class: 'logo ' + cls }, icon(ICONS.lock, cls ? 28 : 16, '#fff', 2.2));
const labelled = (id, label, input) => h('div', { class: 'field' }, h('label', { class: 'lbl', for: id }, label), input);

// ---- Démarrage -------------------------------------------------------------

async function boot() {
  S.settings = await V.getSettings();
  applyTheme();
  if (!(await V.hasVault())) return setupScreen();
  if (!(await V.isUnlocked())) return lockScreen();
  await reload();
  render();
}

async function reload() {
  S.data = await V.read();
  S.H = analyze(S.data.items);
}

async function afterChange(selectId) {
  await reload();
  if (selectId !== undefined) S.sel = selectId;
  render();
}

setInterval(async () => {
  if (S.data && !(await V.isUnlocked())) { S.data = null; lockScreen(); }
}, 10000);
let lastTouch = 0;
for (const ev of ['click', 'keydown']) addEventListener(ev, () => { if (S.data && Date.now() - lastTouch > 20000) { lastTouch = Date.now(); V.touch(); } });
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.nf_vault && S.data && !dialogOpen()) V.read().then((d) => { S.data = d; S.H = analyze(d.items); render(); }, () => {});
});

// ---- Création du coffre / verrouillage ---------------------------------------

function authCard(title, ...kids) {
  return h('div', { class: 'center' }, h('div', { class: 'card auth' }, logoBox('big'), h('h1', { text: title }), ...kids));
}

function setupScreen() {
  const p1 = h('input', { class: 'input', id: 'p1', type: 'password', autocomplete: 'new-password' });
  const p2 = h('input', { class: 'input', id: 'p2', type: 'password', autocomplete: 'new-password' });
  const meter = h('div', { style: 'display:flex;align-items:center;gap:10px' }, bars(0), h('span', { class: 'muted', style: 'font-size:12px', text: '—' }));
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Créer mon coffre');
  p1.addEventListener('input', () => {
    const s = strength(p1.value);
    meter.replaceChildren(bars(s.score), h('span', { class: 'muted', style: 'font-size:12px', text: `${s.label} · ${s.bits} bits` }));
  });
  const form = h('form', { style: 'display:flex;flex-direction:column;gap:16px', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (p1.value.length < 10) return void (err.textContent = 'Au moins 10 caractères. Une phrase de passe fonctionne très bien.');
    if (strength(p1.value).score < 3) return void (err.textContent = 'Mot de passe trop facile à deviner. Allongez-le ou mélangez des mots.');
    if (p1.value !== p2.value) return void (err.textContent = 'Les deux mots de passe ne correspondent pas.');
    btn.disabled = true; btn.textContent = 'Chiffrement…';
    try {
      const { recoveryKey } = await V.setup(p1.value);
      await recoveryScreen(recoveryKey);
      await reload();
      render();
    } catch (x) { err.textContent = 'Erreur : ' + x.message; btn.disabled = false; btn.textContent = 'Créer mon coffre'; }
  } },
    labelled('p1', 'Mot de passe maître', p1), meter,
    labelled('p2', 'Confirmer le mot de passe maître', p2),
    err, btn);
  mount(authCard('Bienvenue sur Never Forget',
    h('p', { class: 'muted', style: 'text-align:center;line-height:1.55', text: 'Un seul mot de passe à retenir. Tout le reste est chiffré sur cet appareil : personne, pas même nous, ne peut le lire ni le réinitialiser.' }),
    form));
  p1.focus();
}

function recoveryScreen(key) {
  return new Promise((resolve) => {
    const ok = h('input', { type: 'checkbox', id: 'ok', class: 'sw' });
    const go = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: resolve }, 'Continuer');
    ok.addEventListener('change', () => { go.disabled = !ok.checked; });
    mount(authCard('Votre clé de récupération',
      h('p', { class: 'muted', style: 'text-align:center;line-height:1.55', text: 'Si vous oubliez votre mot de passe maître, cette clé est le seul moyen de rouvrir votre coffre. Notez-la sur papier et gardez-la en lieu sûr.' }),
      h('div', { class: 'group recovery mono', text: key }),
      h('div', { style: 'display:flex;gap:10px;justify-content:center' },
        h('button', { class: 'btn', type: 'button', onclick: () => copyText(key, 0) }, icon(ICONS.copy, 16), 'Copier'),
        h('button', { class: 'btn', type: 'button', onclick: () => download('never-forget-cle-de-recuperation.txt', `Never Forget : clé de récupération\r\n\r\n${key}\r\n\r\nConservez ce fichier hors de votre ordinateur.\r\n`, 'text/plain') }, icon(ICONS.download, 16), 'Télécharger')),
      h('label', { class: 'grp-row group', for: 'ok', style: 'cursor:pointer' }, h('span', { class: 'grow', text: 'J\'ai conservé ma clé en lieu sûr' }), ok),
      go));
  });
}

function lockScreen() {
  const pw = h('input', { class: 'input', id: 'mp', type: 'password', autocomplete: 'current-password', autofocus: true });
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Déverrouiller');
  const form = h('form', { style: 'display:flex;flex-direction:column;gap:14px', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Déverrouillage…';
    try { await V.unlock(pw.value); await reload(); render(); }
    catch (x) { err.textContent = x.message === 'BAD_PASSWORD' ? 'Mot de passe incorrect.' : 'Erreur : ' + x.message; btn.disabled = false; btn.textContent = 'Déverrouiller'; pw.select(); }
  } }, labelled('mp', 'Mot de passe maître', pw), err, btn);
  mount(authCard('Never Forget', form,
    h('button', { class: 'btn', type: 'button', style: 'background:transparent;color:var(--link);min-height:32px', onclick: recoveryForm }, 'Mot de passe oublié ?')));
  pw.focus();
}

function recoveryForm() {
  const key = h('input', { class: 'input mono', id: 'rk', placeholder: 'XXXX-XXXX-XXXX-…', autocomplete: 'off' });
  const np = h('input', { class: 'input', id: 'np', type: 'password', autocomplete: 'new-password' });
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Récupérer mon coffre');
  const form = h('form', { style: 'display:flex;flex-direction:column;gap:14px', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (np.value.length < 10 || strength(np.value).score < 3) return void (err.textContent = 'Choisissez un nouveau mot de passe plus solide (10 caractères minimum).');
    btn.disabled = true; btn.textContent = 'Déchiffrement…';
    try { await V.recover(key.value, np.value); await reload(); render(); toast('Mot de passe maître remplacé'); }
    catch (x) { err.textContent = x.message === 'BAD_RECOVERY' ? 'Clé de récupération incorrecte.' : 'Erreur : ' + x.message; btn.disabled = false; btn.textContent = 'Récupérer mon coffre'; }
  } }, labelled('rk', 'Clé de récupération', key), labelled('np', 'Nouveau mot de passe maître', np), err, btn);
  mount(authCard('Récupération', form,
    h('button', { class: 'btn', type: 'button', style: 'background:transparent;color:var(--link);min-height:32px', onclick: lockScreen }, 'Retour')));
}

// ---- Coque de l'application ----------------------------------------------------

const VIEW_TITLES = { all: 'Tous les éléments', gen: 'Générateur', health: 'Sécurité', backup: 'Sauvegarde et import', settings: 'Réglages' };

function go(view, cat) {
  S.view = view;
  if (cat !== undefined) { S.cat = cat; S.filter = 'all'; S.q = ''; }
  render();
}

function render() {
  if (!S.data) return;
  const views = { all: vaultView, gen: genView, health: healthView, backup: backupView, settings: settingsView };
  mount(h('div', { class: 'shell' }, h('div', { class: 'win' }, sideBar(), views[S.view]())));
}

function sideBar() {
  const items = S.data.items;
  const navBtn = (view, label, ic, count) => h('button', { class: 'side-a' + (S.view === view && (view !== 'all' || S.cat === 'all') ? ' on' : ''), type: 'button', onclick: () => go(view, view === 'all' ? 'all' : undefined) },
    icon(ic, 18, 'var(--accent)'), h('span', { text: label }), count ? h('span', { class: 'n', text: String(count) }) : null);
  const catBtn = (cat, label, ic, count) => h('button', { class: 'side-a' + (S.view === 'all' && S.cat === cat ? ' on' : ''), type: 'button', onclick: () => go('all', cat) },
    icon(ic, 18, 'var(--text2)'), h('span', { text: label }), h('span', { class: 'n', text: String(count) }));
  const collections = [...new Set(items.map((i) => i.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  return h('aside', { class: 'side' },
    h('div', { class: 'brand' }, logoBox(), 'Never Forget'),
    h('nav', { class: 'nav', 'aria-label': 'Navigation principale' },
      navBtn('all', 'Tous les éléments', ICONS.all, items.length),
      navBtn('gen', 'Générateur', ICONS.gen),
      navBtn('health', 'Sécurité', ICONS.shield, S.H.risky.size),
      navBtn('backup', 'Sauvegarde et import', ICONS.cloud),
      navBtn('settings', 'Réglages', ICONS.gear),
      h('div', { class: 'sec', style: 'padding:16px 10px 6px', text: 'Catégories' }),
      catBtn('fav', 'Favoris', ICONS.star, items.filter((i) => i.fav).length),
      TYPE_ORDER.map((t) => catBtn(t, TYPES[t].plural, TYPES[t].icon, items.filter((i) => i.type === t).length)),
      collections.length ? h('div', { class: 'sec', style: 'padding:16px 10px 6px', text: 'Collections' }) : null,
      collections.map((c) => catBtn('c:' + c, c, ICONS.all, items.filter((i) => i.collection === c).length))),
    h('div', { class: 'side-foot' },
      h('div', { class: 'muted', style: 'font-size:12px;line-height:1.5', text: 'Chiffré sur cet appareil (AES-256)' }),
      h('button', { class: 'btn', type: 'button', onclick: async () => { await V.lock(); S.data = null; lockScreen(); } }, icon(ICONS.lock, 16), 'Verrouiller')));
}

// ---- Vue principale : liste + détail ---------------------------------------------

const FLAG = { breached: ['Exposé', 'var(--warn)'], weak: ['Faible', 'var(--warn)'], reused: ['Réutilisé', 'var(--caution)'], old: ['Ancien', 'var(--text2)'] };

function catTitle() {
  if (S.cat === 'all') return VIEW_TITLES.all;
  if (S.cat === 'fav') return 'Favoris';
  if (S.cat.startsWith('c:')) return S.cat.slice(2);
  return TYPES[S.cat].plural;
}

function visibleItems() {
  let it = S.data.items;
  if (S.cat === 'fav') it = it.filter((i) => i.fav);
  else if (S.cat.startsWith('c:')) it = it.filter((i) => i.collection === S.cat.slice(2));
  else if (S.cat !== 'all') it = it.filter((i) => i.type === S.cat);
  if (S.filter === 'fav') it = it.filter((i) => i.fav);
  if (S.filter === 'risk') it = it.filter((i) => S.H.risky.has(i.id));
  it = searchItems(it, S.q);
  const by = S.sort === 'recent' ? (a, b) => b.updated - a.updated : (a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
  return [...it].sort(by);
}

function vaultView() {
  const items = S.data.items;
  const logins = items.filter((i) => i.type === 'login').length;
  const listEl = h('div', { class: 'list', role: 'list' });
  const detailEl = h('section', { class: 'card', 'aria-label': 'Détail', style: 'padding:24px;display:flex;flex-direction:column;gap:20px' });

  const refreshDetail = () => {
    clearTimers();
    const it = items.find((i) => i.id === S.sel);
    detailEl.replaceChildren(...(it ? detailContent(it) : [h('div', { class: 'empty' }, 'Sélectionnez un élément pour afficher son contenu.')]));
  };
  const refreshList = () => {
    const vis = visibleItems();
    if (S.sel && !items.some((i) => i.id === S.sel)) S.sel = null;
    if (!S.sel && vis.length) S.sel = vis[0].id;
    if (!vis.length) {
      listEl.replaceChildren(items.length
        ? h('div', { class: 'empty' }, 'Aucun résultat.')
        : h('div', { class: 'empty' }, h('b', { style: 'color:var(--text)', text: 'Votre coffre est vide' }), 'Ajoutez un premier élément ou importez vos mots de passe depuis Dashlane, Chrome…',
          h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(null, 'login') }, 'Nouvel élément'),
            h('button', { class: 'btn', type: 'button', onclick: () => go('backup') }, 'Importer'))));
      return;
    }
    listEl.replaceChildren(...vis.map((it) => {
      const issue = (S.H.issues.get(it.id) || []).sort((a, b) => Object.keys(FLAG).indexOf(a.kind) - Object.keys(FLAG).indexOf(b.kind))[0];
      return h('button', { class: 'item' + (it.id === S.sel ? ' on' : ''), type: 'button', role: 'listitem', onclick: () => { S.sel = it.id; refreshList(); refreshDetail(); } },
        h('span', { class: 'tile', style: { background: tileColor(it.name) }, text: tileLetter(it.name) }),
        h('span', { class: 't' }, h('b', { text: it.name || 'Sans nom' }), h('span', { text: subtitle(it) })),
        it.fav ? icon(ICONS.star, 14, 'var(--caution)') : null,
        issue ? h('span', { class: 'flag', style: { color: FLAG[issue.kind][1] }, text: FLAG[issue.kind][0] }) : null,
        icon(ICONS.chevron, 14, 'var(--text2)', 2));
    }));
  };
  S.refresh = () => { refreshList(); refreshDetail(); };

  const search = h('input', { class: 'input', id: 'q', style: 'padding-left:36px', placeholder: 'Rechercher', value: S.q, autocomplete: 'off',
    oninput: (e) => { S.q = e.target.value; refreshList(); refreshDetail(); } });
  const seg = (key, label) => h('button', { class: 'seg-b' + (S.filter === key ? ' on' : ''), type: 'button', onclick: (e) => {
    S.filter = key; e.target.parentElement.querySelectorAll('.seg-b').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); refreshList(); refreshDetail();
  } }, label);

  const el = h('main', { class: 'main' },
    h('header', { class: 'page-h' },
      h('h1', { text: catTitle() }),
      h('div', { style: 'flex:0 1 320px;position:relative' }, h('label', { class: 'sr', for: 'q' }, 'Rechercher'),
        h('span', { style: 'position:absolute;left:12px;top:12px;display:flex' }, icon(ICONS.search, 16, 'var(--text2)', 2)), search),
      h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(null, TYPES[S.cat] ? S.cat : 'login') }, icon(ICONS.plus, 16, '#fff', 2.4), 'Nouvel élément')),
    h('section', { class: 'stats', 'aria-label': 'Résumé' },
      stat('Score de sécurité', S.H.score === null ? '—' : String(S.H.score), S.H.score === null ? 'Aucun mot de passe' : '/ 100', () => go('health'), S.H.score !== null && S.H.score < 60 ? 'var(--warn)' : ''),
      stat('Identifiants', String(logins), 'sites et applications'),
      stat('Autres éléments', String(items.length - logins), 'notes, cartes, identités, Wi-Fi'),
      stat('À corriger', String(S.H.risky.size), S.H.risky.size ? 'faibles, réutilisés, exposés' : 'tout est en ordre', () => { S.filter = 'risk'; go('all'); }, S.H.risky.size ? 'var(--warn)' : 'var(--ok)')),
    h('div', { class: 'cols' },
      h('section', { 'aria-label': 'Liste', style: 'display:flex;flex-direction:column;gap:12px' },
        h('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px' },
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtre' }, seg('all', 'Tous'), seg('fav', 'Favoris'), seg('risk', 'À risque')),
          h('select', { class: 'input', style: 'width:auto;min-height:32px;font-size:12px', 'aria-label': 'Trier', onchange: (e) => { S.sort = e.target.value; refreshList(); } },
            h('option', { value: 'name', selected: S.sort === 'name' }, 'Trier par nom'), h('option', { value: 'recent', selected: S.sort === 'recent' }, 'Trier par date'))),
        listEl),
      detailEl));
  refreshList(); refreshDetail();
  return el;
}

function stat(label, value, sub, onclick, color) {
  const kids = [h('span', { class: 'muted', style: 'font-size:13px', text: label }),
    h('span', { class: 'v', style: color ? { color } : {}, text: value }),
    h('span', { class: 'muted', style: 'font-size:12px', text: sub })];
  return onclick ? h('button', { class: 'card stat', type: 'button', onclick }, ...kids) : h('div', { class: 'card stat' }, ...kids);
}

function detailContent(it) {
  const T = TYPES[it.type];
  const out = [];
  const url = it.type === 'login' && /^https?:\/\//i.test(it.url || '') ? it.url : null;
  out.push(h('div', { style: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap' },
    h('span', { class: 'tile lg', style: { background: tileColor(it.name) }, text: tileLetter(it.name) }),
    h('div', { style: 'flex:1;min-width:140px' },
      h('h2', { style: 'font-size:20px;font-weight:600;letter-spacing:-.02em;overflow-wrap:anywhere', text: it.name || 'Sans nom' }),
      url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', style: 'font-size:13px;text-decoration:none', text: hostOf(url) }) : h('span', { class: 'muted', style: 'font-size:13px', text: T.label })),
    h('button', { class: 'btn icon sm', type: 'button', 'aria-label': it.fav ? 'Retirer des favoris' : 'Ajouter aux favoris', 'aria-pressed': String(!!it.fav),
      onclick: async () => { await V.mutate((d) => { const x = d.items.find((i) => i.id === it.id); x.fav = !x.fav; }); afterChange(); } },
      icon(ICONS.star, 16, it.fav ? 'var(--caution)' : 'currentColor')),
    h('button', { class: 'btn sm', type: 'button', onclick: () => openEditor(it) }, 'Modifier'),
    h('button', { class: 'btn icon sm danger', type: 'button', 'aria-label': 'Supprimer', onclick: async () => {
      if (!(await ask('Supprimer cet élément ?', `« ${it.name || 'Sans nom'} » sera supprimé définitivement de votre coffre.`, 'Supprimer', true))) return;
      await V.mutate((d) => { d.items = d.items.filter((i) => i.id !== it.id); });
      afterChange(null);
    } }, icon(ICONS.trash, 16))));

  const rows = [];
  for (const f of T.fields) {
    const v = it[f.key];
    if (!v) continue;
    if (f.kind === 'totp') { rows.push(totpRow(it)); continue; }
    if (it.type === 'note') { rows.push(h('div', { class: 'grp-row' }, h('div', { class: 'grow' }, h('div', { style: 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55', text: v })), copyBtn(v))); continue; }
    rows.push(valueRow(it, f, v));
  }
  if (rows.length) out.push(h('div', { class: 'group' }, ...rows));

  const pwv = it.type === 'login' || it.type === 'wifi' ? it.password : '';
  if (pwv) {
    const s = strength(pwv);
    out.push(h('div', { style: 'display:flex;align-items:center;gap:10px' },
      h('span', { style: 'font-size:13px;font-weight:500', text: 'Robustesse' }), bars(s.score), h('span', { class: 'muted', style: 'font-size:12px', text: s.label })));
  }
  const issues = S.H.issues.get(it.id) || [];
  if (issues.length) out.push(h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, issues.map((i) => h('div', { style: { fontSize: '13px', color: FLAG[i.kind][1] }, text: '• ' + i.text }))));
  if (it.notes && it.type !== 'note') out.push(h('div', { class: 'group', style: 'padding:12px 14px' }, h('div', { class: 'muted', style: 'font-size:12px', text: 'Notes' }), h('div', { style: 'margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55', text: it.notes })));
  out.push(h('div', { class: 'muted', style: 'font-size:12px;line-height:1.6', text: `Modifié le ${fmtDate(it.updated)}${it.collection ? ' · ' + it.collection : ''}` }));
  return out;
}

const copyBtn = (text) => h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(text, S.settings.clipboardClearSec) }, 'Copier');

function valueRow(it, f, v) {
  const secret = f.kind === 'password' || f.kind === 'secret';
  const k = it.id + ':' + f.key;
  const shown = !secret || S.reveal.has(k);
  let text = v;
  if (!shown) text = f.key === 'number' ? '•••• •••• •••• ' + v.replace(/\D/g, '').slice(-4) : '••••••••••••';
  else if (f.key === 'number') text = v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
  return h('div', { class: 'grp-row' },
    h('div', { class: 'grow' }, h('div', { class: 'muted', style: 'font-size:12px', text: f.label }),
      h('div', { class: secret || f.mono ? 'mono' : '', style: 'margin-top:3px;overflow-wrap:anywhere;' + (secret ? 'font-size:15px' : ''), text })),
    secret ? h('button', { class: 'btn icon sm', type: 'button', 'aria-label': shown ? 'Masquer' : 'Afficher', onclick: () => { if (S.reveal.has(k)) S.reveal.delete(k); else S.reveal.add(k); S.refresh(); } }, icon(shown ? ICONS.eyeoff : ICONS.eye, 16)) : null,
    copyBtn(v));
}

function totpRow(it) {
  const codeEl = h('div', { class: 'mono', style: 'margin-top:3px;font-size:20px;letter-spacing:.08em', text: '······' });
  const ring = h('div', { class: 'mini-ring', role: 'img' }, h('span', { text: '' }));
  let current = '';
  const tick = async () => {
    try {
      const r = await totp(it.totp);
      current = r.code;
      codeEl.textContent = r.code.replace(/(\d{3})(\d+)/, '$1 $2');
      ring.style.background = `conic-gradient(var(--accent) 0 ${(r.left / r.period) * 100}%, var(--fill2) 0 100%)`;
      ring.setAttribute('aria-label', r.left + ' secondes restantes');
      ring.firstChild.textContent = r.left;
    } catch { codeEl.textContent = 'Clé invalide'; codeEl.style.fontSize = '14px'; }
  };
  tick();
  timers.push(setInterval(tick, 1000));
  return h('div', { class: 'grp-row' }, h('div', { class: 'grow' }, h('div', { class: 'muted', style: 'font-size:12px', text: 'Code de validation' }), codeEl), ring,
    h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(current, S.settings.clipboardClearSec) }, 'Copier'));
}

// ---- Éditeur --------------------------------------------------------------------

function pwInput(draft, key, onChange, withGen) {
  const input = h('input', { class: 'input mono', id: 'f-' + key, type: 'password', autocomplete: 'new-password', value: draft[key] || '', style: 'flex:1;font-size:15px' });
  const meter = h('div', { style: 'display:flex;align-items:center;gap:10px' });
  const upd = () => { const s = strength(input.value); meter.replaceChildren(bars(s.score), h('span', { class: 'muted', style: 'font-size:12px', text: input.value ? `${s.label} · ${s.bits} bits` : '' })); };
  input.addEventListener('input', () => { draft[key] = input.value; upd(); onChange && onChange(); });
  upd();
  const eye = h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Afficher ou masquer', onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; } }, icon(ICONS.eye, 16));
  const gen = withGen ? h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Générer un mot de passe', onclick: () => {
    input.value = generatePassword(S.settings.gen); input.type = 'text'; input.dispatchEvent(new Event('input'));
  } }, icon(ICONS.refresh, 16)) : null;
  return h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { style: 'display:flex;gap:8px' }, input, eye, gen), withGen ? meter : null);
}

function openEditor(existing, type = 'login', init = {}) {
  const draft = existing ? structuredClone(existing) : newItem(type, init);
  const origPw = existing ? existing.password : undefined;
  const err = h('div', { class: 'err', role: 'alert' });
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });
  const collections = [...new Set(S.data.items.map((i) => i.collection).filter(Boolean))];

  const buildBody = () => {
    const T = TYPES[draft.type];
    const kids = [labelled('f-name', draft.type === 'wifi' ? 'Nom du réseau' : 'Nom', h('input', { class: 'input', id: 'f-name', value: draft.name, placeholder: draft.type === 'login' ? 'Ex. GitHub' : '', oninput: (e) => { draft.name = e.target.value; } }))];
    for (const f of T.fields) {
      const id = 'f-' + f.key;
      let input;
      if (f.kind === 'password') input = pwInput(draft, f.key, null, true);
      else if (f.kind === 'textarea') input = h('textarea', { class: 'input', id, rows: f.rows || 3, oninput: (e) => { draft[f.key] = e.target.value; } }, draft[f.key] || '');
      else input = h('input', { class: 'input' + (f.mono ? ' mono' : ''), id, value: draft[f.key] || '', placeholder: f.placeholder || '', autocomplete: 'off', type: f.kind === 'secret' && f.key === 'cvv' ? 'password' : 'text', oninput: (e) => { draft[f.key] = e.target.value; } });
      kids.push(labelled(id, f.label, input));
    }
    if (draft.type !== 'note') kids.push(labelled('f-notes', 'Notes', h('textarea', { class: 'input', id: 'f-notes', rows: 2, placeholder: 'Questions de sécurité, numéro client…', oninput: (e) => { draft.notes = e.target.value; } }, draft.notes || '')));
    kids.push(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;align-items:end' },
      labelled('f-col', 'Collection', h('input', { class: 'input', id: 'f-col', list: 'cols', value: draft.collection || '', placeholder: 'Ex. Travail', oninput: (e) => { draft.collection = e.target.value.trim(); } })),
      h('label', { class: 'grp-row group', style: 'cursor:pointer' }, h('span', { class: 'grow', text: 'Favori' }), h('input', { class: 'sw', type: 'checkbox', checked: !!draft.fav, onchange: (e) => { draft.fav = e.target.checked; } }))),
      h('datalist', { id: 'cols' }, collections.map((c) => h('option', { value: c }))));
    body.replaceChildren(...kids);
  };
  buildBody();

  return modal((close) => {
    const tabs = existing ? null : h('div', { class: 'seg', role: 'group', 'aria-label': 'Type d\'élément' }, TYPE_ORDER.map((t) =>
      h('button', { class: 'seg-b' + (t === draft.type ? ' on' : ''), type: 'button', onclick: (e) => {
        draft.type = t; e.target.parentElement.querySelectorAll('.seg-b').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); buildBody();
      } }, TYPES[t].label)));
    const save = h('button', { class: 'btn primary', type: 'submit', style: 'padding:0 22px' }, 'Enregistrer');
    return h('form', { class: 'dlg', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (draft.totp) { try { await totp(draft.totp); } catch { return void (err.textContent = 'Clé de validation invalide (attendu : clé base32 ou lien otpauth://).'); } }
      if (draft.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(draft.url.trim())) draft.url = 'https://' + draft.url.trim();
      if (!draft.name.trim()) draft.name = hostOf(draft.url) || TYPES[draft.type].label;
      draft.name = draft.name.trim();
      draft.updated = Date.now();
      if (!existing || draft.password !== origPw) draft.pwChanged = Date.now();
      save.disabled = true;
      try {
        await V.mutate((d) => { const i = d.items.findIndex((x) => x.id === draft.id); if (i >= 0) d.items[i] = draft; else d.items.push(draft); });
        close(true);
        afterChange(draft.id);
      } catch (x) { err.textContent = x.message === 'LOCKED' ? 'Le coffre s\'est verrouillé. Rouvrez-le puis réessayez.' : 'Erreur : ' + x.message; save.disabled = false; }
    } },
      h('div', { style: 'display:flex;align-items:center;gap:12px' }, h('h2', { style: 'flex:1', text: existing ? 'Modifier l\'élément' : 'Nouvel élément' }),
        h('button', { class: 'btn icon sm', type: 'button', 'aria-label': 'Fermer', style: 'border-radius:50%', onclick: () => close(false) }, icon(ICONS.close, 14, 'var(--text2)', 2.6))),
      tabs, body, err,
      h('div', { class: 'dlg-actions' }, h('span', { class: 'muted', style: 'flex:1 1 200px;font-size:12px', text: 'Chiffré sur cet appareil avant d\'être enregistré.' }),
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Annuler'), save));
  });
}

// ---- Générateur --------------------------------------------------------------------

function genView() {
  const g = { ...S.settings.gen };
  let pw = generatePassword(g);
  const out = h('div', { class: 'mono', style: 'font-size:24px;line-height:1.5;overflow-wrap:anywhere;text-align:center;padding:8px 0', 'aria-live': 'polite' });
  const meter = h('div', { style: 'display:flex;align-items:center;gap:10px;justify-content:center' });
  const lenLbl = h('span', { class: 'mono', text: String(g.length) });
  const rng = h('input', { class: 'rng', type: 'range', min: 8, max: 64, value: g.length, 'aria-label': 'Longueur' });
  const paint = () => { rng.style.background = `linear-gradient(90deg,var(--accent) 0 ${((g.length - 8) / 56) * 100}%,var(--fill2) ${((g.length - 8) / 56) * 100}% 100%)`; };
  const show = () => {
    out.textContent = pw;
    const s = strength(pw);
    meter.replaceChildren(h('div', { style: 'width:160px' }, bars(s.score)), h('span', { class: 'muted', style: 'font-size:12px', text: `${s.label} · ${s.bits} bits` }));
  };
  const regen = () => { pw = generatePassword(g); show(); };
  const persist = () => V.saveSettings({ gen: g }).then((s) => { S.settings = s; });
  rng.addEventListener('input', () => { g.length = Number(rng.value); lenLbl.textContent = g.length; paint(); regen(); });
  rng.addEventListener('change', persist);
  const toggle = (key, label) => h('button', { class: 'pill' + (g[key] ? ' on' : ''), type: 'button', 'aria-pressed': String(!!g[key]), onclick: async () => {
    g[key] = !g[key];
    if (!g.upper && !g.lower && !g.digits && !g.symbols) g.lower = true;
    await persist();
    render(); // rafraîchit les pastilles
  } }, label);
  paint(); show();
  return h('main', { class: 'main' },
    h('header', { class: 'page-h' }, h('h1', { text: 'Générateur' })),
    h('section', { class: 'card', style: 'padding:28px;display:flex;flex-direction:column;gap:18px;max-width:720px' },
      out, meter,
      h('div', { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap' },
        h('button', { class: 'btn', type: 'button', onclick: regen }, icon(ICONS.refresh, 16), 'Régénérer'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(pw, S.settings.clipboardClearSec) }, icon(ICONS.copy, 16, '#fff'), 'Copier'),
        h('button', { class: 'btn', type: 'button', onclick: () => openEditor(null, 'login', { password: pw }) }, 'Utiliser dans un nouvel identifiant')),
      h('div', { style: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap' }, h('span', { style: 'font-size:13px;white-space:nowrap' }, 'Longueur ', lenLbl), h('div', { style: 'flex:1 1 200px' }, rng)),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        toggle('upper', 'A–Z'), toggle('lower', 'a–z'), toggle('digits', '0–9'), toggle('symbols', 'Symboles'), toggle('ambiguous', 'Caractères ambigus (I, l, 1, O, 0)')),
      h('p', { class: 'muted', style: 'font-size:12px;line-height:1.5', text: 'Généré avec le générateur aléatoire cryptographique du navigateur. Rien ne quitte votre appareil.' })));
}

// ---- Sécurité ----------------------------------------------------------------------

function healthView() {
  const H = S.H;
  const btn = h('button', { class: 'btn', type: 'button' }, 'Vérifier les fuites de données');
  const cnt = (label, n, color) => h('div', { class: 'group', style: 'padding:14px' }, h('div', { style: { fontSize: '24px', fontWeight: 600, color: n ? color : '' }, text: String(n) }), h('div', { class: 'muted', style: 'font-size:13px', text: label }));
  const pct = H.score ?? 0;
  const msg = H.score === null ? ['Aucun mot de passe à analyser', 'Ajoutez des identifiants pour obtenir votre score.']
    : H.score >= 85 ? ['Votre coffre est bien protégé', 'Continuez ainsi. Relancez la vérification des fuites de temps en temps.']
    : H.score >= 60 ? ['Votre coffre peut être renforcé', 'Corrigez les éléments ci-dessous en commençant par les mots de passe exposés ou faibles.']
    : ['Votre coffre est fragile', 'Plusieurs mots de passe sont faibles, réutilisés ou exposés. Commencez par les premiers de la liste.'];

  btn.addEventListener('click', async () => {
    const withPw = S.data.items.filter((i) => (i.type === 'login' || i.type === 'wifi') && i.password);
    if (!withPw.length) return toast('Aucun mot de passe à vérifier');
    if (!(await ask('Vérifier les fuites ?', 'Pour chaque mot de passe, seuls les 5 premiers caractères de son empreinte SHA-1 sont envoyés à haveibeenpwned.com ; la comparaison se fait sur votre appareil. Aucun mot de passe, identifiant ni e-mail n\'est transmis.', 'Vérifier'))) return;
    btn.disabled = true;
    const cache = new Map(), counts = new Map();
    try {
      let i = 0;
      for (const it of withPw) {
        btn.textContent = `Vérification… ${++i}/${withPw.length}`;
        counts.set(it.id, await breachCount(it.password, cache));
      }
      const now = Date.now();
      await V.mutate((d) => {
        for (const it of d.items) if (counts.has(it.id)) it.breach = { count: counts.get(it.id), at: now };
        d.lastBreachCheck = now;
      });
      await afterChange();
      toast('Vérification terminée');
    } catch { toast('Vérification impossible (connexion ?)'); btn.disabled = false; btn.textContent = 'Vérifier les fuites de données'; }
  });

  const fixes = S.data.items.filter((i) => H.issues.has(i.id)).sort((a, b) => {
    const w = (it) => Math.min(...H.issues.get(it.id).map((x) => Object.keys(FLAG).indexOf(x.kind)));
    return w(a) - w(b);
  });
  const checked = S.data.lastBreachCheck;
  return h('main', { class: 'main' },
    h('header', { class: 'page-h' }, h('div', { style: 'flex:1 1 260px' }, h('h1', { text: 'Sécurité' }),
      h('div', { class: 'muted', style: 'font-size:13px;margin-top:4px', text: checked ? `Dernière vérification des fuites : ${fmtDate(checked)}` : 'Fuites de données : jamais vérifié' })), btn),
    h('section', { class: 'card', style: 'padding:28px;display:flex;flex-wrap:wrap;align-items:center;gap:32px' },
      h('div', { class: 'ring', role: 'img', 'aria-label': `Score de sécurité ${H.score ?? 0} sur 100`, style: { background: `conic-gradient(var(--accent) 0 ${pct}%, var(--fill2) ${pct}% 100%)` } },
        h('div', {}, h('div', { style: 'font-size:44px;font-weight:600;letter-spacing:-.04em;line-height:1', text: H.score === null ? '—' : String(H.score) }), h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: 'sur 100' }))),
      h('div', { style: 'flex:1 1 280px;display:flex;flex-direction:column;gap:6px' }, h('div', { style: 'font-size:20px;font-weight:600;letter-spacing:-.02em', text: msg[0] }), h('div', { class: 'muted', style: 'line-height:1.55;max-width:520px', text: msg[1] })),
      h('div', { style: 'flex:1 1 340px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' },
        cnt('Exposés dans une fuite', H.counts.breached, 'var(--warn)'), cnt('Réutilisés', H.counts.reused, 'var(--caution)'),
        cnt('Faibles', H.counts.weak, 'var(--warn)'), cnt('Inchangés depuis 1 an', H.counts.old, 'var(--text)'))),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Recommandations' }),
      fixes.length ? h('div', { class: 'group' }, fixes.map((it) => {
        const top = H.issues.get(it.id).sort((a, b) => Object.keys(FLAG).indexOf(a.kind) - Object.keys(FLAG).indexOf(b.kind))[0];
        return h('div', { class: 'grp-row' }, h('span', { class: 'tile', style: { background: tileColor(it.name) }, text: tileLetter(it.name) }),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:500', text: it.name }), h('div', { style: { fontSize: '12px', color: FLAG[top.kind][1] }, text: top.text })),
          h('button', { class: 'btn sm', type: 'button', onclick: () => openEditor(it) }, 'Modifier'));
      })) : h('div', { class: 'group empty', text: H.score === null ? 'Rien à analyser pour l\'instant.' : 'Aucun problème détecté.' })));
}

// ---- Sauvegarde et import -------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

function pickFile(accept) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, class: 'hidden', onchange: () => resolve(i.files[0] || null) });
    document.body.appendChild(i);
    i.addEventListener('cancel', () => resolve(null));
    i.click();
    setTimeout(() => i.remove(), 60000);
  });
}

async function importCsv() {
  const f = await pickFile('.csv,text/csv');
  if (!f) return;
  const { items, skipped } = itemsFromCsv(await f.text());
  if (!items.length) return toast('Aucun élément reconnu dans ce fichier');
  const ok = await ask('Importer ' + items.length + ' élément' + (items.length > 1 ? 's' : '') + ' ?',
    `${skipped ? skipped + ' ligne(s) ignorée(s). ' : ''}Les doublons (même site et même identifiant) seront ignorés. Supprimez ensuite le fichier CSV : il contient vos mots de passe en clair.`, 'Importer');
  if (!ok) return;
  const r = await V.mutate((d) => V.mergeItems(d, items));
  await afterChange();
  toast(`${r.added} importé${r.added > 1 ? 's' : ''}${r.dup ? ', ' + r.dup + ' doublon(s) ignoré(s)' : ''}`);
}

async function importBackup() {
  const f = await pickFile('.nfvault,.json,application/json');
  if (!f) return;
  const text = await f.text();
  const pw = await modal((close) => {
    const i = h('input', { class: 'input', id: 'bp', type: 'password', autocomplete: 'off', autofocus: true });
    return h('form', { class: 'dlg', onsubmit: (e) => { e.preventDefault(); close(i.value); } },
      h('h2', { text: 'Mot de passe de la sauvegarde' }),
      h('p', { class: 'muted', style: 'line-height:1.55', text: 'Saisissez le mot de passe maître qui était actif quand cette sauvegarde a été créée.' }),
      labelled('bp', 'Mot de passe maître', i),
      h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, 'Importer')));
  }, { narrow: true });
  if (!pw) return;
  try {
    const data = await V.readBackup(text, pw);
    const r = await V.mutate((d) => V.mergeItems(d, data.items));
    await afterChange();
    toast(`${r.added} ajouté${r.added > 1 ? 's' : ''}, ${r.dup} déjà présent${r.dup > 1 ? 's' : ''}`);
  } catch (x) { toast(x.message === 'BAD_PASSWORD' ? 'Mot de passe incorrect' : 'Fichier invalide'); }
}

function changeMasterDialog() {
  return modal((close) => {
    const o = h('input', { class: 'input', id: 'o', type: 'password', autocomplete: 'current-password' });
    const n = h('input', { class: 'input', id: 'n', type: 'password', autocomplete: 'new-password' });
    const c = h('input', { class: 'input', id: 'c', type: 'password', autocomplete: 'new-password' });
    const err = h('div', { class: 'err', role: 'alert' });
    return h('form', { class: 'dlg', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      if (n.value.length < 10 || strength(n.value).score < 3) return void (err.textContent = 'Nouveau mot de passe trop faible (10 caractères minimum).');
      if (n.value !== c.value) return void (err.textContent = 'Les nouveaux mots de passe ne correspondent pas.');
      try { await V.changeMaster(o.value, n.value); close(true); toast('Mot de passe maître modifié'); }
      catch (x) { err.textContent = x.message === 'BAD_PASSWORD' ? 'Mot de passe actuel incorrect.' : 'Erreur : ' + x.message; }
    } },
      h('h2', { text: 'Changer le mot de passe maître' }),
      labelled('o', 'Mot de passe actuel', o), labelled('n', 'Nouveau mot de passe', n), labelled('c', 'Confirmer', c), err,
      h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, 'Modifier')));
  }, { narrow: true });
}

function action(title, text, btns) {
  return h('div', { class: 'grp-row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow', style: 'flex:1 1 280px' }, h('div', { style: 'font-weight:500', text: title }), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px;line-height:1.5', text })), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btns));
}

function backupView() {
  const b = (label, ic, fn, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, icon(ic, 16), label);
  return h('main', { class: 'main' },
    h('header', { class: 'page-h' }, h('h1', { text: 'Sauvegarde et import' })),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Importer' }),
      h('div', { class: 'group' },
        action('Depuis Dashlane, Chrome, Bitwarden…', 'Exportez vos données au format CSV depuis l\'ancien gestionnaire, puis importez le fichier ici. Les formats sont reconnus automatiquement.', b('Choisir un CSV', ICONS.upload, importCsv, 'primary')),
        action('Depuis une sauvegarde Never Forget', 'Fusionne le contenu d\'un fichier .nfvault avec votre coffre actuel.', b('Choisir un fichier', ICONS.upload, importBackup)))),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Sauvegarder' }),
      h('div', { class: 'group' },
        action('Sauvegarde chiffrée', 'Un fichier .nfvault que vous pouvez ranger dans Drive, une clé USB ou un autre ordinateur. Il est chiffré : sans votre mot de passe maître, il est illisible. Pour changer d\'ordinateur ou partager un coffre avec vous-même, utilisez ce fichier.',
          b('Télécharger', ICONS.download, async () => { download(`never-forget-${today()}.nfvault`, await V.exportBackup(), 'application/json'); toast('Sauvegarde téléchargée'); }, 'primary')),
        action('Export CSV (non chiffré)', 'Contient vos identifiants en clair. À n\'utiliser que pour migrer vers un autre outil, puis à supprimer.',
          b('Exporter', ICONS.download, async () => {
            if (await ask('Exporter en clair ?', 'Le fichier CSV contiendra tous vos mots de passe lisibles par n\'importe qui. Supprimez-le dès que possible.', 'Exporter', true)) download(`never-forget-${today()}.csv`, loginsToCsv(S.data.items), 'text/csv');
          })))),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Sécurité du compte' }),
      h('div', { class: 'group' },
        action('Mot de passe maître', 'Vos données ne sont pas rechiffrées : seule la clé qui les protège change.', b('Modifier', ICONS.lock, changeMasterDialog)),
        action('Supprimer le coffre de cet appareil', 'Efface définitivement les données de ce navigateur. Faites d\'abord une sauvegarde.',
          b('Supprimer', ICONS.trash, async () => {
            if (!(await ask('Supprimer le coffre ?', 'Toutes les données de ce navigateur seront effacées sans retour possible. Sans sauvegarde, elles sont perdues.', 'Tout supprimer', true))) return;
            await V.wipe(); S.data = null; boot();
          }, 'danger')))));
}

// ---- Réglages ----------------------------------------------------------------------

function settingsView() {
  const set = async (patch) => { S.settings = await V.saveSettings(patch); applyTheme(); };
  const sel = (id, label, options, value, onChange) => h('div', { class: 'grp-row' }, h('label', { class: 'grow', for: id, text: label }),
    h('select', { class: 'input', id, style: 'width:auto', onchange: (e) => onChange(Number(e.target.value)) }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
  const seg = (key, options) => h('div', { class: 'seg' }, options.map(([v, t]) => h('button', { class: 'seg-b' + (S.settings[key] === v ? ' on' : ''), type: 'button', onclick: async () => { await set({ [key]: v }); render(); } }, t)));
  const swatches = ['#0071E3', '#1D1D1F', '#5E5CE6', '#BF4800', '#248A3D'];
  return h('main', { class: 'main' },
    h('header', { class: 'page-h' }, h('h1', { text: 'Réglages' })),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Confidentialité' }),
      h('div', { class: 'group' },
        sel('al', 'Verrouillage automatique', [[5, 'Après 5 min'], [15, 'Après 15 min'], [30, 'Après 30 min'], [60, 'Après 1 h'], [0, 'À la fermeture du navigateur']], S.settings.autoLockMin, (v) => set({ autoLockMin: v })),
        sel('cb', 'Effacer le presse-papiers', [[15, 'Après 15 s'], [30, 'Après 30 s'], [60, 'Après 1 min'], [0, 'Jamais']], S.settings.clipboardClearSec, (v) => set({ clipboardClearSec: v })))),
    h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Apparence' }),
      h('div', { class: 'group' },
        h('div', { class: 'grp-row' }, h('span', { class: 'grow', text: 'Thème' }), seg('theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']])),
        h('div', { class: 'grp-row' }, h('span', { class: 'grow', text: 'Couleur d\'accent' }),
          h('div', { style: 'display:flex;gap:10px' }, swatches.map((c) => h('button', { class: 'swatch' + (S.settings.accent === c ? ' on' : ''), type: 'button', 'aria-label': 'Accent ' + c, style: { background: c }, onclick: async () => { await set({ accent: c }); render(); } })))))),
    S.settings.neverSave.length ? h('section', { style: 'display:flex;flex-direction:column;gap:10px;max-width:760px' },
      h('div', { class: 'sec', text: 'Sites pour lesquels l\'enregistrement est désactivé' }),
      h('div', { class: 'group' }, S.settings.neverSave.map((s) => h('div', { class: 'grp-row' }, h('span', { class: 'grow', text: s }),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { await set({ neverSave: S.settings.neverSave.filter((x) => x !== s) }); render(); } }, 'Retirer'))))) : null,
    h('section', { style: 'max-width:760px' }, h('p', { class: 'muted', style: 'font-size:12px;line-height:1.6', text: 'Never Forget 1.0 · Chiffrement AES-256-GCM, clé dérivée par PBKDF2-SHA256 (600 000 itérations). Aucun serveur, aucun compte, aucune télémétrie : seule la vérification des fuites (optionnelle) contacte haveibeenpwned.com, avec une empreinte partielle.' })));
}

boot();
