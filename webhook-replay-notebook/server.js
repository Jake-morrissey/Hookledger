import http from 'node:http';
import { FixtureStore, replayFixture } from './core.js';

const store = new FixtureStore();
const PORT = Number(process.env.PORT || 3000);

function page() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Webhook Replay Notebook</title><style>body{font-family:system-ui;margin:2rem;max-width:980px}textarea,input{width:100%;box-sizing:border-box;margin:.25rem 0 1rem;padding:.6rem}button{padding:.6rem 1rem}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}pre{background:#f6f6f6;padding:1rem;overflow:auto}.warn{background:#fff3cd;padding:1rem}</style></head><body><h1>Webhook Replay Notebook</h1><p class="warn">Local MVP. Do not paste production secrets or sensitive customer data. Secret-like fields are redacted before storage.</p><div class="grid"><section><h2>Save fixture</h2><input id="name" placeholder="Fixture name"><input id="url" placeholder="Target URL, e.g. http://localhost:4000/webhook"><input id="method" value="POST"><textarea id="headers" rows="5">{"content-type":"application/json"}</textarea><textarea id="body" rows="10">{"event":"test.created","token":"will be redacted"}</textarea><button onclick="save()">Save</button></section><section><h2>Fixtures</h2><button onclick="load()">Refresh</button><div id="fixtures"></div><h2>Replay history</h2><pre id="history"></pre></section></div><script>
async function api(path, options){const r=await fetch(path,options); const j=await r.json(); if(!r.ok) throw new Error(j.error); return j}
async function save(){await api('/api/fixtures',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.value,url:url.value,method:method.value,headers:JSON.parse(headers.value),body:JSON.parse(body.value)})}); await load()}
async function replay(id){await api('/api/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})}); await load()}
async function load(){const data=await api('/api/fixtures'); fixtures.innerHTML=data.fixtures.map(f=>'<p><b>'+f.name+'</b> '+f.method+' '+f.url+' <button onclick="replay(\''+f.id+'\')">Replay</button><pre>'+JSON.stringify(f,null,2)+'</pre></p>').join(''); history.textContent=JSON.stringify((await api('/api/history')).history,null,2)}
load();</script></body></html>`;
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
    if (url.pathname === '/api/history' && req.method === 'GET') return send(res, 200, { history: store.history() });
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

server.listen(PORT, () => console.log(`Webhook Replay Notebook running at http://localhost:${PORT}`));
