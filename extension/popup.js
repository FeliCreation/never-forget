import * as V from './lib/vault.js';
import { hostOf, siteMatches, tileColor, tileLetter, searchItems, subtitle } from './lib/items.js';
import { h, icon, ICONS, toast, copyText } from './ui/dom.js';

const root = document.getElementById('pop');
let settings, tab, data, q = '';

const openApp = () => { chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); window.close(); };
const logo = () => h('span', { class: 'logo' }, icon(ICONS.lock, 16, '#fff', 2.2));

async function init() {
  settings = await V.getSettings();
  const r = document.documentElement;
  if (settings.theme !== 'auto') r.setAttribute('data-theme', settings.theme);
  r.style.setProperty('--accent', settings.accent);
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!(await V.hasVault())) return draw(h('div', { class: 'empty' }, h('b', { style: 'color:var(--text)', text: 'Bienvenue' }), 'Créez votre coffre pour commencer.', h('button', { class: 'btn primary', type: 'button', onclick: openApp }, 'Créer mon coffre')));
  if (!(await V.isUnlocked())) return lockForm();
  data = await V.read();
  list();
}

function draw(...kids) {
  root.replaceChildren(h('div', { class: 'top' }, h('div', { class: 'brand' }, logo(), 'Never Forget')), ...kids);
}

function lockForm(err = '') {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe maître', 'aria-label': 'Mot de passe maître' });
  const e = h('div', { class: 'err', role: 'alert', text: err });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Déverrouiller');
  draw(h('form', { style: 'display:flex;flex-direction:column;gap:10px', onsubmit: async (ev) => {
    ev.preventDefault();
    btn.disabled = true; btn.textContent = 'Déverrouillage…';
    try { await V.unlock(pw.value); data = await V.read(); list(); }
    catch (x) { lockForm(x.message === 'BAD_PASSWORD' ? 'Mot de passe incorrect.' : 'Erreur : ' + x.message); }
  } }, pw, e, btn));
  root.querySelector('input').focus();
}

async function fillTab(it) {
  const url = tab && tab.url;
  if (!url || !siteMatches(it.url, url)) return toast('Cet identifiant ne correspond pas au site');
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') return toast('Page non sécurisée : remplissage refusé');
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'nf:fill-creds', username: it.username || '', password: it.password || '' });
    if (res && res.ok) window.close(); else toast('Aucun champ de connexion trouvé');
  } catch { toast('Rechargez la page puis réessayez'); }
}

function row(it, withFill) {
  return h('div', { class: 'item', style: 'cursor:default' },
    h('span', { class: 'tile', style: { background: tileColor(it.name) }, text: tileLetter(it.name) }),
    h('span', { class: 't' }, h('b', { text: it.name || 'Sans nom' }), h('span', { text: subtitle(it) })),
    h('span', { class: 'acts' },
      withFill ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => fillTab(it) }, 'Remplir') : null,
      it.username ? h('button', { class: 'btn sm icon', type: 'button', title: 'Copier l\'identifiant', 'aria-label': 'Copier l\'identifiant', onclick: () => copyText(it.username, 0) }, icon(ICONS.all, 14)) : null,
      it.password ? h('button', { class: 'btn sm icon', type: 'button', title: 'Copier le mot de passe', 'aria-label': 'Copier le mot de passe', onclick: () => copyText(it.password, settings.clipboardClearSec) }, icon(ICONS.copy, 14)) : null));
}

function list() {
  const logins = data.items.filter((i) => i.type === 'login');
  const here = tab && tab.url ? logins.filter((i) => siteMatches(i.url, tab.url)) : [];
  const box = h('div', { class: 'list' });
  const paint = () => {
    const found = q ? searchItems(logins, q).slice(0, 20) : [];
    box.replaceChildren(
      ...(q ? (found.length ? found.map((i) => row(i, false)) : [h('div', { class: 'empty', text: 'Aucun résultat' })])
        : [here.length ? h('div', { class: 'sec', style: 'padding:4px 8px', text: hostOf(tab.url) }) : null,
          ...here.map((i) => row(i, true)),
          !here.length ? h('div', { class: 'empty', style: 'padding:18px 8px', text: tab && tab.url && /^https?:/.test(tab.url) ? 'Aucun identifiant pour ce site.' : 'Ouvrez un site pour voir ses identifiants.' }) : null].filter(Boolean)));
  };
  const search = h('input', { class: 'input', placeholder: 'Rechercher dans le coffre', 'aria-label': 'Rechercher', oninput: (e) => { q = e.target.value; paint(); } });
  draw(search, box,
    h('div', { style: 'display:flex;gap:8px' },
      h('button', { class: 'btn', type: 'button', style: 'flex:1', onclick: openApp }, 'Ouvrir le coffre'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { await V.lock(); window.close(); } }, icon(ICONS.lock, 16), 'Verrouiller')));
  paint();
}

init();
