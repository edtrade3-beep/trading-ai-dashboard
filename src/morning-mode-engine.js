"use strict";

// morning-mode-engine.js — Master Agent v1, Morning Mode (2026-09-11,
// explicit user request via a master platform-audit prompt: "Start my
// day"/"good morning" should answer market verdict / do-now / best trade
// / dealership / platform health in one report).
//
// Deliberately NOT a new decision engine and NOT a new AI call. Every
// number here is read from already-computed, already-real sources — the
// canonical opportunity/decision pipeline (src/canonical-decision-
// pipeline.js via /api/market/opportunities + /api/market/trend-screen),
// today's already-generated CEO AI judgment (src/ceo-ai.js, runs once/day
// at 8:10 ET, already paid for), the real dealership CRM/appointments
// stores (src/dealership/fb-hub.js), and /api/health. This file's only
// job is honest, deterministic assembly into the shape the platform's own
// north-star charter and the master prompt's Morning Mode both ask for —
// "AI role is bounded, never a second decision engine" applies here too:
// the BEST TRADE verdict/entry/stop/target below always comes from the
// real canonical AssetDecision, never from an LLM guess.
const { PORT } = require("./config");

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

const BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Real, disclosed scope limit: /api/market/econ-calendar's own FOMC/CPI/
// NFP/PCE dates are explicitly hardcoded placeholders per that route's own
// comment ("These are estimated — in production would fetch from an
// API") — this file does NOT surface them as confirmed events in a report
// the user acts on. Only its real, deterministically-computed OPEX/Quad
// Witching dates (real calendar math, not a guess) are used here.
async function getRealMarketEvents() {
  const cal = await getJson("/api/market/econ-calendar");
  const events = Array.isArray(cal?.events) ? cal.events : Array.isArray(cal) ? cal : [];
  return events.filter((e) => e && e.tag === "OPEX").slice(0, 2);
}

