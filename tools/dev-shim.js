// Simule chrome.storage / chrome.runtime pour prévisualiser l'interface dans un onglet normal.
// Usage dev uniquement (http://localhost:5173/dev.html) : jamais livré dans l'extension.
(() => {
  const area = (store, prefix) => ({
    get: async (k) => { const v = store.getItem(prefix + k); return v === null ? {} : { [k]: JSON.parse(v) }; },
    set: async (o) => { for (const [k, v] of Object.entries(o)) store.setItem(prefix + k, JSON.stringify(v)); },
    remove: async (k) => { for (const x of [].concat(k)) store.removeItem(prefix + x); }
  });
  window.chrome = {
    storage: { local: area(localStorage, 'nf:'), session: area(sessionStorage, 'nf:'), onChanged: { addListener() {} } },
    runtime: { id: 'dev', getURL: (p) => '/' + p, sendMessage() {}, onMessage: { addListener() {} } },
    tabs: { create: ({ url }) => window.open(url), query: async () => [], sendMessage: async () => ({}) }
  };
})();
