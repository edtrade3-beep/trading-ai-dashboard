// autopilot-tick.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec, Phase 7,
// ALERT mode only (explicit user request 2026-08-19). Orchestrator, mirrors
// lightbox-state-store.js's own tick pattern.
//
// Deliberately reads src/lightbox-state-store.js's ALREADY-COMPUTED,
// already-persisted state rather than fetching/scoring anything itself —
// this is what makes "the same signal that appears in the light box must
// be the signal used by Autopilot" (spec §3) true by construction, and
// adds zero new Alpaca/market-data API load on top of the existing tick.
//
// Zero order execution — this phase only detects real fresh BUY/SELL
// transitions, applies real chase-protection (autopilot-engine.js), and
// (only when mode != "OFF") sends a real Telegram alert. No order-placing
// function is called anywhere in this file, regardless of mode.
"use strict";

const { isMarketHoursET } = require("./risk-guardrails");
const { evaluateEntry } = require("./autopilot-engine");
const {
  getMode, upsertPosition, logActivity, hasProcessedTransition, markTransitionProcessed,
} = require("./autopilot-store");

const DIRECTION_FOR_TO = { BUY: "LONG", SELL: "SHORT" };

function reasonFromChecks(raw) {
  const passed = (raw?.checks || []).filter((c) => c.pass).map((c) => c.label.replace(/\s*\(.*?\)/, ""));
  return passed.length ? passed.join(" + ") : "Real weighted signal confirmation.";
}

async function tickAutopilot() {
  // Real end-of-day flatten (2026-08-23) — checked every tick regardless
  // of the isMarketHoursET() gate just below, since its own real window
  // (15:50-16:10 ET) extends slightly past that gate's 15:55 cutoff. See
  // lightbox-autopilot-execute.js's header for why. Best-effort: a failure
  // here must never block the rest of this tick's real detection logic.
  try {
    const { maybeFlattenEndOfDay } = require("./lightbox-autopilot-execute");
    await maybeFlattenEndOfDay();
  } catch { /* best-effort */ }

  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let getLightBoxState;
  try {
    ({ getLightBoxState } = require("./lightbox-state-store"));
  } catch {
    return { ok: false, checked: 0 };
  }
  const lbState = getLightBoxState();
  const mode = getMode();
  const transitions = lbState.transitions || [];

  let evaluated = 0, alerted = 0;
  for (const t of transitions) {
    if (t.to !== "BUY" && t.to !== "SELL") continue;
    const direction = DIRECTION_FOR_TO[t.to];
    const key = `${t.symbol}:${t.ts}`;
    if (hasProcessedTransition(key)) continue;

    const entry = lbState.bySymbol?.[t.symbol];
    const raw = entry?.raw;
    if (!raw || !(raw.bestEntry > 0)) continue; // no real data yet — leave unprocessed, re-check next tick

    const result = evaluateEntry({ direction, bestEntry: raw.bestEntry, currentPrice: raw.px });
    evaluated++;

    if (result.state == null) continue; // still developing — re-evaluate next tick, don't mark processed

    markTransitionProcessed(key);
    const why = reasonFromChecks(raw);
    upsertPosition(t.symbol, {
      state: result.state,
      direction,
      detectedAt: t.ts,
      bestEntry: raw.bestEntry,
      stop: raw.stop,
      target: raw.target,
      rr: raw.rr,
      quality: raw.quality,
      zone: result.zone,
      why,
      reason: result.reason,
    });
    logActivity({
      symbol: t.symbol, state: result.state, direction, quality: raw.quality,
      note: result.state === "ENTRY_READY" ? `Entry ready — ${why}` : result.reason,
    });

    if (result.state === "ENTRY_READY" && mode !== "OFF") {
      try {
        const { sendTelegramMessage, isConfigured } = require("./telegram");
        if (isConfigured()) {
          const zoneStr = result.zone ? `$${result.zone.low.toFixed(2)}–$${result.zone.high.toFixed(2)}` : "n/a";
          await sendTelegramMessage(
            `🚦 AUTOPILOT (${mode}) — ${direction === "SHORT" ? "SHORT" : "ENTER"} ${t.symbol}\n` +
            `Entry: ${zoneStr}\nStop: $${Number(raw.stop).toFixed(2)}  Target: $${Number(raw.target).toFixed(2)} (R:R ${raw.rr}:1)\n` +
            `Score ${raw.quality}/100 — ${why}\n` +
            (mode === "ALERT" ? "(alert only — no order placed)" : `(${mode} mode — order execution not yet built)`)
          ).catch(() => {});
          alerted++;
        }
      } catch { /* Telegram is best-effort — real detection/logging above still happened */ }
    }
  }

  return { ok: true, evaluated, alerted, mode };
}

module.exports = { tickAutopilot };
