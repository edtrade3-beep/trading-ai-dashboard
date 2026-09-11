"use strict";

// deep-scan-engine.js — Master Agent v1.1, "deep scan" (2026-09-11,
// explicit user request: "I want agent to give me detail deep scan of
// what happening" — scoped, per the user's own choice, to a full
// MARKET-WIDE scan, not a single-ticker deep dive). Same real data
// sources and same "no new decision engine, no new AI call" discipline
// as morning-mode-engine.js — this reports the SAME real scan Morning
// Mode uses, just in full instead of condensed to one best trade + 3
// backups: every real candidate found, the full regime factor breakdown,
// per-source data health, real portfolio risk state, dealership, and
// platform health.
const { getJson, summarizeDealership, summarizePlatform } = require("./morning-mode-engine");

const BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);
// Real AssetDecision (entry/stop/target/R:R) is fetched for up to this
// many top-ranked candidates — bounded so a busy market doesn't turn one
// chat answer into dozens of extra real trend-screen calls.
const DEEP_SCAN_CANDIDATE_LIMIT = 10;

async function buildDeepScan() {
  const opp = await getJson("/api/market/opportunities");
  if (!opp || !opp.ok) {
    return {
      generatedAt: new Date().toISOString(), error: "Real opportunity scan is unavailable right now.",
      marketRegime: null, dataHealth: null, tierCounts: {}, opportunities: [],
      portfolio: null, dealership: summarizeDealership(null, null), platform: summarizePlatform(null),
    };
  }

  const tierCounts = opp.counts || {};
  const pool = [...(opp.tiers?.actionable || []), ...(opp.tiers?.developing || []), ...(opp.tiers?.extended || [])]
    .filter((p) => p && p.symbol)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, DEEP_SCAN_CANDIDATE_LIMIT);

  let opportunities = [];
  if (pool.length) {
    const symbols = pool.map((p) => p.symbol).join(",");
    const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(symbols)}&withDecision=1`);
    const rows = Array.isArray(screen?.results) ? screen.results : [];
    opportunities = pool.map((p) => {
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
        reasons: Array.isArray(ad?.reasons) ? ad.reasons.slice(0, 3) : [],
        blockers: Array.isArray(ad?.blockers) ? ad.blockers.slice(0, 2) : [],
      };
    });
  }

  const [portfolio, leadsResp, apptsResp, health] = await Promise.all([
    getJson("/api/ai-hub/risk-snapshot"),
    getJson("/api/dealer/crm/leads"),
    getJson("/api/dealer/fb/appointments"),
    getJson("/api/health"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    error: null,
    marketRegime: opp.marketRegime || null,
    dataHealth: opp.dataHealth || null,
    tierCounts,
    opportunities,
    portfolio: portfolio && portfolio.ok ? portfolio : null,
    dealership: summarizeDealership(leadsResp, apptsResp),
    platform: summarizePlatform(health),
  };
}

function renderDeepScanText(d) {
  const lines = ["═══ DEEP SCAN ═══"];
  if (d.error) { lines.push("", d.error); return lines.join("\n"); }

  const r = d.marketRegime;
  if (r) {
    lines.push("", `MARKET REGIME: ${r.regime || "?"} (score ${r.score ?? "?"}, confidence ${r.confidence ?? "?"}%)`);
    if (Array.isArray(r.reasons) && r.reasons.length) lines.push(`Reasons: ${r.reasons.join("; ")}`);
    if (Array.isArray(r.blockers) && r.blockers.length) lines.push(`Blockers: ${r.blockers.join("; ")}`);
    if (Array.isArray(r.factors) && r.factors.length) lines.push(`Factors: ${r.factors.map((f) => `${f.label} ${f.pass ? "✓" : "✗"}`).join(", ")}`);
    if (r.volatility) lines.push(`Volatility: ${r.volatility.level ?? "?"} (${r.volatility.state ?? "?"})`);
  } else {
    lines.push("", "MARKET REGIME: unavailable.");
  }

  if (d.dataHealth) {
    lines.push("", `DATA HEALTH: ${d.dataHealth.status || "?"} (score ${d.dataHealth.score ?? "?"})`);
    const warnings = d.dataHealth.warnings || [];
    if (warnings.length) lines.push(`Warnings: ${warnings.join("; ")}`);
  }

  const counts = d.tierCounts || {};
  lines.push("", `OPPORTUNITY COUNTS: actionable ${counts.actionable ?? 0} · developing ${counts.developing ?? 0} · wait ${counts.wait ?? 0} · extended ${counts.extended ?? 0} · invalidated ${counts.invalidated ?? 0}`);

  if (d.opportunities.length) {
    lines.push("", `TOP ${d.opportunities.length} REAL CANDIDATES:`);
    d.opportunities.forEach((o, i) => {
      const buyTag = BUY_FAMILY.has(o.verdict) ? "✅" : "·";
      lines.push(`${i + 1}. ${buyTag} ${o.symbol} — ${o.verdict || o.opportunityTier} (score ${o.opportunityScore})`);
      if (o.entry != null) lines.push(`   Entry ${o.entry} · Stop ${o.stop} · Target ${o.targets?.[0] ?? "?"} · R:R ${o.riskReward ?? "?"} · Confidence ${o.confidence ?? "?"}`);
      if (o.reasons.length) lines.push(`   Why: ${o.reasons.join("; ")}`);
      if (o.blockers.length) lines.push(`   Blocked by: ${o.blockers.join("; ")}`);
    });
  } else {
    lines.push("", "No real candidates in actionable/developing/extended tiers right now.");
  }

  if (d.portfolio) {
    lines.push("", `PORTFOLIO: open risk ${d.portfolio.openRiskPct}% (cap 6%), daily-loss breaker ${d.portfolio.dailyBreakerTripped ? "TRIPPED" : "clear"}, ${d.portfolio.positionCount} open position(s).`);
  }

  lines.push("", "DEALERSHIP:");
  if (d.dealership.hotLeadCount || d.dealership.todaysAppointmentCount || d.dealership.staleLeadCount) {
    if (d.dealership.hotLeadCount) lines.push(`${d.dealership.hotLeadCount} hot lead(s): ${d.dealership.hotLeads.map((l) => l.name).join(", ")}`);
    if (d.dealership.todaysAppointmentCount) lines.push(`${d.dealership.todaysAppointmentCount} appointment(s) today.`);
    if (d.dealership.staleLeadCount) lines.push(`${d.dealership.staleLeadCount} lead(s) with no contact in 3+ days.`);
  } else {
    lines.push("Nothing urgent.");
  }

  lines.push("", `PLATFORM: ${d.platform.ok ? "All clear." : d.platform.issues.join("; ")}`);
  lines.push(`Active mutators: ${(d.platform.activeMutators || []).join(", ") || "none"}`);

  return lines.join("\n");
}

module.exports = { buildDeepScan, renderDeepScanText };
