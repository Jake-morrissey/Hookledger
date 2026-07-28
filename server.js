import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureStore, redact, replayFixture } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FixtureStore({ dataFile: process.env.DATA_FILE || path.join(__dirname, 'data', 'hookledger.json') });
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
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of replayRateLimit) {
    if (now - entry.start > REPLAY_RATE_WINDOW) replayRateLimit.delete(ip);
  }
}, 300000).unref();
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · HookLedger</title><link rel="stylesheet" href="/public/style.css"></head><body><div class="topbar"><div class="wrap nav"><a class="brand" href="/"><span class="logo">⌁</span><span>HookLedger</span></a><nav class="links">${nav}</nav></div></div>${body}<footer class="footer"><div class="wrap row"><strong>HookLedger</strong><span>Free and open-source localhost-first webhook fixture notebook.</span><a href="${SUPPORT_URL}" target="_blank" rel="noopener">Support this project</a></div></footer>${scripts}</body></html>`;
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
  return shell({ pathName, title: 'Workspace', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Developer workspace</span><h1>HookLedger fixture lab</h1><p class="muted">Build a local library of replayable webhook examples.</p></div><div class="row"><button class="secondary" id="refreshBtn">Refresh</button><button class="secondary" id="exportBtn">Export JSON</button></div></div><div class="workspace"><section class="panel card"><h2 id="formTitle">Create fixture</h2><p class="small">Do not paste production secrets or sensitive customer data.</p><label class="field">Name<input id="name" placeholder="stripe.payment_succeeded happy path"></label><label class="field">Target URL<input id="url" placeholder="http://localhost:4000/webhook"></label><label class="field">Method<select id="method"><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label class="field">Headers JSON<textarea id="headers">{"content-type":"application/json","authorization":"Bearer test"}</textarea></label><label class="field">Body JSON<textarea id="body">{"event":"test.created","token":"will be redacted"}</textarea></label><div class="toolbar"><button id="previewBtn">Preview redaction</button><button class="secondary" id="debugBtn">Debug redaction</button><button id="saveBtn">Save fixture</button><button class="secondary" id="clearBtn">Clear</button></div><div id="message" class="status"></div><h3>Redaction preview</h3><pre id="previewBox">Click preview to inspect the stored shape.</pre><h3>Import</h3><textarea id="importBox" placeholder='Paste a HookLedger export JSON object with a "fixtures" array'></textarea><button class="ghost" id="importBtn">Import fixtures</button></section><section><div class="cards" style="grid-template-columns:repeat(2,1fr);margin-top:0"><div class="card"><div class="metric" id="fixtureCount">0</div><div class="small">fixtures</div></div><div class="card"><div class="metric" id="replayCount">0</div><div class="small">recent replays</div></div></div><div class="panel card"><h2>Saved fixtures</h2><input id="searchInput" type="text" placeholder="Search fixtures..." style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--text);margin-bottom:14px;font-size:14px;font-weight:600"><div id="fixtures"></div></div><div class="panel card" style="margin-top:18px"><h2>Replay history</h2><div id="replayHistory"></div></div></section></div></main><div id="responseModal" style="display:none;position:fixed;inset:0;background:#000a;z-index:100;display:none;align-items:center;justify-content:center"><div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:24px;max-width:800px;width:90%;max-height:80vh;overflow:auto;box-shadow:var(--shadow)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 id="modalTitle" style="margin:0">Response</h3><button class="secondary" id="closeModalBtn">Close</button></div><pre id="modalBody" style="white-space:pre-wrap;word-break:break-all;font-size:13px"></pre></div></div>`, scripts: '<script src="/public/app.js"></script>' });
}

function docsPage(pathName) {
  return shell({ pathName, title: 'Docs', body: `<main class="wrap page"><div class="page-head"><div><span class="badge">Docs</span><h1>Use HookLedger in 5 minutes</h1><p class="muted">A short guide for local webhook testing.</p></div></div><div class="cards"><div class="card"><h3>1. Paste an event</h3><p class="muted">Copy headers and JSON body from provider logs, your terminal, or a request bin.</p></div><div class="card"><h3>2. Preview redaction</h3><p class="muted">Check how HookLedger will store the fixture before it writes to disk.</p></div><div class="card"><h3>3. Replay locally</h3><p class="muted">Point the fixture at your dev endpoint and replay it while you iterate.</p></div></div><section class="panel card"><h2>Local data</h2><p>HookLedger stores data in <code>data/hookledger.json</code>. That folder is ignored by git.</p><h2>Supported methods</h2><p><code>POST</code>, <code>PUT</code>, <code>PATCH</code>, and <code>DELETE</code>.</p><h2>Open-source direction</h2><p>Phase 1 is free and open source. Hosted multi-user features, billing, auth, and sync are intentionally deferred to a future separate hosted product only if real usage proves demand.</p></section></main>` });
}

