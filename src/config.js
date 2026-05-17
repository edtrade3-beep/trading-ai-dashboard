const path = require("node:path");

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
const TV_WEBHOOK_SECRET = (process.env.TV_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "").trim();
const APP_PASSWORD = (process.env.APP_PASSWORD || "").trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const TV_WEBHOOK_MAX_ROWS = 160;

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
  ".ico": "image/x-icon"
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
  };
}

module.exports = {
  PORT, HOST, ROOT, MARKET_QUOTE_TIMEOUT_MS,
  FINNHUB_API_KEY, FMP_API_KEY, TWELVE_DATA_API_KEY, POLYGON_API_KEY,
  UNUSUAL_WHALES_API_KEY, TRADIER_API_KEY, TV_WEBHOOK_SECRET, TV_WEBHOOK_MAX_ROWS,
  APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY,
  MIME_TYPES, TIMEFRAME_CONFIG, CANDLE_TIMEFRAME_CONFIG, MACRO_SYMBOLS,
  resolveProviderKeys
};
