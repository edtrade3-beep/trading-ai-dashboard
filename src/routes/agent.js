const { writeJson, readRequestBody } = require("../utils");
const { ANTHROPIC_API_KEY } = require("../config");
const { callAnthropicApi } = require("../anthropic");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("../telegram");

function buildMarketPrompt(ctx) {
  const indexLine = (ctx.indexRows || [])
    .map((r) => `${r.label} ${r.value >= 0 ? "+" : ""}${Number(r.value || 0).toFixed(2)}%`)
    .join(", ");

  const topLongs = (ctx.topLongs || [])
    .slice(0, 5)
    .map((q) => `${q.symbol} (RS ${Number(q.relVsSpy || 0) >= 0 ? "+" : ""}${Number(q.relVsSpy || 0).toFixed(2)}%, RVOL ${Number(q.rvol || 0).toFixed(2)}x, Score ${Math.round(Number(q.composite || 0))})`)
    .join("; ");

  const topRisks = (ctx.topRisks || [])
    .slice(0, 3)
    .map((q) => `${q.symbol} (RS ${Number(q.relVsSpy || 0).toFixed(2)}%)`)
    .join("; ");

  const alerts = (ctx.alerts || [])
    .slice(0, 4)
    .map((a) => `${a.symbol} [${String(a.type || "").toUpperCase()}] ${a.text}`)
    .join("; ");

  const focusBlock = ctx.focus
    ? `\nFocus symbol: ${ctx.focus.symbol} @ $${ctx.focus.price} (${Number(ctx.focus.changesPercentage || 0) >= 0 ? "+" : ""}${Number(ctx.focus.changesPercentage || 0).toFixed(2)}%), trend ${ctx.focus.trend}, composite score ${ctx.focus.score}`
    : "";

  return `You are an institutional equities analyst. Analyze the following live market data and provide a concise, actionable institutional summary.

MARKET CONTEXT:
- Regime: ${ctx.regime || "Unknown"} | Macro tone: ${ctx.macroTone || "Unknown"} | Session: ${ctx.session || "Unknown"}
- Index moves: ${indexLine || "N/A"}
- Flow bias: ${ctx.flowBias || "N/A"} (Calls $${(Number(ctx.flowCallNotional || 0) / 1e6).toFixed(1)}M vs Puts $${(Number(ctx.flowPutNotional || 0) / 1e6).toFixed(1)}M)
- Top long candidates: ${topLongs || "None identified"}
- Risk names / hedges: ${topRisks || "None identified"}
- Priority alerts: ${alerts || "None"}${focusBlock}

USER QUESTION / FOCUS: ${ctx.prompt || "General market check"}

Respond with a structured institutional-grade summary covering:
1. Market verdict (regime, risk/reward, key macro reads)
2. Best trade setups (specific tickers with entry thesis)
3. Risk factors to watch
4. One clear action decision for today

Keep it under 400 words. Use plain text, no markdown. Be direct and specific — this is decision support, not a report.`;
}

