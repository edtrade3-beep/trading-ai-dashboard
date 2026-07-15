const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Referer": "https://finviz.com/",
};

// ── Stat labels present in the Finviz snapshot table ─────────────────────────
const KNOWN_LABELS = new Set([
  "Index","P/E","EPS (ttm)","Insider Own","Shs Outstand","Perf Week",
  "Market Cap","Forward P/E","EPS next Y","Insider Trans","Shs Float","Perf Month",
  "Income","PEG","EPS next Q","Inst Own","Short Float","Perf Quarter",
  "Sales","P/S","EPS this Y","Inst Trans","Short Ratio","Perf Half Y",
  "Book/sh","P/B","ROA","Target Price","Perf Year",
  "Cash/sh","P/C","EPS next 5Y","ROE","52W Range","Perf YTD",
  "Dividend","P/FCF","EPS past 5Y","ROI","52W High","Beta",
  "Dividend %","Quick Ratio","Sales past 5Y","Gross Margin","52W Low","ATR",
  "Employees","Current Ratio","Sales Q/Q","Oper. Margin","RSI (14)","Volatility",
  "Optionable","Debt/Eq","EPS Q/Q","Profit Margin","Rel Volume","Prev Close",
  "Shortable","LT Debt/Eq","Earnings","Payout","Avg Volume","Price",
  "Recom","SMA20","SMA50","SMA200","Volume","Change",
]);

// ── Parse Finviz quote page HTML ──────────────────────────────────────────────
function parseFinvizHtml(html, symbol) {
  const raw = {};

  // Finviz's snapshot stats are split across several separate <table
  // class="...snapshot-table2..."> blocks (a layout redesign — used to be
  // one single table). Grab all of them, not just the first, or every field
  // past the first ~10 rows silently reads as missing.
  const tableRe = /<table[^>]*snapshot-table2[^>]*>[\s\S]*?<\/table>/g;
  const tables  = html.match(tableRe);
  const table   = tables && tables.length ? tables.join("") : html;

  // Extract text content from every <td> in the table
  const tds = [];
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = tdRe.exec(table)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();
    tds.push(text);
  }

  // Labels always appear one cell before their value
  for (let i = 0; i < tds.length - 1; i++) {
    if (KNOWN_LABELS.has(tds[i])) {
      raw[tds[i]] = tds[i + 1] || "-";
    }
  }

  // Company name from title tag
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const companyName = titleM ? titleM[1].replace(/\s*\|\s*.*$/, "").trim() : symbol;

  // Sector / Industry from nav links
  const sectorM  = html.match(/sector=([A-Za-z &%+]+?)(?:&|")/i);
  const industryM = html.match(/industry=([A-Za-z &%+]+?)(?:&|")/i);
  const countryM  = html.match(/country=([A-Za-z]+?)(?:&|")/i);

  return {
    symbol:       symbol.toUpperCase(),
    name:         companyName,
    sector:       sectorM   ? decodeURIComponent(sectorM[1].replace(/\+/g, " "))   : null,
    industry:     industryM ? decodeURIComponent(industryM[1].replace(/\+/g, " ")) : null,
    country:      countryM  ? countryM[1] : null,
    raw,
    // Parsed numeric fields
    pe:           parseNum(raw["P/E"]),
    eps:          parseNum(raw["EPS (ttm)"]),
    forwardPe:    parseNum(raw["Forward P/E"]),
    peg:          parseNum(raw["PEG"]),
    marketCap:    parseSuffixed(raw["Market Cap"]),
    income:       parseSuffixed(raw["Income"]),
    sales:        parseSuffixed(raw["Sales"]),
    beta:         parseNum(raw["Beta"]),
    atr:          parseNum(raw["ATR"]),
    rsi14:        parseNum(raw["RSI (14)"]),
    sma20:        parsePct(raw["SMA20"]),
    sma50:        parsePct(raw["SMA50"]),
    sma200:       parsePct(raw["SMA200"]),
    targetPrice:  parseNum(raw["Target Price"]),
    recom:        raw["Recom"]  || null,
    earnings:     raw["Earnings"] || null,
    price:        parseNum(raw["Price"]),
    prevClose:    parseNum(raw["Prev Close"]),
    change:       raw["Change"] || null,
    volume:       parseSuffixed(raw["Volume"]),
    avgVolume:    parseSuffixed(raw["Avg Volume"]),
    relVolume:    parseNum(raw["Rel Volume"]),
    shortFloat:   parsePct(raw["Short Float"]),
    shortRatio:   parseNum(raw["Short Ratio"]),
    instOwn:      parsePct(raw["Inst Own"]),
    insiderOwn:   parsePct(raw["Insider Own"]),
    roe:          parsePct(raw["ROE"]),
    roa:          parsePct(raw["ROA"]),
    roi:          parsePct(raw["ROI"]),
    debtEq:       parseNum(raw["Debt/Eq"]),
    grossMargin:  parsePct(raw["Gross Margin"]),
    operMargin:   parsePct(raw["Oper. Margin"]),
    profitMargin: parsePct(raw["Profit Margin"]),
    perfWeek:     parsePct(raw["Perf Week"]),
    perfMonth:    parsePct(raw["Perf Month"]),
    perfYTD:      parsePct(raw["Perf YTD"]),
    perfYear:     parsePct(raw["Perf Year"]),
    week52High:   parseNum(raw["52W High"] ? raw["52W High"].split("-")[0] : null),
    week52Low:    parseNum(raw["52W Low"]),
    week52Range:  raw["52W Range"] || null,
    shsOutstand:  parseSuffixed(raw["Shs Outstand"]),
    employees:    parseSuffixed(raw["Employees"]),
    index:        raw["Index"] || null,
    volatility:   raw["Volatility"] || null,
    dividend:     parseNum(raw["Dividend"]),
    dividendPct:  parsePct(raw["Dividend %"]),
  };
}

function parseNum(s) {
  if (!s || s === "-") return null;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parsePct(s) {
  if (!s || s === "-") return null;
  const n = parseFloat(String(s).replace("%", "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSuffixed(s) {
  if (!s || s === "-") return null;
  const str = String(s).replace(/,/g, "").trim();
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return null;
  const last = str.slice(-1).toUpperCase();
  if (last === "T") return n * 1e12;
  if (last === "B") return n * 1e9;
  if (last === "M") return n * 1e6;
  if (last === "K") return n * 1e3;
  return n;
}

// ── Simple in-memory cache (5 minutes per symbol) ────────────────────────────
const QUOTE_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchFinvizStats(symbol) {
  const key = symbol.toUpperCase();
  const cached = QUOTE_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(key)}&ty=c&ta=1&p=d`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Finviz HTTP ${res.status} for ${key}`);
  const html = await res.text();
  const data = parseFinvizHtml(html, key);

  QUOTE_CACHE.set(key, { data, ts: Date.now() });
  return data;
}

// ── Chart image proxy ─────────────────────────────────────────────────────────
async function fetchFinvizChartBuffer(symbol, period) {
  const p = ["d", "w", "m"].includes(period) ? period : "d";
  const url = `https://finviz.com/chart.ashx?t=${encodeURIComponent(symbol.toUpperCase())}&ty=c&ta=1&p=${p}&s=l`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Finviz chart HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "image/gif";
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: ct };
}

module.exports = { fetchFinvizStats, fetchFinvizChartBuffer };
