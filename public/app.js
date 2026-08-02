let editingId = null;
let allFixtures = [];
let allHistory = [];
let editingSequenceId = null;
let allSequences = [];
let allRuns = [];
let sequenceSteps = [];
let recordPollTimer = null;
let currentRecording = null;

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
const editHint = document.getElementById('editHint');

const fixturesView = document.getElementById('fixturesView');
const sequencesView = document.getElementById('sequencesView');
const sequenceListEl = document.getElementById('sequenceList');
const sequenceRunsEl = document.getElementById('sequenceRuns');
const seqMessageEl = document.getElementById('seqMessage');
const sequenceListPanel = document.getElementById('sequenceListPanel');
const sequenceBuilder = document.getElementById('sequenceBuilder');
const seqFormTitle = document.getElementById('seqFormTitle');
const seqNameEl = document.getElementById('seqName');
const seqDescriptionEl = document.getElementById('seqDescription');
const seqStepsEl = document.getElementById('seqSteps');
const seqTimingModeEl = document.getElementById('seqTimingMode');
const seqFixedDelayEl = document.getElementById('seqFixedDelay');
const seqJitterEl = document.getElementById('seqJitter');
const seqSpeedEl = document.getElementById('seqSpeed');
const fixedDelayField = document.getElementById('fixedDelayField');
const jitterField = document.getElementById('jitterField');
const speedField = document.getElementById('speedField');
const runSeqHintEl = document.getElementById('runSeqHint');
const seqTargetUrlEl = document.getElementById('seqTargetUrl');
const seqRunResultsEl = document.getElementById('seqRunResults');
const recordPanel = document.getElementById('recordPanel');
const recordNameEl = document.getElementById('recordName');
const recordIngestUrlEl = document.getElementById('recordIngestUrl');
const recordCountEl = document.getElementById('recordCount');

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

function seqFlash(text, cls = 'ok') {
  seqMessageEl.innerHTML = '<p class="' + cls + '">' + escapeHtml(text) + '</p>';
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
    editHint.style.display = '';
    message.innerHTML = '<p class="ok">Editing ' + escapeHtml(fixture.name) + '. Secret fields show [REDACTED] and are preserved unchanged when you save.</p>';
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
  editHint.style.display = 'none';
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

function switchView(view) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  fixturesView.style.display = view === 'fixtures' ? '' : 'none';
  sequencesView.style.display = view === 'sequences' ? '' : 'none';
  if (view === 'sequences') loadSequences();
}

async function loadSequences() {
  const s = await api('/api/sequences');
  const r = await api('/api/sequence-runs');
  allSequences = s.sequences;
  allRuns = r.runs;
  renderSequences(allSequences);
  renderRuns(allRuns);
}

function renderSequences(list) {
  sequenceListEl.innerHTML = list.length
    ? list.map(s =>
      '<div class="fixture"><div class="fixture-title"><div><strong>' + escapeHtml(s.name) + '</strong>' +
      '<div class="small">' + s.steps.length + ' step(s)' + (s.description ? ' &middot; ' + escapeHtml(s.description) : '') + '</div></div>' +
      '<span class="method" style="background:var(--cyan);color:#06111f">seq</span></div>' +
      '<div class="toolbar">' +
      '<button data-seq-action="run" data-id="' + escapeHtml(s.id) + '">Run</button>' +
      '<button class="secondary" data-seq-action="edit" data-id="' + escapeHtml(s.id) + '">Edit</button>' +
      '<button class="secondary" data-seq-action="record" data-id="' + escapeHtml(s.id) + '">Record</button>' +
      '<button class="danger" data-seq-action="delete" data-id="' + escapeHtml(s.id) + '">Delete</button>' +
      '</div></div>'
    ).join('')
    : '<p class="small">No sequences yet. Create one to replay a multi-event flow.</p>';
}