function supportPage(pathName) {
  return shell({ pathName, title: 'Support the project', body: `<main class="wrap page"><span class="badge">Support</span><h1>Support HookLedger</h1><div class="notice">HookLedger Phase 1 is free and open source. If it saves you time, consider sponsoring development.</div><div class="pricing"><div class="card"><h3>Use it free</h3><div class="price">$0</div><p class="muted">Local webhook fixture workflow, available without activation or billing.</p></div><div class="card"><h3>Sponsor development</h3><div class="price">♥</div><p class="muted">Support maintenance, documentation, and future polish for the local app.</p><div class="actions"><a class="button" href="${SUPPORT_URL}" target="_blank" rel="noopener">Support this project</a></div></div><div class="card"><h3>Future hosted version</h3><div class="price">Later</div><p class="muted">Auth, teams, multi-tenant storage, hosted replay targets, and billing belong to a separate product once real demand exists.</p></div></div></main>` });
}

function changelogPage(pathName) {
  return shell({ pathName, title: 'Changelog', body: `<main class="wrap page"><span class="badge">Product updates</span><h1>Changelog</h1><section class="panel card"><h2>0.9.0 · Replay secrets fix and CSP hardening</h2><p class="muted">Fixes the critical replay-sends-redacted issue and removes inline script handlers.</p><ul><li>Critical fix: replay now sends real secret values instead of [REDACTED]. Previously, save() permanently overwrote real header/body values with placeholder strings. Now fixtures store real values; list and export return redacted copies for display; get returns real values for replay and edit.</li><li>Removed all inline onclick/oninput handlers from server-rendered pages. All event bindings now use addEventListener in app.js.</li><li>Removed unsafe-inline from script-src CSP directive. CSP now enforces script-src 'self'.</li><li>editFixture() now fetches real fixture data via API instead of reading from the redacted list.</li><li>Added redactedFixture() helper for creating display-safe fixture copies.</li></ul><h2>0.8.0 · Security and correctness hardening</h2><p class="muted">SSRF protection, redaction improvements, and critical client-script fix.</p><ul><li>Fixed critical bug: public/app.js contained stale server code instead of the actual client script — Workspace page is now functional.</li><li>Added SSRF guard: replay targets restricted to localhost/loopback addresses only.</li><li>Server now binds to 127.0.0.1 by default instead of all interfaces.</li><li>Redaction now uses substring matching — catches access_token, refresh_token, x-api-key, and similar variants.</li><li>Added provider-specific signature headers: x-hub-signature-256 (GitHub), x-shopify-hmac-sha256 (Shopify), x-webhook-signature.</li><li>Fixed partial-import state corruption: importFixtures validates all items before mutating, preventing inconsistent state on mid-batch errors.</li><li>Improved test for public/app.js: now validates JavaScript parseability, not just substring matching.</li><li>SSRF validation errors now correctly return 400 instead of 500.</li></ul><h2>0.7.0 · Code quality and static assets</h2><p class="muted">Review-driven fixes, new endpoint, and extracted static assets.</p><ul><li>Fixed history() to return a copy instead of mutating the internal replay array.</li><li>Fixed exportData() replays reference leak with the same copy pattern.</li><li>Fixed rate limiter memory leak: added 5-minute cleanup with .unref() for clean shutdown.</li><li>Fixed fragile querySelector('h2'): form heading now uses id="formTitle".</li><li>Improved readJson error message for malformed JSON.</li><li>Added PATCH /api/fixtures/:id for partial fixture updates.</li><li>Added Content-Type validation on POST/PUT/PATCH API routes.</li><li>Added Content-Length headers on all responses.</li><li>Added escapeHtml() to page title for defense-in-depth XSS protection.</li><li>Moved replay history response bodies from data-body HTML attributes to JS memory.</li><li>Extracted CSS into public/style.css and JS into public/app.js with async static file serving.</li><li>Updated CSP to allow self origin static files.</li></ul><h2>0.6.0 · Production hardening</h2><p class="muted">Security, reliability, and usability improvements for production readiness.</p><ul><li>Added 1 MB request body size limit to prevent memory exhaustion.</li><li>Fixed HTTP error codes: 404 for not found, 400 for validation, 413 for oversized bodies.</li><li>Added graceful shutdown (SIGTERM/SIGINT) to persist data before exit.</li><li>Added GET /api/fixtures/:id endpoint.</li><li>Added security headers (CSP, X-Content-Type-Options, X-Frame-Options).</li><li>Added truncation indicator for replay responses over 5000 chars.</li><li>Fixed delete to skip disk write when fixture ID doesn't exist.</li><li>Renamed /pricing route to /support.</li><li>Removed placeholder "0 external accounts" metric from workspace.</li></ul><h2>0.5.0 · Free and open source reset</h2><p class="muted">Removed the local licensing system and made the workspace open by default for Phase 1.</p></section></main>` });
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (err) {
    if (err instanceof SyntaxError) throw Object.assign(new Error('Invalid JSON in request body'), { status: 400 });
    throw err;
  }
}
async function drainBody(req) {
  for await (const _ of req) { /* drain */ }
}

