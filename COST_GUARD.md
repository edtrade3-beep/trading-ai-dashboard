# COST_GUARD — News Intelligence Engine

Every external dependency the news pipeline (`src/news/*`) actually uses,
existing and new (News Intelligence Engine V1, 2026-09-05 — see
`.claude/plans/proud-yawning-unicorn.md`). **No paid dependency is
required for any of this to run.** Every source below is free or
keyless; anything gated behind an API key degrades gracefully (an
unset/invalid key simply drops that source from the provider chain — it
never blocks the pipeline or throws).

| Source | Used for | Cost / auth | Documented free-tier limit | Fallback if unavailable |
|---|---|---|---|---|
| **Finnhub** (`src/providers/finnhub.js`) | Primary per-ticker news search | Free tier, requires `FINNHUB_API_KEY` | Published free-tier limits are modest (tens of calls/minute per Finnhub's own current terms — verify against their live docs before relying on a specific number) | `getLatestNews` (`src/news/provider.js`) falls through to Polygon, then Yahoo/Google — never blocks the tick |
| **Polygon.io** (`src/providers/polygon.js`) | Secondary per-ticker news search | Free tier, requires `POLYGON_API_KEY` | Polygon's free tier is rate-limited to a small number of calls/minute (verify current terms) | Falls through to Yahoo/Google News RSS |
| **Yahoo News** (via `src/routes/market.js`'s news chain) | Tertiary per-ticker news, keyless | Free, no key | Informal — no published hard limit, but not designed for high-volume automated polling; the pipeline caps itself to 60 tickers/tick (`MAX_TICKERS_PER_TICK`, `src/news/pipeline.js`) specifically to stay well under any real-world threshold | Falls through to Google News RSS |
| **Google News RSS** (`src/providers/googlenews.js`) | Final per-ticker fallback, keyless | Free, no key | Informal, no published limit; this app already relies on it as the guaranteed-available floor of the chain | None below it — an outage here means that tick's per-ticker news search returns empty for the affected symbols; the broad-market and RSS legs (below) are unaffected since they're independent |
| **Federal Reserve press releases RSS** (`src/providers/global-market-rss.js`, new V1) | Broad, non-ticker-scoped MACRO coverage | Free, no key, official government feed | No published rate limit found; fetched once per 5-minute tick, well within normal fair use | Isolated `try/catch` in `pipeline.js` — an outage here never blocks per-ticker news or the other RSS leg |
| **MarketWatch top-stories RSS** (`src/providers/global-market-rss.js`, new V1) | Broad general-market coverage | Free, no key | Informal, no published limit; same once-per-5-minute-tick cadence | Same isolated `try/catch` — independent of every other leg |
| **Alpaca** (`src/providers/alpaca-data.js`, via `fetchDayTradeScanRows`/`fetchMarketQuotes`) | Price/volume confirmation (per-ticker VWAP/RVOL) and SPY/QQQ change for divergence detection | Free real-time IEX data with an Alpaca account, keyless beyond the app's own configured Alpaca keys (already required for the paper-trading account, not a new dependency) | Alpaca's free real-time data has its own published rate limits (verify current terms); this app already relies on it throughout, not new usage created by this feature | Falls through to Yahoo for quotes if Alpaca is unavailable (`fetchMarketQuotesRaw`) |
| **Postgres** (`news_items` table, `src/news/store.js`) | Persisted, deduped, indexed news storage | Whatever Postgres plan this deployment already runs (already load-bearing for other stores — not new spend) | N/A — this app's own database | If `DATABASE_URL` isn't set, `initNewsStore()`/`isReady()` make the whole module honestly inert (`{ok:true, skipped:"no database configured"}`) rather than half-working |
| **Telegram** (`src/telegram.js`) | Regime alerts for high-impact MACRO/GEOPOLITICAL/SYSTEMIC_RISK items | Free Bot API, requires `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` | Telegram's Bot API has generous published free limits; this app's own 60-second cooldown / 40-message/day cap (`src/telegram.js`) is a stricter self-imposed ceiling regardless | If unconfigured, `isConfigured()` is false and alerts are silently skipped — no error, no retry storm |

## Not used, and why

- **SEC/EDGAR general filings** — `src/providers/sec-edgar.js` already exists but is scoped to Form 4 insider transactions only; general 8-K/press-release-adjacent filing ingestion is explicitly deferred (see the plan's "explicitly deferred" section), not part of V1.
- **U.S. Treasury press releases RSS** — tried and dropped. Several plausible URLs under `home.treasury.gov` either timed out or redirected to the bare homepage with no discoverable feed link when checked (2026-09-05). Rather than guess at a URL, this source is left out. Revisit if Treasury publishes a working public feed.
- **Any paid news/market-data/AI API** (Bloomberg, Reuters terminal, paid OpenAI/Anthropic calls for classification, etc.) — never introduced. Every classification/sentiment/scoring step in `src/news/*` is deterministic keyword/rule-based logic, not an LLM call, by design (see `src/news/classifier.js`'s and `src/news/sentiment.js`'s own header comments).

## Licensing / attribution

Every stored news item retains its real `source` and `url` (`src/news/normalizer.js`) — this pipeline never reproduces full article text, only headlines/summaries with attribution and a link back to the original publisher, and never scrapes a paywalled or authentication-gated source.
