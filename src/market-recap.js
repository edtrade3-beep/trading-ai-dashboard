// 3:45 PM Daily Market Recap — Auto-generates video script + sends to Telegram
// Pipeline: Fetch market data → Claude generates script → Telegram
// Runs at 3:45 PM ET weekdays via server.js scheduler

const { sendTelegramMessage, isConfigured } = require("./telegram");
const { callAnthropicApi }                  = require("./anthropic");
const { ANTHROPIC_API_KEY }                 = require("./config");
const { fetchJsonSafe, withTimeout }        = require("./utils");

// ── Fetch all market data in parallel ────────────────────────────────────────

async function fetchMarketData() {
  const https = require("https");

  function yahooMeta(sym) {
    return new Promise(resolve => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
      const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const m = JSON.parse(d)?.chart?.result?.[0]?.meta || {};
            const closes = JSON.parse(d)?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
            const prev   = closes[0] || m.previousClose || 0;
            const price  = m.regularMarketPrice || 0;
            const chg    = prev > 0 ? (price - prev) / prev * 100 : 0;
            resolve({ price: Math.round(price * 100) / 100, chg: Math.round(chg * 100) / 100 });
          } catch { resolve({ price: 0, chg: 0 }); }
        });
      });
      req.on("error", () => resolve({ price: 0, chg: 0 }));
      req.setTimeout(6000, () => { req.destroy(); resolve({ price: 0, chg: 0 }); });
    });
  }

  const [spy, qqq, iwm, vix, tlt, dxy, oil, gold, btc] = await Promise.all([
    yahooMeta("SPY"), yahooMeta("QQQ"), yahooMeta("IWM"),
    yahooMeta("^VIX"), yahooMeta("^TNX"),
    yahooMeta("DX-Y.NYB"), yahooMeta("CL=F"),
    yahooMeta("GC=F"), yahooMeta("BTC-USD"),
  ]);

  // Sector ETFs for rotation
  const sectorSyms = ["XLK","XLF","XLV","XLE","XLI","XLP","XLY","XLU","XLRE","XLC","XLB"];
  const sectorData = await Promise.all(sectorSyms.map(s => yahooMeta(s).then(d => ({ sym: s, ...d }))));
  sectorData.sort((a, b) => b.chg - a.chg);
  const topSector = sectorData[0];
  const weakSector = sectorData[sectorData.length - 1];

  const SECTOR_NAMES = {
    XLK:"Technology", XLF:"Financials", XLV:"Healthcare",
    XLE:"Energy", XLI:"Industrials", XLP:"Consumer Staples",
    XLY:"Consumer Discretionary", XLU:"Utilities", XLRE:"Real Estate",
    XLC:"Communication", XLB:"Materials"
  };

  return {
    spy, qqq, iwm, vix, tny: tlt, dxy, oil, gold, btc,
    topSector:  { name: SECTOR_NAMES[topSector.sym]  || topSector.sym,  chg: topSector.chg },
    weakSector: { name: SECTOR_NAMES[weakSector.sym] || weakSector.sym, chg: weakSector.chg },
    fetchedAt: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }),
    date: new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  };
}

// ── Generate script with Claude ───────────────────────────────────────────────

