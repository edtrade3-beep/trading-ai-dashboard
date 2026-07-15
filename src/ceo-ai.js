// CEO AI — the actual orchestration layer the "AI departments" were missing.
// Every other AI surface in this app (Scanner AI, Portfolio Risk, Market
// Intelligence, Journal Patterns, the Morning Brief, Coach's Notes) already
// exists and is already real. This is the one piece that was genuinely
// missing: something that gathers what each of those already reported and
// makes ONE final synthesized call — not another endpoint re-deriving
// everything from raw market data (that's what the Morning Brief already
// does), but a synthesis OF the other departments' own outputs.
//
// Cost discipline: every input below is either free (real data, no AI call)
// or already-persisted AI output (generated once, reused here for free).
// This adds exactly one new Haiku call/day — smart-money-brief is
// deliberately NOT pulled in here since it's a paid, manually-triggered
// endpoint; auto-invoking it inside a daily cron would spend money the user
// didn't ask for.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

function summarizeScanner(status) {
  const hits = (status && status.lastHits) || [];
  if (!hits.length) return "No active signals — nothing has crossed a scan threshold recently.";
  return hits.slice(0, 8)
    .map(h => `${h.symbol} ${h.signal} (score ${Math.round(h.composite || 0)}, RVOL ${(h.rvol || 0).toFixed(1)}x)`)
    .join("; ");
}
function summarizeRisk(snap) {
  if (!snap || !snap.ok) return "No live broker account connected — risk data unavailable.";
  return `Open risk ${snap.openRiskPct}% (cap 6%), daily-loss breaker ${snap.dailyBreakerTripped ? "TRIPPED" : "clear"}, ` +
    `account health ${snap.accountHealth?.ok ? "OK" : `BLOCKED (${snap.accountHealth?.reason})`}, ${snap.positionCount} open positions.`;
}
function summarizeFed(fed) {
  if (!fed || !fed.ok) return "No recent Fed statement available.";
  return `${fed.label}${fed.stale ? " (from the last meeting, not current)" : ""} — ${fed.read || ""}`;
}
function summarizeJournal(jp) {
  if (!jp || !jp.ok || !jp.tradeCount) return "Not enough closed-trade history yet for real patterns.";
  const bestDay = Object.entries(jp.byDayOfWeek || {}).filter(([, v]) => v).sort((a, b) => b[1].winRate - a[1].winRate)[0];
  return bestDay ? `${jp.tradeCount} closed trades. Best day: ${bestDay[0]} (${bestDay[1].winRate}% win).` : `${jp.tradeCount} closed trades, no single-bucket pattern has enough samples yet.`;
}

async function buildCeoRecommendation() {
  if (!KEY()) return null;

  const [scanner, risk, fed, journal, coachLog] = await Promise.all([
    getJson("/api/scanner/status"),
    getJson("/api/ai-hub/risk-snapshot"),
    getJson("/api/market/fed-interpret"),
    getJson("/api/ai-hub/journal-patterns"),
    Promise.resolve(loadCoachLog()),
  ]);

  const morningBrief = coachLog?.apex?.report || null;
  const gamePlan = coachLog?.gameplan?.text || null;

  const departmentReports = [
    `SCANNER AI: ${summarizeScanner(scanner)}`,
    `RISK MANAGER AI: ${summarizeRisk(risk)}`,
    `MACRO AI (Fed): ${summarizeFed(fed)}`,
    `JOURNAL AI: ${summarizeJournal(journal)}`,
    morningBrief ? `MARKET INTELLIGENCE AI (this morning's briefing, excerpt): ${morningBrief.slice(0, 900)}` : "MARKET INTELLIGENCE AI: no briefing generated yet today.",
    gamePlan ? `TODAY'S GAME PLAN: ${gamePlan}` : null,
  ].filter(Boolean).join("\n\n");

  const SYSTEM = `You are the CEO AI of a small trading desk. You don't analyze raw market data yourself — that's your department heads' job, and their reports are below. Your only job is to synthesize THEIR findings into one final executive call. If two departments disagree, say so and explain which one you're weighting more and why. If the departments collectively don't support a clear action, say WAIT — do not manufacture a false sense of certainty. Return JSON ONLY in exactly this shape, no text outside the JSON:
{"verdict":"one line, the overall stance","topAction":"the single highest-conviction action right now, with reasoning, or a clear WAIT with why","biggestRisk":"the one thing most likely to hurt you today, one sentence","reasoning":"2-3 sentences tying the department reports together into why you reached this call"}`;
  const prompt = `Today's department reports:\n\n${departmentReports}\n\nGive your final call.`;

  let recommendation;
  try {
    const raw = await callAnthropicApi(prompt, KEY(), { model: MODELS.haiku, maxTokens: 500, system: SYSTEM, cache: true });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    recommendation = JSON.parse(m ? m[0] : raw);
  } catch {
    return null;
  }
  if (!recommendation || !recommendation.verdict) return null;

  const built = { ...recommendation, generatedAt: Date.now() };
  saveCoachOutput("ceo", built);
  return built;
}

async function runCeoRecommendation() {
  const built = await buildCeoRecommendation();
  if (!built) return;
  if (!telegramConfigured() || !shouldSendAlert({ category: "ai-coach" })) return;
  const msg = `👔 *CEO AI — TODAY'S CALL*\n\n${built.verdict}\n\n🎯 *Top action:* ${built.topAction}\n⚠️ *Watch:* ${built.biggestRisk}`;
  sendTelegramMessage(msg).catch(() => {});
}

module.exports = { buildCeoRecommendation, runCeoRecommendation };
