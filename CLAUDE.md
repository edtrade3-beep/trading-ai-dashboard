# CLAUDE.md — Dixie Motors Platform

## Project Overview

This is the **Dixie Motors Platform** — a monorepo containing two distinct applications served by a single Node.js HTTP server:

1. **Trading Platform** (`axiom-runner/axiom-live.jsx`) — Market intelligence dashboard with watchlists, live quotes, technical analysis, TradingView webhooks, and live TV embeds.
2. **Dealer Portal** (`app.jsx`) — Used car dealership management tool with VIN decode, trade-in pricing, financing calculator, and Facebook ad generation.
3. **Trading Workstation** (`app.js` + `index.html`) — Manual indicator form with weighted scoring and trade plan builder.

The backend is `server.js` — a raw Node.js HTTP server with no framework. React is loaded via CDN with in-browser Babel transpilation (no build step).

---

## Core Rules

### Separation of Concerns
- **Never mix dealership and trading code.** These are separate modules that share a server. Keep their logic, state, and UI isolated.
- Dealership files: `app.jsx`, `index.html`, `styles.css`
- Trading files: `axiom-runner/axiom-live.jsx`, `axiom-runner/index.html`, `app.js`
- Backend: `server.js` serves both — do not duplicate routes or conflate their APIs.

### Preserve Working Features
- Do not remove or rewrite any working feature without explicitly explaining what is being removed and why.
- If replacing a function, keep the old one commented out or note the change in the PR/commit message.
- Working routes in `server.js` must not be broken. Test any route you touch.

### Do Not Break Routes
- The default route (`/`) serves `axiom-runner/index.html`. Do not change this path without updating the static serving logic in `server.js`.
- `axiom-runner/index.html` fetches `./axiom-live.jsx` at runtime — both files must stay in the same directory.
- Static file serving depends on `const ROOT = __dirname` in `server.js`. Do not move `server.js` without updating this.

---

## Secrets & Security

- **Never hardcode passwords, API keys, Telegram bot tokens, or webhook secrets in source files.**
- All secrets must come from environment variables (`process.env.VARIABLE_NAME`).
- The following env vars are defined in `render.yaml` and must be set in the Render.com dashboard:
  - `FINNHUB_API_KEY`
  - `FMP_API_KEY`
  - `TWELVE_DATA_API_KEY`
  - `POLYGON_API_KEY`
  - `UNUSUAL_WHALES_API_KEY`
  - `TRADIER_API_KEY`
- App lock passwords (currently `"@Dixie123"` in `app.jsx` and `axiom-live.jsx`) must be moved to env vars before any production deployment.
- Do not log secrets, tokens, or API keys to the console.

---

## Code Style

- Keep code clean and readable — this codebase is maintained by one person.
- Prefer clarity over cleverness. A longer, readable function beats a terse one-liner.
- No unnecessary abstractions. Only refactor when there is a clear, immediate benefit.
- Default to no comments. Only add a comment when the *why* is non-obvious.
- Inline styles are acceptable in JSX (pattern already established) — do not force external CSS unless cleaning up a specific file.
- Do not introduce new npm packages without discussion. The backend uses zero dependencies by design.

---

## UI Changes

- Improve UI **slowly and safely** — one section at a time.
- Do not restyle the entire app in one change. Prefer targeted improvements.
- Test dark and light mode after any theme change.
- Do not remove UI elements without confirming they are unused.

---

## After Major Changes

- If a build or check command is available, run it after major edits.
- Current check commands (run manually):
  ```
  node --check server.js       # syntax check the server
  node server.js               # verify it starts without errors
  ```
- There is no automated test suite. Manually verify:
  - `GET /api/health` returns `{ ok: true }`
  - `GET /api/market/quote?symbol=NVDA` returns data
  - The root URL loads the trading platform
  - The dealer portal renders and the VIN/finance tabs work

---

## Known Issues (Do Not Regress)

- `POST /api/inventory/import-website` and `POST /api/inventory/import-pdf` are called by `app.jsx` but **not implemented** in `server.js`. These return 404. Implement before enabling those UI buttons.
- TradingView alert history is stored **in memory only** — lost on server restart. Do not make users depend on it for critical data until persistence is added.
- `axiom-live.jsx` and `app.jsx` each define their own theme system independently. Do not merge them until a build step is introduced.

---

## Refactor Order (Phases — Do Not Skip)

1. **Phase 1** — Secrets: move hardcoded passwords to env vars. Add stub endpoints for missing inventory routes.
2. **Phase 2** — Split `server.js` into route modules (backend only, no frontend impact).
3. **Phase 3** — Add a build step (Vite or esbuild) to enable ES module imports in JSX files.
4. **Phase 4** — Reorganize frontend into `client/trading/` and `client/dealer/` after Phase 3.
5. **Phase 5** — Add file or SQLite persistence for TradingView alert history.

Do not jump to Phase 4 before Phase 3. Moving files before a build step exists will break CDN Babel's runtime `fetch('./axiom-live.jsx')` pattern.

---

## Deployment

- Platform: **Render.com** (see `render.yaml`)
- Node version: 20
- Start command: `node server.js`
- Region: Ohio (`ohio`)
- Health check: `GET /api/health`
- Auto-deploy: enabled on push to main
