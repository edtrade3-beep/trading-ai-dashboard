// bearish-setups-alerts.js — real Telegram alert when a new bearish
// (put-buy) setup appears in the trade-signals engine's real universe
// (explicit user request, 2026-08-03: "when market is down what stocks to
// short" — puts, not equity shorts, confirmed via AskUserQuestion; this
// app's long-only guardrail, src/routes/alpaca.js, stays intact). The
// bearish counterpart to best-opportunities-alerts.js.
//
// Reuses /api/market/trade-signals via a real internal self-fetch (same
// established convention as advisor-ai.js/ceo-ai.js/command-center-ai.js —
// BASE()+getJson()) rather than duplicating its computation — that route
// already scores a real ~48-symbol universe and classifies each into
// LONG/SHORT-AVOID/WATCH/WATCH-SHORT with real entry/stop/target/R:R and a
// real IV-aware option recommendation, self-cached 60s server-side.
"use strict";

const path = require("node:path");
const { ROOT, PORT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "bearish-setups-alert-state.json");
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

async function checkBearishSetupsAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let sigData;
  try {
    const r = await fetch(`${BASE()}/api/market/trade-signals`);
    sigData = await r.json();
  } catch {
    return { ok: false, checked: 0, alerts: [] };
  }
  if (!sigData?.ok || !Array.isArray(sigData.signals)) return { ok: true, checked: 0, alerts: [] };

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const s of sigData.signals) {
    if (!s?.sym) continue;
    const isShort = s.action === "SHORT / AVOID";
    const last = prev[s.sym] || {};

    if (last.isShort === false && isShort === true) {
      alerts.push(s);
    }
    next[s.sym] = { isShort };
  }

  saveState(next);

  if (alerts.length) {
    const lines = alerts.map((s) =>
      `📉 ${s.sym}: new bearish setup at $${Number(s.entry).toFixed(2)} (${s.confidence}, score ${s.score}/100)` +
      `${s.optDetail ? ` — ${s.optDetail.tradeStr}` : (s.optionType ? ` — ${s.optionType}` : "")}` +
      ` · Stop $${s.stop} · T1 $${s.target1} · T2 $${s.target2} · R:R ${s.rr}:1`
    );
    pushDigestLines("opportunity", "📉 NEW BEARISH SETUP", lines);
  }

  return { ok: true, checked: sigData.signals.length, alerts };
}

module.exports = { checkBearishSetupsAlerts };
