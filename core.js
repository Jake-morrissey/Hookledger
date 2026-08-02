import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'client_secret',
  'stripe-signature',
  'x-hub-signature',
  'x-hub-signature-256',
  'x-shopify-hmac-sha256',
  'x-webhook-signature'
]);

const ALLOWED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SAFE_COMPOUND_FIELDS = new Set([
  'token_type',
  'token_use',
  'cookie_settings',
  'cookie_name',
  'cookie_path',
  'cookie_domain',
  'cookie_httponly',
  'cookie_secure',
  'cookie_samesite',
  'cookie_maxage'
]);

export class FixtureStore {
  constructor(options = {}) {
    this.dataFile = options.dataFile || null;
    this.fixtures = new Map();
    this.replays = [];
    this.sequences = new Map();
    this.sequenceRuns = [];
    if (this.dataFile) this.load();
  }

  load() {
    if (!this.dataFile || !fs.existsSync(this.dataFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8') || '{}');
      const entries = [];
      const seenIds = new Set();
      for (const fixture of (data.fixtures || [])) {
        if (!fixture.id) {
          console.warn('load: skipping fixture without id:', fixture.name || '<unknown>');
          continue;
        }
        if (seenIds.has(fixture.id)) {
          console.warn('load: skipping duplicate id:', fixture.id, fixture.name || '<unknown>');
          continue;
        }
        seenIds.add(fixture.id);
        entries.push([fixture.id, fixture]);
      }
      this.fixtures = new Map(entries);
      this.replays = data.replays || [];
      const sequenceEntries = [];
      const seenSequenceIds = new Set();
      for (const sequence of (data.sequences || [])) {
        if (!sequence.id) {
          console.warn('load: skipping sequence without id:', sequence.name || '<unknown>');
          continue;
        }
        if (seenSequenceIds.has(sequence.id)) {
          console.warn('load: skipping duplicate sequence id:', sequence.id, sequence.name || '<unknown>');
          continue;
        }
        seenSequenceIds.add(sequence.id);
        sequenceEntries.push([sequence.id, { steps: [], ...sequence }]);
      }
      this.sequences = new Map(sequenceEntries);
      this.sequenceRuns = Array.isArray(data.sequenceRuns) ? data.sequenceRuns : [];
    } catch (err) {
      console.error(`Corrupted data file, backing up and starting fresh: ${err.message}`);
      const backup = this.dataFile + '.bak.' + Date.now() + '.' + crypto.randomUUID().slice(0, 8);
      try { fs.copyFileSync(this.dataFile, backup); } catch {}
      this.fixtures = new Map();
      this.replays = [];
      this.sequences = new Map();
      this.sequenceRuns = [];
    }
  }

  persist() {
    if (!this.dataFile) return;
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    const tmp = this.dataFile + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(this.exportData(), null, 2));
    fs.renameSync(tmp, this.dataFile);
  }

  save(input, options = {}) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Fixture name is required');
    const url = String(input?.url ?? '').trim();
    if (url) validateHttpUrl(url);
    const method = String(input?.method ?? 'POST').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error(`Method must be one of ${[...ALLOWED_METHODS].join(', ')}`);
    if (input?.headers != null && (typeof input.headers !== 'object' || Array.isArray(input.headers))) {
      throw new Error('Fixture headers must be a plain object');
    }
    if (input?.body != null && (typeof input.body !== 'object' || Array.isArray(input.body))) {
      throw new Error('Fixture body must be a plain object');
    }
    const now = new Date().toISOString();
    const existing = input?.id ? this.fixtures.get(input.id) : null;
    const headers = options.preserveRedacted && existing
      ? preserveSecrets(existing.headers, input?.headers ?? {})
      : (input?.headers ?? {});
    const body = options.preserveRedacted && existing
      ? preserveSecrets(existing.body, input?.body ?? {})
      : (input?.body ?? {});
    const fixture = {
      id: input?.id || crypto.randomUUID(),
      name,
      url,
      method,
      headers,
      body,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.fixtures.set(fixture.id, fixture);
    try {
      this.persist();
    } catch (err) {
      this.fixtures.delete(fixture.id);
      throw err;
    }
    return fixture;
  }

