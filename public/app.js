let editingId = null;
let allFixtures = [];
let allHistory = [];

const nameEl = document.getElementById('name');
const urlEl = document.getElementById('url');
const methodEl = document.getElementById('method');
const headersEl = document.getElementById('headers');
const bodyEl = document.getElementById('body');
const message = document.getElementById('message');
const previewBox = document.getElementById('previewBox');
const importBox = document.getElementById('importBox');
const fixtureCount = document.getElementById('fixtureCount');
const replayCount = document.getElementById('replayCount');
const searchInput = document.getElementById('searchInput');
const fixtures = document.getElementById('fixtures');
const replayHistory = document.getElementById('replayHistory');
const responseModal = document.getElementById('responseModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const formTitle = document.getElementById('formTitle');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function parseJson(id) {
  try {
    return JSON.parse(document.getElementById(id).value || '{}');
  } catch (e) {
    throw new Error(id + ' must be valid JSON: ' + e.message);
  }
}

function payload() {
  return {
    name: nameEl.value,
    url: urlEl.value,
    method: methodEl.value,
    headers: parseJson('headers'),
    body: parseJson('body')
  };
}

function flash(text, cls = 'ok') {
  message.innerHTML = '<p class="' + cls + '">' + escapeHtml(text) + '</p>';
}

async function api(path, options) {
  const r = await fetch(path, options);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function previewPayload() {
  try {
    const data = (await api('/api/redact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload())
    })).redacted;
    previewBox.textContent = JSON.stringify(data, null, 2);
    flash('Preview generated');
  } catch (e) {
    flash(e.message, 'error');
  }
}

async function debugRedaction() {
  try {
    const data = await api('/api/debug/redaction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload())
    });
    previewBox.textContent = JSON.stringify(data.debug, null, 2);
    flash('Debug: fields marked as [REDACTED] with reason');
  } catch (e) {
    flash(e.message, 'error');
  }
}

async function save() {
  try {
    const p = payload();
    if (editingId) {
      await api('/api/fixtures/' + editingId, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p)
      });
      flash('Fixture updated');
    } else {
      await api('/api/fixtures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p)
      });
      flash('Fixture saved');
    }
    clearForm();
    await load();
  } catch (e) {
    flash(e.message, 'error');
  }
}

