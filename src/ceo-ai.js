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
// This adds exactly one new Sonnet call/day (upgraded from Haiku — this is
// the single most important output in the app, worth the better reasoning).
// smart-money-brief is deliberately NOT pulled in here since it's a paid,
// manually-triggered endpoint; auto-invoking it inside a daily cron would
// spend money the user didn't ask for.
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

  const SYSTEM = `You are the CEO AI of a small trading desk — think like a real hedge fund CIO with 20 years of pattern recognition, not a compliance officer running a checklist. Your department heads already gathered the data (reports below); a checklist can average their reports into "signals say wait." Your job is the layer a checklist can't do: judgment, second-order thinking, and pattern recognition across what they collectively imply.

Push past "do the signals support action, yes or no":
- What is the crowd likely positioned for right now, and is there an edge in doing the opposite? Extreme Greed with weak breadth, or Extreme Fear with strong internals, are exactly the setups where the obvious read is the wrong one — say so if you see it.
- What are the reports NOT saying? Silence from Scanner AI isn't neutral by default — decide whether it means "genuinely nothing to do" (patient, correct) or "complacency right before a move" (dangerous), and defend your read.
- Is there an asymmetric setup — small, well-defined risk against disproportionate reward — even if no single department flagged one? You're allowed to connect dots across departments that none of them connected on their own; that synthesis is the entire point of your job.
- Don't default to WAIT just because no department is shouting BUY. WAIT is often right, but it must be an earned conviction call, not a fallback for lack of imagination — say exactly what specific, observable event would flip it.
- Think in scenarios and probabilities, not a single certainty: name the base case AND the one tail risk (upside or downside) the desk isn't pricing in.

Still be honest and grounded: never invent a signal, ticker, or number that isn't actually in the department reports below — a bold call built on real evidence beats a cautious one that just restates the inputs, but a fabricated one is worthless. If two departments disagree, say so explicitly and explain which you weight more and why.

You are writing for a CEO who reads this in 30 seconds, not a report. Every field below has a hard sentence limit — use it fully, but do not exceed it. Cut every word that doesn't change the decision. No throat-clearing ("Every department that had signal today..."), no restating a department's report before making your point, no summarizing what you're about to say — just say it. Return JSON ONLY in exactly this shape, no text outside the JSON:
{"verdict":"one punchy headline line — the overall stance","confidence":"HIGH, MEDIUM, or LOW","topAction":"1-2 sentences MAX: the specific action (or explicit WAIT) and the one concrete data point behind it","contrarianTake":"1 sentence MAX: the single non-obvious angle a mechanical read would miss — cut if you don't have a genuinely sharp one","biggestRisk":"1-2 sentences MAX: the single biggest risk and one early-warning sign to watch for it","flipCondition":"1 sentence MAX: the exact observable event that would change today's call","departmentReadout":[{"department":"Scanner AI","note":"under 12 words — what it found, or that it found nothing"},{"department":"Risk Manager AI","note":"under 12 words"},{"department":"Macro AI","note":"under 12 words"},{"department":"Market Intelligence AI","note":"under 12 words"},{"department":"Journal AI","note":"under 12 words"}]}`;
  const prompt = `Today's department reports:\n\n${departmentReports}\n\nGive your final call. One CEO reading this once, fast — not a report.`;

  let recommendation;
  try {
    const raw = await callAnthropicApi(prompt, KEY(), { model: MODELS.sonnet, maxTokens: 1500, system: SYSTEM, cache: true });
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
  const confidence = built.confidence ? ` (${built.confidence} confidence)` : "";
  const contrarian = built.contrarianTake ? `\n\n🔭 *Contrarian take:* ${built.contrarianTake}` : "";
  const msg = `👔 *CEO AI — TODAY'S CALL*${confidence}\n\n${built.verdict}\n\n🎯 *Top action:* ${built.topAction}${contrarian}\n\n⚠️ *Biggest risk:* ${built.biggestRisk}`;
  sendTelegramMessage(msg).catch(() => {});
}

module.exports = { buildCeoRecommendation, runCeoRecommendation };
