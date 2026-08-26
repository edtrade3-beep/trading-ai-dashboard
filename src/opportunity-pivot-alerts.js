// opportunity-pivot-alerts.js — real Telegram alert the moment a symbol
// the Market Opportunity Engine already has its eye on (WAIT/DEVELOPING/
// EXTENDED tier in Trade Desk's own Opportunity Inbox) genuinely reaches
// a real, executable ACTIONABLE entry (explicit user request, 2026-08-26:
// "i need system watchem for me" — auto-watch every real WAIT-tier setup
// rather than requiring a manual per-symbol opt-in). Runs the exact same
// real scan /api/market/opportunities returns (routes/market.js's
// computeAllOpportunities, extracted for this reuse) — no second scan
// universe, no second tier classification, same "one engine" discipline
// every other alert job in this app already follows.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured, sendTelegramMessage } = require("./telegram");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "opportunity-pivot-alert-state.json");
function loadState() { return readJsonSafe(STORE_PATH, {}); }
function saveState(s) { writeJsonAtomic(STORE_PATH, s); }

const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";

// Real, pure transition check — fires only when a symbol's real tier
// genuinely just changed TO ACTIONABLE from something that wasn't
// already ACTIONABLE. First-seen-per-symbol (lastTier == null) seeds
// silently — same discipline as watchlist-setup-alerts.js's own
// shouldAlert(): never floods Telegram with every symbol that already
// happened to be ACTIONABLE the first time this job ever runs.
function justBecameActionable(lastTier, tier) {
  if (lastTier == null) return false;
  if (lastTier === "ACTIONABLE") return false;
  return tier === "ACTIONABLE";
}

async function checkOpportunityPivotAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let computeAllOpportunities;
  try {
    ({ computeAllOpportunities } = require("./routes/market"));
  } catch {
    return { ok: false, checked: 0, alerts: [] };
  }

  const tiers = await computeAllOpportunities().catch(() => null);
  if (!tiers) return { ok: false, checked: 0, alerts: [] };
  const all = Object.values(tiers).flat();

  const prev = loadState();
  const next = {};
  const alerts = [];

  for (const o of all) {
    const lastTier = prev[o.symbol];
    next[o.symbol] = o.tier;
    if (justBecameActionable(lastTier, o.tier)) alerts.push(o);
  }
  saveState(next);

  for (const o of alerts) {
    const entry = o.executableEntry ?? o.entry;
    const win = o.probability != null ? `${o.probability}%` : "—";
    const ev = Number.isFinite(o.expectedValue) ? `${o.expectedValue > 0 ? "+" : ""}${o.expectedValue}%` : "—";
    await sendTelegramMessage(
      `🔔 ${o.symbol} just reached ACTIONABLE\nEntry ${fmt(entry)} · Stop ${fmt(o.stop)} · Target ${fmt(o.target)}\nScore ${o.score ?? "—"} · Win ${win} · EV ${ev}`
    ).catch(() => {});
  }

  return { ok: true, checked: all.length, alerts: alerts.map((o) => o.symbol) };
}

module.exports = { checkOpportunityPivotAlerts, justBecameActionable };