  importFixtures(fixtures) {
    if (!Array.isArray(fixtures)) throw new Error('Import payload must include a fixtures array');
    const warnings = [];
    const seenIds = new Set();
    const validated = fixtures.map((fixture) => {
      const id = fixture.id || crypto.randomUUID();
      if (this.fixtures.has(id)) warnings.push(`Fixture "${fixture.name || id}" overwrites existing ID ${id}`);
      if (seenIds.has(id)) warnings.push(`Fixture "${fixture.name || id}" has duplicate ID ${id} within the same batch`);
      seenIds.add(id);
      const name = String(fixture?.name ?? '').trim();
      if (!name) throw new Error('Fixture name is required');
      const url = String(fixture?.url ?? '').trim();
      if (url) validateHttpUrl(url);
      const method = String(fixture?.method ?? 'POST').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) throw new Error(`Method must be one of ${[...ALLOWED_METHODS].join(', ')}`);
      if (fixture.headers != null && (typeof fixture.headers !== 'object' || Array.isArray(fixture.headers))) {
        throw new Error('Fixture headers must be a plain object');
      }
      if (fixture.body != null && (typeof fixture.body !== 'object' || Array.isArray(fixture.body))) {
        throw new Error('Fixture body must be a plain object');
      }
      const now = new Date().toISOString();
      const existing = this.fixtures.get(id);
      return {
        id, name, url, method,
        headers: fixture?.headers ?? {},
        body: fixture?.body ?? {},
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
    });
    const written = new Set();
    const writtenFixtures = [];
    for (const f of validated) {
      if (written.has(f.id)) continue;
      written.add(f.id);
      this.fixtures.set(f.id, f);
      writtenFixtures.push(f);
    }
    this.persist();
    return { imported: writtenFixtures, warnings };
  }

  list() {
    return [...this.fixtures.values()].map(redactedFixture).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id) {
    const fixture = this.fixtures.get(id);
    if (!fixture) throw new Error('Fixture not found');
    return fixture;
  }

  delete(id) {
    if (!this.fixtures.has(id)) return false;
    const fixture = this.fixtures.get(id);
    this.fixtures.delete(id);
    try {
      this.persist();
    } catch (err) {
      this.fixtures.set(id, fixture);
      throw err;
    }
    return true;
  }

  logReplay(entry) {
    const replay = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
    this.replays.unshift(replay);
    if (this.replays.length > 100) this.replays.length = 100;
    try {
      this.persist();
    } catch (err) {
      this.replays.shift();
      throw err;
    }
    return this.replays[0];
  }

  history() {
    return this.replays.map(r => structuredClone(r));
  }

  exportData() {
    return {
      product: 'HookLedger',
      version: 1,
      fixtures: this.list(),
      replays: this.replays.map(r => structuredClone(r)),
      sequences: [...this.sequences.values()].map(s => structuredClone(s)),
      sequenceRuns: this.sequenceRuns.map(r => structuredClone(r))
    };
  }

  listSequences() {
    return [...this.sequences.values()].map(s => structuredClone(s)).sort((a, b) => a.name.localeCompare(b.name));
  }

  getSequence(id) {
    const sequence = this.sequences.get(id);
    if (!sequence) throw new Error('Sequence not found');
    return structuredClone(sequence);
  }

  saveSequence(input) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Sequence name is required');
    const steps = [];
    if (input?.steps != null) {
      if (!Array.isArray(input.steps)) throw new Error('Sequence steps must be an array');
      for (const step of input.steps) {
        const fixtureId = String(step?.fixtureId ?? '').trim();
        if (!fixtureId) throw new Error('Each sequence step must reference a fixture id');
        if (!this.fixtures.has(fixtureId)) throw new Error(`Sequence step references missing fixture ${fixtureId}`);
        const delayMs = Number(step?.delayMs ?? 0);
        if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('Sequence step delay must be a non-negative number');
        const cleanStep = { fixtureId, delayMs };
        if (step?.assertion != null) cleanStep.assertion = validateAssertion(step.assertion);
        steps.push(cleanStep);
      }
    }
    const now = new Date().toISOString();
    const existing = input?.id ? this.sequences.get(input.id) : null;
    const targetUrl = String(input?.targetUrl ?? '').trim();
    if (targetUrl) validateHttpUrl(targetUrl);
    const sequence = {
      id: input?.id || crypto.randomUUID(),
      name,
      description: String(input?.description ?? '').trim(),
      targetUrl,
      steps,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.sequences.set(sequence.id, sequence);
    try {
      this.persist();
    } catch (err) {
      this.sequences.delete(sequence.id);
      throw err;
    }
    return structuredClone(sequence);
  }

  deleteSequence(id) {
    if (!this.sequences.has(id)) return false;
    const sequence = this.sequences.get(id);
    this.sequences.delete(id);
    try {
      this.persist();
    } catch (err) {
      this.sequences.set(id, sequence);
      throw err;
    }
    return true;
  }

