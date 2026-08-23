// position-decision-engine.js — "AM Trading — Final Trading Logic
// Redesign" spec, Phase 2+3 (explicit user request, 2026-08-19): once a
// real position exists, don't rerun the entry decision — switch to HOLD
// MANAGEMENT (§13). Pure function, zero I/O — same purity convention as
// daytrade-console-engine.js, whose real weighted scorers (computeMixed-
// Signals/computeMasterScore) feed this as `mixedVerdict`/`mixedReason`.
//
// ADVISORY ONLY (explicit user choice via AskUserQuestion): this computes
// and labels a state + real reason. It never calls quick-trade-service.js
// itself — no automatic order placement/modification. trailing-stops.js's
// own real +4%/-3% ratchet automation is untouched and runs independently.
"use strict";

// Same real gain% trail-activation threshold trailing-stops.js already
// uses (ACTIVATE_PCT) — reused for consistency, not reinvented.
const TRAIL_ACTIVATE_PCT = 4;
// A position extended 2R+ with conviction no longer strongly confirming
// is real evidence worth flagging for partial profit-taking, even short
// of a formally reached target.
const EXTENDED_R_MULTIPLE = 2;

// side: "long" | "short" — real position side from Alpaca.
// gainPct: real unrealized % in the position's own favor direction
//   (already sign-adjusted for shorts by the caller).
// mixedVerdict: "BULLISH" | "BEARISH" | "MIXED" | null — the fresh,
//   real verdict from daytrade-console-engine.js's computeMixedSignals,
//   computed for this symbol right now. null = no real day-trade data
//   available (e.g. illiquid symbol, no real intraday bars) — this
//   function honestly declines to state an opinion rather than guess.
// mixedReason: the real reason string from the same computeMixedSignals
//   call — reused verbatim so EXIT's reason is never generic filler.
// rNow / rTarget: real R-multiples from the position's own real planned
//   entry/stop/target (same math ActivePositionsCard.jsx already
//   computes) — null when no real plan is on file for this position.
// currentPrice / stopPrice: real, already-resolved values the caller
//   (routes/alpaca.js) already has in scope (pos.current from Alpaca's
//   own current_price, pos.plannedStop from the matched real trade plan)
//   — null when no real plan is on file, same graceful-degradation
//   discipline as rNow/rTarget above.
function computePositionState({ side, gainPct, mixedVerdict, mixedReason, rNow = null, rTarget = null, currentPrice = null, stopPrice = null }) {
  // HARD EXIT (Master Build Spec §18, 2026-08-22) — a real, objective,
  // mechanical stop breach: the planned risk limit already agreed to when
  // the position was opened, not a soft thesis change. Checked FIRST,
  // even before a fresh mixedVerdict is available — a stop breach doesn't
  // need a weighted read to justify exiting, and must never be masked by
  // "no real day-trade data" (the null-verdict early return below).
  // Distinct from a plain EXIT (thesis invalidated via mixedVerdict
  // flipping) so the reason a position needs to close is never conflated:
  // "the story changed" vs. "the risk plan says get out now."
  if (Number.isFinite(currentPrice) && Number.isFinite(stopPrice)) {
    const stopBreached = side === "short" ? currentPrice >= stopPrice : currentPrice <= stopPrice;
    if (stopBreached) {
      return { state: "HARD_EXIT", reason: `Real stop price ($${stopPrice.toFixed(2)}) has been breached — the planned risk limit, not a thesis change.` };
    }
  }

  if (mixedVerdict == null) return { state: null, reason: null };

  const thesisAligned = side === "short" ? mixedVerdict !== "BULLISH" : mixedVerdict !== "BEARISH";
  const thesisStronglyAligned = side === "short" ? mixedVerdict === "BEARISH" : mixedVerdict === "BULLISH";

  // EXIT — real thesis invalidation (spec §13/§16): the fresh weighted
  // verdict has flipped fully against this position's side. Reason is the
  // real, already-generated Mixed Signals sentence, not a paraphrase.
  if (!thesisAligned) {
    return { state: "EXIT", reason: mixedReason || "Weighted evidence has turned against this position — thesis invalidated." };
  }

  // TAKE_PARTIAL — real target reached (spec §15).
  if (rNow != null && rTarget != null && rTarget > 0 && rNow >= rTarget) {
    return { state: "TAKE_PARTIAL", reason: `Target reached (+${rNow.toFixed(1)}R of ${rTarget.toFixed(1)}R planned) — consider banking some size.` };
  }
  // TAKE_PARTIAL — meaningfully extended (2R+) while conviction is no
  // longer strongly confirming (mixed or just barely aligned, not a
  // clean strong read) — real "momentum starts weakening" evidence (§15).
  if (rNow != null && rNow >= EXTENDED_R_MULTIPLE && !thesisStronglyAligned) {
    return { state: "TAKE_PARTIAL", reason: `+${rNow.toFixed(1)}R and conviction is fading (${mixedVerdict.toLowerCase()}) — consider taking partial profit.` };
  }

  // TRAIL — real gain, trend remains strong (spec §14).
  if (gainPct != null && gainPct >= TRAIL_ACTIVATE_PCT && thesisStronglyAligned) {
    return { state: "TRAIL", reason: `+${gainPct.toFixed(1)}% and trend remains strong — raise the stop to protect gains.` };
  }

  // WARNING (Master Build Spec §18, 2026-08-22) — real, distinct tier:
  // the thesis hasn't invalidated (still HOLD-eligible per spec §13), but
  // the fresh evidence is genuinely mixed/uncertain, not cleanly
  // confirming. This exact real condition already existed here (the
  // softer "evidence mixed, but not invalidated" reason text below) —
  // previously silently labeled HOLD; now gets its own badge so
  // deteriorating-but-not-yet-exit is never indistinguishable from a
  // clean, confirmed hold.
  if (!thesisStronglyAligned) {
    return { state: "WARNING", reason: "Structure intact, but evidence has turned mixed — momentum or structure may be deteriorating. Watch closely." };
  }

  // HOLD — the default: thesis intact and strongly confirmed.
  return { state: "HOLD", reason: "Structure intact, thesis still confirmed." };
}

module.exports = { computePositionState, TRAIL_ACTIVATE_PCT, EXTENDED_R_MULTIPLE };
