"use strict";
// opportunity-hunter-alerts.js (2026-09-16, "AI Opportunity Hunter" master
// prompt, Stocks Phase 1) — same real "diff canonical scan against last-
// known state" template opportunity-pivot-alerts.js/top50-telegram-alerts.js
// already established. Deliberately covers ONLY the NEW real signals this
// layer adds (Deal Score crossing, Risk spike, Valuation improving, entering
// the ranked top list) — price-zone entry/exit, entry confirmation, and
// setup invalidation are the SAME real events top50-telegram-alerts.js
// already alerts on off the SAME underlying whatToPay/tier fields; alerting
// on them again here would be exactly the "Telegram and the main platform
// generate different canonical verdicts" duplication this master prompt's
// own rules forbid. Reuses telegram.js's real send + telegram-bot.js's real
// daily priority-budget/quiet-hours gate — never a second Telegram client.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured, sendTelegramMessage } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { isMarketHoursET } = require("./risk-guardrails");
const { scanOpportunities } = require("./opportunity-hunter");

const STORE_PATH = path.join(ROOT, "data", "opportunity-hunter-state.json");
function loadState() { return readJsonSafe(STORE_PATH, {}); }
function saveState(s) { writeJsonAtomic(STORE_PATH, s); }

const COOLDOWN_MS = 30 * 60_000;
const RISK_RANK = { LOW: 0, NORMAL: 0, ELEVATED: 1, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

function fmt(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }

function detectTransitions(prevState, o, wasRanked) {
  if (!prevState) return [];
  const events = [];
  if (prevState.dealScore < 80 && o.dealScore >= 80) events.push("NEW_HIGH_QUALITY_DEAL");
  const prevRisk = RISK_RANK[prevState.riskLevel] ?? 0, nowRisk = RISK_RANK[o.riskLevel] ?? 0;
  if (nowRisk > prevRisk && nowRisk >= 2) events.push("RISK_SPIKE");
  const prevMargin = prevState.marginOfSafetyPct, nowMargin = o.fairValue?.marginOfSafetyPct;
  if (Number.isFinite(prevMargin) && Number.isFinite(nowMargin) && nowMargin - prevMargin >= 10) events.push("VALUATION_IMPROVED");
  if (!wasRanked) events.push("ENTERED_TOP_RANKS");
  return events;
}

function buildMessage(o, kind) {
  const TITLE = {
    NEW_HIGH_QUALITY_DEAL: "🔥 NEW HIGH-QUALITY DEAL", RISK_SPIKE: "⚠️ RISK SPIKE",
    VALUATION_IMPROVED: "📈 VALUATION IMPROVED", ENTERED_TOP_RANKS: "🆕 NEW OPPORTUNITY",
  };
  const lines = [
    TITLE[kind] || "🚨 OPPORTUNITY UPDATE", "", o.symbol, `Current: ${fmt(o.price)}`,
    o.fairValue ? `Estimated Fair Value: ${fmt(o.fairValue.conservative)}–${fmt(o.fairValue.bull)}` : null,
    "",
    `Deal Score: ${o.dealScore ?? "—"}`, `Entry Score: ${o.entryScore ?? "—"}`,
    `Risk: ${o.riskLevel || "—"}`, `Confidence: ${o.confidenceScore ?? "—"}`,
    "", "State:", o.state,
    "", "WHY:", ...(o.reasons || []).slice(0, 5).map((r) => `• ${r.replace(/_/g, " ")}`),
  ].filter((l) => l !== null);
  return lines.join("\n");
}

async function checkOpportunityHunterAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  const { opportunities } = await scanOpportunities({ limit: 50 }).catch(() => ({ opportunities: [] }));
  const prev = loadState();
  const next = {};
  const sent = [];

  for (const o of opportunities) {
    const prevState = prev[o.symbol] || null;
    const wasRanked = !!prevState;
    const events = detectTransitions(prevState, o, wasRanked);
    const now = Date.now();
    const lastAlertAt = prevState?.lastAlertAt || 0;
    const withinCooldown = now - lastAlertAt < COOLDOWN_MS;

    const priority = ["RISK_SPIKE", "NEW_HIGH_QUALITY_DEAL", "VALUATION_IMPROVED", "ENTERED_TOP_RANKS"];
    const fireKind = priority.find((k) => events.includes(k));

    next[o.symbol] = {
      dealScore: o.dealScore, entryScore: o.entryScore, riskLevel: o.riskLevel,
      marginOfSafetyPct: o.fairValue?.marginOfSafetyPct ?? null, state: o.state,
      lastAlertAt: prevState?.lastAlertAt || 0,
    };

    if (!fireKind) continue;
    // RISK_SPIKE bypasses cooldown (a real, material risk escalation should
    // never wait up to 30 real minutes to be reported); the rest respect it
    // — "Do not send repeated alerts every refresh," the prompt's own rule.
    if (fireKind !== "RISK_SPIKE" && withinCooldown) continue;
    // "opportunity" (P1) for all real event kinds here — NOT "portfolio-risk"
    // (P0), which is reserved for real account-wide risk (emergency-stop/
    // auto-exec/trade-gps-critical) elsewhere in telegram-bot.js; a single
    // stock's own risk score escalating is a real, but narrower, signal —
    // using the P0 category here would be a real category misuse, not just
    // a labeling nicety.
    if (!shouldSendAlert({ category: "opportunity" })) continue;

    next[o.symbol].lastAlertAt = now;
    await sendTelegramMessage(buildMessage(o, fireKind)).catch(() => {}); // a real Telegram failure must never break the scan/state-save below
    sent.push({ symbol: o.symbol, kind: fireKind });
  }

  saveState(next);
  return { ok: true, checked: opportunities.length, sent };
}

