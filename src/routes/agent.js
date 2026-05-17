const { writeJson, readRequestBody } = require("../utils");
const { ANTHROPIC_API_KEY } = require("../config");
const { callAnthropicApi } = require("../anthropic");

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

  return writeJson(res, 404, { error: "Unknown agent endpoint." });
}

module.exports = handleAgent;
