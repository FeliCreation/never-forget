// Petits utilitaires DOM. Tout est construit avec textContent : aucune donnée du coffre n'est
// jamais interprétée comme du HTML.

const SVG = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate']);

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') { if (typeof v === 'string') e.style.cssText = v; else Object.assign(e.style, v); }
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  append(e, kids);
  return e;
}

function append(e, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    e.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

export function icon(d, size = 18, stroke = 'currentColor', sw = 1.8) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', stroke); s.setAttribute('stroke-width', sw);
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  for (const part of d.split('|')) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', part);
    s.appendChild(p);
  }
  return s;
}

export const ICONS = {
  lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4',
  all: 'M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 11h9M18 11v3M21 11v2',
  gen: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.7A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4.4-1',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5',
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9z|M5 15V4h11',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14'
};

let toastEl, toastT;
export function toast(msg) {
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

let clipTimer;
export async function copyText(text, clearSec = 30) {
  try { await navigator.clipboard.writeText(text); } catch { toast('Copie impossible'); return; }
  clearTimeout(clipTimer);
  if (clearSec > 0) {
    clipTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), clearSec * 1000);
    toast(`Copié · effacé du presse-papiers dans ${clearSec} s`);
  } else toast('Copié');
}

export function download(filename, text, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Dialogue modal générique. `build(close)` renvoie le contenu ; la promesse se résout avec la valeur passée à close().
export function modal(build, { narrow = false } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: narrow ? 'narrow' : '' });
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.appendChild(build(close));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(undefined); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export function ask(title, text, okLabel = 'Confirmer', danger = false) {
  return modal((close) => h('div', { class: 'dlg' },
    h('h2', { text: title }),
    h('p', { class: 'muted', style: 'line-height:1.55', text }),
    h('div', { class: 'dlg-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Annuler'),
      h('button', { class: 'btn ' + (danger ? 'primary danger-fill' : 'primary'), type: 'button', style: danger ? 'background:var(--warn)' : '', onclick: () => close(true), autofocus: true }, okLabel))
  ), { narrow: true });
}

export const fmtDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
