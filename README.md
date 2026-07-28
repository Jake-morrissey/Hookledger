# HookLedger

Save, redact, and replay webhook fixtures during development.

HookLedger is a fully localhosted, free and open-source developer tool for testing webhook integrations without recreating the same Stripe, GitHub, Shopify, Clerk, or custom event by hand.

## Quick start

Requires **Node.js >= 18**.

```bash
git clone https://github.com/Jake-morrissey/HookLedger.git
cd HookLedger
npm install
npm start
```

Then open http://localhost:3000.

## Download

1. Click the green **Code** button on this page
2. Select **Download ZIP**
3. Extract the ZIP
4. Open a terminal in the extracted folder
5. Run `npm install && npm start`

## Run tests

```bash
npm test
```

## What it does

- Polished multi-page developer-tool interface with dark theme.
- Save named webhook fixtures with automatic secret redaction.
- Preview and debug redaction before saving.
- Replay fixtures against any local or remote HTTP endpoint.
- Import and export fixtures as JSON.
- Replay history with response status and body.
- File-backed persistence at `data/hookledger.json` (git-ignored).

## Pages

| Page | What it does |
|------|-------------|
| `/` | Home - product overview and value proposition |
| `/workspace` | Create, preview, replay, import/export fixtures |
| `/docs` | Quick-start guide and local storage info |
| `/support` | Sponsor the project |
| `/changelog` | Version history |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/fixtures` | List all fixtures |
| `POST` | `/api/fixtures` | Create or update a fixture |
| `GET` | `/api/fixtures/:id` | Get a single fixture |
| `PUT` | `/api/fixtures/:id` | Update an existing fixture |
| `PATCH` | `/api/fixtures/:id` | Partially update an existing fixture |
| `DELETE` | `/api/fixtures/:id` | Delete a fixture |
| `GET` | `/api/history` | Get replay history |
| `GET` | `/api/export` | Export all fixtures as JSON |
| `POST` | `/api/import` | Import fixtures from JSON |
| `POST` | `/api/redact` | Preview redaction (dry-run) |
| `POST` | `/api/replay` | Replay a fixture to its target URL |

## Guardrails

Do not paste production secrets or sensitive customer data. This app is localhost-first and does not require account creation, billing, or hosted infrastructure for Phase 1.

## Support this project

If HookLedger saves you time, you can sponsor it here:

- GitHub Sponsors: `https://github.com/sponsors/Jake-morrissey`

## Phase 1 scope

Included now:

- File-backed persistence
- Fixture CRUD
- Redaction preview
- Import/export
- Replay history
- Multi-page UI
- Critical-path and integration tests
- MIT open-source licensing

Deferred to a separate future hosted product, only if usage proves demand:

- Real authentication
- Multi-tenant storage
- Hosted replay targets
- Team collaboration
- Billing and subscription logic
- Sync between local and hosted versions

## License

MIT