function send(res, status, data, type = 'application/json') {
  const body = type === 'application/json' ? JSON.stringify(data) : type === 'text/html' ? data : Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const headers = { 'content-type': type, 'content-length': Buffer.byteLength(body) };
  if (type === 'text/html') {
    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['content-security-policy'] = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'";
  }
  res.writeHead(status, headers);
  res.end(body);
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

    // Static files
    const MIME = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    if (pathname.startsWith('/public/')) {
      const filePath = path.resolve(__dirname, pathname.replace(/^\//, ''));
      if (!filePath.startsWith(path.resolve(__dirname, 'public') + path.sep)) { return send(res, 404, { error: 'Not found' }); }
      try {
        const data = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath);
        send(res, 200, data, MIME[ext] || 'application/octet-stream');
      } catch { send(res, 404, { error: 'Not found' }); }
      return;
    }

    // Page routes
    if (pathname === '/') return send(res, 200, homePage(pathname), 'text/html');
    if (pathname === '/workspace') return send(res, 200, workspacePage(pathname), 'text/html');
    if (pathname === '/docs') return send(res, 200, docsPage(pathname), 'text/html');
    if (pathname === '/support') return send(res, 200, supportPage(pathname), 'text/html');
    if (pathname === '/changelog') return send(res, 200, changelogPage(pathname), 'text/html');
    
    // API routes
    let apiPathMatched = false;
    if (pathname === '/api/fixtures') {
      apiPathMatched = true;
      if (req.method === 'GET') return send(res, 200, { fixtures: store.list() });
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        const body = await readJson(req);
        const { id: _ignored, ...fixtureData } = body;
        return send(res, 201, { fixture: store.save(fixtureData) });
      }
    }
    if (pathname.match(/^\/api\/fixtures\/[^/]+$/)) {
      apiPathMatched = true;
      const id = pathname.split('/').pop();
      if (req.method === 'GET') return send(res, 200, { fixture: store.get(id) });
      if (req.method === 'PUT') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        const body = await readJson(req);
        store.get(id);
        return send(res, 200, { fixture: store.save({ ...body, id }) });
      }
      if (req.method === 'PATCH') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        const body = await readJson(req);
        const existing = store.get(id);
        return send(res, 200, { fixture: store.save({ ...existing, ...body, id }) });
      }
      if (req.method === 'DELETE') return send(res, 200, { deleted: store.delete(id) });
    }
    if (pathname === '/api/history') { apiPathMatched = true; if (req.method === 'GET') return send(res, 200, { history: store.history() }); }
    if (pathname === '/api/export') { apiPathMatched = true; if (req.method === 'GET') return send(res, 200, store.exportData()); }
    if (pathname === '/api/import') {
      apiPathMatched = true;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        return send(res, 200, store.importFixtures((await readJson(req)).fixtures));
      }
    }
    if (pathname === '/api/redact') {
      apiPathMatched = true;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        return send(res, 200, { redacted: redact(await readJson(req)) });
      }
    }
    if (pathname === '/api/debug/redaction') {
      apiPathMatched = true;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        return send(res, 200, { debug: redact(await readJson(req), true) });
      }
    }
    if (pathname === '/api/replay') {
      apiPathMatched = true;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.includes('application/json')) { await drainBody(req); return send(res, 415, { error: 'Content-Type must be application/json' }); }
        const clientIp = req.socket.remoteAddress;
        const body = await readJson(req);
        if (!checkReplayRate(clientIp)) { return send(res, 429, { error: 'Too many replay requests. Please wait a moment.' }); }
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
    }
    
    if (apiPathMatched) return send(res, 405, { error: 'Method not allowed' });
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof Error && error.status ? error.status : null;
    if (status || message === 'Fixture not found' || message.startsWith('Fixture name') || message.startsWith('Method must') || message.startsWith('Target URL') || message.startsWith('Replay target') || message.startsWith('Request body') || message.startsWith('Invalid JSON') || message.startsWith('Import payload') || message.startsWith('Fixture headers') || message.startsWith('Fixture body')) {
      return send(res, status || (message === 'Fixture not found' ? 404 : 400), { error: message });
    }
    console.error('Unhandled error:', error);
    send(res, 500, { error: 'Internal server error' });
  }
});

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`HookLedger running at http://${HOST}:${PORT}`));

function shutdown() {
  console.log('\nShutting down...');
  store.persist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
