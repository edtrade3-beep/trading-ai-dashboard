const { writeJson, readRequestBody } = require("../utils");
const { runScan, getScannerStatus, loadConfig, saveConfig, DEFAULT_SYMBOLS } = require("../market-scanner");

async function handleScanner(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/scanner/status
  if (pathname === "/api/scanner/status" && req.method === "GET") {
    return writeJson(res, 200, getScannerStatus());
  }

  // POST /api/scanner/run — manual trigger
  if (pathname === "/api/scanner/run" && req.method === "POST") {
    const result = await runScan();
    return writeJson(res, 200, result);
  }

  // GET /api/scanner/config
  if (pathname === "/api/scanner/config" && req.method === "GET") {
    return writeJson(res, 200, { config: loadConfig(), defaultSymbols: DEFAULT_SYMBOLS });
  }

  // POST /api/scanner/config — update config
  if (pathname === "/api/scanner/config" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const allowed = ["enabled","symbols","intervalMinutes","buyScoreMin","sellScoreMax","minRvol","cooldownHours","marketHoursOnly"];
    const updates = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Validate symbols array
    if ("symbols" in updates) {
      if (!Array.isArray(updates.symbols)) {
        return writeJson(res, 400, { error: "symbols must be an array of ticker strings" });
      }
      updates.symbols = updates.symbols
        .map(s => String(s || "").trim().toUpperCase())
        .filter(s => /^[A-Z0-9.\-^]{1,12}$/.test(s))
        .slice(0, 500);
    }

    // Validate numeric ranges
    if ("intervalMinutes" in updates) updates.intervalMinutes = Math.max(5, Math.min(1440, Number(updates.intervalMinutes) || 15));
    if ("buyScoreMin" in updates)     updates.buyScoreMin = Math.max(50, Math.min(99, Number(updates.buyScoreMin) || 72));
    if ("sellScoreMax" in updates)    updates.sellScoreMax = Math.max(1, Math.min(49, Number(updates.sellScoreMax) || 32));
    if ("minRvol" in updates)         updates.minRvol = Math.max(0.5, Math.min(5, Number(updates.minRvol) || 1.25));
    if ("cooldownHours" in updates)   updates.cooldownHours = Math.max(0.5, Math.min(48, Number(updates.cooldownHours) || 4));

    const saved = saveConfig(updates);
    return writeJson(res, 200, { ok: true, config: saved });
  }

  // GET /api/scanner/smart-scan?tickers=BBAI,SERV,...
  // Returns quotes + candle indicators for every ticker in one shot.
  // Client scores and renders; server just provides the raw data.
  if (pathname === "/api/scanner/smart-scan" && req.method === "GET") {
    const { fetchYahooQuotes, fetchYahooCandlesWithIndicators } = require("../providers/yahoo");
    const tickers = (requestUrl.searchParams.get("tickers") || "")
      .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
    if (!tickers.length) return writeJson(res, 400, { error: "tickers param required" });

    // Batch quotes — one Yahoo call
    const quotes = await fetchYahooQuotes(tickers).catch(() => []);
    const quoteMap = Object.fromEntries(quotes.map(q => [String(q.symbol || "").toUpperCase(), q]));

    // Parallel candles — 6-month daily so RSI/MACD have enough history
    const candleSettled = await Promise.allSettled(
      tickers.map(t =>
        fetchYahooCandlesWithIndicators(t, "1D")
          .then(d => ({ ticker: t, bars: d.bars.slice(-60), indicators: d.indicators }))
          .catch(() => ({ ticker: t, bars: [], indicators: {} }))
      )
    );
    const candleMap = {};
    candleSettled.forEach(r => {
      if (r.status === "fulfilled") candleMap[r.value.ticker] = r.value;
    });

    const results = tickers.map(t => ({
      ticker: t,
      quote:   quoteMap[t]   || null,
      candles: candleMap[t]  || null,
    }));

    return writeJson(res, 200, { ok: true, scannedAt: new Date().toISOString(), results });
  }

  return writeJson(res, 404, { error: "Unknown scanner endpoint" });
}

module.exports = handleScanner;
