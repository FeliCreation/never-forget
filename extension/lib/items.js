// Modèle des éléments du coffre + correspondance des sites.

export const TYPES = {
  login: {
    label: 'Identifiant', plural: 'Identifiants',
    icon: 'M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 11h9M18 11v3M21 11v2',
    fields: [
      { key: 'url', label: 'Site web', kind: 'url', placeholder: 'https://exemple.fr' },
      { key: 'username', label: 'Identifiant ou e-mail', kind: 'text' },
      { key: 'password', label: 'Mot de passe', kind: 'password' },
      { key: 'totp', label: 'Code de validation (clé TOTP)', kind: 'totp', placeholder: 'Clé secrète ou lien otpauth://' }
    ]
  },
  note: {
    label: 'Note', plural: 'Notes sécurisées',
    icon: 'M6 3h9l3 3v15H6zM9 12h6M9 16h6',
    fields: [{ key: 'text', label: 'Contenu', kind: 'textarea', rows: 6 }]
  },
  card: {
    label: 'Carte', plural: 'Paiements',
    icon: 'M3 6h18v12H3zM3 10h18',
    fields: [
      { key: 'holder', label: 'Titulaire', kind: 'text' },
      { key: 'number', label: 'Numéro de carte', kind: 'secret', mono: true },
      { key: 'expiry', label: 'Expiration (MM/AA)', kind: 'text', placeholder: '09/29' },
      { key: 'cvv', label: 'Cryptogramme', kind: 'secret', mono: true }
    ]
  },
  identity: {
    label: 'Identité', plural: 'Identités',
    icon: 'M4 5h16v14H4zM7 16a3 3 0 0 1 6 0M10 11a1.5 1.5 0 1 0 0-.01M15 10h3M15 14h3',
    fields: [
      { key: 'fullName', label: 'Nom complet', kind: 'text' },
      { key: 'email', label: 'E-mail', kind: 'text' },
      { key: 'phone', label: 'Téléphone', kind: 'text' },
      { key: 'address', label: 'Adresse', kind: 'textarea', rows: 2 },
      { key: 'birthDate', label: 'Date de naissance', kind: 'text', placeholder: 'JJ/MM/AAAA' }
    ]
  },
  wifi: {
    label: 'Wi-Fi', plural: 'Wi-Fi',
    icon: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01',
    fields: [
      { key: 'password', label: 'Mot de passe', kind: 'password' },
      { key: 'security', label: 'Sécurité', kind: 'text', placeholder: 'WPA2, WPA3…' }
    ]
  }
};

export const TYPE_ORDER = ['login', 'note', 'card', 'identity', 'wifi'];

export function uid() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newItem(type = 'login', init = {}) {
  const now = Date.now();
  return { id: uid(), type, name: '', collection: '', fav: false, notes: '', created: now, updated: now, pwChanged: now, ...init };
}

// ---- Sites -----------------------------------------------------------------

export function hostOf(url) {
  if (!url) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
}

// Correspondance stricte : même hôte, ou sous-domaine d'un hôte enregistré (jamais l'inverse,
// jamais une simple sous-chaîne). "evil-github.com" ne correspond donc pas à "github.com".
export function siteMatches(itemUrl, pageUrl) {
  const a = hostOf(itemUrl), b = hostOf(pageUrl);
  if (!a || !b) return false;
  return b === a || b.endsWith('.' + a);
}

export function isHttps(url) {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

// ---- Affichage -------------------------------------------------------------

const PALETTE = ['#1D1D1F', '#0071E3', '#5E5CE6', '#BF4800', '#2C5A8C', '#3A3A3C', '#8E8E93', '#248A3D', '#AF52DE', '#C93400'];

export function tileColor(name) {
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const tileLetter = (name) => ((name || '?').trim()[0] || '?').toUpperCase();

export function searchItems(items, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return items;
  return items.filter((it) =>
    [it.name, it.url, it.username, it.collection, it.email, it.fullName].some((v) => (v || '').toLowerCase().includes(s))
  );
}

export function subtitle(it) {
  switch (it.type) {
    case 'login': return it.username || hostOf(it.url);
    case 'card': return it.number ? '•••• ' + it.number.replace(/\D/g, '').slice(-4) : it.holder || '';
    case 'identity': return it.fullName || it.email || '';
    case 'wifi': return it.security || 'Réseau Wi-Fi';
    default: return 'Note';
  }
}