async function getBestTradeCandidates() {
  const opp = await getJson("/api/market/opportunities");
  if (!opp || !opp.ok) return { candidates: [], marketRegime: null, error: "Opportunity scan unavailable." };
  const pool = [...(opp.tiers?.actionable || []), ...(opp.tiers?.developing || [])]
    .filter((p) => p && p.symbol)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4);
  if (!pool.length) return { candidates: [], marketRegime: opp.marketRegime, error: null };

  const symbols = pool.map((p) => p.symbol).join(",");
  const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(symbols)}&withDecision=1`);
  const rows = Array.isArray(screen?.results) ? screen.results : [];
  const candidates = pool.map((p) => {
    const row = rows.find((r) => r.symbol === p.symbol);
    const ad = row?.assetDecision || null;
    return {
      symbol: p.symbol,
      opportunityTier: p.tier,
      opportunityScore: p.score,
      verdict: ad?.verdict || null,
      entry: ad?.entry ?? null,
      stop: ad?.stop ?? null,
      targets: Array.isArray(ad?.targets) ? ad.targets : [],
      riskReward: ad?.riskReward ?? null,
      confidence: ad?.confidence ?? null,
      reasons: Array.isArray(ad?.reasons) ? ad.reasons.slice(0, 2) : [],
    };
  });
  return { candidates, marketRegime: opp.marketRegime, error: null };
}

function summarizeDealership(leadsResp, apptsResp) {
  const leads = Array.isArray(leadsResp?.leads) ? leadsResp.leads : [];
  const appts = Array.isArray(apptsResp) ? apptsResp : [];
  const hotLeads = leads.filter((l) => l && l.hot && l.stage !== "SOLD");
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysAppts = appts.filter((a) => a && a.date === todayStr && a.status !== "cancelled");
  const staleLeads = leads.filter((l) => {
    if (!l || l.stage === "SOLD" || l.stage === "LOST") return false;
    const ageMs = Date.now() - (l.updatedAt || l.createdAt || 0);
    return ageMs > 3 * ONE_DAY_MS; // no real contact in 3+ real days
  });
  return {
    hotLeadCount: hotLeads.length,
    hotLeads: hotLeads.slice(0, 3).map((l) => ({ name: l.name || "?", vehicle: l.vehicle || null, budget: l.budget || null })),
    todaysAppointmentCount: todaysAppts.length,
    todaysAppointments: todaysAppts.slice(0, 3).map((a) => ({ name: a.name || "?", time: a.time || null, vehicle: a.vehicle || null })),
    staleLeadCount: staleLeads.length,
  };
}

function summarizePlatform(health) {
  if (!health || !health.ok) return { ok: false, activeMutators: [], issues: ["Health check unavailable."] };
  const issues = [];
  if (health.execution && health.execution.paperOnly === false) issues.push("Execution is NOT paper-only — real money at risk.");
  if (health.postgres && health.postgres.configured && !health.postgres.connected) issues.push("Postgres configured but not connected — persistence at risk.");
  if (health.dynamicUniverse && health.dynamicUniverse.stale) issues.push("Scanner universe is stale.");
  return { ok: issues.length === 0, activeMutators: (health.execution && health.execution.activeMutators) || [], issues };
}

// Real freshness check — CEO AI runs once/day at 8:10 ET. A "Start my day"
// call before that time (or after a missed scheduled run) would otherwise
// silently show yesterday's verdict as if it were today's — exactly the
// class of fabricated-freshness bug this platform's own discipline exists
// to prevent.
function isFromToday(timestampMs) {
  if (!Number.isFinite(timestampMs)) return false;
  return new Date(timestampMs).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

async function buildMorningMode() {
  const { loadCoachLog } = require("./ai-coach-store");
  const [tradeData, leadsResp, apptsResp, health, marketEvents] = await Promise.all([
    getBestTradeCandidates(),
    getJson("/api/dealer/crm/leads"),
    getJson("/api/dealer/fb/appointments"),
    getJson("/api/health"),
    getRealMarketEvents(),
  ]);
  const coachLog = loadCoachLog();
  const ceo = coachLog?.ceo || null;
  const ceoFresh = !!ceo && !ceo.aiUnavailable && isFromToday(ceo.generatedAt);

  const [best, ...backups] = tradeData.candidates;
  const bestIsBuy = !!best && BUY_FAMILY.has(best.verdict);

  const dealership = summarizeDealership(leadsResp, apptsResp);
  const platform = summarizePlatform(health);

  // Deterministic DO NOW (max 3, per the master prompt's own cap) — real
  // conditions only, never padded to reach 3.
  const doNow = [];
  if (bestIsBuy) doNow.push(`Review ${best.symbol} — ${best.verdict}${best.riskReward != null ? `, R:R ${best.riskReward}` : ""}.`);
  if (!platform.ok) doNow.push(platform.issues[0]);
  if (dealership.hotLeadCount > 0) doNow.push(`${dealership.hotLeadCount} hot dealership lead(s) waiting on a reply.`);
  if (dealership.todaysAppointmentCount > 0) doNow.push(`${dealership.todaysAppointmentCount} dealership appointment(s) today.`);

  // MONEY OPPORTUNITY — one deterministic pick, never fabricated; "no
  // standout opportunity" is a genuinely valid answer (master prompt: "do
  // not confuse activity with opportunity").
  let moneyOpportunity;
  if (bestIsBuy) moneyOpportunity = { type: "TRADE", detail: `${best.symbol} ${best.verdict}` };
  else if (dealership.hotLeadCount > 0) moneyOpportunity = { type: "DEALERSHIP_LEAD", detail: `${dealership.hotLeadCount} hot lead(s) to close` };
  else moneyOpportunity = { type: "KEEP_CASH", detail: "No standout trade or dealership opportunity right now." };

  return {
    generatedAt: new Date().toISOString(),
    marketRegime: tradeData.marketRegime,
    marketVerdict: ceoFresh ? ceo.verdict : null,
    marketWhy: ceoFresh ? ceo.topAction : null,
    contrarianTake: ceoFresh ? ceo.contrarianTake : null,
    biggestRisk: ceoFresh ? ceo.biggestRisk : null,
    flipCondition: ceoFresh ? ceo.flipCondition : null,
    ceoJudgmentAvailable: ceoFresh,
    ceoJudgmentNote: ceoFresh ? null : (ceo ? "Today's CEO AI judgment isn't available yet (runs once/day) — market verdict below reflects real scan data only, no AI synthesis yet." : "No CEO AI judgment recorded yet."),
    doNow: doNow.slice(0, 3),
    bestTrade: bestIsBuy ? best : null,
    noTradeReason: !bestIsBuy
      ? (best ? `Top candidate ${best.symbol} did not clear a real BUY-family verdict (${best.verdict || "no verdict"}) after risk review — NO TRADE, keep cash.` : "No qualifying opportunity found in this scan — NO TRADE, keep cash.")
      : null,
    backupWatchlist: backups.filter((c) => c.verdict).slice(0, 3),
    marketEvents,
    dealership,
    platform,
    moneyOpportunity,
  };
}

// Real, plain-text render matching the master prompt's own Morning Mode
// section order — kept separate from buildMorningMode() so the structured
// object stays independently testable/consumable (e.g. by a future UI
// widget) without forcing every caller through this one text shape.
function renderMorningModeText(m) {
  const lines = [];
  lines.push(`MARKET VERDICT: ${m.marketVerdict || (m.marketRegime ? m.marketRegime.regime || m.marketRegime.label || "See regime below." : "Unavailable.")}`);
  if (m.marketRegime) lines.push(`Regime: ${m.marketRegime.regime || m.marketRegime.label || "?"}`);
  if (m.marketWhy) lines.push(`Why: ${m.marketWhy}`);
  if (m.ceoJudgmentNote) lines.push(`(${m.ceoJudgmentNote})`);

  if (m.doNow.length) {
    lines.push("", "DO NOW:");
    m.doNow.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
  }

  lines.push("", "BEST TRADE:");
  if (m.bestTrade) {
    const t = m.bestTrade;
    lines.push(`${t.symbol} — ${t.verdict}`);
    lines.push(`Entry ${t.entry ?? "?"} · Stop ${t.stop ?? "?"} · Target ${t.targets?.[0] ?? "?"} · R:R ${t.riskReward ?? "?"} · Confidence ${t.confidence ?? "?"}`);
    if (t.reasons?.length) lines.push(`Why now: ${t.reasons.join("; ")}`);
  } else {
    lines.push(m.noTradeReason || "NO TRADE — KEEP CASH.");
  }

  if (m.backupWatchlist.length) {
    lines.push("", "BACKUP WATCHLIST:");
    m.backupWatchlist.forEach((c) => lines.push(`${c.symbol} — ${c.verdict}${c.reasons?.length ? ` (${c.reasons[0]})` : ""}`));
  }

  if (m.marketEvents.length) {
    lines.push("", "MARKET EVENTS:");
    m.marketEvents.forEach((e) => lines.push(`${e.name} — ${e.note || ""}`));
  }

  lines.push("", `MONEY OPPORTUNITY: ${m.moneyOpportunity.detail}`);

  lines.push("", "DEALERSHIP:");
  if (m.dealership.hotLeadCount || m.dealership.todaysAppointmentCount || m.dealership.staleLeadCount) {
    if (m.dealership.hotLeadCount) lines.push(`${m.dealership.hotLeadCount} hot lead(s): ${m.dealership.hotLeads.map((l) => l.name).join(", ")}`);
    if (m.dealership.todaysAppointmentCount) lines.push(`${m.dealership.todaysAppointmentCount} appointment(s) today: ${m.dealership.todaysAppointments.map((a) => `${a.name}${a.time ? ` @ ${a.time}` : ""}`).join(", ")}`);
    if (m.dealership.staleLeadCount) lines.push(`${m.dealership.staleLeadCount} lead(s) with no contact in 3+ days.`);
  } else {
    lines.push("Nothing urgent.");
  }

  if (!m.platform.ok) {
    lines.push("", "PLATFORM:");
    m.platform.issues.forEach((i) => lines.push(`⚠ ${i}`));
  }

  if (m.biggestRisk) lines.push("", `BIGGEST RISK: ${m.biggestRisk}`);
  if (m.flipCondition) lines.push(`FLIP CONDITION: ${m.flipCondition}`);

  return lines.join("\n");
}

module.exports = {
  buildMorningMode, renderMorningModeText,
  // Exported for reuse by the Trading Copilot's portfolio_snapshot/
  // dealership_summary/platform_health tools (src/routes/market.js) —
  // same real functions/helper, not a re-derived copy, so Morning Mode
  // and ad-hoc chat questions can never quietly disagree about what "hot
  // lead" or "platform issue" means.
  summarizeDealership, summarizePlatform, getBestTradeCandidates, getJson,
};
