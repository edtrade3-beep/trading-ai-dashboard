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

  // GET /api/scanner/gap-scan — real pre-market / intraday gap data via Yahoo
  if (pathname === "/api/scanner/gap-scan" && req.method === "GET") {
    const { fetchYahooQuoteBatch } = require("../providers/yahoo");
    const { round2 } = require("../utils");

    // ~80 liquid, high-volume symbols likely to gap
    const GAP_UNIVERSE = [
      "NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT","AMD","NFLX","COIN",
      "SMCI","ARM","PLTR","RIVN","LCID","SOFI","MARA","RIOT","HOOD","RBLX",
      "UPST","AFRM","DKNG","SNOW","PATH","AI","CRWD","ZS","PANW","NET",
      "BBAI","SERV","SMR","LUNR","ASTS","RKLB","SOUN","RGTI","IONQ","ACHR",
      "MSTR","IBIT","GBTC","FBTC","CLSK","IREN","HUT","BITF",
      "SYM","OKLO","NNE","RDW","APLD","CORZ","VST","CEG","GEV","CCJ",
      "SPY","QQQ","IWM","UVXY","TQQQ","SQQQ",
      "GLD","SLV","USO","UNG",
      "BABA","JD","PDD","NIO","XPEV","LI","GRAB","SE",
      "HIMS","RXRX","BEAM","CRSP","MRNA","BNTX","NVAX",
      "UBER","LYFT","SNAP","PINS","RDDT","ABNB","DASH",
    ];

    const SECTORS = {
      NVDA:"AI/Chips",TSLA:"EV/Auto",AAPL:"Tech",META:"Social",AMZN:"E-Comm",GOOGL:"Tech",MSFT:"Tech",
      AMD:"Chips",NFLX:"Streaming",COIN:"Crypto",SMCI:"Servers",ARM:"Chips",PLTR:"Defense AI",
      RIVN:"EV",LCID:"EV",SOFI:"FinTech",MARA:"Crypto Mining",RIOT:"Crypto Mining",HOOD:"FinTech",
      RBLX:"Gaming",UPST:"FinTech",AFRM:"FinTech",DKNG:"Gambling",SNOW:"Cloud",PATH:"AI",
      AI:"AI",CRWD:"Cybersec",ZS:"Cybersec",PANW:"Cybersec",NET:"Cybersec",
      BBAI:"Defense AI",SERV:"Robotics",SMR:"Nuclear",LUNR:"Space",ASTS:"Satellite",RKLB:"Space",
      SOUN:"AI Voice",RGTI:"Quantum",IONQ:"Quantum",ACHR:"Air Mobility",
      MSTR:"Crypto",IBIT:"Crypto ETF",GBTC:"Crypto ETF",FBTC:"Crypto ETF",
      CLSK:"Crypto Mining",IREN:"Crypto Mining",HUT:"Crypto Mining",BITF:"Crypto Mining",
      SYM:"Robotics",OKLO:"Nuclear",NNE:"Nuclear",APLD:"AI Infrastructure",
      CORZ:"Crypto Mining",VST:"Energy",CEG:"Nuclear",GEV:"Energy",CCJ:"Nuclear",
      SPY:"ETF",QQQ:"ETF",IWM:"ETF",UVXY:"Volatility",TQQQ:"ETF",SQQQ:"ETF",
      GLD:"Commodities",SLV:"Commodities",USO:"Commodities",UNG:"Commodities",
      BABA:"China Tech",JD:"China Tech",PDD:"China Tech",NIO:"China EV",XPEV:"China EV",
      LI:"China EV",GRAB:"SE Asia Tech",SE:"SE Asia Tech",
      HIMS:"Biotech",RXRX:"Biotech",BEAM:"Biotech",CRSP:"Biotech",MRNA:"Biotech",BNTX:"Biotech",NVAX:"Biotech",
      UBER:"Rideshare",LYFT:"Rideshare",SNAP:"Social",PINS:"Social",RDDT:"Social",ABNB:"Travel",DASH:"Delivery",
    };

    try {
      // Yahoo v7 batch works best with ≤20 symbols — split and fetch in parallel
      const CHUNK = 20;
      const chunks = [];
      for (let i = 0; i < GAP_UNIVERSE.length; i += CHUNK)
        chunks.push(GAP_UNIVERSE.slice(i, i + CHUNK));
      const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatch(c)));
      const raw = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

      const results = raw
        .filter(q => q && (q.regularMarketPrice || q.regularMarketOpen))
        .map(q => {
          const sym       = String(q.symbol || "").toUpperCase();
          const price     = round2(Number(q.regularMarketPrice || q.regularMarketOpen || 0));
          const prevClose = round2(Number(q.regularMarketPreviousClose || 0));
          const openPrice = round2(Number(q.regularMarketOpen || price));

          // Pre-market gap if available, otherwise use open vs prev close
          const prePrice  = round2(Number(q.preMarketPrice || 0));
          const hasPreMkt = prePrice > 0 && prevClose > 0;

          const gapPrice  = hasPreMkt ? prePrice : openPrice;
          // Fall back to Yahoo's own changePercent if we can't compute from prices
          const gapPct    = prevClose > 0
            ? round2((gapPrice - prevClose) / prevClose * 100)
            : round2(Number(q.regularMarketChangePercent || q.preMarketChangePercent || 0));

          const vol     = Number(q.regularMarketVolume || 0);
          const avgVol  = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 1);
          const rvol    = avgVol > 0 ? round2(vol / avgVol) : 0;
          const floatSh = Number(q.floatShares || q.sharesOutstanding || 0);
          const floatM  = floatSh > 0 ? round2(floatSh / 1e6) : null;
          const mktCap  = round2((Number(q.marketCap) || 0) / 1e9);

          // Setup classification
          let setupType;
          if (gapPct >= 3 && rvol >= 1.5)        setupType = "Gap & Go";
          else if (gapPct >= 1.5)                 setupType = "Gap Fill Risk";
          else if (gapPct <= -3 && rvol >= 1.5)   setupType = "Gap Fill";
          else if (floatM && floatM < 50 && gapPct > 0) setupType = "Short Squeeze";
          else if (gapPct < -1.5)                 setupType = "Gap Fill";
          else                                     setupType = gapPct >= 0 ? "Gap Fill Risk" : "Gap Fill";

          return {
            ticker:     sym,
            name:       q.longName || q.shortName || sym,
            price,
            prevClose,
            openPrice,
            preMarketPrice: prePrice || null,
            gapPct,
            vol,
            avgVol,
            rvol,
            floatM,
            mktCapB: mktCap,
            sector:   SECTORS[sym] || "Other",
            catalyst: "—",
            setupType,
            hasPreMkt,
          };
        })
        .filter(s => Math.abs(s.gapPct) >= 0.5) // only meaningful gaps
        .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
        .slice(0, 30);

      return writeJson(res, 200, { ok: true, results, scannedAt: new Date().toISOString() });
    } catch (e) {
      return writeJson(res, 502, { ok: false, error: e.message });
    }
  }

  return writeJson(res, 404, { error: "Unknown scanner endpoint" });
}

module.exports = handleScanner;