function renderRuns(list) {
  sequenceRunsEl.innerHTML = list.length
    ? list.map(r => {
      const color = r.overallStatus === 'ok' ? 'var(--green)' : r.overallStatus === 'partial' ? 'var(--yellow)' : 'var(--red)';
      const steps = (r.steps || []).map(s => {
        const ok = s.result && s.result.ok && (!s.assertionResult || s.assertionResult.passed);
        const st = s.result && s.result.status != null ? s.result.status : 'err';
        let a = '';
        if (s.assertionResult) {
          a = s.assertionResult.passed
            ? ' &middot; assertion pass'
            : ' &middot; assertion FAIL' + (s.assertionResult.value !== undefined && s.assertionResult.value !== null && s.assertionResult.value !== '' ? ' (last=' + escapeHtml(String(s.assertionResult.value)) + ')' : '');
        }
        return '<span class="small" style="color:' + (ok ? 'var(--green)' : 'var(--red)') + '">' +
          escapeHtml(s.fixtureName || s.fixtureId || '?') + ' ' + st + a + '</span>';
      }).join(' &middot; ');
      return '<div class="fixture"><div class="fixture-title"><div><strong>' + escapeHtml(r.sequenceName || r.sequenceId || 'sequence') + '</strong>' +
        '<div class="small">' + escapeHtml(r.timingMode || '') + ' &middot; ' + (r.durationMs != null ? r.durationMs + 'ms' : '?') + ' &middot; ' + new Date(r.startedAt).toLocaleString() + '</div></div>' +
        '<span class="method" style="background:' + color + ';color:#06111f">' + escapeHtml(r.overallStatus) + '</span></div>' +
        '<div class="small" style="margin-top:8px">' + steps + '</div></div>';
    }).join('')
    : '<p class="small">No sequence runs yet.</p>';
}

async function openSequenceBuilder(id) {
  editingSequenceId = id || null;
  let seq = { name: '', description: '', steps: [] };
  if (id) {
    const res = await api('/api/sequences/' + id);
    seq = res.sequence;
  }
  seqNameEl.value = seq.name || '';
  seqDescriptionEl.value = seq.description || '';
  seqTargetUrlEl.value = seq.targetUrl || '';
  sequenceSteps = (seq.steps || []).map(s => ({
    fixtureId: s.fixtureId,
    delayMs: s.delayMs || 0,
    assertion: s.assertion ? {
      url: s.assertion.url || '',
      jsonPath: s.assertion.jsonPath || '',
      expectedValue: s.assertion.expectedValue != null ? String(s.assertion.expectedValue) : '',
      timeoutMs: s.assertion.timeoutMs || 10000,
      pollIntervalMs: s.assertion.pollIntervalMs || 500
    } : null
  }));
  seqFormTitle.textContent = id ? 'Edit sequence' : 'New sequence';
  sequenceBuilder.style.display = '';
  sequenceListPanel.style.display = 'none';
  seqRunResultsEl.innerHTML = '';
  renderBuilderSteps();
}

function closeSequenceBuilder() {
  editingSequenceId = null;
  sequenceBuilder.style.display = 'none';
  sequenceListPanel.style.display = '';
  seqRunResultsEl.innerHTML = '';
}

