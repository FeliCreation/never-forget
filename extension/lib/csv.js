// Import / export CSV. Reconnaît les exports de Dashlane, Chrome/Edge, Bitwarden, 1Password, Firefox.
import { newItem, hostOf } from './items.js';

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

const ALIASES = {
  name: ['title', 'name', 'nom', 'login_name'],
  url: ['url', 'login_uri', 'website', 'web site', 'site'],
  username: ['username', 'login_username', 'login', 'email', 'user'],
  password: ['password', 'login_password', 'mot de passe', 'pass'],
  totp: ['otpsecret', 'login_totp', 'otpauth', 'totp'],
  notes: ['note', 'notes']
};

// Renvoie { items, skipped }. `items` sont prêts à être ajoutés au coffre.
export function itemsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[k] = i;
  }
  const get = (r, k) => (col[k] !== undefined ? (r[col[k]] || '').trim() : '');
  const items = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const url = get(r, 'url');
    let name = get(r, 'name') || hostOf(url);
    const password = get(r, 'password');
    const username = get(r, 'username');
    const notes = get(r, 'notes');
    if (!password && !username && col.password === undefined && (name || notes)) {
      // Fichier de notes (ex. securenotes.csv de Dashlane : title,note).
      items.push(newItem('note', { name: name || 'Note', text: notes }));
      continue;
    }
    if (!name && !url && !username) { skipped++; continue; }
    items.push(newItem('login', { name: name || url, url, username, password, totp: get(r, 'totp'), notes }));
  }
  return { items, skipped };
}

const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

export function loginsToCsv(items) {
  const head = ['name', 'url', 'username', 'password', 'note', 'otpSecret'];
  const lines = [head.join(',')];
  for (const it of items.filter((i) => i.type === 'login')) {
    lines.push([it.name, it.url, it.username, it.password, it.notes, it.totp].map(esc).join(','));
  }
  return lines.join('\r\n');
}
