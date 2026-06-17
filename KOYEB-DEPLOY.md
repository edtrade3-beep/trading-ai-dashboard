# Deploy to Koyeb (always-on, free tier)

Your app is already Koyeb-ready: `npm start` → `node server.js`, Node 20, listens on `$PORT`/`$HOST`.
Koyeb does **not** sleep, so your schedulers (Telegram bot, market scanners) stay alive — unlike Render's free tier.

## Steps

1. Go to **koyeb.com** → sign up (GitHub login is easiest).
2. **Create Web Service → GitHub** → pick this repo (`trading-ai-dashboard`), branch `main`.
3. **Builder:** leave on **Buildpack** (auto-detected). It runs `npm install` then `npm start`.
   - If asked for a run command: `node server.js`
4. **Instance:** pick the **Free** instance (Eco / nano).
5. **Port:** `8000` (Koyeb default). The app reads `$PORT` automatically — leave it.
6. **Health check path:** `/api/health`
7. **Environment variables** — add the ones you use (copy values from your local `.env`):

   **Core / security**
   - `APP_PASSWORD`
   - `TV_WEBHOOK_SECRET`

   **Telegram**
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

   **Price Beater (dealer data)**
   - `MARKETCHECK_API_KEY`
   - `AUTODEV_API_KEY`
   - `BRAVE_API_KEY`
   - `SERPAPI_KEY`

   **Market data (trading side)**
   - `FINNHUB_API_KEY`, `FMP_API_KEY`, `TWELVE_DATA_API_KEY`, `POLYGON_API_KEY`,
     `TIINGO_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TRADIER_API_KEY`, `TRADIER_BASE_URL`,
     `UNUSUAL_WHALES_API_KEY`

   **Optional**
   - `ANTHROPIC_API_KEY` (only if you use the AI description generator)

8. **Deploy.** Koyeb builds and gives you a URL like `https://your-app-xxxx.koyeb.app`.

## After deploy
- Trading platform: `https://your-app.koyeb.app/`
- Dealer portal: `https://your-app.koyeb.app/dealer`
- Price Beater: `https://your-app.koyeb.app/price-beater`

## Notes
- **Keys go in Koyeb env vars, not the in-app `.env`** — the filesystem resets on each deploy (same as Render). The in-app "Save key" still works for the current run, but set them in the dashboard so they persist.
- Auto-deploy on push to `main` is on by default — same workflow you had on Render.
- Free instance has limited RAM; if the build is heavy, bump to the smallest paid instance only if needed.