  logSequenceRun(run) {
    const entry = { id: run.id || crypto.randomUUID(), ...structuredClone(run) };
    this.sequenceRuns.unshift(entry);
    if (this.sequenceRuns.length > 100) this.sequenceRuns.length = 100;
    try {
      this.persist();
    } catch (err) {
      this.sequenceRuns.shift();
      throw err;
    }
    return structuredClone(this.sequenceRuns[0]);
  }

  listSequenceRuns() {
    return this.sequenceRuns.map(r => structuredClone(r));
  }
}

export function validateHttpUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      const validationError = new Error('Target URL must be a valid http:// or https:// URL');
      validationError.isValidationError = true;
      throw validationError;
    }
    return parsed;
  } catch (err) {
    if (err.isValidationError) throw err;
    throw new Error('Target URL must be a valid http:// or https:// URL');
  }
}

export function validateReplayTarget(url) {
  const parsed = validateHttpUrl(url);
  const host = parsed.hostname;
  const isExplicitLoopback = host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0';
  const is127Prefix = host === '127.0.0.1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  const isLoopback = isExplicitLoopback || is127Prefix;
  if (!isLoopback) {
    throw new Error('Replay target must be a localhost/loopback address for safety');
  }
  return parsed;
}

export function redact(value, debug = false) {
  if (Array.isArray(value)) return value.map(v => redact(v, debug));
  if (!value || typeof value !== 'object') return value;
  
  const secretKeys = [...SECRET_KEYS].map(k => k.replaceAll('-', '_'));
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      const isSecret = secretKeys.some(kn => {
        return normalized === kn ||
          (normalized.startsWith(kn + '_') && !SAFE_COMPOUND_FIELDS.has(normalized)) ||
          normalized.endsWith('_' + kn) ||
          normalized.includes('_' + kn + '_');
      });
      if (isSecret) {
        return [key, debug ? { value: '[REDACTED]', reason: 'secret-field' } : '[REDACTED]'];
      }
      return [key, redact(nested, debug)];
    })
  );
}

export function redactedFixture(fixture) {
  return { ...fixture, headers: redact(fixture.headers ?? {}), body: redact(fixture.body ?? {}) };
}

export async function replayFixture(fixture, targetUrl = fixture.url, fetchImpl = fetch) {
  if (!targetUrl) throw new Error('Target URL is required');
  validateReplayTarget(targetUrl);
  
  const start = Date.now();
  try {
    const response = await fetchImpl(targetUrl, {
      method: fixture.method || 'POST',
      headers: { 'content-type': 'application/json', ...(fixture.headers || {}) },
      body: JSON.stringify(fixture.body ?? {})
    });
    const text = await response.text();
    const truncated = text.length > 5000;
    return { 
      status: response.status, 
      ok: response.ok, 
      body: truncated ? text.slice(0, 5000) : text,
      truncated,
      durationMs: Date.now() - start,
      error: null
    };
  } catch (err) {
    const errorMsg = err instanceof TypeError 
      ? `Connection failed: ${err.message}. Check that the target URL is reachable.`
      : `Replay failed: ${err.message}`;
    return { 
      status: null, 
      ok: false, 
      body: null,
      durationMs: Date.now() - start,
      error: errorMsg
    };
  }
}

export function preserveSecrets(existing, incoming) {
  if (typeof incoming === 'string' && incoming === '[REDACTED]' && existing !== undefined && existing !== null) {
    return existing;
  }
  if (Array.isArray(incoming)) {
    return incoming.map((v, i) => preserveSecrets(existing?.[i], v));
  }
  if (incoming && typeof incoming === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(incoming)) {
      out[key] = preserveSecrets(existing?.[key], value);
    }
    return out;
  }
  return incoming;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function jsonPathGet(obj, path) {
  if (!path) return undefined;
  const segments = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(s => s.length > 0);
  let current = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

export function validateAssertion(assertion) {
  if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
    throw new Error('Step assertion must be an object');
  }
  const url = String(assertion.url ?? '').trim();
  if (!url) throw new Error('Assertion URL is required');
  validateHttpUrl(url);
  const jsonPath = String(assertion.jsonPath ?? '').trim();
  if (!jsonPath) throw new Error('Assertion JSON path is required');
  const timeoutMs = Number(assertion.timeoutMs ?? 10000);
  const pollIntervalMs = Number(assertion.pollIntervalMs ?? 500);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Assertion timeout must be a positive number');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new Error('Assertion poll interval must be a positive number');
  return { url, jsonPath, expectedValue: assertion.expectedValue, timeoutMs, pollIntervalMs };
}