async function replay(id) {
  if (!confirm('Replay this fixture?')) return;
  try {
    const res = await api('/api/replay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const r = res.replay;
    if (r.result.error) {
      flash('Replay failed: ' + r.result.error, 'error');
    } else {
      flash('Replay ' + (r.result.ok ? 'OK' : 'FAIL') + ' (' + r.result.status + ') in ' + (r.result.durationMs || '?') + 'ms');
    }
    await load();
  } catch (e) {
    flash(e.message, 'error');
  }
}

async function removeFixture(id) {
  if (!confirm('Delete this fixture?')) return;
  try {
    await api('/api/fixtures/' + id, { method: 'DELETE' });
    flash('Fixture deleted');
    await load();
  } catch (e) {
    flash(e.message, 'error');
  }
}

function editFixture(id) {
  api('/api/fixtures/' + id).then(({ fixture }) => {
    editingId = id;
    nameEl.value = fixture.name;
    urlEl.value = fixture.url || '';
    methodEl.value = fixture.method;
    headersEl.value = JSON.stringify(fixture.headers || {}, null, 2);
    bodyEl.value = JSON.stringify(fixture.body || {}, null, 2);
    formTitle.textContent = 'Edit fixture';
    message.innerHTML = '<p class="ok">Editing ' + escapeHtml(fixture.name) + '</p>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }).catch(e => flash(e.message, 'error'));
}

function viewResponse(title, body) {
  modalTitle.textContent = title;
  modalBody.textContent = body || '(empty)';
  responseModal.style.display = 'flex';
}

function closeModal() {
  responseModal.style.display = 'none';
}

async function importFixtures() {
  try {
    const data = JSON.parse(importBox.value);
    const res = await api('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });
    flash('Imported ' + res.imported.length + ' fixture(s)');
    importBox.value = '';
    await load();
  } catch (e) {
    flash(e.message, 'error');
  }
}

async function exportData() {
  try {
    const data = await api('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hookledger-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    flash(e.message, 'error');
  }
}

function clearForm() {
  editingId = null;
  nameEl.value = '';
  urlEl.value = '';
  methodEl.value = 'POST';
  headersEl.value = '{"content-type":"application/json"}';
  bodyEl.value = '{}';
  previewBox.textContent = 'Click preview to inspect the stored shape.';
  formTitle.textContent = 'Create fixture';
}

function filterFixtures() {
  const q = (searchInput.value || '').toLowerCase();
  const filtered = allFixtures.filter(f =>
    f.name.toLowerCase().includes(q) || (f.url || '').toLowerCase().includes(q)
  );
  renderFixtures(filtered);
}

function renderFixtures(list) {
  fixtures.innerHTML = list.length
    ? list.map(f => '<div class="fixture" data-id="' + escapeHtml(f.id) + '">' +
      '<div class="fixture-title"><div><strong>' + escapeHtml(f.name) + '</strong>' +
      '<div class="small">' + escapeHtml(f.url || '(no target)') + '</div></div>' +
      '<span class="method">' + escapeHtml(f.method) + '</span></div>' +
      '<div class="toolbar"><button data-action="replay">Replay</button>' +
      '<button class="secondary" data-action="edit">Edit</button>' +
      '<button class="danger" data-action="delete">Delete</button></div>' +
      '<pre>' + escapeHtml(JSON.stringify(f, null, 2)) + '</pre></div>'
    ).join('')
    : '<p class="small">No fixtures found.</p>';
}

function renderHistory(list) {
  replayHistory.innerHTML = list.length
    ? list.map((h, i) => {
      const ok = h.result && h.result.ok;
      const status = h.result ? h.result.status : '?';
      const dur = h.durationMs != null ? h.durationMs + 'ms' : '?';
      const trunc = h.result && h.result.truncated ? ' [truncated]' : '';
      const err = h.result && h.result.error ? ' &mdash; ' + escapeHtml(h.result.error) : '';
      return '<div class="fixture"><div class="fixture-title"><div><strong>' +
        escapeHtml(h.fixtureName || 'unknown') + '</strong><div class="small">' +
        escapeHtml(h.targetUrl || '') + '</div></div><span class="method" style="background:' +
        (ok ? 'var(--green)' : 'var(--red)') + ';color:#06111f">' + status + '</span></div>' +
        '<div class="toolbar"><span class="small">' + dur + trunc + err + '</span>' +
        (h.result && h.result.body ? '<button class="secondary" data-action="view-response" data-idx="' + i + '">View body</button>' : '') +
        '</div></div>';
    }).join('')
    : '<p class="small">No replays yet.</p>';
}

async function load() {
  const data = await api('/api/fixtures');
  const h = await api('/api/history');
  allFixtures = data.fixtures;
  allHistory = h.history;
  fixtureCount.textContent = data.fixtures.length;
  replayCount.textContent = h.history.length;
  filterFixtures();
  renderHistory(h.history);
}

fixtures.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'view-response') {
    const idx = parseInt(btn.dataset.idx, 10);
    const h = allHistory[idx];
    if (h) viewResponse('Response — ' + (h.fixtureName || ''), h.result ? h.result.body : '');
    return;
  }
  const id = btn.closest('.fixture').dataset.id;
  if (btn.dataset.action === 'replay') replay(id);
  if (btn.dataset.action === 'edit') editFixture(id);
  if (btn.dataset.action === 'delete') removeFixture(id);
});

document.getElementById('refreshBtn')?.addEventListener('click', load);
document.getElementById('exportBtn')?.addEventListener('click', exportData);
document.getElementById('previewBtn')?.addEventListener('click', previewPayload);
document.getElementById('debugBtn')?.addEventListener('click', debugRedaction);
document.getElementById('saveBtn')?.addEventListener('click', save);
document.getElementById('clearBtn')?.addEventListener('click', clearForm);
document.getElementById('importBtn')?.addEventListener('click', importFixtures);
searchInput?.addEventListener('input', filterFixtures);
document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
responseModal?.addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

load().catch(e => flash(e.message, 'error'));
