import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureStore, redact, replayFixture } from './core.js';
import { LicenseManager } from './license.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicKeyPath = path.join(__dirname, 'keys', 'public.pem');
const publicKeyPem = fs.existsSync(publicKeyPath) ? fs.readFileSync(publicKeyPath, 'utf8') : '';
const store = new FixtureStore({ dataFile: path.join(__dirname, 'data', 'hookledger.json') });
const licenseManager = new LicenseManager({
  publicKeyPem,
  licenseFile: path.join(__dirname, 'data', 'license.json')
});
const PORT = Number(process.env.PORT || 3000);

const navItems = [
  ['/', 'Home'],
  ['/activate', 'Activate'],
  ['/workspace', 'Workspace'],
  ['/docs', 'Docs'],
  ['/pricing', 'Pricing'],
  ['/changelog', 'Changelog']
];

function shell({ pathName, title, body, scripts = '', locked = false }) {
  const nav = navItems.map(([href, label]) => `<a class="${pathName === href ? 'active' : ''}" href="${href}">${label}</a>`).join('');
  const statePill = locked ? '<span class="state locked">Locked</span>' : '<span class="state live">Activated</span>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · HookLedger</title><style>
  :root{--bg:#070b16;--panel:#101729;--line:#24304a;--text:#eef4ff;--muted:#99a8c7;--blue:#5b8cff;--cyan:#42d6ff;--green:#42e8a4;--red:#ff5b7f;--yellow:#ffd166;--shadow:0 24px 80px #0008;--radius:22px}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,Segoe UI,sans-serif;background:radial-gradient(circle at top left,#16285a 0,#070b16 36rem),linear-gradient(180deg,#070b16,#0a1020);color:var(--text);line-height:1.55}a{color:inherit;text-decoration:none}.wrap{max-width:1180px;margin:0 auto;padding:0 24px}.topbar{position:sticky;top:0;z-index:10;background:#070b16cc;backdrop-filter:blur(18px);border-bottom:1px solid #ffffff12}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:12px;font-weight:900}.logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:grid;place-items:center;color:#07101f}.links{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.links a{padding:10px 14px;border-radius:999px;color:var(--muted);font-weight:700;font-size:14px}.links a:hover,.links a.active{background:#ffffff12;color:var(--text)}.cta{background:linear-gradient(135deg,var(--cyan),var(--blue));color:#06111f!important;padding:11px 16px!important;border-radius:999px;font-weight:900!important}.state{padding:8px 12px;border-radius:999px;font-weight:800;font-size:12px}.state.live{background:#103424;color:#86ffca}.state.locked{background:#3a2911;color:#ffd98d}.hero{padding:74px 0 54px}.badge{display:inline-flex;gap:8px;align-items:center;border:1px solid #ffffff1f;background:#ffffff0d;color:#cfe8ff;padding:8px 12px;border-radius:999px;font-weight:800;font-size:13px}.grid-hero,.workspace,.pricing,.cards{display:grid;gap:18px}.grid-hero{grid-template-columns:1.05fr .95fr;align-items:center}.headline{font-size:clamp(42px,7vw,76px);line-height:.96;letter-spacing:-.07em;margin:22px 0}.gradient{background:linear-gradient(135deg,#fff,#9dccff 45%,#42d6ff);-webkit-background-clip:text;color:transparent}.sub{font-size:19px;color:var(--muted);max-width:650px}.actions,.toolbar,.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.button,button{border:0;border-radius:14px;padding:13px 17px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,var(--cyan),var(--blue));color:#06111f;box-shadow:0 12px 30px #427bff35}.button.secondary,button.secondary{background:#ffffff12;color:var(--text);box-shadow:none;border:1px solid #ffffff1a}.button.danger,button.danger{background:var(--red);color:white}.button.ghost,button.ghost{background:transparent;color:#b9d3ff;border:1px solid var(--line);box-shadow:none}.panel{background:linear-gradient(180deg,#111a31,#0c1325);border:1px solid #ffffff14;border-radius:var(--radius);box-shadow:var(--shadow)}.code-card,.card{padding:22px}.window{display:flex;gap:7px;margin-bottom:14px}.dot{width:11px;height:11px;border-radius:50%;background:#ff5f57}.dot:nth-child(2){background:#ffbd2e}.dot:nth-child(3){background:#28c840}pre,code,textarea{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}pre{white-space:pre-wrap;background:#050914;border:1px solid #ffffff12;border-radius:16px;padding:16px;overflow:auto;color:#d8e6ff}.cards{grid-template-columns:repeat(3,1fr);margin:34px 0}.card{background:#ffffff08;border:1px solid #ffffff12;border-radius:var(--radius)}.muted,.small{color:var(--muted)}.small{font-size:13px}.page{padding:40px 0 70px}.page-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:22px}.page h1{font-size:44px;letter-spacing:-.04em;margin:0}.workspace{grid-template-columns:minmax(320px,440px) 1fr}.field{display:block;font-weight:800;color:#d7e6ff;margin-top:12px}input,select,textarea{width:100%;margin-top:7px;padding:12px 13px;border-radius:14px;border:1px solid var(--line);background:#081020;color:var(--text);font:inherit}textarea{min-height:120px}.status{min-height:28px}.ok{color:var(--green)}.error{color:var(--red)}.fixture{padding:16px;border:1px solid var(--line);background:#081020;border-radius:18px;margin:12px 0}.fixture-title{display:flex;justify-content:space-between;gap:12px;align-items:start}.method{font-size:12px;font-weight:900;color:#06111f;background:var(--green);padding:4px 8px;border-radius:999px}.metric{font-size:32px;font-weight:950;letter-spacing:-.04em}.pricing{grid-template-columns:repeat(3,1fr)}.price{font-size:44px;font-weight:950}.notice{border:1px solid #ffd16655;background:#ffd16614;color:#ffe0a3;border-radius:18px;padding:14px;margin:18px 0}.footer{border-top:1px solid #ffffff12;padding:28px 0;color:var(--muted)}.locked-card{padding:28px}.mini{font-size:12px;color:var(--muted)}
  @media(max-width:900px){.grid-hero,.workspace,.pricing,.cards{grid-template-columns:1fr}.links{display:none}.page-head{display:block}}
  </style></head><body><div class="topbar"><div class="wrap nav"><a class="brand" href="/"><span class="logo">⌁</span><span>HookLedger</span></a><nav class="links">${nav}${statePill}<a class="cta" href="${locked ? '/activate' : '/workspace'}">${locked ? 'Unlock app' : 'Open app'}</a></nav></div></div>${body}<footer class="footer"><div class="wrap row"><strong>HookLedger</strong><span>Fully localhosted webhook fixture notebook.</span><span class="small">No live payment processor is connected in this build.</span></div></footer>${scripts}</body></html>`;
}

function homePage(pathName, status) {
  const locked = !status.active;
  return shell({ pathName, locked, title: locked ? 'Local app with one-time license activation' : 'Replay webhooks without recreating events', body: `<main class="wrap hero"><div class="grid-hero"><section><span class="badge">Local-first · Machine-bound license · Secret redaction</span><h1 class="headline">${locked ? 'A <span class="gradient">local app</span> you unlock once.' : 'Stop rebuilding <span class="gradient">webhook events</span> by hand.'}</h1><p class="sub">${locked ? 'HookLedger runs on the user\'s computer, stays fully localhosted, and uses a machine-bound license file for access. Disposable emails are blocked during activation requests.' : 'HookLedger gives developers a fast notebook for saving, redacting, editing, and replaying webhook fixtures against local endpoints.'}</p><div class="actions"><a class="button" href="${locked ? '/activate' : '/workspace'}">${locked ? 'Start activation' : 'Open the workspace'}</a><a class="button secondary" href="/docs">Read the docs</a></div></section><aside class="panel code-card"><div class="window"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><pre>${locked ? `{
  "product": "HookLedger",
  "access": "locked",
  "machineBound": true,
  "tempEmailBlock": true,
  "payment": "seller issues license after purchase"
}` : `{
  "fixture": "stripe.payment_succeeded",
  "redacted": true,
  "target": "http://localhost:4000/webhook",
  "lastReplay": { "status": 200, "ok": true }
}`}</pre></aside></div><div class="cards"><div class="card"><h3>Local-only runtime</h3><p class="muted">Runs on localhost and stores app data on the user\'s machine.</p></div><div class="card"><h3>Machine-bound access</h3><p class="muted">Licenses are signed and bound to a machine fingerprint to discourage file sharing.</p></div><div class="card"><h3>One-time purchase flow</h3><p class="muted">User sends a local activation request after purchase and pastes back the signed license.</p></div></div></main>` });
}

function activatePage(pathName, status) {
  const locked = !status.active;
  return shell({ pathName, locked, title: locked ? 'Activate your local copy' : 'License active', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Activation</span><h1>${locked ? 'Unlock HookLedger' : 'HookLedger is activated'}</h1><p class="muted">${locked ? 'Create a purchase request, then paste the signed license you receive after payment.' : 'This computer has an active machine-bound license.'}</p></div></div>${locked ? `<div class="workspace"><section class="panel card locked-card"><h2>1. Create purchase request</h2><p class="small">Temporary email domains are blocked.</p><label class="field">Full name<input id="fullName" placeholder="Jane Developer"></label><label class="field">Email<input id="email" placeholder="jane@company.com"></label><div class="toolbar"><button onclick="createRequest()">Create request</button></div><div id="requestMessage" class="status"></div><pre id="requestBlob">Request JSON will appear here.</pre><p class="mini">Machine fingerprint: <span id="machineHashLabel"></span></p></section><section class="panel card locked-card"><h2>2. Activate with signed license</h2><textarea id="licenseText" placeholder="Paste the signed HookLedger license JSON here"></textarea><div class="toolbar"><button onclick="activateLicense()">Activate this computer</button></div><div id="activateMessage" class="status"></div><div class="notice">Sharing the downloaded app alone should not unlock another computer. The license is verified against this machine fingerprint.</div></section></div>` : `<section class="panel card"><h2>Installed license</h2><pre>${escapeHtml(JSON.stringify(status.license, null, 2))}</pre><div class="actions"><a class="button" href="/workspace">Open workspace</a></div></section>`}</main>`, scripts: activationScript(status) });
}

function workspacePage(pathName, status) {
  const locked = !status.active;
  if (locked) {
    return shell({ pathName, locked, title: 'Workspace locked', body: `<main class="wrap page"><section class="panel card locked-card"><span class="badge">Locked</span><h1>Activate before using the workspace</h1><p class="muted">This copy of HookLedger is local-first, but it still requires a valid machine-bound license file before workspace access is enabled.</p><div class="actions"><a class="button" href="/activate">Go to activation</a><a class="button secondary" href="/docs">Read docs</a></div></section></main>` });
  }
  return shell({ pathName, locked, title: 'Workspace', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Developer workspace</span><h1>Webhook fixture lab</h1><p class="muted">Build a local library of replayable webhook examples.</p></div><div class="row"><span class="state live">Licensed to ${escapeHtml(status.license?.purchaserEmail || 'customer')}</span><button class="secondary" onclick="load()">Refresh</button><button class="secondary" onclick="exportData()">Export JSON</button></div></div><div class="workspace"><section class="panel card"><h2>Create fixture</h2><p class="small">Do not paste production secrets or sensitive customer data.</p><label class="field">Name<input id="name" placeholder="stripe.payment_succeeded happy path"></label><label class="field">Target URL<input id="url" placeholder="http://localhost:4000/webhook"></label><label class="field">Method<select id="method"><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label class="field">Headers JSON<textarea id="headers">{"content-type":"application/json","authorization":"Bearer test"}</textarea></label><label class="field">Body JSON<textarea id="body">{"event":"test.created","token":"will be redacted"}</textarea></label><div class="toolbar"><button onclick="previewPayload()">Preview redaction</button><button onclick="save()">Save fixture</button><button class="secondary" onclick="clearForm()">Clear</button></div><div id="message" class="status"></div><h3>Redaction preview</h3><pre id="previewBox">Click preview to inspect the stored shape.</pre><h3>Import</h3><textarea id="importBox" placeholder='Paste a HookLedger export JSON object with a "fixtures" array'></textarea><button class="ghost" onclick="importFixtures()">Import fixtures</button></section><section><div class="cards" style="grid-template-columns:repeat(3,1fr);margin-top:0"><div class="card"><div class="metric" id="fixtureCount">0</div><div class="small">fixtures</div></div><div class="card"><div class="metric" id="replayCount">0</div><div class="small">recent replays</div></div><div class="card"><div class="metric">1</div><div class="small">licensed machine</div></div></div><div class="panel card"><h2>Saved fixtures</h2><div id="fixtures"></div></div><div class="panel card" style="margin-top:18px"><h2>Replay history</h2><pre id="history"></pre></div></section></div></main>`, scripts: workspaceScript() });
}

function docsPage(pathName, status) {
  const locked = !status.active;
  return shell({ pathName, locked, title: 'Docs', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Docs</span><h1>Use HookLedger in 5 minutes</h1><p class="muted">Local usage, activation, and anti-sharing behavior.</p></div></div><div class="cards"><div class="card"><h3>1. Purchase once</h3><p class="muted">After purchase, the customer creates a local activation request and receives a signed license file.</p></div><div class="card"><h3>2. Activate locally</h3><p class="muted">Paste the signed license into the app. It is verified against this computer.</p></div><div class="card"><h3>3. Work offline</h3><p class="muted">After activation, HookLedger continues working locally on localhost with file-backed storage.</p></div></div><section class="panel card"><h2>Local data</h2><p>Fixtures and replay history are stored in <code>data/hookledger.json</code>. Activated license state is stored in <code>data/license.json</code>.</p><h2>Activation request</h2><p>Temporary email domains are blocked. The request includes the machine fingerprint so a downloaded copy cannot simply be shared to another computer and still unlock.</p><h2>Limits</h2><p>This is anti-sharing friction, not perfect DRM. A determined attacker can still tamper with local software, but this materially raises the effort required to casually share the paid copy.</p></section></main>` });
}

function pricingPage(pathName, status) {
  const locked = !status.active;
  return shell({ pathName, locked, title: 'Pricing draft', body: `<main class="wrap page"><span class="badge">Draft, not active</span><h1>One-time purchase direction</h1><div class="notice">This page describes the intended one-time-payment positioning only. No payment processor is connected in this local build.</div><div class="pricing"><div class="card"><h3>Single machine</h3><div class="price">$29</div><p class="muted">Draft one-time payment for one customer and one activated machine.</p></div><div class="card"><h3>Reissue support</h3><div class="price">Manual</div><p class="muted">If a machine changes, the seller can reissue a license for the replacement device.</p></div><div class="card"><h3>What the buyer gets</h3><div class="price">Local</div><p class="muted">A fully localhosted app plus a signed license bound to their machine.</p></div></div></main>` });
}

function changelogPage(pathName, status) {
  const locked = !status.active;
  return shell({ pathName, locked, title: 'Changelog', body: `<main class="wrap page"><span class="badge">Product updates</span><h1>Changelog</h1><section class="panel card"><h2>0.4.0 · Local licensing</h2><p class="muted">Added machine-bound local licensing, activation request flow, temporary email blocking, and locked workspace behavior.</p><ul><li>Signed license verification with public-key checking.</li><li>Local activation page and request blob generation.</li><li>Workspace stays locked until a valid license is installed.</li><li>Pricing draft updated to reflect one-time purchase direction.</li></ul><h2>0.3.0 · UI expansion</h2><p class="muted">Added a polished multi-page interface with Home, Workspace, Docs, Pricing draft, and Changelog pages.</p></section></main>` });
}

function activationScript(status) {
  return `<script>const initialStatus=${JSON.stringify(status)};function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function flash(id,text,cls='ok'){document.getElementById(id).innerHTML='<p class="'+cls+'">'+escapeHtml(text)+'</p>'}async function api(path,options){const r=await fetch(path,options);const j=await r.json();if(!r.ok) throw new Error(j.error);return j}if(document.getElementById('machineHashLabel')) machineHashLabel.textContent=initialStatus.machineHash;async function createRequest(){try{const res=await api('/api/license/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fullName.value,email:email.value})});requestBlob.textContent=JSON.stringify(res.request,null,2);flash('requestMessage','Request created. Send this blob after the customer pays.')}catch(e){flash('requestMessage',e.message,'error')}}async function activateLicense(){try{await api('/api/license/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({license:licenseText.value})});flash('activateMessage','License activated. Reloading...');setTimeout(()=>location.href='/workspace',700)}catch(e){flash('activateMessage',e.message,'error')}}</script>`;
}

function workspaceScript() {
  return `<script>function parseJson(id){try{return JSON.parse(document.getElementById(id).value || '{}')}catch(e){throw new Error(id+' must be valid JSON: '+e.message)}}function payload(){return {name:name.value,url:url.value,method:method.value,headers:parseJson('headers'),body:parseJson('body')}}function flash(text, cls='ok'){message.innerHTML='<p class="'+cls+'">'+escapeHtml(text)+'</p>'}function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}async function api(path, options){const r=await fetch(path,options); const j=await r.json(); if(!r.ok) throw new Error(j.error); return j}async function previewPayload(){try{previewBox.textContent=JSON.stringify((await api('/api/redact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())})).redacted,null,2);flash('Preview generated')}catch(e){flash(e.message,'error')}}async function save(){try{await api('/api/fixtures',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});flash('Fixture saved');await load()}catch(e){flash(e.message,'error')}}async function replay(id){try{await api('/api/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});flash('Replay sent');await load()}catch(e){flash(e.message,'error')}}async function removeFixture(id){if(!confirm('Delete this local fixture?'))return;try{await api('/api/fixtures/'+id,{method:'DELETE'});flash('Fixture deleted');await load()}catch(e){flash(e.message,'error')}}async function importFixtures(){try{const data=JSON.parse(importBox.value);const res=await api('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});flash('Imported '+res.imported.length+' fixture(s)');importBox.value='';await load()}catch(e){flash(e.message,'error')}}async function exportData(){try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hookledger-export.json';a.click();URL.revokeObjectURL(a.href)}catch(e){flash(e.message,'error')}}function clearForm(){name.value='';url.value='';method.value='POST';headers.value='{"content-type":"application/json"}';body.value='{}';previewBox.textContent='Click preview to inspect the stored shape.'}async function load(){const data=await api('/api/fixtures');const h=await api('/api/history');fixtureCount.textContent=data.fixtures.length;replayCount.textContent=h.history.length;fixtures.innerHTML=data.fixtures.length?data.fixtures.map(f=>'<div class="fixture"><div class="fixture-title"><div><strong>'+escapeHtml(f.name)+'</strong><div class="small">'+escapeHtml(f.url||'(no target)')+'</div></div><span class="method">'+f.method+'</span></div><div class="toolbar"><button onclick="replay(\''+f.id+'\')">Replay</button><button class="danger" onclick="removeFixture(\''+f.id+'\')">Delete</button></div><pre>'+escapeHtml(JSON.stringify(f,null,2))+'</pre></div>').join(''):'<p class="small">No fixtures yet. Save one from the left panel.</p>';history.textContent=JSON.stringify(h.history,null,2)}load().catch(e=>flash(e.message,'error'));</script>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, data, type = 'application/json', headers = {}) {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const licenseStatus = licenseManager.status();
    if (url.pathname === '/') return send(res, 200, homePage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/activate') return send(res, 200, activatePage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/workspace') return send(res, 200, workspacePage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/docs') return send(res, 200, docsPage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/pricing') return send(res, 200, pricingPage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/changelog') return send(res, 200, changelogPage(url.pathname, licenseStatus), 'text/html');
    if (url.pathname === '/api/license/status' && req.method === 'GET') return send(res, 200, licenseStatus);
    if (url.pathname === '/api/license/request' && req.method === 'POST') return send(res, 200, { request: licenseManager.createRequest(await readJson(req)) });
    if (url.pathname === '/api/license/activate' && req.method === 'POST') return send(res, 200, licenseManager.activate((await readJson(req)).license));
    if (!licenseStatus.active && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/license/')) return send(res, 403, { error: 'Activate HookLedger before using the workspace APIs' });
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
