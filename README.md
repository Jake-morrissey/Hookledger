# HookLedger

Save, redact, and replay webhook fixtures during development.

HookLedger is a fully localhosted, free and open-source developer tool for testing webhook integrations without recreating the same Stripe, GitHub, Shopify, Clerk, or custom event by hand.

## What it does

- Provides a polished multi-page developer-tool interface.
- Home page explains the product and target workflow.
- Workspace page handles fixture creation, redaction preview, replay, import/export, and history.
- Docs page explains local storage, methods, and the Phase 1 open-source direction.
- Support page replaces pricing and points people to sponsor the project.
- Changelog page summarizes product updates.
- Saves named fixtures to a local JSON data file.
- Redacts common secret-like fields before storage.
- Validates method and target URL before replay.

## Why it is free and open source

Phase 1 is intentionally free and open source. The earlier machine-bound license experiment added friction and complexity before the project had real user demand. Removing it makes the local tool easier to adopt, easier to audit, and more aligned with how developer tools typically spread. If a hosted team product ever becomes worth building, that should be a separate product driven by real usage signals from this free local app.

## Support this project

If HookLedger saves you time, you can sponsor it here:

- GitHub Sponsors: `https://github.com/sponsors/YOUR_GITHUB_USERNAME`

Replace the placeholder username in `.github/FUNDING.yml` and this README before publishing.

## Guardrails

Do not paste production secrets or sensitive customer data. This app is localhost-first and does not require account creation, billing, or hosted infrastructure for Phase 1.

## Run

```bash
npm test
npm start
```

Open http://localhost:3000.

Data is stored at `data/hookledger.json` and is intentionally ignored by git.

## Phase 1 scope

Included now:

- File-backed persistence
- Fixture CRUD
- Redaction preview
- Import/export
- Replay history
- Multi-page UI
- Critical-path tests
- MIT open-source licensing

Deferred to a separate future hosted product, only if usage proves demand:

- Real authentication
- Multi-tenant storage
- Hosted replay targets
- Team collaboration
- Billing and subscription logic
- Sync between local and hosted versions
