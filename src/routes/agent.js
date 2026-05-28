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

  return writeJson(res, 404, { error: "Unknown agent endpoint." });
}

module.exports = handleAgent;