function renderBuilderSteps() {
  seqStepsEl.innerHTML = sequenceSteps.map((step, i) => {
    const opts = allFixtures.map(f =>
      '<option value="' + escapeHtml(f.id) + '"' + (f.id === step.fixtureId ? ' selected' : '') + '>' + escapeHtml(f.name) + '</option>'
    ).join('');
    const a = step.assertion || {};
    const assertHidden = step.assertion ? '' : ' style="display:none"';
    return '<div class="step-row" data-idx="' + i + '" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0;background:#081020">' +
      '<div class="row"><select class="step-fixture" style="flex:1;margin-top:0"><option value="">Select fixture&hellip;</option>' + opts + '</select>' +
      '<input class="step-delay" type="number" min="0" value="' + (step.delayMs || 0) + '" title="Delay before this step (ms)" style="width:110px;margin-top:0">' +
      '<button class="secondary step-up" title="Move up">&uarr;</button>' +
      '<button class="secondary step-down" title="Move down">&darr;</button>' +
      '<button class="danger step-remove" title="Remove step">&times;</button></div>' +
      '<button class="ghost step-assert-toggle">' + (step.assertion ? 'Hide assertion' : 'Add assertion') + '</button>' +
      '<div class="step-assert"' + assertHidden + '>' +
      '<label class="field">Assertion URL<input class="assert-url" value="' + escapeHtml(a.url || '') + '" placeholder="http://localhost:4000/state"></label>' +
      '<div class="row"><label class="field" style="flex:1">JSON path<input class="assert-path" value="' + escapeHtml(a.jsonPath || '') + '" placeholder="status"></label>' +
      '<label class="field" style="flex:1">Expected value<input class="assert-value" value="' + escapeHtml(a.expectedValue ?? '') + '" placeholder="ready"></label></div>' +
      '<div class="row"><label class="field" style="flex:1">Timeout (ms)<input class="assert-timeout" type="number" min="100" value="' + (a.timeoutMs || 10000) + '"></label>' +
      '<label class="field" style="flex:1">Poll interval (ms)<input class="assert-poll" type="number" min="50" value="' + (a.pollIntervalMs || 500) + '"></label></div>' +
      '</div></div>';
  }).join('') || '<p class="small">No steps yet. Add fixtures below in the order you want them replayed.</p>';
}

function syncBuilderFromDom() {
  sequenceSteps = sequenceSteps.map((step, i) => {
    const row = seqStepsEl.querySelector('[data-idx="' + i + '"]');
    if (!row) return step;
    const fixtureId = row.querySelector('.step-fixture').value;
    const delayMs = Number(row.querySelector('.step-delay').value || 0);
    const assertDiv = row.querySelector('.step-assert');
    const assertOn = assertDiv.style.display !== 'none';
    let assertion = null;
    if (assertOn) {
      const url = row.querySelector('.assert-url').value.trim();
      const jsonPath = row.querySelector('.assert-path').value.trim();
      if (url || jsonPath) {
        assertion = {
          url,
          jsonPath,
          expectedValue: row.querySelector('.assert-value').value,
          timeoutMs: Number(row.querySelector('.assert-timeout').value || 10000),
          pollIntervalMs: Number(row.querySelector('.assert-poll').value || 500)
        };
      }
    }
    return { fixtureId, delayMs, assertion };
  });
}

function addStep() {
  syncBuilderFromDom();
  sequenceSteps.push({ fixtureId: '', delayMs: 0, assertion: null });
  renderBuilderSteps();
}

function moveStep(idx, delta) {
  syncBuilderFromDom();
  const target = idx + delta;
  if (target < 0 || target >= sequenceSteps.length) return;
  const tmp = sequenceSteps[idx];
  sequenceSteps[idx] = sequenceSteps[target];
  sequenceSteps[target] = tmp;
  renderBuilderSteps();
}

function removeStep(idx) {
  syncBuilderFromDom();
  sequenceSteps.splice(idx, 1);
  renderBuilderSteps();
}

function collectBuilder() {
  syncBuilderFromDom();
  const steps = sequenceSteps
    .filter(s => s.fixtureId)
    .map(s => {
      const step = { fixtureId: s.fixtureId, delayMs: s.delayMs || 0 };
      if (s.assertion) step.assertion = s.assertion;
      return step;
    });
  return {
    id: editingSequenceId,
    name: seqNameEl.value.trim(),
    description: seqDescriptionEl.value.trim(),
    targetUrl: seqTargetUrlEl.value.trim(),
    steps
  };
}

async function saveSequenceRequest(seq) {
  const url = seq.id ? '/api/sequences/' + seq.id : '/api/sequences';
  const res = await api(url, {
    method: seq.id ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seq)
  });
  return res.sequence;
}

async function saveBuilderSequence() {
  try {
    const seq = collectBuilder();
    const saved = await saveSequenceRequest(seq);
    editingSequenceId = saved.id;
    seqFormTitle.textContent = 'Edit sequence';
    seqFlash('Sequence saved');
    await loadSequences();
  } catch (e) {
    seqFlash(e.message, 'error');
  }
}

async function runSequenceRequest(id, opts) {
  const res = await api('/api/sequences/' + id + '/replay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts || {})
  });
  return res.run;
}

