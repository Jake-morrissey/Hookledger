# Changelog

## 0.9.0 - 2026-07-28

- **Critical fix: replay now sends real secret values instead of `[REDACTED]`.** Previously, `save()` called `redact()` which permanently overwrote real header/body values with the literal string `[REDACTED]` in storage. Every subsequent replay sent the placeholder instead of the real signature/token. Now: `save()` stores real values; `list()` and `exportData()` return redacted copies for display; `get()` returns real values for replay and edit. Replaying a fixture with a real `stripe-signature` now works correctly.
- Removed all inline `onclick`/`oninput` event handlers from server-rendered pages. All event bindings now use `addEventListener` in `public/app.js`. Workspace buttons (`Refresh`, `Export`, `Preview`, `Debug`, `Save`, `Clear`, `Import`) and modal/search input now use `id`-based selection.
- Removed `'unsafe-inline'` from `script-src` CSP directive. CSP now reads `script-src 'self'` — inline scripts are no longer permitted. `style-src` retains `'unsafe-inline'` for the extracted stylesheet.
- `editFixture()` now fetches real fixture data via `GET /api/fixtures/:id` instead of reading from the redacted list, so the edit form shows real secrets that can be modified before save.
- Added `redactedFixture()` export — creates a display-safe copy of a fixture with secrets replaced by `[REDACTED]`.

## 0.8.0 - 2026-07-28

- Fixed critical bug: `public/app.js` contained stale server code instead of the actual client script — Workspace page is now functional.
- Added SSRF guard: replay targets restricted to localhost/loopback addresses only.
- Server now binds to `127.0.0.1` by default instead of all interfaces.
- Redaction now uses boundary-aware matching — catches `access_token`, `refresh_token`, `x-api-key`, and similar variants without over-matching short field names like `at`, `key`, or `secretary`.
- Added provider-specific signature headers: `x-hub-signature-256` (GitHub), `x-shopify-hmac-sha256` (Shopify), `x-webhook-signature`.
- Fixed partial-import state corruption: `importFixtures` validates all items before mutating, preventing inconsistent state on mid-batch errors.
- Fixed POST `/api/fixtures` silently overwriting fixtures when client supplies an ID — client-supplied IDs are now ignored on create.
- Fixed non-atomic data file writes: `persist()` now writes to a temp file then renames atomically.
- Added corruption recovery: if `data/hookledger.json` is corrupted, it is backed up and the server starts fresh.
- Improved test for `public/app.js`: now validates JavaScript parseability, not just substring matching.
- SSRF validation errors now correctly return 400 instead of 500.
- Documented `PORT` and `HOST` environment variables in README.
- Updated README to reflect loopback-only replay behavior.

## 0.7.0 - 2026-07-28

- Fixed `history()` to return a copy instead of mutating the internal replay array.
- Fixed rate limiter memory leak: added 5-minute cleanup interval for stale entries.
- Fixed fragile `querySelector('h2')`: form heading now uses `id="formTitle"`.
- Improved `readJson` error message for malformed JSON (returns "Invalid JSON in request body").
- Added `PATCH /api/fixtures/:id` endpoint for partial fixture updates.
- Added `escapeHtml()` to page `<title>` tag for defense-in-depth XSS protection.
- Moved replay history response bodies from `data-body` HTML attributes to JS memory (index-based).
- Extracted CSS into `public/style.css` and JS into `public/app.js` with static file serving.
- Added static file server with MIME type detection for `/public/*` routes.
- Updated CSP to allow `style-src 'self'` and `script-src 'self'` for static files.
- Kept synchronous `persist()` to avoid data loss on shutdown.

## 0.6.0 - 2026-07-26

- Added request body size limit (1 MB) to prevent memory exhaustion.
- Fixed HTTP error codes: 404 for not found, 400 for validation errors, 413 for oversized bodies.
- Added graceful shutdown handler (SIGTERM/SIGINT) to persist data before exit.
- Added `engines` field requiring Node.js >= 18.
- Added GET /api/fixtures/:id endpoint for fetching a single fixture.
- Added PUT /api/fixtures/:id endpoint for updating existing fixtures.
- Added rate limiting on POST /api/replay (10 requests per minute per IP).
- Fixed XSS: all fixture data in workspace UI now escaped with escapeHtml.
- Replaced inline onclick handlers with data-attribute event delegation for security.
- Added server-side escapeHtml helper for defense-in-depth.
- Added security headers (CSP, X-Content-Type-Options, X-Frame-Options) to HTML responses.
- Added truncation indicator when replay response body exceeds 5000 chars.
- Fixed FixtureStore.delete() to skip disk write when fixture ID doesn't exist.
- Renamed /pricing route to /support to match its label.
- Removed hardcoded "0 external accounts" metric card from workspace UI.
- Normalized all product references to "HookLedger" across README, package.json, and docs.
- Added replay duration tracking (durationMs) in response and history.
- Added search/filter for fixtures list in workspace.
- Added inline fixture editing (Edit button pre-fills the create form).
- Added confirmation dialog before replaying fixtures.
- Added replay history panel with status badges, duration, and truncation indicators.
- Added response body viewer modal for replay history entries.
- Refactored workspace script from minified single-line to readable multi-line.
- Added tests for durationMs, workspace UI elements, export, import, and redact endpoints.

## 0.5.0 - 2026-07-26

- Removed the local licensing system and activation flow.
- Removed machine-bound license verification and seller-side license issuance.
- Removed disposable-email blocking, since there is no free-trial or signup gate in Phase 1.
- Made the workspace open by default again.
- Replaced the pricing page with a support/sponsor page.
- Added MIT licensing and funding metadata for open-source distribution.
- Reframed the hosted/team version as a separate future product rather than a modification of the local app.

## 0.4.0 - 2026-07-26

- Added fully localhosted machine-bound licensing.
- Added activation request flow with disposable-email blocking.
- Added signed license verification and locked workspace behavior.
- Added offline `issue-license.mjs` seller-side issuance script.
- Updated pricing draft to reflect one-time purchase direction.

## 0.3.0 - 2026-07-26

- Redesigned the UI with a developer-focused dark visual system.
- Added multiple routes: Home, Workspace, Docs, Pricing draft, and Changelog.
- Moved fixture operations into a dedicated workspace page.
- Added product-positioning content for the target developer audience.
- Added visible guardrail language to the pricing draft and footer.

## 0.2.0 - 2026-07-26

- Renamed product to HookLedger.
- Added file-backed local persistence at `data/hookledger.json`.
- Added import/export for fixture JSON.
- Added redaction preview endpoint and UI.
- Added method and URL validation.
- Improved UI, error handling, delete flow, and replay history display.
- Expanded tests for persistence, import/export, validation, and replay.

## 0.1.0 - 2026-07-26

- Scaffolded local HookLedger Replay Notebook MVP.
- Added fixture save/list/get/delete operations.
- Added secret-field redaction.
- Added webhook replay with request/response logging.
- Added critical-path tests.