async function handleAgent(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/agent" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) {
      return writeJson(res, 503, { error: "ANTHROPIC_API_KEY is not configured. Add it to your .env to enable AI analysis." });
    }

    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const prompt = buildMarketPrompt(body);
    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY);

      if (telegramConfigured()) {
        const focusSym = body?.focus?.symbol ? ` — ${body.focus.symbol}` : "";
        const preview = text.length > 1400 ? text.slice(0, 1400) + "…" : text;
        sendTelegramMessage(`🤖 *AI Market Analysis${focusSym}*\n\n${preview}`).catch(() => {});
      }

      return writeJson(res, 200, {
        output: text,
        generatedAt: new Date().toISOString(),
        model: "claude-sonnet-4-6",
      });
    } catch (err) {
      return writeJson(res, 422, {
        error: err instanceof Error ? err.message : "AI analysis failed",
      });
    }
  }

  // POST /api/agent/trade-setup — AI-generated full trade plan for one ticker
  if (pathname === "/api/agent/trade-setup" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) {
      return writeJson(res, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    }
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { ticker, score, signal, signals = [], rsiVal, macdBull, ema9v, ema21v,
            livePrice, liveChg, ref, fundamentals, news = [] } = body;

    const techLines = [
      `Current Price: $${Number(livePrice || 0).toFixed(2)} (${Number(liveChg || 0) >= 0 ? "+" : ""}${Number(liveChg || 0).toFixed(2)}% today)`,
      `AI Score: ${score}/100 → ${signal}`,
      rsiVal != null ? `RSI: ${Number(rsiVal).toFixed(1)}${rsiVal < 30 ? " (OVERSOLD)" : rsiVal > 70 ? " (OVERBOUGHT)" : ""}` : null,
      `MACD: ${macdBull ? "BULLISH crossover" : "BEARISH"}`,
      ema9v  ? `EMA9: $${Number(ema9v).toFixed(2)}  (price ${Number(livePrice) > ema9v ? "ABOVE" : "BELOW"})` : null,
      ema21v ? `EMA21: $${Number(ema21v).toFixed(2)} (price ${Number(livePrice) > ema21v ? "ABOVE" : "BELOW"})` : null,
      signals.length ? `Active signals: ${signals.map(s => (s.bull ? "▲" : "▼") + " " + s.txt).join(" | ")}` : null,
    ].filter(Boolean).join("\n");

    const zoneLines = ref ? [
      `Starter entry: $${ref.e1}  Better entry: $${ref.e2}  Deep value: $${ref.e3}`,
      `Breakout trigger: $${ref.trigger}  Hard stop: $${ref.stop}`,
      `Target upside: ${ref.upside}  Risk rating: ${ref.risk}`,
      `Thesis: ${ref.thesis}`,
    ].join("\n") : "No predefined entry zones available.";

    const fundLines = fundamentals ? [
      fundamentals.marketCap ? `Market cap: $${(fundamentals.marketCap / 1e9).toFixed(2)}B` : null,
      fundamentals.revenue    ? `Revenue TTM: $${(fundamentals.revenue / 1e9).toFixed(2)}B` : null,
      fundamentals.revenueGrowth ? `Revenue growth: ${(fundamentals.revenueGrowth * 100).toFixed(1)}%` : null,
      fundamentals.grossMargin   ? `Gross margin: ${(fundamentals.grossMargin * 100).toFixed(1)}%` : null,
      fundamentals.priceToSales  ? `P/S ratio: ${Number(fundamentals.priceToSales).toFixed(1)}x` : null,
      fundamentals.trailingPE    ? `P/E ratio: ${Number(fundamentals.trailingPE).toFixed(1)}x` : null,
      fundamentals.totalCash     ? `Cash on hand: $${(fundamentals.totalCash / 1e9).toFixed(2)}B` : null,
    ].filter(Boolean).join("  |  ") : "No fundamental data.";

    const newsLines = news.length
      ? news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title || n.headline || ""}${n.source ? " [" + n.source + "]" : ""}`).join("\n")
      : "No recent news.";

    const prompt = `You are a professional trader and market analyst generating a complete actionable trade setup.

TICKER: ${ticker}  |  COMPANY: ${ref?.company || ticker}  |  SECTOR: ${ref?.sector || "N/A"}

=== TECHNICALS ===
${techLines}

=== ENTRY ZONES (watchlist reference) ===
${zoneLines}

=== FUNDAMENTALS ===
${fundLines}

=== RECENT NEWS ===
${newsLines}

Generate a complete, specific trade setup. Structure your response exactly as follows (no markdown, plain text):

SETUP SUMMARY
[2-3 sentences describing the opportunity and why now]

ENTRY STRATEGY
[Whether to buy now or wait, exact price levels, limit vs market order]

STOP LOSS
[Exact price, % below entry, reasoning]

PRICE TARGETS
T1: [price] — [timeframe] — [reasoning]
T2: [price] — [timeframe] — [reasoning]
T3: [price] — [timeframe] — [reasoning]

RISK/REWARD
[Ratio at each target, expected value]