async function runSequenceFromList(id) {
  try {
    const seq = allSequences.find(s => s.id === id);
    const opts = { timingMode: 'compressed' };
    if (seq && seq.targetUrl) opts.targetUrl = seq.targetUrl;
    const run = await runSequenceRequest(id, opts);
    seqFlash('Sequence run complete: ' + run.overallStatus);
    await loadSequences();
  } catch (e) {
    seqFlash(e.message, 'error');
  }
}

function syncTimingFields() {
  const mode = seqTimingModeEl.value;
  fixedDelayField.style.display = mode === 'fixed-delay' ? '' : 'none';
  jitterField.style.display = mode === 'overlap' ? '' : 'none';
  speedField.style.display = mode === 'accelerated' ? '' : 'none';
  runSeqHintEl.textContent = mode === 'overlap'
    ? 'Steps fire concurrently at random offsets within the jitter window to shake out race conditions.'
    : mode === 'accelerated'
      ? 'Replays at Nx the recorded speed while keeping relative ordering.'
      : '';
}

async function runBuilderSequence() {
  try {
    const seq = collectBuilder();
    if (!seq.name) throw new Error('Sequence name is required');
    if (!seq.steps.length) throw new Error('Add at least one step before running');
    const saved = await saveSequenceRequest(seq);
    editingSequenceId = saved.id;
    seqFormTitle.textContent = 'Edit sequence';
    const run = await runSequenceRequest(saved.id, {
      timingMode: seqTimingModeEl.value,
      fixedDelayMs: Number(seqFixedDelayEl.value || 0),
      jitterMs: Number(seqJitterEl.value || 0),
      speed: Number(seqSpeedEl.value || 1),
      targetUrl: seqTargetUrlEl.value.trim() || undefined
    });
    renderRunResults(run);
    seqFlash('Sequence run complete: ' + run.overallStatus);
    await loadSequences();
  } catch (e) {
    seqFlash(e.message, 'error');
  }
}

function renderRunResults(run) {
  const color = run.overallStatus === 'ok' ? 'var(--green)' : run.overallStatus === 'partial' ? 'var(--yellow)' : 'var(--red)';
  const rows = (run.steps || []).map(s => {
    const ok = s.result && s.result.ok && (!s.assertionResult || s.assertionResult.passed);
    const st = s.result && s.result.status != null ? s.result.status : 'err';
    const dur = s.result && s.result.durationMs != null ? s.result.durationMs + 'ms' : '?';
    const err = s.result && s.result.error ? ' &mdash; ' + escapeHtml(s.result.error) : '';
    let assert = '';
    if (s.assertionResult) {
      assert = s.assertionResult.passed
        ? ' <span class="small" style="color:var(--green)">assertion pass (' + s.assertionResult.attempts + ' attempt(s))</span>'
        : ' <span class="small" style="color:var(--red)">assertion FAIL' + (s.assertionResult.value !== undefined && s.assertionResult.value !== null && s.assertionResult.value !== '' ? ' &mdash; last value ' + escapeHtml(String(s.assertionResult.value)) : '') + '</span>';
    }
    return '<div class="step-result" style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #ffffff0d">' +
      '<span class="small"><strong>' + escapeHtml(s.fixtureName || s.fixtureId || '?') + '</strong> &middot; ' + dur + err + '</span>' +
      '<span class="small" style="color:' + (ok ? 'var(--green)' : 'var(--red)') + '">' + st + assert + '</span></div>';
  }).join('');
  seqRunResultsEl.innerHTML = '<div class="fixture"><div class="fixture-title"><div><strong>Run result</strong>' +
    '<div class="small">' + escapeHtml(run.timingMode || '') + ' &middot; ' + (run.durationMs != null ? run.durationMs + 'ms' : '?') + '</div></div>' +
    '<span class="method" style="background:' + color + ';color:#06111f">' + escapeHtml(run.overallStatus) + '</span></div>' + rows + '</div>';
}