export async function runAssertion(assertion, fetchImpl = fetch) {
  validateReplayTarget(assertion.url);
  const startedAt = Date.now();
  const timeoutMs = assertion.timeoutMs ?? 10000;
  const pollIntervalMs = assertion.pollIntervalMs ?? 500;
  const deadline = startedAt + timeoutMs;
  let value = null;
  let error = null;
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      const response = await fetchImpl(assertion.url);
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      value = jsonPathGet(parsed, assertion.jsonPath);
      if (String(value) === String(assertion.expectedValue)) {
        return { passed: true, value, error: null, attempts, elapsedMs: Date.now() - startedAt };
      }
    } catch (err) {
      error = err.message;
    }
    if (Date.now() + pollIntervalMs >= deadline) break;
    await sleep(pollIntervalMs);
  }
  return {
    passed: false,
    value,
    error: error || `Assertion timed out after ${timeoutMs}ms`,
    attempts,
    elapsedMs: Date.now() - startedAt
  };
}

export async function replaySequence(sequence, options = {}) {
  const {
    timingMode = 'compressed',
    store,
    targetUrl,
    fixedDelayMs = 0,
    jitterMs = 0,
    speed = 1,
    fetchImpl = fetch
  } = options;
  if (!store) throw new Error('Sequence replay requires a store');
  const steps = sequence.steps || [];
  const startedAt = Date.now();
  const run = {
    id: crypto.randomUUID(),
    sequenceId: sequence.id,
    timingMode,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    steps: [],
    overallStatus: 'ok'
  };

  const replayStep = async (step, delay) => {
    if (delay > 0) await sleep(delay);
    const at = new Date().toISOString();
    let result;
    try {
      const fixture = store.get(step.fixtureId);
      result = await replayFixture(fixture, targetUrl || fixture.url, fetchImpl);
    } catch (err) {
      result = { status: null, ok: false, body: null, durationMs: 0, error: err.message };
    }
    const entry = { fixtureId: step.fixtureId, at, result };
    if (step.assertion) {
      try {
        entry.assertionResult = await runAssertion(step.assertion, fetchImpl);
      } catch (err) {
        entry.assertionResult = { passed: false, value: null, error: err.message, attempts: 0, elapsedMs: 0 };
      }
    }
    return entry;
  };

  if (timingMode === 'overlap') {
    const tasks = steps.map(step => {
      const offset = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
      return new Promise(resolve => {
        setTimeout(() => resolve(replayStep(step, 0)), offset);
      });
    });
    const settled = await Promise.allSettled(tasks);
    run.steps = settled.map(s => s.status === 'fulfilled' ? s.value : {
      fixtureId: null,
      at: new Date().toISOString(),
      result: { status: null, ok: false, body: null, durationMs: 0, error: s.reason?.message || 'Step failed unexpectedly' }
    });
  } else {
    for (let i = 0; i < steps.length; i++) {
      let delay = 0;
      if (i > 0) {
        if (timingMode === 'fixed-delay') delay = fixedDelayMs > 0 ? fixedDelayMs : (steps[i].delayMs || 0);
        else if (timingMode === 'as-recorded') delay = steps[i].delayMs || 0;
        else if (timingMode === 'accelerated') delay = Math.max(0, (steps[i].delayMs || 0) / speed);
      }
      run.steps.push(await replayStep(steps[i], delay));
    }
  }

  run.durationMs = Date.now() - startedAt;
  const statuses = run.steps.map(s => !!(s.result?.ok && (!s.assertionResult || s.assertionResult.passed)));
  const failures = statuses.filter(ok => !ok).length;
  run.overallStatus = statuses.length === 0 ? 'ok' : failures === statuses.length ? 'failed' : failures > 0 ? 'partial' : 'ok';
  return run;
}

export class RecordingSession {
  constructor({ store }) {
    this.store = store;
    this.events = [];
    this.startedAt = Date.now();
  }

  capture(method, headers, body) {
    this.events.push({
      method: String(method ?? 'POST').toUpperCase(),
      headers: { ...(headers || {}) },
      body,
      receivedAt: Date.now()
    });
  }

  count() {
    return this.events.length;
  }

  finalize({ sequenceName }) {
    const fixtures = [];
    const warnings = [];
    const steps = [];
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      try {
        const body = typeof event.body === 'string' ? { _raw: event.body } : (event.body ?? {});
        const fixture = this.store.save({
          name: `${sequenceName} · step ${i + 1}`,
          url: '',
          method: event.method,
          headers: event.headers,
          body
        });
        fixtures.push(fixture);
        steps.push({
          fixtureId: fixture.id,
          delayMs: i === 0 ? 0 : Math.max(0, event.receivedAt - this.events[i - 1].receivedAt)
        });
      } catch (err) {
        warnings.push(`Captured event ${i + 1} (${event.method}) skipped: ${err.message}`);
      }
    }
    return { fixtures, steps, warnings };
  }
}