KEY CATALYSTS
[2-3 specific things that could drive the move]

RED FLAGS
[2-3 things that would invalidate this trade]

VERDICT
[One of: BUY NOW / WAIT FOR DIP / AVOID] — [One clear sentence reason]

Be specific with exact dollar prices. Under 450 words total.`;

    try {
      const plan = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 700 });
      if (telegramConfigured()) {
        sendTelegramMessage(`🤖 *AI Trade Setup: ${ticker}*\n\n${plan.slice(0, 1200)}${plan.length > 1200 ? "…" : ""}`).catch(() => {});
      }
      return writeJson(res, 200, { ok: true, ticker, plan, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "AI trade setup failed" });
    }
  }

  // POST /api/agent/premarket — AI pre-market morning briefing
  if (pathname === "/api/agent/premarket" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { regime, macroTone, session, indexMoves = [], topLongs = [], topRisks = [],
            alerts = [], flowBias, earningsToday = [], macroEvents = [] } = body;

    const indexLine   = indexMoves.map(r => `${r.label} ${r.value >= 0 ? "+" : ""}${Number(r.value || 0).toFixed(2)}%`).join(", ");
    const longsLine   = topLongs.slice(0, 5).map(q => `${q.symbol} (Score ${Math.round(q.composite || q.score || 0)}, RS ${Number(q.relVsSpy || 0).toFixed(1)}%)`).join("; ");
    const risksLine   = topRisks.slice(0, 3).map(q => q.symbol).join(", ");
    const alertsLine  = alerts.slice(0, 3).map(a => `${a.symbol} [${a.type}] ${a.text}`).join("; ");
    const earningsLine = earningsToday.slice(0, 6).map(e => `${e.symbol}${e.timing ? " (" + e.timing + ")" : ""}`).join(", ");
    const macroLine   = macroEvents.slice(0, 4).map(e => `${e.time || ""} ${e.event || ""} (${e.impact || ""})`).join("; ");

    const prompt = `You are a senior institutional trading desk strategist. Generate a concise pre-market briefing.

CURRENT DATA:
- Regime: ${regime || "Unknown"} | Macro: ${macroTone || "Unknown"} | Session: ${session || "Pre-Market"}
- Index futures: ${indexLine || "N/A"}
- Flow bias: ${flowBias || "N/A"}
- Top setups: ${longsLine || "None"}
- Risk names: ${risksLine || "None"}
- Alerts: ${alertsLine || "None"}
- Earnings today: ${earningsLine || "None"}
- Key macro events: ${macroLine || "None"}

Structure your briefing exactly as:

MORNING VERDICT
[Regime status, overall bias bull/bear/neutral, confidence level]

KEY THEMES TODAY
[2-3 specific narratives driving the tape today]

EARNINGS WATCH
[Any earnings worth trading, approach if any]

MACRO EVENTS
[Specific data releases to watch, expected market impact]

TOP 3 SETUPS
[Specific tickers, entry triggers, stops — be exact]

WHAT TO AVOID
[Sectors or names to stay away from today]

GAME PLAN
[One paragraph — exactly what the ideal trader does today from open to close]

