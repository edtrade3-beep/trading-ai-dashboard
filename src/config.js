const path = require("node:path");
const { isOn } = require("./utils");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const MARKET_QUOTE_TIMEOUT_MS = 30000;

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_API_KEY = process.env.FMP_API_KEY || "";
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || "";
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";
const UNUSUAL_WHALES_API_KEY = process.env.UNUSUAL_WHALES_API_KEY || "";
const TRADIER_API_KEY = process.env.TRADIER_API_KEY || "";
// RentCast (2026-09-16, "AI Opportunity Hunter" master prompt's Property
// Engine — real, explicit user decision after being asked which provider
// they have: "I have a real listing/comps API"). Real property records/
// value-estimate/rent-estimate/sale-listings API, key added by the user
// directly to Render's env vars — src/providers/rentcast.js is the one
// real adapter against it.
const RENTCAST_API_KEY = (process.env.RENTCAST_API_KEY || "").trim();
const TV_WEBHOOK_SECRET = (process.env.TV_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "").trim();
const APP_PASSWORD = (process.env.APP_PASSWORD || "").trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
// Astra (the dev-task planner/reviewer, 2026-09-13) is a real, separate
// Anthropic spend on top of Story AI/the web Copilot — explicit user
// request: "i dont want to use money for ai agent". Defaults OFF even
// when ANTHROPIC_API_KEY is set for those other features; set
// ASTRA_ENABLED=true (Render env var) to opt in later. astra-agent.js's
// isConfigured() checks this, never just the presence of the key.
const ASTRA_ENABLED = isOn(process.env.ASTRA_ENABLED);
const TV_WEBHOOK_MAX_ROWS = 160;

// Fajr & Tasbeeh multi-user bot (2026-09-19, explicit user request: "build
// this multi-user (200+) version as new functionality inside trading-ai-
// dashboard's existing single-user bot"). A genuinely SEPARATE Telegram
// bot/token from TELEGRAM_BOT_TOKEN above — that one is hardcoded to a
// single TELEGRAM_CHAT_ID throughout this whole app (see telegram.js) and
// is not safe to repurpose for 200+ distinct users. Real, own bot created
// via @BotFather, own token here. ADMIN_TELEGRAM_ID is who /stats and
// admin-only commands are allowed to reach. DEFAULT_TIMEZONE only applies
// until a user's own real timezone is known (their /start registration
// captures it) — never silently overrides a real per-user value.
const FAJR_BOT_TOKEN = (process.env.FAJR_BOT_TOKEN || "").trim();
const ADMIN_TELEGRAM_ID = (process.env.ADMIN_TELEGRAM_ID || "").trim();
const DEFAULT_TIMEZONE = (process.env.DEFAULT_TIMEZONE || "America/New_York").trim();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jsx": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

const TIMEFRAME_CONFIG = {
  "1D": { range: "6mo", interval: "1d", aggregate: 1 },
  "4H": { range: "1mo", interval: "1h", aggregate: 4 },
  "1H": { range: "1mo", interval: "1h", aggregate: 1 },
  "15M": { range: "5d", interval: "15m", aggregate: 1 }
};

const CANDLE_TIMEFRAME_CONFIG = {
  "5M": { range: "1d", interval: "5m", aggregate: 1 },
  "15M": { range: "5d", interval: "15m", aggregate: 1 },
  // 4H added 2026-08-20 (MTF Decision System, Phase 2) — same range/
  // interval/aggregate already used by TIMEFRAME_CONFIG's own "4H" entry
  // above (1h bars, 4 aggregated into one candle). That entry backs the
  // orphaned buildLivePayload/api/live path; this one backs
  // fetchYahooCandlesWithIndicators (src/providers/yahoo.js), which
  // already correctly applies `aggregate` and already computes real
  // EMA9/21/VWAP/RSI/MACD series — the real reusable primitive for the
  // new SWING_SETUP (4H) evaluator. Validated live before use, not
  // assumed: real NVDA 1H bars returned 163 real candles with sane
  // EMA/RSI values.
  "4H": { range: "1mo", interval: "1h", aggregate: 4 },
  "1H": { range: "1mo", interval: "1h", aggregate: 1 },
  "1D": { range: "6mo", interval: "1d", aggregate: 1 },
  "1W": { range: "2y", interval: "1wk", aggregate: 1 }
};

const MACRO_SYMBOLS = {
  SPY: ["SPY"],
  QQQ: ["QQQ"],
  VIX: ["^VIX"],
  DXY: ["DX-Y.NYB", "DX=F"],
  US10Y: ["^TNX"],
  US2Y: ["^UST2Y", "^US2Y", "2YY=F"]
};

function resolveProviderKeys(searchParams) {
  return {
    finnhub: (searchParams.get("finnhubKey") || FINNHUB_API_KEY || "").trim(),
    fmp: (searchParams.get("fmpKey") || FMP_API_KEY || "").trim(),
    twelvedata: (searchParams.get("tdKey") || TWELVE_DATA_API_KEY || "").trim(),
    polygon: (searchParams.get("polygonKey") || POLYGON_API_KEY || "").trim(),
    unusualWhales: (searchParams.get("uwKey") || UNUSUAL_WHALES_API_KEY || "").trim(),
    tradier: (searchParams.get("tradierKey") || TRADIER_API_KEY || "").trim(),
    rentcast: (searchParams.get("rentcastKey") || RENTCAST_API_KEY || "").trim(),
  };
}

module.exports = {
  PORT, HOST, ROOT, MARKET_QUOTE_TIMEOUT_MS,
  FINNHUB_API_KEY, FMP_API_KEY, TWELVE_DATA_API_KEY, POLYGON_API_KEY,
  UNUSUAL_WHALES_API_KEY, TRADIER_API_KEY, RENTCAST_API_KEY, TV_WEBHOOK_SECRET, TV_WEBHOOK_MAX_ROWS,
  APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY, ASTRA_ENABLED,
  FAJR_BOT_TOKEN, ADMIN_TELEGRAM_ID, DEFAULT_TIMEZONE,
  MIME_TYPES, TIMEFRAME_CONFIG, CANDLE_TIMEFRAME_CONFIG, MACRO_SYMBOLS,
  resolveProviderKeys
};