async function generateRecapScript(data) {
  const { spy, qqq, iwm, vix, tny, dxy, oil, gold, btc, topSector, weakSector, date } = data;

  const fmt = (n) => n > 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
  const fmtP = (p) => p >= 1000 ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${p.toFixed(2)}`;

  const marketContext = `
Market Data at 3:45 PM ET — ${date}:
- SPY: ${fmtP(spy.price)} (${fmt(spy.chg)})
- QQQ: ${fmtP(qqq.price)} (${fmt(qqq.chg)})
- IWM: ${fmtP(iwm.price)} (${fmt(iwm.chg)})
- VIX: ${vix.price.toFixed(1)} — ${vix.price > 25 ? "elevated fear" : vix.price > 18 ? "cautious" : "calm"}
- 10Y Yield: ${tny.price.toFixed(2)}%
- DXY (Dollar): ${dxy.price.toFixed(2)} (${fmt(dxy.chg)})
- Oil (WTI): ${fmtP(oil.price)} (${fmt(oil.chg)})
- Gold: ${fmtP(gold.price)} (${fmt(gold.chg)})
- BTC: ${fmtP(btc.price)} (${fmt(btc.chg)})
- Strongest sector: ${topSector.name} (${fmt(topSector.chg)})
- Weakest sector: ${weakSector.name} (${fmt(weakSector.chg)})
`;

  const prompt = `You are a professional Bloomberg-style market narrator. Create a 75-second YouTube market recap voiceover script for 3:45 PM ET.

${marketContext}

RULES:
- Calm, professional tone — no hype
- Factual only — use the exact numbers provided
- No financial advice
- 6 scenes, each 2-3 sentences
- End EXACTLY with: "Do not chase. Wait for confirmation. Manage risk."
- Total word count: 140-170 words

FORMAT your response exactly like this:
SCENE 1 [OPEN]: [text]
SCENE 2 [INDEXES]: [text]
SCENE 3 [MACRO]: [text]
SCENE 4 [SECTORS]: [text]
SCENE 5 [SETUPS]: [text]
SCENE 6 [CLOSE]: [text]

TITLE: [YouTube title]
DESCRIPTION: [2-3 sentence YouTube description]`;

  try {
    if (!ANTHROPIC_API_KEY) {
      // Fallback: template-based script without AI
      return buildTemplateScript(data);
    }
    const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 600 });
    return text;
  } catch {
    return buildTemplateScript(data);
  }
}

function buildTemplateScript(data) {
  const { spy, qqq, iwm, vix, tny, oil, gold, btc, topSector, weakSector, date } = data;
  const dir = (chg) => chg >= 0 ? "up" : "down";
  const abs = (chg) => Math.abs(chg).toFixed(2);

  return `SCENE 1 [OPEN]: It's 3:45 PM Eastern. Fifteen minutes to the close. Here's what matters right now.

SCENE 2 [INDEXES]: The S&P 500 is at $${spy.price}, ${dir(spy.chg)} ${abs(spy.chg)} percent. The Nasdaq is ${dir(qqq.chg)} ${abs(qqq.chg)}, trading at ${qqq.price}. Small caps are ${dir(iwm.chg)}, IWM at ${iwm.price}.

SCENE 3 [MACRO]: The VIX is at ${vix.price.toFixed(1)} — ${vix.price > 25 ? "fear is elevated" : vix.price > 18 ? "caution in the air" : "relatively calm"}. The 10-year yield holds at ${tny.price.toFixed(2)} percent. Oil is ${dir(oil.chg)} ${abs(oil.chg)}, gold at ${gold.price.toFixed(0)}.

SCENE 4 [SECTORS]: ${topSector.name} is today's leader, ${dir(topSector.chg > 0 ? 1 : -1)} ${Math.abs(topSector.chg).toFixed(2)} percent. ${weakSector.name} is the weakest sector today. Rotation is ${spy.chg > 0 ? "risk-on" : "defensive"}.

SCENE 5 [SETUPS]: Review your watchlist for confirmed setups only. Avoid chasing extended names. Volume and structure must confirm before entry.

SCENE 6 [CLOSE]: Power hour is here. Expect volatility. Institutions are positioning for tomorrow. Do not chase. Wait for confirmation. Manage risk.

TITLE: 3:45 PM Market Recap — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} | SPY ${spy.chg >= 0 ? "+" : ""}${spy.chg.toFixed(2)}%
DESCRIPTION: Daily 3:45 PM market recap. SPY ${spy.price}, QQQ ${qqq.price}, VIX ${vix.price.toFixed(1)}. Sector rotation, key levels, and watchlist notes heading into the close. Not financial advice.`;
}

// ── Format and send to Telegram ───────────────────────────────────────────────

function formatTelegramMessage(script, data) {
  const { spy, qqq, iwm, vix, topSector, weakSector, date } = data;
  const arrow = (chg) => chg >= 0 ? "▲" : "▼";
  const fmt = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const lines = [
    `🎬 MARKET RECAP — 3:45 PM ET`,
    `📅 ${date}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📊 SNAPSHOT`,
    `SPY ${spy.price} ${arrow(spy.chg)} ${fmt(spy.chg)}`,
    `QQQ ${qqq.price} ${arrow(qqq.chg)} ${fmt(qqq.chg)}`,
    `IWM ${iwm.price} ${arrow(iwm.chg)} ${fmt(iwm.chg)}`,
    `VIX ${vix.price.toFixed(1)} ${vix.price > 25 ? "⚠️ FEAR" : vix.price > 18 ? "🟡 CAUTION" : "🟢 CALM"}`,
    ``,
    `🔄 ROTATION`,
    `✅ Leading: ${topSector.name} ${fmt(topSector.chg)}`,
    `❌ Lagging: ${weakSector.name} ${fmt(weakSector.chg)}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📝 SCRIPT PREVIEW`,
    ``,
    script.split("\n").slice(0, 12).join("\n"),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ Do not chase. Wait for confirmation. Manage risk.`,
    `📱 Full video script generated — ready for production`,
  ];

  return lines.join("\n");
}

// ── Main function — called at 3:45 PM ET ─────────────────────────────────────

async function runMarketRecap() {
  if (!isConfigured()) {
    console.log("[Recap] Telegram not configured — skipping");
    return;
  }

  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) { console.log("[Recap] Weekend — skipping"); return; }

  console.log("[Recap] 3:45 PM — fetching market data…");
  try {
    const data   = await fetchMarketData();
    const script = await generateRecapScript(data);
    const msg    = formatTelegramMessage(script, data);
    await sendTelegramMessage(msg);
    console.log("[Recap] Sent to Telegram ✓");

    // Also save script to file for video production tools
    const fs   = require("fs");
    const path = require("path");
    const dir  = path.join(__dirname, "../data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "latest-recap.json"), JSON.stringify({ script, data, generatedAt: new Date().toISOString() }, null, 2));
    console.log("[Recap] Script saved to data/latest-recap.json");
  } catch (e) {
    console.error("[Recap] Error:", e.message);
  }
}

// ── API endpoint — get latest recap ──────────────────────────────────────────

async function handleRecapApi(req, res, requestUrl) {
  const { writeJson } = require("./utils");

  if (requestUrl.pathname === "/api/recap/latest") {
    try {
      const fs   = require("fs");
      const path = require("path");
      const file = path.join(__dirname, "../data/latest-recap.json");
      if (!fs.existsSync(file)) return writeJson(res, 200, { ok: false, error: "No recap yet" });
      return writeJson(res, 200, { ok: true, ...JSON.parse(fs.readFileSync(file, "utf8")) });
    } catch (e) { return writeJson(res, 500, { ok: false, error: e.message }); }
  }

  if (requestUrl.pathname === "/api/recap/generate" && req.method === "POST") {
    runMarketRecap().catch(() => {});
    return writeJson(res, 200, { ok: true, message: "Recap generation started" });
  }

  return null;
}

module.exports = { runMarketRecap, handleRecapApi };