// Hourly Opportunity Digest (2026-09-16, explicit request: "I want
// opportunities come to me not search for it") — a real, guaranteed push
// on a fixed schedule regardless of whether anything changed, distinct
// from checkOpportunityHunterAlerts() above (which only fires on a real
// state-diff event and could stay silent for hours on a quiet day). Same
// real scanOpportunities() read, just a different real delivery cadence
// and format — reuses telegram.js's real send, no second Telegram client.
// Deliberately sent directly (like top50-telegram-alerts.js's own
// sendTop50MorningSummary), not through shouldSendAlert's P1 budget —
// this is a fixed, bounded schedule (server.js's OPP_DIGEST_HOURS), not
// an unbounded event stream that needs budgeting.
function buildDigestMessage(opportunities) {
  const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
  const lines = [`📊 OPPORTUNITY DIGEST — ${time} ET`, ""];
  const ranked = [...opportunities].sort((a, b) => (b.dealScore ?? -1) - (a.dealScore ?? -1) || b.entryScore - a.entryScore).slice(0, 10);
  if (!ranked.length) { lines.push("No real qualifying candidates right now."); return lines.join("\n"); }
  ranked.forEach((o, i) => {
    lines.push(`${i + 1}. ${o.symbol} — Deal ${o.dealScore ?? "—"} · Entry ${o.entryScore} · Risk ${o.riskLevel || "—"}`, `   ${o.state}`);
  });
  lines.push("", "/why SYMBOL for full detail · /opportunities for the live list anytime");
  return lines.join("\n");
}

async function sendOpportunityDigest() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { opportunities } = await scanOpportunities({ limit: 50 }).catch(() => ({ opportunities: [] }));
  await sendTelegramMessage(buildDigestMessage(opportunities)).catch(() => {});
  return { ok: true, sent: opportunities.length };
}

module.exports = { checkOpportunityHunterAlerts, detectTransitions, buildMessage, sendOpportunityDigest, buildDigestMessage, COOLDOWN_MS, STORE_PATH };
