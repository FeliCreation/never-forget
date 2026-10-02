// Serveur statique minimal pour la prévisualisation. node tools/serve.mjs  → http://localhost:5173/dev.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ext = join(base, 'extension');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/dev.html') {
    res.writeHead(200, { 'content-type': types['.html'] });
    return res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Never Forget (dev)</title><link rel="stylesheet" href="ui/ui.css"></head><body><div id="app"></div><script src="/__shim.js"></script><script type="module" src="app.js"></script></body></html>');
  }
  if (p === '/login-test.html') { // page de connexion factice pour tester content.js avec un « faux » service worker
    res.writeHead(200, { 'content-type': types['.html'] });
    return res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion test</title></head><body style="font-family:sans-serif;padding:40px">
<h1>Connexion</h1><form id="f" onsubmit="event.preventDefault();document.title='soumis'" style="display:flex;flex-direction:column;gap:12px;width:320px">
<input id="u" name="email" type="email" placeholder="E-mail"><input id="p" name="password" type="password" placeholder="Mot de passe"><button id="go">Se connecter</button></form>
<script>
let pending=null;
window.chrome={runtime:{id:'t',lastError:null,onMessage:{addListener(f){window.__onMsg=f}},sendMessage(m,cb){
 window.__log=(window.__log||[]);window.__log.push(m.type);
 window.__msgs=(window.__msgs||[]);window.__msgs.push(m);
 let r={ok:true};
 if(m.type==='nf:matches')r={state:'ok',items:[{id:'1',name:'GitHub',username:'cyril@exemple.fr'}]};
 else if(m.type==='nf:fill')r={username:'cyril@exemple.fr',password:'S3cret-test!'};
 else if(m.type==='nf:capture'){pending={action:'new',username:m.username,host:'localhost'};r=pending}
 else if(m.type==='nf:pending')r=pending||{action:'none'};
 cb(r)}}};
</script><script src="/content.js"></script></body></html>`);
  }
  const file = p === '/__shim.js' ? join(base, 'tools', 'dev-shim.js') : normalize(join(ext, p));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  try {
    let buf = await readFile(file);
    if (p === '/popup.html') buf = Buffer.from(buf.toString().replace('<script type="module"', '<script src="/__shim.js"></script><script type="module"'));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(5173, () => console.log('http://localhost:5173/dev.html'));
