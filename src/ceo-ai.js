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

Still be honest and grounded: never invent a signal, ticker, or number that isn't actually in the department reports below — a bold call built on real evidence beats a cautious one that just restates the inputs, but a fabricated one is worthless. If two departments disagree, say so explicitly and explain which you weight more and why. Return JSON ONLY in exactly this shape, no text outside the JSON:
{"verdict":"one punchy headline line — the overall stance","confidence":"HIGH, MEDIUM, or LOW","topAction":"3-5 sentences: the specific action (or explicit WAIT), concrete reasoning referencing real data from the reports, and what specific observable change would alter this call","contrarianTake":"1-3 sentences: the non-obvious angle a mechanical read of these reports would miss entirely — what an experienced CIO sees between the lines that no single department report says outright. Be genuinely willing to disagree with the surface-level consensus of the reports if the evidence supports it.","biggestRisk":"2-4 sentences: the single biggest risk, how it could realistically play out today, and one early-warning sign worth watching for it","departmentReadout":[{"department":"Scanner AI","note":"one sentence on what it found and whether it matters right now"},{"department":"Risk Manager AI","note":"one sentence"},{"department":"Macro AI","note":"one sentence"},{"department":"Market Intelligence AI","note":"one sentence"},{"department":"Journal AI","note":"one sentence"}],"reasoning":"4-6 sentences tying every department together into the final call — explicitly name any disagreement between departments and how you resolved it, and be honest about which departments had nothing useful to say today"}`;
  const prompt = `Today's department reports:\n\n${departmentReports}\n\nGive your detailed final call. Think like a CIO, not a checklist.`;

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
