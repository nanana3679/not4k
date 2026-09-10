// PROTOTYPE: private, expiring, explicit-file share; no project-directory serving.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const host=execFileSync('tailscale',['ip','-4'],{encoding:'utf8'}).trim().split('\n')[0];
let prior;
if(process.argv.includes('--reuse-link')){try{prior=JSON.parse(await readFile(new URL('preview-state.json',import.meta.url),'utf8'));}catch{}}
const old=prior?new URL(prior.url):null,reuse=old?.hostname===host&&Date.parse(prior.expiresAt)>Date.now();
const token=reuse?old.pathname.split('/')[1]:randomBytes(24).toString('hex');
const expiresAt=reuse?prior.expiresAt:new Date(Date.now()+86400000).toISOString();
const files=new Map();
for(const name of ["index.html", "style.css", "scene.mjs", "integration.mjs", "world-trails.mjs", "light-batch.mjs", "render-model.mjs", "surface-geometry.mjs", "originals/hangar.mjs", "vendor/three.module.js", "vendor/three.core.js", "vendor/LICENSE", "legacy/geometry.mjs", "legacy/architecture.mjs", "legacy/original-motion.mjs", "legacy/palette.mjs", "legacy/surface-art.mjs", "legacy/wall-contours.mjs", "legacy/clearance.mjs", "legacy/afterglow.mjs", "model-library.mjs", "surroundings.mjs", "painted-backdrop.mjs", "catalog.mjs", "blueprint-kit.mjs", "originals/wedge.mjs", "modules/d-twin-gallery.mjs", "modules/f-open-dock.mjs", "modules/c-service-tower.mjs", "modules/e-hangar.mjs", "modules/b-maintenance.mjs", "modules/h-logistics-hub.mjs", "modules/g-transfer-spine.mjs", "modules/a-wedge.mjs"]){const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.mjs')||name.endsWith('.js')?'text/javascript':'text/plain';files.set(name,{bytes:await readFile(new URL(name,import.meta.url)),type});}
for(const id of ['armor','window','door'])files.set(`assets/${id}.png`,{bytes:await readFile(new URL(`../../imagegen/wedge-surface-textures-20260910/${id}.png`,import.meta.url)),type:'image/png'});
for(const id of ['hull','soffit'])files.set(`assets/${id}.png`,{bytes:await readFile(new URL(`../../imagegen/hangar-surface-textures-20260910/${id}.png`,import.meta.url)),type:'image/png'});
files.set('assets/distant-architecture.png',{bytes:await readFile(new URL('../../imagegen/distant-architecture-backdrop-20260910/distant-architecture.png',import.meta.url)),type:'image/png'});
files.set('share.json',{bytes:Buffer.from(JSON.stringify({expiresAt})),type:'application/json'});
const server=createServer((req,res)=>{const path=new URL(req.url,'http://preview.local').pathname,prefix=`/${token}/`,entry=path.startsWith(prefix)?files.get(path.slice(prefix.length)||'index.html'):null;
if(!entry||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
res.writeHead(200,{'Content-Type':entry.type,'Content-Length':entry.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:entry.bytes);});
server.listen(reuse?Number(old.port):0,host,async()=>{const state={url:`http://${host}:${server.address().port}/${token}/`,expiresAt,pid:process.pid};await writeFile(new URL('preview-state.json',import.meta.url),JSON.stringify(state,null,2),{mode:0o600});console.log(JSON.stringify(state));});
setTimeout(()=>{server.closeAllConnections();server.close();},Math.max(1,Date.parse(expiresAt)-Date.now()));