Under 450 words. Plain text only. Be specific and actionable.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 700 });
      if (telegramConfigured()) {
        const preview = text.length > 1200 ? text.slice(0, 1200) + "…" : text;
        sendTelegramMessage(`🌅 *Pre-Market Briefing*\n\n${preview}`).catch(() => {});
      }
      return writeJson(res, 200, { ok: true, briefing: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Briefing generation failed" });
    }
  }

  // POST /api/agent/journal-review — AI analysis of trading journal
  if (pathname === "/api/agent/journal-review" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { entries = [] } = body;
    const closed = entries.filter(e => e.closedAt && e.pnl != null).slice(-50);
    if (closed.length < 3) return writeJson(res, 400, { error: "Need at least 3 closed trades to analyze." });

    const totalPnl = closed.reduce((s, e) => s + (Number(e.pnl) || 0), 0);
    const wins     = closed.filter(e => Number(e.pnl) > 0);
    const losses   = closed.filter(e => Number(e.pnl) <= 0);
    const winRate  = ((wins.length / closed.length) * 100).toFixed(0);
    const avgWin   = wins.length   ? (wins.reduce((s, e)   => s + Number(e.pnl), 0) / wins.length).toFixed(0)   : 0;
    const avgLoss  = losses.length ? (losses.reduce((s, e) => s + Number(e.pnl), 0) / losses.length).toFixed(0) : 0;
    const pf       = losses.length && Number(avgLoss) < 0 ? Math.abs(Number(avgWin) / Number(avgLoss)).toFixed(2) : "N/A";

    const tradeLines = closed.slice(-20).map(e =>
      `${e.symbol || "?"} ${e.side || "?"} ${e.setup || "?"} P&L:$${Number(e.pnl || 0).toFixed(0)}${e.notes ? ` "${String(e.notes).slice(0, 60)}"` : ""}`
    ).join("\n");

    const prompt = `You are an expert trading coach reviewing a trader's journal. Be direct, specific, and honest.

STATS (last ${closed.length} closed trades):
- Total P&L: $${totalPnl.toFixed(0)} | Win rate: ${winRate}% | Profit factor: ${pf}
- Avg win: $${avgWin} | Avg loss: $${avgLoss}

RECENT TRADES:
${tradeLines}

Provide structured coaching:

PERFORMANCE SUMMARY
[Key numbers, honest overall assessment]

STRENGTHS
[2-3 specific things they do well — cite actual trades]

WEAKNESSES
[2-3 patterns hurting P&L — be direct, cite examples]

PSYCHOLOGY PATTERNS
[Any emotional patterns: overtrading, revenge trading, cutting winners early, letting losers run]

TOP 3 IMPROVEMENTS
[Ranked by expected P&L impact, make each one actionable]

HOMEWORK
[2-3 concrete actions before next trading session]

Under 400 words. Plain text. Be a coach, not a cheerleader.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 700 });
      return writeJson(res, 200, { ok: true, review: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Journal review failed" });
    }
  }

  // POST /api/agent/sentiment — batch sentiment scoring for news headlines
  if (pathname === "/api/agent/sentiment" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { headlines = [] } = body;
    const batch = headlines.slice(0, 25).map(h => String(h || "").slice(0, 120));
    if (!batch.length) return writeJson(res, 400, { error: "No headlines provided" });

    const numbered = batch.map((h, i) => `${i + 1}. ${h}`).join("\n");
    const prompt = `Rate each headline's market sentiment. Respond ONLY with a valid JSON array — no other text, no markdown.

Each item: {"i": 1, "s": "bull"|"bear"|"neutral", "score": -100 to 100}

Headlines:
${numbered}`;

    try {
      const raw = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 500 });
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Could not parse sentiment response");
      const results = JSON.parse(match[0]);
      return writeJson(res, 200, { ok: true, results });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Sentiment analysis failed" });
    }
  }

  // POST /api/agent/halal — Islamic finance halal compliance check
  if (pathname === "/api/agent/halal" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { ticker, company, sector, description, debtRatio, interestRatio, cashRatio } = body;

    const prompt = `You are an Islamic finance scholar specializing in equity stock screening per AAOIFI and MSCI Islamic screening standards.

STOCK: ${ticker} — ${company || ticker}
SECTOR: ${sector || "Unknown"}
BUSINESS: ${description ? String(description).slice(0, 350) : "No description available"}
FINANCIALS:
- Total debt / total assets: ${debtRatio != null ? (Number(debtRatio) * 100).toFixed(1) + "%" : "N/A"} (threshold: <33%)
- Interest income / revenue: ${interestRatio != null ? (Number(interestRatio) * 100).toFixed(1) + "%" : "N/A"} (threshold: <5%)
- Cash + securities / assets: ${cashRatio != null ? (Number(cashRatio) * 100).toFixed(1) + "%" : "N/A"}

Evaluate and respond in this exact structure (plain text, no markdown):

VERDICT: [HALAL / DOUBTFUL / HARAM]

COMPLIANCE SCORE: [0-100]

BUSINESS SCREENING
[Is the primary business permissible? Any haram revenue streams (alcohol, gambling, weapons, pork, conventional banking/insurance, adult content)? Estimate % haram revenue if applicable]

FINANCIAL RATIOS
[Check each ratio against AAOIFI thresholds. Pass or fail each one]

CONCERNS
[Specific issues that could make this non-compliant — be precise]

PURIFICATION
[If holding, what % of dividends should be donated as purification? Explain]

RECOMMENDATION
[SUITABLE FOR HALAL PORTFOLIO / AVOID / REQUIRES DEEPER RESEARCH]

Under 300 words. Be scholarly and clear.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 600 });
      return writeJson(res, 200, { ok: true, ticker, report: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Halal check failed" });
    }
  }

  // POST /api/agent/pattern — AI chart pattern recognition
  if (pathname === "/api/agent/pattern" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { ticker, bars = [], currentPrice, rsiVal, macdBull } = body;
    if (!bars.length) return writeJson(res, 400, { error: "No candle data provided" });

    const recent = bars.slice(-30);
    const ohlc = recent.map((b, i) => `${i + 1}: O${Number(b.open).toFixed(2)} H${Number(b.high).toFixed(2)} L${Number(b.low).toFixed(2)} C${Number(b.close).toFixed(2)} V${Math.round((b.volume || 0) / 1000)}K`).join("\n");
    const prompt = `You are a professional technical analyst. Analyze this OHLCV data and identify chart patterns.

TICKER: ${ticker}  |  Current Price: $${Number(currentPrice || 0).toFixed(2)}
RSI(14): ${rsiVal != null ? Number(rsiVal).toFixed(1) : "N/A"}  |  MACD: ${macdBull ? "BULLISH" : "BEARISH"}

LAST 30 DAILY BARS (index: O H L C Vol):
${ohlc}

Analyze and respond in this exact structure (plain text):

PATTERN IDENTIFIED
[Name the primary chart pattern you see — be specific]

PATTERN QUALITY
[Strong / Moderate / Weak — and why]

KEY LEVELS
[Support: $X | Resistance: $Y | Breakout trigger: $Z]

MEASURED MOVE TARGET
[$X — how you calculated it from the pattern]

INVALIDATION
[What price action would invalidate this setup]

VERDICT
[BULLISH SETUP / BEARISH SETUP / NO CLEAR PATTERN] — [One sentence action]

Under 200 words. Be precise with exact prices.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 400 });
      return writeJson(res, 200, { ok: true, ticker, analysis: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Pattern analysis failed" });
    }
  }

  // POST /api/agent/macro-scenario — Macro scenario impact analysis
  if (pathname === "/api/agent/macro-scenario" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { scenario, regime, holdings = [], watchlist = [] } = body;
    if (!scenario?.trim()) return writeJson(res, 400, { error: "scenario required" });

    const holdingsLine = holdings.slice(0, 8).map(h => `${h.symbol} (${h.shares} shares @ $${h.avgPrice})`).join(", ");
    const watchLine    = watchlist.slice(0, 10).join(", ");

    const prompt = `You are a macro strategist. Analyze the market impact of this scenario.

SCENARIO: "${scenario}"
CURRENT REGIME: ${regime || "Unknown"}
PORTFOLIO: ${holdingsLine || "No positions provided"}
WATCHLIST: ${watchLine || "No watchlist provided"}

Analyze and respond exactly as:

PROBABILITY
[Low / Medium / High — your assessment of this scenario occurring in next 90 days]

IMMEDIATE IMPACT (first 48 hours)
[Market reaction: indexes, VIX, bonds, dollar]

SECTOR WINNERS
[Top 3 sectors that benefit — specific ETFs]

SECTOR LOSERS
[Top 3 sectors that get hurt — specific ETFs]

PORTFOLIO IMPACT
[How each holding above is affected — specific and honest]

RECOMMENDED ACTIONS
[3 specific trades to position for this scenario]

HEDGE
[Best 1-2 hedges if scenario occurs unexpectedly]

Under 350 words. Plain text. Be a strategist not a journalist.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 600 });
      return writeJson(res, 200, { ok: true, scenario, analysis: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Scenario analysis failed" });
    }
  }

  // POST /api/agent/earnings-call — Earnings transcript summarizer
  if (pathname === "/api/agent/earnings-call" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { ticker, transcript } = body;
    if (!transcript?.trim() || transcript.trim().length < 100) return writeJson(res, 400, { error: "Transcript too short (min 100 chars)" });

    const trimmed = String(transcript).slice(0, 12000);
    const prompt = `You are an institutional sell-side analyst. Extract key information from this earnings call transcript.

COMPANY: ${ticker || "Unknown"}

TRANSCRIPT:
${trimmed}

Summarize exactly as (plain text):

HEADLINE
[One sentence: beat/miss, key guidance change, market reaction]

FINANCIAL RESULTS
[Revenue: actual vs estimate, EPS: actual vs estimate, key margins]

GUIDANCE
[Next quarter and full year guidance — numbers only, not fluff]

MANAGEMENT TONE
[Confident / Cautious / Mixed — with evidence from their language]

KEY GROWTH DRIVERS
[2-3 specific catalysts management highlighted]

RISKS ACKNOWLEDGED
[What risks did they mention or dodge]

ANALYST QUESTIONS THEMES
[What were analysts most concerned about]

TRADING IMPLICATION
[BUY INTO WEAKNESS / SELL THE POP / HOLD — with exact reasoning]

Under 400 words. Numbers only, no filler.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 700 });
      return writeJson(res, 200, { ok: true, ticker, summary: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Earnings analysis failed" });
    }
  }

  // POST /api/agent/session-recap — End-of-day trading session recap
  if (pathname === "/api/agent/session-recap" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 503, { error: "ANTHROPIC_API_KEY not configured." });
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const { indexMoves = [], topMovers = [], alertsTriggered = [], journalToday = [], regime, date } = body;
    const idxLine   = indexMoves.slice(0, 5).map(m => `${m.symbol} ${m.value >= 0 ? "+" : ""}${Number(m.value || 0).toFixed(2)}%`).join(", ");
    const movers    = topMovers.slice(0, 5).map(m => `${m.symbol} ${m.pct >= 0 ? "+" : ""}${m.pct.toFixed(1)}%`).join(", ");
    const alertLine = alertsTriggered.slice(0, 5).map(a => `${a.symbol} [${a.type}] ${a.text}`).join("; ");
    const tradesLine= journalToday.slice(0, 5).map(t => `${t.symbol} ${t.side} PnL:${t.pnl >= 0 ? "+" : ""}$${Number(t.pnl || 0).toFixed(0)}`).join("; ");

    const prompt = `Generate a concise end-of-session trading recap.

DATE: ${date || new Date().toDateString()}
REGIME: ${regime || "Unknown"}
INDEX MOVES: ${idxLine || "N/A"}
TOP MOVERS: ${movers || "N/A"}
ALERTS TRIGGERED: ${alertLine || "None"}
TRADES TODAY: ${tradesLine || "None"}

Write a brief session recap:

SESSION SUMMARY
[2-3 sentences: what happened in the market today, key theme]

NOTABLE MOVES
[What worked, what didn't, any surprise moves]

TODAY'S TRADES
[Review any trades above — what was good/bad]

TOMORROW SETUP
[2-3 specific tickers to watch tomorrow with levels]

LESSON
[One specific thing to remember from today's session]

Under 250 words. Plain text. Be direct.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 500 });
      if (telegramConfigured()) sendTelegramMessage(`📋 *Session Recap*\n\n${text.slice(0, 1200)}`).catch(() => {});
      return writeJson(res, 200, { ok: true, recap: text, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Session recap failed" });
    }
  }

  return writeJson(res, 404, { error: "Unknown agent endpoint." });
}

module.exports = handleAgent;
