import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureStore, redact, replayFixture } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FixtureStore({ dataFile: path.join(__dirname, 'data', 'hookledger.json') });
const PORT = Number(process.env.PORT || 3000);

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HookLedger</title>
  <style>
    :root{color-scheme:light dark;--accent:#3867ff;--muted:#667085;--border:#d0d5dd;--bg:#f8fafc;--card:#fff}
    @media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#121a2f;--border:#29324a;--muted:#a3acc2}}
    body{font-family:Inter,system-ui,Segoe UI,sans-serif;margin:0;background:var(--bg);line-height:1.45}
    header{padding:2rem;max-width:1180px;margin:auto}.tag{color:var(--accent);font-weight:700}.subtitle{color:var(--muted);max-width:720px}
    main{max-width:1180px;margin:auto;padding:0 2rem 2rem;display:grid;grid-template-columns:minmax(320px,430px) 1fr;gap:1rem}
    section{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1rem;box-shadow:0 1px 2px #0001}
    input,select,textarea{width:100%;box-sizing:border-box;margin:.25rem 0 .75rem;padding:.65rem;border:1px solid var(--border);border-radius:10px;background:transparent;color:inherit;font:inherit}
    textarea{font-family:ui-monospace,Consolas,monospace}button{border:0;border-radius:10px;padding:.65rem .9rem;background:var(--accent);color:white;font-weight:700;cursor:pointer;margin:.2rem .2rem .2rem 0}.secondary{background:#667085}.danger{background:#d92d20}.ghost{background:transparent;color:var(--accent);border:1px solid var(--border)}
    pre{background:#00000012;border-radius:10px;padding:.8rem;overflow:auto;max-height:300px}.fixture{border-top:1px solid var(--border);padding:.75rem 0}.row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.warn{background:#fffaeb;border-color:#fedf89;color:#7a4b00}.error{color:#d92d20}.ok{color:#027a48}.small{font-size:.9rem;color:var(--muted)}
    @media(max-width:900px){main{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header>
  <div class="tag">HookLedger</div>
  <h1>Save, redact, and replay webhook fixtures.</h1>
  <p class="subtitle">A local-first notebook for developers testing Stripe, GitHub, Shopify, Clerk, and other webhook integrations without recreating the same event by hand.</p>
</header>
<main>
  <section>
    <h2>Fixture</h2>
    <p class="small">Secret-like fields are redacted before storage. Do not paste production secrets or sensitive customer data.</p>
    <label>Name<input id="name" placeholder="payment.succeeded happy path"></label>
    <label>Target URL<input id="url" placeholder="http://localhost:4000/webhook"></label>
    <label>Method<select id="method"><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>
    <label>Headers JSON<textarea id="headers" rows="5">{"content-type":"application/json","authorization":"Bearer test"}</textarea></label>
    <label>Body JSON<textarea id="body" rows="10">{"event":"test.created","token":"will be redacted"}</textarea></label>
    <div class="row"><button onclick="preview()">Preview redaction</button><button onclick="save()">Save fixture</button><button class="secondary" onclick="clearForm()">Clear</button></div>
    <div id="message"></div>
    <h3>Redaction preview</h3><pre id="preview">Click preview to see stored payload.</pre>
    <h3>Import fixtures</h3>
    <textarea id="importBox" rows="5" placeholder='Paste HookLedger export JSON with {"fixtures":[...]}'></textarea>
    <button class="ghost" onclick="importFixtures()">Import</button>
  </section>
  <section>
    <div class="row"><h2 style="flex:1">Saved fixtures</h2><button class="ghost" onclick="load()">Refresh</button><button class="ghost" onclick="exportData()">Export JSON</button></div>
    <div id="fixtures"></div>
    <h2>Replay history</h2>
    <pre id="history"></pre>
  </section>
</main>
<script>
function parseJson(id){try{return JSON.parse(document.getElementById(id).value || '{}')}catch(e){throw new Error(id+' must be valid JSON: '+e.message)}}
function payload(){return {name:name.value,url:url.value,method:method.value,headers:parseJson('headers'),body:parseJson('body')}}
function flash(text, cls='ok'){message.innerHTML='<p class="'+cls+'">'+escapeHtml(text)+'</p>'}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function api(path, options){const r=await fetch(path,options); const j=await r.json(); if(!r.ok) throw new Error(j.error); return j}
async function preview(){try{preview.textContent=JSON.stringify((await api('/api/redact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())})).redacted,null,2);flash('Preview generated')}catch(e){flash(e.message,'error')}}
async function save(){try{await api('/api/fixtures',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});flash('Fixture saved');await load()}catch(e){flash(e.message,'error')}}
async function replay(id){try{await api('/api/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});flash('Replay sent');await load()}catch(e){flash(e.message,'error')}}
async function removeFixture(id){if(!confirm('Delete this local fixture?'))return;try{await api('/api/fixtures/'+id,{method:'DELETE'});flash('Fixture deleted');await load()}catch(e){flash(e.message,'error')}}
async function importFixtures(){try{const data=JSON.parse(importBox.value);const res=await api('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});flash('Imported '+res.imported.length+' fixture(s)');importBox.value='';await load()}catch(e){flash(e.message,'error')}}
async function exportData(){try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hookledger-export.json';a.click();URL.revokeObjectURL(a.href)}catch(e){flash(e.message,'error')}}
function clearForm(){name.value='';url.value='';method.value='POST';headers.value='{"content-type":"application/json"}';body.value='{}';preview.textContent='Click preview to see stored payload.'}
async function load(){const data=await api('/api/fixtures');fixtures.innerHTML=data.fixtures.length?data.fixtures.map(f=>'<div class="fixture"><div class="row"><b>'+escapeHtml(f.name)+'</b><span class="small">'+f.method+' '+escapeHtml(f.url||'(no target)')+'</span></div><button onclick="replay(\''+f.id+'\')">Replay</button><button class="danger" onclick="removeFixture(\''+f.id+'\')">Delete</button><pre>'+escapeHtml(JSON.stringify(f,null,2))+'</pre></div>').join(''):'<p class="small">No fixtures yet.</p>';history.textContent=JSON.stringify((await api('/api/history')).history,null,2)}
load().catch(e=>flash(e.message,'error'));
</script>
</body>
</html>`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/') return send(res, 200, page(), 'text/html');
    if (url.pathname === '/api/fixtures' && req.method === 'GET') return send(res, 200, { fixtures: store.list() });
    if (url.pathname === '/api/fixtures' && req.method === 'POST') return send(res, 201, { fixture: store.save(await readJson(req)) });
    if (url.pathname.startsWith('/api/fixtures/') && req.method === 'DELETE') return send(res, 200, { deleted: store.delete(url.pathname.split('/').pop()) });
    if (url.pathname === '/api/history' && req.method === 'GET') return send(res, 200, { history: store.history() });
    if (url.pathname === '/api/export' && req.method === 'GET') return send(res, 200, store.exportData());
    if (url.pathname === '/api/import' && req.method === 'POST') return send(res, 200, { imported: store.importFixtures((await readJson(req)).fixtures) });
    if (url.pathname === '/api/redact' && req.method === 'POST') return send(res, 200, { redacted: redact(await readJson(req)) });
    if (url.pathname === '/api/replay' && req.method === 'POST') {
      const body = await readJson(req);
      const fixture = store.get(body.id);
      const result = await replayFixture(fixture, body.targetUrl || fixture.url);
      return send(res, 200, { replay: store.logReplay({ fixtureId: fixture.id, fixtureName: fixture.name, targetUrl: body.targetUrl || fixture.url, result }) });
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`HookLedger running at http://localhost:${PORT}`));