async function startRecording(sequenceId) {
  try {
    const res = await api('/api/sequences/' + sequenceId + '/record/start', { method: 'POST' });
    currentRecording = { sequenceId, ingestUrl: res.ingestUrl };
    recordNameEl.textContent = res.sequence.name;
    recordIngestUrlEl.textContent = res.ingestUrl;
    recordCountEl.textContent = '0';
    recordPanel.style.display = '';
    sequenceListPanel.style.display = 'none';
    sequenceBuilder.style.display = 'none';
    recordPollTimer = setInterval(pollRecordCount, 2000);
  } catch (e) {
    seqFlash(e.message, 'error');
  }
}

async function pollRecordCount() {
  if (!currentRecording) return;
  try {
    const res = await api('/api/record/' + currentRecording.sequenceId);
    recordCountEl.textContent = res.captured;
  } catch (e) {
    /* keep last known count */
  }
}

async function stopRecording() {
  if (!currentRecording) return;
  clearInterval(recordPollTimer);
  const sequenceId = currentRecording.sequenceId;
  currentRecording = null;
  try {
    const res = await api('/api/sequences/' + sequenceId + '/record/stop', { method: 'POST' });
    recordPanel.style.display = 'none';
    sequenceListPanel.style.display = 'none';
    if (res.warnings && res.warnings.length) seqFlash('Recording stopped with warnings: ' + res.warnings.join('; '), 'error');
    else seqFlash('Recording stopped. Captured steps are ready to replay.');
    await loadSequences();
    await openSequenceBuilder(res.sequence.id);
  } catch (e) {
    seqFlash(e.message, 'error');
    recordPanel.style.display = 'none';
    sequenceListPanel.style.display = '';
    await loadSequences();
  }
}

async function recordNewSequence() {
  try {
    const res = await api('/api/sequences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Recorded sequence', description: 'Captured from a live webhook source', steps: [] })
    });
    await startRecording(res.sequence.id);
  } catch (e) {
    seqFlash(e.message, 'error');
  }
}

async function deleteSequence(id) {
  if (!confirm('Delete this sequence?')) return;
  try {
    await api('/api/sequences/' + id, { method: 'DELETE' });
    seqFlash('Sequence deleted');
    await loadSequences();
  } catch (e) {
    seqFlash(e.message, 'error');
  }
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

sequenceListEl.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-seq-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.seqAction === 'run') runSequenceFromList(id);
  if (btn.dataset.seqAction === 'edit') openSequenceBuilder(id);
  if (btn.dataset.seqAction === 'record') startRecording(id);
  if (btn.dataset.seqAction === 'delete') deleteSequence(id);
});

seqStepsEl.addEventListener('click', function (e) {
  const row = e.target.closest('.step-row');
  if (!row) return;
  const idx = parseInt(row.dataset.idx, 10);
  if (e.target.classList.contains('step-up')) { moveStep(idx, -1); return; }
  if (e.target.classList.contains('step-down')) { moveStep(idx, 1); return; }
  if (e.target.classList.contains('step-remove')) { removeStep(idx); return; }
  if (e.target.classList.contains('step-assert-toggle')) {
    const div = row.querySelector('.step-assert');
    const hidden = div.style.display === 'none';
    div.style.display = hidden ? '' : 'none';
    e.target.textContent = hidden ? 'Hide assertion' : 'Add assertion';
  }
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
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
document.getElementById('newSequenceBtn')?.addEventListener('click', () => openSequenceBuilder(null));
document.getElementById('recordNewBtn')?.addEventListener('click', recordNewSequence);
document.getElementById('addStepBtn')?.addEventListener('click', addStep);
document.getElementById('saveSeqBtn')?.addEventListener('click', saveBuilderSequence);
document.getElementById('cancelSeqBtn')?.addEventListener('click', closeSequenceBuilder);
document.getElementById('runSeqBtn')?.addEventListener('click', runBuilderSequence);
document.getElementById('stopRecordBtn')?.addEventListener('click', stopRecording);
seqTimingModeEl?.addEventListener('change', syncTimingFields);

load().catch(e => flash(e.message, 'error'));
loadSequences().catch(() => {});
