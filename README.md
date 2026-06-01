# Dixie Motors Platform

A monorepo containing two applications served by a single raw Node.js HTTP server:

- **Trading Platform** (`/`) — live market quotes, watchlists, TradingView webhook alerts, options flow, macro dashboard
- **Dealer Portal** (`/client/dealer/`) — VIN decode, financing calculator, trade-in pricing, Facebook ad builder, inventory management
- **Analyst Workstation** (`/client/trading/workstation.html`) — manual indicator form with weighted scoring and trade plan builder

---

## Quick Start (local)

### 1. Prerequisites

- Node.js 20 or newer
- No build step required — React is loaded via CDN

### 2. Clone and configure

```bash
git clone <your-repo-url>
cd <repo>
cp .env.example .env
```

Open `.env` and set at minimum:

```
APP_PASSWORD=your_strong_password_here
```

All other variables are optional for local development (the app uses public Yahoo Finance as a no-key fallback).

### 3. Start

```bash
node server.js
```

Open `http://localhost:3000`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default: `3000`) | HTTP listen port |
| `HOST` | No (default: `0.0.0.0`) | HTTP listen host |
| `APP_PASSWORD` | **Yes** | Protects the lock screen on the Trading Platform and Dealer Portal. Set a strong value before deploying. |
| `TV_WEBHOOK_SECRET` | Recommended | Token checked on `POST /api/webhooks/tradingview`. Leave blank to disable auth (not recommended in production). |
| `FINNHUB_API_KEY` | Optional | [finnhub.io](https://finnhub.io) — free tier available |
| `FMP_API_KEY` | Optional | [financialmodelingprep.com](https://financialmodelingprep.com) — free tier available |
| `TWELVE_DATA_API_KEY` | Optional | [twelvedata.com](https://twelvedata.com) — free tier available |
| `POLYGON_API_KEY` | Optional | [polygon.io](https://polygon.io) — free tier available |
| `UNUSUAL_WHALES_API_KEY` | Optional | [unusualwhales.com](https://unusualwhales.com) — paid |
| `TRADIER_API_KEY` | Optional | [tradier.com](https://tradier.com) — free sandbox available |

The server falls back through data providers automatically: **Yahoo Finance (free, no key) → FMP → Finnhub → Polygon**.

---

## Deployment (Render.com)

All secrets are declared in `render.yaml` with `sync: false` — you must set them manually in the Render dashboard under **Environment → Environment Variables**.

**Required secrets to set on Render:**

1. `APP_PASSWORD` — strong password for the app lock screen
2. `TV_WEBHOOK_SECRET` — random secret for TradingView webhook auth

**Optional (for better data quality):**

3–8. Any of the provider keys in the table above.

Health check endpoint: `GET /api/health` → `{ "ok": true }`

---

## Telegram Alerts Setup

When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, every valid TradingView webhook automatically sends a message to your Telegram.

**One-time setup:**

1. Open Telegram and message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts → copy the token
2. Set `TELEGRAM_BOT_TOKEN=<token>` in your env
3. Start a conversation with your new bot (send it any message)
4. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser — find `"chat":{"id":...}` and copy that number
5. Set `TELEGRAM_CHAT_ID=<number>` in your env

Alert messages look like:
```
🟢 NVDA — BUY @ $974.5 [1D]
Score: 90/100
Breakout above range high
```

Telegram delivery failures are silenced — they never affect the webhook response.

---

## TradingView Webhook Setup

1. Set `TV_WEBHOOK_SECRET` to a random string.
2. In TradingView, point the alert webhook to:
   ```
   https://your-app.onrender.com/api/webhooks/tradingview?token=YOUR_SECRET
   ```
3. Or pass the secret as a header: `X-Webhook-Token: YOUR_SECRET`
4. View recent alerts at: `GET /api/market/tv-alerts?token=YOUR_SECRET`

---

## Security Model

- **`APP_PASSWORD` never appears in source code.** The browser sends the entered password to `POST /api/auth/check`. The server compares it server-side using a timing-safe comparison and replies `{ ok: true }` or `{ ok: false }`. The actual password value is never sent back to the client.
- **Provider API keys** entered in the Trading Platform settings panel are stored only in the user's own browser `localStorage` — they are never sent to this server.
- **All server-side API keys** are read from `process.env` at startup and never included in API responses.

---

## Development Checks

```bash
node --check server.js   # syntax check
node server.js           # verify startup
node test/smoke.js       # run pure-function tests (30 assertions, no network)
npm test                 # alias for above
```

Manual smoke tests:

```
GET  /api/health                    → { ok: true }
GET  /api/market/quote?symbol=NVDA  → quote data
POST /api/auth/check                → { ok: true } with correct password
```

---

## Known Limitations & Future Work

These are documented issues — nothing is broken, but each item is worth addressing before heavier production use.

### Must-fix before going multi-user

- ~~**TradingView alert history is in-memory only**~~ — **Done.** Alerts are now written to `data/tv-alerts.json` on every POST and reloaded on startup. Max 500 rows.
- ~~**Inventory import endpoints return 501**~~ — **Done.** Website scraper tries JSON-LD structured data first, falls back to HTML text parsing. PDF import extracts text from text-based PDFs. Both save results to `data/inventory.json` automatically.
- ~~**Session auth has no expiry**~~ — **Done.** Both the Trading Platform and Dealer Portal now store a timestamp in `sessionStorage`. Sessions expire after 8 hours — the user is asked to log in again.

### Should improve

- ~~**No rate limiting**~~ — **Done.** Market data routes are limited to 60 requests per IP per minute via an in-memory token bucket.
- ~~**VIN decode returned stub data**~~ — **Done.** `GET /api/dealer/vin-decode` now calls the NHTSA free public API first; falls back to a prefix map stub only if NHTSA is unreachable or the VIN is unrecognized. Frontend shows "NHTSA — Live" or "Fallback — No data".
- ~~**Test coverage**~~ — **Done.** `test/smoke.js` now covers 68 pure-function assertions: finance math, auth, VIN normalization, pricing estimates, flow filters, EMA/RSI/VWAP indicators, trend detection, news sentiment, and TradingView webhook parsing.
- ~~**Polygon provider missing**~~ — **Done.** `src/providers/polygon.js` added. Polygon is now the last fallback in both the quote and news chains: Yahoo → FMP → Finnhub → Polygon.
- ~~**Macro signals re-fetched on every /api/live call**~~ — **Done.** `fetchMacroSignals()` now caches results for 15 minutes in memory. SPY, QQQ, VIX, DXY, and yield data are only re-fetched after the TTL expires.
- ~~**AI Agent tab uses heuristic only**~~ — **Done.** The Trading Platform AI Agent now calls `POST /api/agent` which forwards market context to Claude (claude-haiku). Falls back to the local heuristic summary if `ANTHROPIC_API_KEY` is not set. Set the key on Render to activate.
- ~~**No trade journal**~~ — **Done.** `POST /api/journal` logs trades with entry/stop/target. `GET /api/journal` lists them. `PATCH /api/journal/:id` closes a trade with a fill price and auto-calculates P&L. The Analyst Workstation has a "Log Trade" button and a live journal viewer panel.
- **Yahoo Finance is unofficial** — `fetchJsonSafe` calls undocumented Yahoo endpoints. These work but can break without notice. Having at least one official API key (Finnhub free tier) as a fallback is recommended.
- **`axiom-live.jsx` has no unit test coverage** — the 6000+ line trading platform is untested at the function level. It works, but any refactor is risky.
- **No HTTPS in local dev** — `node server.js` serves plain HTTP. Use Render (which provides HTTPS automatically) or a local proxy (e.g., Caddy) if you need HTTPS locally.

### Nice to have

- ~~**Inventory persistence**~~ — **Done.** Inventory loads from `data/inventory.json` on mount and auto-saves on every change.
- ~~**Telegram / push notifications**~~ — **Done.** Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to activate. See setup instructions above.
- ~~**Sold tracking**~~ — **Done.** Each inventory vehicle can be marked as sold with an actual price. Gross profit (sold price minus estimated total cost) is shown per vehicle and aggregated in the Inventory and Overview tabs. CSV export includes Status, SoldPrice, and SoldDate columns.
- ~~**Print sheet**~~ — **Done.** Vehicle tab has a "Print Sheet" button that opens a formatted one-page printable summary with price, monthly payment, spec grid, VIN, and vehicle history links.
- ~~**Multi-platform ad templates**~~ — **Done.** Ad builder supports Facebook (3 styles), Craigslist, and OfferUp. Customer Reply Generator covers 5 tones including WhatsApp.
- ~~**Workstation localStorage persistence**~~ — **Done.** Analyst Workstation saves form state and restores it on page load. Keeps the last 10 analyses in a history panel — click Load to replay any of them.
- **Build step (Phase 3 of refactor)** — adding Vite or esbuild would allow proper ES module imports in JSX files, tree-shaking, and smaller payloads. Not needed yet but required before significant frontend growth.
- **Structured logging** — `console.log` is fine for one person; a JSON logger (like `pino`) would make Render log-drain integration easier at scale.
