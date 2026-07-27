# Changelog

## 0.6.0 - 2026-07-26

- Added request body size limit (1 MB) to prevent memory exhaustion.
- Fixed HTTP error codes: 404 for not found, 422 for validation errors, 500 for server errors.
- Added graceful shutdown handler (SIGTERM/SIGINT) to persist data before exit.
- Added `engines` field requiring Node.js >= 18.
- Added GET /api/fixtures/:id endpoint for fetching a single fixture.
- Added security headers (CSP, X-Content-Type-Options, X-Frame-Options) to HTML responses.
- Added truncation indicator when replay response body exceeds 5000 chars.
- Fixed FixtureStore.delete() to skip disk write when fixture ID doesn't exist.
- Renamed /pricing route to /support to match its label.
- Removed hardcoded "0 external accounts" metric card from workspace UI.
- Documented Node.js version requirement in README.

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

- Scaffolded local Webhook Replay Notebook MVP.
- Added fixture save/list/get/delete operations.
- Added secret-field redaction.
- Added webhook replay with request/response logging.
- Added critical-path tests.
