// Service worker : répond aux scripts de contenu et verrouille le coffre après inactivité.
// Règle de sécurité : on se fie à l'URL de l'expéditeur (sender.url, fournie par le navigateur),
// jamais à une URL envoyée par la page.
import * as V from './lib/vault.js';
import { siteMatches, hostOf, newItem } from './lib/items.js';

const PENDING_TTL = 120000;

function ensureAlarm() {
  chrome.alarms.get('autolock', (a) => { if (!a) chrome.alarms.create('autolock', { periodInMinutes: 1 }); });
}
chrome.runtime.onInstalled.addListener(({ reason }) => {
  ensureAlarm();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'autolock') V.isUnlocked(); });

const pendingKey = (tabId) => 'nf_pending_' + tabId;

async function handle(msg, sender) {
  const url = sender.url || '';
  const tabId = sender.tab && sender.tab.id;
  if (!/^https?:/.test(url) || tabId === undefined) return { error: 'bad_sender' };

  switch (msg.type) {
    case 'nf:matches': {
      if (!(await V.hasVault())) return { state: 'novault' };
      if (!(await V.isUnlocked())) return { state: 'locked' };
      const data = await V.read();
      const items = data.items
        .filter((i) => i.type === 'login' && siteMatches(i.url, url))
        .map((i) => ({ id: i.id, name: i.name, username: i.username }));
      return { state: 'ok', items };
    }

    case 'nf:fill': {
      const u = new URL(url);
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !local) return { error: 'insecure' };
      const data = await V.read();
      const it = data.items.find((i) => i.id === msg.id && i.type === 'login');
      if (!it || !siteMatches(it.url, url)) return { error: 'mismatch' };
      return { username: it.username || '', password: it.password || '' };
    }

    case 'nf:capture': {
      const { username = '', password = '' } = msg;
      if (!password || !(await V.isUnlocked())) return { action: 'none' };
      const settings = await V.getSettings();
      const host = hostOf(url);
      if (settings.neverSave.includes(host)) return { action: 'none' };
      const data = await V.read();
      const same = data.items.filter((i) => i.type === 'login' && siteMatches(i.url, url) && (i.username || '') === username);
      let pending;
      if (!same.length) pending = { action: 'new' };
      else if (same.some((i) => i.password === password)) return { action: 'none' };
      else pending = { action: 'update', id: same[0].id };
      pending = { ...pending, username, password, url: new URL(url).origin, host, at: Date.now() };
      await chrome.storage.session.set({ [pendingKey(tabId)]: pending });
      return { action: pending.action, username, host };
    }

    case 'nf:pending': {
      const k = pendingKey(tabId);
      const p = (await chrome.storage.session.get(k))[k];
      if (!p) return { action: 'none' };
      const cur = hostOf(url);
      if (Date.now() - p.at > PENDING_TTL || !(p.host === cur || siteMatches(p.host, url) || siteMatches('https://' + cur, 'https://' + p.host))) {
        await chrome.storage.session.remove(k);
        return { action: 'none' };
      }
      return { action: p.action, username: p.username, host: p.host };
    }

    case 'nf:save-pending': {
      const k = pendingKey(tabId);
      const p = (await chrome.storage.session.get(k))[k];
      if (!p) return { error: 'none' };
      await V.mutate((d) => {
        if (p.action === 'update') {
          const it = d.items.find((i) => i.id === p.id);
          if (it) { it.password = p.password; it.updated = it.pwChanged = Date.now(); }
        } else {
          d.items.push(newItem('login', { name: p.host, url: p.url, username: p.username, password: p.password }));
        }
      });
      await chrome.storage.session.remove(k);
      return { ok: true };
    }

    case 'nf:dismiss': {
      const k = pendingKey(tabId);
      const p = (await chrome.storage.session.get(k))[k];
      await chrome.storage.session.remove(k);
      if (msg.never && p) {
        const s = await V.getSettings();
        if (!s.neverSave.includes(p.host)) await V.saveSettings({ neverSave: [...s.neverSave, p.host] });
      }
      return { ok: true };
    }

    case 'nf:open-app':
      await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
      return { ok: true };

    default:
      return { error: 'unknown' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Seuls les scripts de contenu de cette extension passent ici (sender.tab défini).
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('nf:')) return;
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(pendingKey(tabId)));
