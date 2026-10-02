// Script de contenu : pastille de remplissage sur les champs de connexion + proposition d'enregistrement.
// Principes : rien n'est rempli sans clic de l'utilisateur ; l'interface vit dans un shadow DOM fermé
// (la page ne peut pas la lire) ; seuls les clics réels (isTrusted) sont acceptés.
(() => {
  if (window.top !== window || window.__neverForget) return;
  window.__neverForget = true;

  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); }); } catch { res(undefined); }
  });

  // ---- Champs ---------------------------------------------------------------
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const passwordFields = () => [...document.querySelectorAll('input[type="password"]')].filter(visible);
  const USER_RE = /user|login|email|e-mail|mail|identifiant|account|compte/i;
  const isUserish = (el) => {
    if (el.tagName !== 'INPUT') return false;
    const t = (el.type || 'text').toLowerCase();
    if (!['text', 'email', 'tel'].includes(t)) return false;
    return /username|email/.test(el.autocomplete || '') || t === 'email' || USER_RE.test(el.name + ' ' + el.id);
  };
  const isTarget = (el) => el && el.tagName === 'INPUT' && visible(el) && (el.type === 'password' || isUserish(el));

  function usernameFor(pw) {
    const scope = pw && pw.form ? pw.form : document;
    const cands = [...scope.querySelectorAll('input')].filter((i) =>
      ['text', 'email', 'tel'].includes((i.type || 'text').toLowerCase()) && visible(i));
    if (!pw) return cands.find(isUserish) || null;
    const before = cands.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before[before.length - 1] || null;
  }

  function setValue(el, v) {
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    el.focus();
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fill(username, password, anchor) {
    const pws = passwordFields();
    const pw = (anchor && anchor.type === 'password' ? anchor : pws[0]) || null;
    const user = (anchor && isUserish(anchor) ? anchor : null) || usernameFor(pw);
    if (user && username) setValue(user, username);
    if (pw && password) setValue(pw, password);
  }

  // ---- Interface (shadow DOM fermé) ------------------------------------------
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    .badge{position:fixed;width:24px;height:24px;border-radius:7px;border:0;padding:0;cursor:pointer;background:#0071E3;display:none;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.3)}
    .badge svg{width:14px;height:14px}
    .menu{position:fixed;min-width:240px;max-width:340px;background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.12);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:6px;display:none}
    .menu .hd{font-size:11px;font-weight:600;color:#6e6e73;padding:6px 8px 4px}
    .menu button,.banner button{font:inherit;cursor:pointer}
    .opt{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:0;background:transparent;border-radius:8px;padding:8px 10px;color:inherit;font-size:13px}
    .opt:hover,.opt:focus-visible{background:rgba(0,0,0,.06);outline:none}
    .opt small{color:#6e6e73;font-size:12px}
    .msg{font-size:13px;padding:8px 10px;color:#3a3a3c;line-height:1.4}
    .banner{position:fixed;top:16px;right:16px;width:340px;background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.12);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);padding:16px;display:none;font-size:13px;line-height:1.45}
    .banner h4{margin:0 0 4px;font-size:14px;display:flex;align-items:center;gap:8px}
    .banner .logo{width:22px;height:22px;border-radius:6px;background:#0071E3;display:grid;place-items:center}
    .banner p{margin:0 0 12px;color:#3a3a3c;word-break:break-word}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    .b{min-height:34px;padding:0 14px;border-radius:9px;border:0;font-size:13px;font-weight:500;background:rgba(0,0,0,.07);color:#1d1d1f}
    .b.p{background:#0071E3;color:#fff}
    @media (prefers-color-scheme:dark){
      .menu,.banner{background:#2c2c2e;color:#f5f5f7;border-color:rgba(255,255,255,.14)}
      .opt:hover,.opt:focus-visible{background:rgba(255,255,255,.1)}
      .opt small,.menu .hd{color:#a1a1a6}.msg,.banner p{color:#d1d1d6}
      .b{background:rgba(255,255,255,.12);color:#f5f5f7}
    }
  </style>
  <button class="badge" type="button" aria-label="Never Forget : remplir"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></button>
  <div class="menu" role="menu"></div>
  <div class="banner" role="dialog" aria-label="Never Forget"></div>`;
  const badge = root.querySelector('.badge');
  const menu = root.querySelector('.menu');
  const banner = root.querySelector('.banner');
  const LOGO = '<span class="logo"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></span>';

  const attach = () => { if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  let target = null;

  function place() {
    if (!target || !target.isConnected) { badge.style.display = 'none'; menu.style.display = 'none'; return; }
    const r = target.getBoundingClientRect();
    if (r.width < 90 || r.bottom < 0 || r.top > innerHeight) { badge.style.display = 'none'; menu.style.display = 'none'; return; }
    badge.style.display = 'grid';
    badge.style.left = Math.max(0, r.right - 30) + 'px';
    badge.style.top = r.top + (r.height - 24) / 2 + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 350)) + 'px';
    menu.style.top = r.bottom + 6 + 'px';
  }

  function closeMenu() { menu.style.display = 'none'; }

  async function openMenu() {
    attach();
    menu.replaceChildren();
    menu.appendChild(el('div', 'hd', 'NEVER FORGET'));
    const res = await send({ type: 'nf:matches' });
    const addOpenApp = (label) => {
      const b = el('button', 'opt', label);
      b.type = 'button';
      b.addEventListener('click', (e) => { if (e.isTrusted) { send({ type: 'nf:open-app' }); closeMenu(); } });
      menu.appendChild(b);
    };
    if (!res) menu.appendChild(el('div', 'msg', 'Extension indisponible. Rechargez la page.'));
    else if (res.state === 'novault') addOpenApp('Créer mon coffre');
    else if (res.state === 'locked') {
      menu.appendChild(el('div', 'msg', 'Le coffre est verrouillé. Cliquez sur l\'icône Never Forget dans la barre du navigateur pour le déverrouiller.'));
      addOpenApp('Ouvrir Never Forget');
    } else if (!res.items.length) {
      menu.appendChild(el('div', 'msg', 'Aucun identifiant enregistré pour ce site.'));
      addOpenApp('Ouvrir mon coffre');
    } else {
      for (const it of res.items) {
        const b = el('button', 'opt');
        b.type = 'button';
        b.appendChild(el('span', '', it.name || 'Sans nom'));
        b.appendChild(el('small', '', it.username || '(sans identifiant)'));
        b.addEventListener('click', async (e) => {
          if (!e.isTrusted) return;
          const anchor = target;
          closeMenu();
          const c = await send({ type: 'nf:fill', id: it.id });
          if (!c || c.error) {
            alert(c && c.error === 'insecure' ? 'Never Forget : page non sécurisée (http), remplissage refusé.' : 'Never Forget : impossible de remplir ce champ.');
            return;
          }
          fill(c.username, c.password, anchor);
        });
        menu.appendChild(b);
      }
    }
    menu.style.display = 'block';
    place();
  }

  badge.addEventListener('mousedown', (e) => e.preventDefault());
  badge.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    if (menu.style.display === 'block') closeMenu(); else openMenu();
  });

  document.addEventListener('focusin', (e) => {
    if (isTarget(e.target)) { target = e.target; attach(); closeMenu(); place(); }
  }, true);
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isTarget(document.activeElement) && menu.style.display !== 'block') { badge.style.display = 'none'; } }, 150);
  }, true);
  document.addEventListener('mousedown', (e) => { if (e.target !== host) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); }, true);
  let raf = 0;
  const reposition = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  addEventListener('scroll', reposition, true);
  addEventListener('resize', reposition);

  // ---- Remplissage demandé depuis la popup ----------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg || msg.type !== 'nf:fill-creds') return;
    const t = isTarget(document.activeElement) ? document.activeElement : null;
    fill(String(msg.username || ''), String(msg.password || ''), t);
    sendResponse({ ok: passwordFields().length > 0 || !!usernameFor(null) });
  });

  // ---- Détection de connexion / inscription ------------------------------------
  let lastSent = '';
  function collect() {
    const pws = passwordFields().filter((p) => p.value);
    if (!pws.length) return null;
    let pw = pws[pws.length - 1];
    if (pws.length >= 2) {
      const dup = pws.find((p, i) => pws.some((q, j) => i !== j && q.value === p.value));
      if (dup) pw = dup;
    }
    const u = usernameFor(pw);
    return { username: u ? u.value.trim() : '', password: pw.value };
  }

  async function capture() {
    const c = collect();
    if (!c) return;
    const sig = c.username + '\u0000' + c.password;
    if (sig === lastSent) return;
    lastSent = sig;
    const r = await send({ type: 'nf:capture', ...c });
    if (r && r.action && r.action !== 'none') setTimeout(showPending, 1200);
  }

  document.addEventListener('submit', capture, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"], [role="button"]');
    if (b && e.isTrusted) capture();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.isTrusted && e.target.tagName === 'INPUT') capture(); }, true);

  async function showPending() {
    const p = await send({ type: 'nf:pending' });
    if (!p || !p.action || p.action === 'none') return;
    attach();
    banner.replaceChildren();
    const h = el('h4'); h.insertAdjacentHTML('afterbegin', LOGO); h.appendChild(el('span', '', 'Never Forget'));
    const isUpdate = p.action === 'update';
    const txt = isUpdate
      ? `Mettre à jour le mot de passe de ${p.username || 'ce compte'} sur ${p.host} ?`
      : `Enregistrer le mot de passe de ${p.username || 'ce compte'} pour ${p.host} ?`;
    const row = el('div', 'row');
    const mk = (label, cls, fn) => {
      const b = el('button', 'b ' + cls, label); b.type = 'button';
      b.addEventListener('click', (e) => { if (e.isTrusted) fn(); });
      row.appendChild(b);
    };
    const done = () => { banner.style.display = 'none'; };
    mk(isUpdate ? 'Mettre à jour' : 'Enregistrer', 'p', async () => {
      const r = await send({ type: 'nf:save-pending' });
      banner.replaceChildren(h.cloneNode(true), el('p', '', r && r.ok ? 'Enregistré dans votre coffre.' : 'Échec : le coffre est peut-être verrouillé.'));
      setTimeout(done, 1800);
    });
    mk('Plus tard', '', () => { send({ type: 'nf:dismiss' }); done(); });
    mk('Jamais ici', '', () => { send({ type: 'nf:dismiss', never: true }); done(); });
    banner.append(h, el('p', '', txt), row);
    banner.style.display = 'block';
  }

  // Après une navigation (envoi de formulaire), on regarde s'il y a une proposition en attente.
  showPending();
})();
