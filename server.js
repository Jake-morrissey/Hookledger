import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureStore, redact, replayFixture } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FixtureStore({ dataFile: path.join(__dirname, 'data', 'hookledger.json') });
const PORT = Number(process.env.PORT || 3000);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const replayRateLimit = new Map();
const REPLAY_RATE_WINDOW = 60000;
const REPLAY_RATE_MAX = 10;
function checkReplayRate(ip) {
  const now = Date.now();
  const entry = replayRateLimit.get(ip);
  if (!entry || now - entry.start > REPLAY_RATE_WINDOW) {
    replayRateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= REPLAY_RATE_MAX;
}
const SUPPORT_URL = 'https://github.com/sponsors/Jake-morrissey';

const NAV_ITEMS = [
  ['/', 'Home'],
  ['/workspace', 'Workspace'],
  ['/docs', 'Docs'],
  ['/support', 'Support'],
  ['/changelog', 'Changelog']
];

function shell({ pathName, title, body, scripts = '' }) {
  const nav = NAV_ITEMS.map(([href, label]) => `<a class="${pathName === href ? 'active' : ''}" href="${href}">${label}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · HookLedger</title><style>
  :root{--bg:#070b16;--panel:#101729;--line:#24304a;--text:#eef4ff;--muted:#99a8c7;--blue:#5b8cff;--cyan:#42d6ff;--green:#42e8a4;--red:#ff5b7f;--yellow:#ffd166;--shadow:0 24px 80px #0008;--radius:22px}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,Segoe UI,sans-serif;background:radial-gradient(circle at top left,#16285a 0,#070b16 36rem),linear-gradient(180deg,#070b16,#0a1020);color:var(--text);line-height:1.55}a{color:inherit;text-decoration:none}.wrap{max-width:1180px;margin:0 auto;padding:0 24px}.topbar{position:sticky;top:0;z-index:10;background:#070b16cc;backdrop-filter:blur(18px);border-bottom:1px solid #ffffff12}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:12px;font-weight:900}.logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:grid;place-items:center;color:#07101f}.links{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.links a{padding:10px 14px;border-radius:999px;color:var(--muted);font-weight:700;font-size:14px}.links a:hover,.links a.active{background:#ffffff12;color:var(--text)}.cta{background:linear-gradient(135deg,var(--cyan),var(--blue));color:#06111f!important;padding:11px 16px!important;border-radius:999px;font-weight:900!important}.hero{padding:74px 0 54px}.badge{display:inline-flex;gap:8px;align-items:center;border:1px solid #ffffff1f;background:#ffffff0d;color:#cfe8ff;padding:8px 12px;border-radius:999px;font-weight:800;font-size:13px}.grid-hero,.workspace,.pricing,.cards{display:grid;gap:18px}.grid-hero{grid-template-columns:1.05fr .95fr;align-items:center}.headline{font-size:clamp(42px,7vw,76px);line-height:.96;letter-spacing:-.07em;margin:22px 0}.gradient{background:linear-gradient(135deg,#fff,#9dccff 45%,#42d6ff);-webkit-background-clip:text;color:transparent}.sub{font-size:19px;color:var(--muted);max-width:650px}.actions,.toolbar,.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.button,button{border:0;border-radius:14px;padding:13px 17px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,var(--cyan),var(--blue));color:#06111f;box-shadow:0 12px 30px #427bff35}.button.secondary,button.secondary{background:#ffffff12;color:var(--text);box-shadow:none;border:1px solid #ffffff1a}.button.danger,button.danger{background:var(--red);color:white}.button.ghost,button.ghost{background:transparent;color:#b9d3ff;border:1px solid var(--line);box-shadow:none}.panel{background:linear-gradient(180deg,#111a31,#0c1325);border:1px solid #ffffff14;border-radius:var(--radius);box-shadow:var(--shadow)}.code-card,.card{padding:22px}.window{display:flex;gap:7px;margin-bottom:14px}.dot{width:11px;height:11px;border-radius:50%;background:#ff5f57}.dot:nth-child(2){background:#ffbd2e}.dot:nth-child(3){background:#28c840}pre,code,textarea{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}pre{white-space:pre-wrap;background:#050914;border:1px solid #ffffff12;border-radius:16px;padding:16px;overflow:auto;color:#d8e6ff}.cards{grid-template-columns:repeat(3,1fr);margin:34px 0}.card{background:#ffffff08;border:1px solid #ffffff12;border-radius:var(--radius)}.muted,.small{color:var(--muted)}.small{font-size:13px}.page{padding:40px 0 70px}.page-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:22px}.page h1{font-size:44px;letter-spacing:-.04em;margin:0}.workspace{grid-template-columns:minmax(320px,440px) 1fr}.field{display:block;font-weight:800;color:#d7e6ff;margin-top:12px}input,select,textarea{width:100%;margin-top:7px;padding:12px 13px;border-radius:14px;border:1px solid var(--line);background:#081020;color:var(--text);font:inherit}textarea{min-height:120px}.status{min-height:28px}.ok{color:var(--green)}.error{color:var(--red)}.fixture{padding:16px;border:1px solid var(--line);background:#081020;border-radius:18px;margin:12px 0}.fixture-title{display:flex;justify-content:space-between;gap:12px;align-items:start}.method{font-size:12px;font-weight:900;color:#06111f;background:var(--green);padding:4px 8px;border-radius:999px}.metric{font-size:32px;font-weight:950;letter-spacing:-.04em}.pricing{grid-template-columns:repeat(3,1fr)}.price{font-size:44px;font-weight:950}.notice{border:1px solid #ffd16655;background:#ffd16614;color:#ffe0a3;border-radius:18px;padding:14px;margin:18px 0}.footer{border-top:1px solid #ffffff12;padding:28px 0;color:var(--muted)}
  @media(max-width:900px){.grid-hero,.workspace,.pricing,.cards{grid-template-columns:1fr}.links{display:none}.page-head{display:block}}
  </style></head><body><div class="topbar"><div class="wrap nav"><a class="brand" href="/"><span class="logo">⌁</span><span>HookLedger</span></a><nav class="links">${nav}</nav></div></div>${body}<footer class="footer"><div class="wrap row"><strong>HookLedger</strong><span>Free and open-source localhost-first webhook fixture notebook.</span><a href="${SUPPORT_URL}" target="_blank" rel="noopener">Support this project</a></div></footer>${scripts}</body></html>`;
}

function homePage(pathName) {
  return shell({ pathName, title: 'Replay webhooks without recreating events', body: `<main class="wrap hero"><div class="grid-hero"><section><span class="badge">Free and open source · Local-first · Secret redaction</span><h1 class="headline">Stop rebuilding <span class="gradient">webhook events</span> by hand.</h1><p class="sub">HookLedger is a free and open-source localhost-first notebook for developers who save, redact, edit, and replay webhook fixtures against local endpoints.</p><div class="actions"><a class="button" href="/workspace">Open the workspace</a><a class="button secondary" href="/docs">Read the docs</a></div></section><aside class="panel code-card"><div class="window"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><pre>{
  "fixture": "stripe.payment_succeeded",
  "redacted": true,
  "target": "http://localhost:4000/webhook",
  "lastReplay": { "status": 200, "ok": true }
}</pre></aside></div><div class="cards"><div class="card"><h3>Capture once</h3><p class="muted">Paste headers and body from any webhook provider, then store it as a reusable local fixture.</p></div><div class="card"><h3>Redact by default</h3><p class="muted">Common token, authorization, cookie, password, and signature fields are replaced before saving.</p></div><div class="card"><h3>Replay fast</h3><p class="muted">Send known-good or edge-case payloads to your local app without clicking through provider dashboards.</p></div></div></main>` });
}

function workspacePage(pathName) {
  return shell({ pathName, title: 'Workspace', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Developer workspace</span><h1>HookLedger fixture lab</h1><p class="muted">Build a local library of replayable webhook examples.</p></div><div class="row"><button class="secondary" onclick="load()">Refresh</button><button class="secondary" onclick="exportData()">Export JSON</button></div></div><div class="workspace"><section class="panel card"><h2>Create fixture</h2><p class="small">Do not paste production secrets or sensitive customer data.</p><label class="field">Name<input id="name" placeholder="stripe.payment_succeeded happy path"></label><label class="field">Target URL<input id="url" placeholder="http://localhost:4000/webhook"></label><label class="field">Method<select id="method"><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label class="field">Headers JSON<textarea id="headers">{"content-type":"application/json","authorization":"Bearer test"}</textarea></label><label class="field">Body JSON<textarea id="body">{"event":"test.created","token":"will be redacted"}</textarea></label><div class="toolbar"><button onclick="previewPayload()">Preview redaction</button><button class="secondary" onclick="debugRedaction()">Debug redaction</button><button onclick="save()">Save fixture</button><button class="secondary" onclick="clearForm()">Clear</button></div><div id="message" class="status"></div><h3>Redaction preview</h3><pre id="previewBox">Click preview to inspect the stored shape.</pre><h3>Import</h3><textarea id="importBox" placeholder='Paste a HookLedger export JSON object with a "fixtures" array'></textarea><button class="ghost" onclick="importFixtures()">Import fixtures</button></section><section><div class="cards" style="grid-template-columns:repeat(2,1fr);margin-top:0"><div class="card"><div class="metric" id="fixtureCount">0</div><div class="small">fixtures</div></div><div class="card"><div class="metric" id="replayCount">0</div><div class="small">recent replays</div></div></div><div class="panel card"><h2>Saved fixtures</h2><input id="searchInput" type="text" placeholder="Search fixtures..." style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--text);margin-bottom:14px;font-size:14px;font-weight:600" oninput="filterFixtures()"><div id="fixtures"></div></div><div class="panel card" style="margin-top:18px"><h2>Replay history</h2><div id="replayHistory"></div></div></section></div></main><div id="responseModal" style="display:none;position:fixed;inset:0;background:#000a;z-index:100;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)closeModal()"><div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:24px;max-width:800px;width:90%;max-height:80vh;overflow:auto;box-shadow:var(--shadow)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 id="modalTitle" style="margin:0">Response</h3><button class="secondary" onclick="closeModal()">Close</button></div><pre id="modalBody" style="white-space:pre-wrap;word-break:break-all;font-size:13px"></pre></div></div>`, scripts: workspaceScript() });
}

function docsPage(pathName) {
  return shell({ pathName, title: 'Docs', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Docs</span><h1>Use HookLedger in 5 minutes</h1><p class="muted">A short guide for local webhook testing.</p></div></div><div class="cards"><div class="card"><h3>1. Paste an event</h3><p class="muted">Copy headers and JSON body from provider logs, your terminal, or a request bin.</p></div><div class="card"><h3>2. Preview redaction</h3><p class="muted">Check how HookLedger will store the fixture before it writes to disk.</p></div><div class="card"><h3>3. Replay locally</h3><p class="muted">Point the fixture at your dev endpoint and replay it while you iterate.</p></div></div><section class="panel card"><h2>Local data</h2><p>HookLedger stores data in <code>data/hookledger.json</code>. That folder is ignored by git.</p><h2>Supported methods</h2><p><code>POST</code>, <code>PUT</code>, <code>PATCH</code>, and <code>DELETE</code>.</p><h2>Open-source direction</h2><p>Phase 1 is free and open source. Hosted multi-user features, billing, auth, and sync are intentionally deferred to a future separate hosted product only if real usage proves demand.</p></section></main>` });
}

function supportPage(pathName) {
  return shell({ pathName, title: 'Support the project', body: `<main class="wrap page"><span class="badge">Support</span><h1>Support HookLedger</h1><div class="notice">HookLedger Phase 1 is free and open source. If it saves you time, consider sponsoring development.</div><div class="pricing"><div class="card"><h3>Use it free</h3><div class="price">$0</div><p class="muted">Local webhook fixture workflow, available without activation or billing.</p></div><div class="card"><h3>Sponsor development</h3><div class="price">♥</div><p class="muted">Support maintenance, documentation, and future polish for the local app.</p><div class="actions"><a class="button" href="${SUPPORT_URL}" target="_blank" rel="noopener">Support this project</a></div></div><div class="card"><h3>Future hosted version</h3><div class="price">Later</div><p class="muted">Auth, teams, multi-tenant storage, hosted replay targets, and billing belong to a separate product once real demand exists.</p></div></div></main>` });
}

function changelogPage(pathName) {
  return shell({ pathName, title: 'Changelog', body: `<main class="wrap page"><span class="badge">Product updates</span><h1>Changelog</h1><section class="panel card"><h2>0.6.0 · Production hardening</h2><p class="muted">Security, reliability, and usability improvements for production readiness.</p><ul><li>Added 1 MB request body size limit to prevent memory exhaustion.</li><li>Fixed HTTP error codes: 404 for not found, 400 for validation, 413 for oversized bodies.</li><li>Added graceful shutdown (SIGTERM/SIGINT) to persist data before exit.</li><li>Added GET /api/fixtures/:id endpoint.</li><li>Added security headers (CSP, X-Content-Type-Options, X-Frame-Options).</li><li>Added truncation indicator for replay responses over 5000 chars.</li><li>Fixed delete to skip disk write when fixture ID doesn't exist.</li><li>Renamed /pricing route to /support.</li><li>Removed placeholder "0 external accounts" metric from workspace.</li></ul><h2>0.5.0 · Free and open source reset</h2><p class="muted">Removed the local licensing system and made the workspace open by default for Phase 1.</p></section></main>` });
}

function workspaceScript() {
  return `<script>
let editingId=null;let allFixtures=[];
function parseJson(id){try{return JSON.parse(document.getElementById(id).value||'{}')}catch(e){throw new Error(id+' must be valid JSON: '+e.message)}}
function payload(){return{name:name.value,url:url.value,method:method.value,headers:parseJson('headers'),body:parseJson('body')}}
function flash(text,cls='ok'){message.innerHTML='<p class="'+cls+'">'+escapeHtml(text)+'</p>'}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function api(path,options){const r=await fetch(path,options);const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
async function previewPayload(){try{previewBox.textContent=JSON.stringify((await api('/api/redact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())})).redacted,null,2);flash('Preview generated')}catch(e){flash(e.message,'error')}}
async function debugRedaction(){try{const d=await api('/api/debug/redaction',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});previewBox.textContent=JSON.stringify(d.debug,null,2);flash('Debug: fields marked as [REDACTED] with reason')}catch(e){flash(e.message,'error')}}
async function save(){try{const p=payload();if(editingId){await api('/api/fixtures/'+editingId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)});editingId=null;document.querySelector('h2').textContent='Create fixture';flash('Fixture updated')}else{await api('/api/fixtures',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});flash('Fixture saved')}clearForm();await load()}catch(e){flash(e.message,'error')}}
async function replay(id){if(!confirm('Replay this fixture?'))return;try{const res=await api('/api/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});const r=res.replay;if(r.result.error){flash('Replay failed: '+r.result.error,'error')}else{flash('Replay '+(r.result.ok?'OK':'FAIL')+' ('+r.result.status+') in '+(r.result.durationMs||'?')+'ms')}await load()}catch(e){flash(e.message,'error')}}
async function removeFixture(id){if(!confirm('Delete this fixture?'))return;try{await api('/api/fixtures/'+id,{method:'DELETE'});flash('Fixture deleted');await load()}catch(e){flash(e.message,'error')}}
function editFixture(id){const f=allFixtures.find(x=>x.id===id);if(!f)return;editingId=id;name.value=f.name;url.value=f.url||'';method.value=f.method;headers.value=JSON.stringify(f.headers||{},null,2);body.value=JSON.stringify(f.body||{},null,2);document.querySelector('h2').textContent='Edit fixture';message.innerHTML='<p class="ok">Editing '+escapeHtml(f.name)+'</p>';window.scrollTo({top:0,behavior:'smooth'})}
function viewResponse(title,body){modalTitle.textContent=title;modalBody.textContent=body||'(empty)';responseModal.style.display='flex'}
function closeModal(){responseModal.style.display='none'}
async function importFixtures(){try{const data=JSON.parse(importBox.value);const res=await api('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});flash('Imported '+res.imported.length+' fixture(s)');importBox.value='';await load()}catch(e){flash(e.message,'error')}}
async function exportData(){try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hookledger-export.json';a.click();URL.revokeObjectURL(a.href)}catch(e){flash(e.message,'error')}}
function clearForm(){editingId=null;name.value='';url.value='';method.value='POST';headers.value='{"content-type":"application/json"}';body.value='{}';previewBox.textContent='Click preview to inspect the stored shape.';document.querySelector('h2').textContent='Create fixture'}
function filterFixtures(){const q=(searchInput.value||'').toLowerCase();const filtered=allFixtures.filter(f=>f.name.toLowerCase().includes(q)||(f.url||'').toLowerCase().includes(q));renderFixtures(filtered)}
function renderFixtures(list){fixtures.innerHTML=list.length?list.map(f=>'<div class="fixture" data-id="'+escapeHtml(f.id)+'"><div class="fixture-title"><div><strong>'+escapeHtml(f.name)+'</strong><div class="small">'+escapeHtml(f.url||'(no target)')+'</div></div><span class="method">'+escapeHtml(f.method)+'</span></div><div class="toolbar"><button data-action="replay">Replay</button><button class="secondary" data-action="edit">Edit</button><button class="danger" data-action="delete">Delete</button></div><pre>'+escapeHtml(JSON.stringify(f,null,2))+'</pre></div>').join(''):'<p class="small">No fixtures found.</p>'}
function renderHistory(list){replayHistory.innerHTML=list.length?list.map(h=>{const ok=h.result&&h.result.ok;const status=h.result?h.result.status:'?';const dur=h.durationMs!=null?h.durationMs+'ms':'?';const trunc=h.result&&h.result.truncated?' [truncated]':'';const err=h.result&&h.result.error?' — '+escapeHtml(h.result.error):'';return '<div class="fixture"><div class="fixture-title"><div><strong>'+escapeHtml(h.fixtureName||'unknown')+'</strong><div class="small">'+escapeHtml(h.targetUrl||'')+'</div></div><span class="method" style="background:'+(ok?'var(--green)':'var(--red)')+';color:#06111f">'+status+'</span></div><div class="toolbar"><span class="small">'+dur+trunc+err+'</span>'+(h.result&&h.result.body?'<button class="secondary" data-action="view-response" data-body="'+escapeHtml(h.result.body)+'" data-title="Response — '+escapeHtml(h.fixtureName||'')+'">View body</button>':'')+'</div></div>'}).join(''):'<p class="small">No replays yet.</p>'}
async function load(){const data=await api('/api/fixtures');const h=await api('/api/history');allFixtures=data.fixtures;fixtureCount.textContent=data.fixtures.length;replayCount.textContent=h.history.length;filterFixtures();renderHistory(h.history)}
fixtures.addEventListener('click',function(e){var btn=e.target.closest('[data-action]');if(!btn)return;var id=btn.closest('.fixture').dataset.id;if(btn.dataset.action==='replay')replay(id);if(btn.dataset.action==='edit')editFixture(id);if(btn.dataset.action==='delete')removeFixture(id);if(btn.dataset.action==='view-response')viewResponse(btn.dataset.title,btn.dataset.body)});
load().catch(e=>flash(e.message,'error'));</script>`;
}

const MAX_BODY_BYTES = 1024 * 1024;

async function readJson(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large (max 1 MB)'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function send(res, status, data, type = 'application/json') {
  const headers = { 'content-type': type };
  if (type === 'text/html') {
    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['content-security-policy'] = "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
  }
  res.writeHead(status, headers);
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
      res.writeHead(301, { 'Location': pathname });
      return res.end();
    }
    
    // Page routes
    if (pathname === '/') return send(res, 200, homePage(pathname), 'text/html');
    if (pathname === '/workspace') return send(res, 200, workspacePage(pathname), 'text/html');
    if (pathname === '/docs') return send(res, 200, docsPage(pathname), 'text/html');
    if (pathname === '/support') return send(res, 200, supportPage(pathname), 'text/html');
    if (pathname === '/changelog') return send(res, 200, changelogPage(pathname), 'text/html');
    
    // API routes
    if (pathname === '/api/fixtures') {
      if (req.method === 'GET') return send(res, 200, { fixtures: store.list() });
      if (req.method === 'POST') return send(res, 201, { fixture: store.save(await readJson(req)) });
    }
    if (pathname.match(/^\/api\/fixtures\/[^/]+$/)) {
      const id = pathname.split('/').pop();
      if (req.method === 'GET') return send(res, 200, { fixture: store.get(id) });
      if (req.method === 'PUT') { store.get(id); return send(res, 200, { fixture: store.save({ ...await readJson(req), id }) }); }
      if (req.method === 'DELETE') return send(res, 200, { deleted: store.delete(id) });
    }
    if (pathname === '/api/history' && req.method === 'GET') return send(res, 200, { history: store.history() });
    if (pathname === '/api/export' && req.method === 'GET') return send(res, 200, store.exportData());
    if (pathname === '/api/import' && req.method === 'POST') {
      return send(res, 200, { imported: store.importFixtures((await readJson(req)).fixtures) });
    }
    if (pathname === '/api/redact' && req.method === 'POST') {
      return send(res, 200, { redacted: redact(await readJson(req)) });
    }
    if (pathname === '/api/debug/redaction' && req.method === 'POST') {
      return send(res, 200, { debug: redact(await readJson(req), true) });
    }
    if (pathname === '/api/replay' && req.method === 'POST') {
      const clientIp = req.socket.remoteAddress;
      if (!checkReplayRate(clientIp)) return send(res, 429, { error: 'Too many replay requests. Please wait a moment.' });
      const body = await readJson(req);
      const fixture = store.get(body.id);
      const result = await replayFixture(fixture, body.targetUrl || fixture.url);
      return send(res, 200, { replay: store.logReplay({ 
        fixtureId: fixture.id, 
        fixtureName: fixture.name, 
        targetUrl: body.targetUrl || fixture.url, 
        durationMs: result.durationMs,
        result 
      })});
    }
    
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.status || (error.message === 'Fixture not found' ? 404 : 400);
    send(res, status, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`HookLedger running at http://localhost:${PORT}`));

function shutdown() {
  console.log('\nShutting down...');
  store.persist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
