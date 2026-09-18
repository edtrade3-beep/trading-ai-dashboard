import { useEffect, useState, useRef } from "react";
import { pickTopOpportunities } from "./CommandSearchPanel.jsx";

// Real valuation enrichment (2026-09-17 follow-up, "VALUATION ENGINE"
// master prompt §15, "Add valuation information to Top Opportunities" —
// this IS that named panel). Bounded to exactly the 5 (or 6, with the
// Early Discovery slot) symbols actually visible here — a real, cheap
// fetch of the SAME canonical GET /api/market/valuation every other
// valuation surface reads (routes/valuation.js's shared 15-min cache),
// never a second scoring formula. `fetchedRef` prevents re-requesting a
// symbol that's already resolved (including a real "unavailable") on
// every 60s poll tick as long as the Top-5 set doesn't change.
function useValuations(symbols) {
  const [map, setMap] = useState({});
  const fetchedRef = useRef(new Set());
  useEffect(() => {
    let alive = true;
    const need = symbols.filter((s) => s && !fetchedRef.current.has(s));
    if (!need.length) return undefined;
    need.forEach((s) => fetchedRef.current.add(s));
    Promise.all(need.map((s) =>
      fetch(`/api/market/valuation?symbol=${encodeURIComponent(s)}`).then((r) => r.json()).catch(() => null)
    )).then((results) => {
      if (!alive) return;
      setMap((prev) => {
        const next = { ...prev };
        need.forEach((s, i) => { next[s] = results[i] || null; });
        return next;
      });
    });
    return () => { alive = false; };
  }, [symbols.join(",")]);
  return map;
}

// TopOpportunities.jsx (2026-09-13) — compact ranked "TOP OPPORTUNITIES"
// panel for Trade Desk. Reuses the EXACT SAME real ranking Trade Desk's
// own "default to best trade of the day" logic and CommandSearchPanel's
// own "BEST" headline already use (pickTopOpportunities over
// GET /api/market/opportunities' tiers — priority ACTIONABLE > DEVELOPING
// > WAIT > EXTENDED, then real score, then Edge Velocity). No new
// backend scan (the route is already cached server-side), no new sort,
// no composite score — this component only presents the existing
// canonical fields (assetDecision.opportunityScore/riskScore/riskLevel/
// verdict/opportunityStage) already attached to each row.
const POLL_MS = 60_000;

const FRESH_LABEL = { EARLY: "EARLY", EMERGING: "EMERGING", DEVELOPING: "DEVELOPING", ACTIONABLE: "ACTIONABLE", CONFIRMED: "CONFIRMED" };
const RISK_LEVEL_COLOR = { LOW: "up", NORMAL: "up", ELEVATED: "mid", HIGH: "down", CRITICAL: "down" };

function stageDisplay(o, C) {
  const stage = o.assetDecision?.opportunityStage || null;
  // EXTENDED/EXHAUSTED must be visually obvious and never look like a
  // fresh setup — the anti-chase requirement. tier "EXTENDED" is the
  // structural source of truth (opportunity-engine.js), opportunityStage
  // only refines EXTENDED vs. EXHAUSTED within it.
  //
  // Bug fix (2026-09-13): opp.tier is UPPERCASE on the real opportunity
  // object (classifyOpportunityTier's literal return values —
  // "ACTIONABLE"/"DEVELOPING"/"WAIT"/"EXTENDED"/"INVALIDATED"). Only the
  // TIERS BUCKET KEY is lowercased (routes/market.js's
  // `tiers[opp.tier.toLowerCase()]`), never the field itself. The prior
  // lowercase comparison here never matched — harmless in this specific
  // spot only because the opportunityStage fallback below already covers
  // the same real cases, but wrong and fixed now that a second, load-
  // bearing tier check (withEarlyDiscoverySlot below) depends on getting
  // this right.
  if (o.tier === "EXTENDED" || stage === "EXTENDED" || stage === "EXHAUSTED") {
    return { text: stage === "EXHAUSTED" ? "EXHAUSTED" : "EXTENDED — DON'T CHASE", color: C.red };
  }
  if (stage && FRESH_LABEL[stage]) return { text: stage, color: C.green };
  return { text: stage || (o.tier || "—").toUpperCase(), color: C.textSec };
}

function riskColorFor(level, C) {
  const bucket = RISK_LEVEL_COLOR[level];
  if (bucket === "up") return C.green;
  if (bucket === "mid") return C.amber;
  if (bucket === "down") return C.red;
  return C.textDim;
}

// Early Discovery slot (2026-09-13) — presentation-only fix for the
// audit's confirmed lateness bias: pickTopOpportunities() (shared,
// UNTOUCHED here — Trade Desk auto-load and Command Search BEST both keep
// using it as-is) can let a full ACTIONABLE bucket crowd out every real
// DEVELOPING candidate, even one with a real ACCELERATING Edge Velocity.
// This reserves exactly ONE visible slot for the first such candidate
// already sitting in the backend's own DEVELOPING bucket order — no new
// sort, no new score, no formula. Never touches EXTENDED/EXHAUSTED rows
// (only ever looks at tiers.developing).
export function withEarlyDiscoverySlot(rows, tiers) {
  if (rows.length < 5) return rows; // canonical selection already included everything available
  // Bug fix (2026-09-13): opp.tier is "DEVELOPING" (uppercase) on the real
  // object — see stageDisplay's comment above. This de-dup check was
  // silently always-false before the fix, which could have let an already-
  // included accelerating candidate be re-injected as a duplicate row.
  const alreadyPresent = rows.some((o) => o.tier === "DEVELOPING" && o.edgeVelocity?.status === "ACCELERATING");
  if (alreadyPresent) return rows;
  const candidate = (tiers?.developing || []).find((o) => o.edgeVelocity?.status === "ACCELERATING");
  if (!candidate) return rows;
  return [...rows.slice(0, 4), candidate];
}

// Timing Not Ready watch row (2026-09-13, locked contract from the
// "Promising WAIT" audit) — discovery-only, NEVER a trade recommendation.
// Identifies the narrow WAIT-2 case: real opportunity quality already
// clears BUY-grade (opportunity.score >= AM_CORE_SETUP.buyThreshold, 70)
// but the real Entry Score gate (AM_CORE_SETUP.entryScoreFloor, 75) is
// what's keeping it at AVOID_LONG — not weak overall quality, not a
// structural/critical-flag/chase-band gate (those land in INVALIDATED/
// EXTENDED, never WAIT). Excludes any row carrying a real execution
// blocker or untrustworthy data — this is "worth watching," never "safe
// to act on." The canonical assetDecision.verdict for every one of these
// rows is "AVOID" (standardizeDecision only maps the literal opportunity-
// engine "WAIT" string to canonical WAIT, never "AVOID_LONG") — the UI
// must always show that real verdict alongside the tag, never instead of
// it.
//
// Dedup against the final visible list (2026-09-13, live audit finding —
// confirmed in real production output: MU appeared as both Top-5 #1 and
// this secondary row, since a WAIT-heavy scan can have every visible
// Top-5 slot independently satisfy this same predicate). `visibleSymbols`
// is the FINAL Top-5 — i.e. after withEarlyDiscoverySlot's own
// adjustment, per the caller below — so this stays correct regardless of
// whether Early Discovery changed slot 5. Presentation-only: the
// predicate itself, tiers.wait's existing backend order, and the
// Top-5/Early-Discovery logic are all untouched.
export function pickTimingNotReadyCandidate(tiers, visibleSymbols = []) {
  const visible = new Set(visibleSymbols);
  const wait = tiers?.wait || [];
  return wait.find((o) => {
    if (visible.has(o.symbol)) return false;
    const ad = o.assetDecision;
    return (
      o.tier === "WAIT" &&
      o.verdict === "AVOID_LONG" &&
      Number.isFinite(o.score) && o.score >= 70 &&
      Number.isFinite(o.entryScore) && o.entryScore < 75 &&
      ad?.verdict === "AVOID" &&
      !(Array.isArray(ad?.blockers) && ad.blockers.length > 0) &&
      ad?.dataHealth?.canTrade !== false
    );
  }) || null;
}

export default function TopOpportunities({ onSelectSymbol, C, MONO, SANS }) {
  const [tiers, setTiers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/opportunities").then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d?.ok === false) { setError(d.error || "unavailable"); return; }
        setTiers(d?.tiers || null);
        setError(null);
      }).catch((err) => { if (alive) setError(err.message); });
    };
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const rows = tiers ? withEarlyDiscoverySlot(pickTopOpportunities(tiers, 5), tiers) : [];
  const timingNotReady = tiers ? pickTimingNotReadyCandidate(tiers, rows.map((o) => o.symbol)) : null;
  const valuations = useValuations(rows.map((o) => o.symbol));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textDim, marginBottom: 8 }}>TOP OPPORTUNITIES</div>
      {!tiers && !error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Loading…</div>}
      {error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No qualified opportunities right now.</div>}
      {tiers && !rows.length && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No qualified opportunities right now.</div>}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((o) => {
            const stage = stageDisplay(o, C);
            const ad = o.assetDecision || null;
            const opportunityScore = Number.isFinite(ad?.opportunityScore) ? ad.opportunityScore : (Number.isFinite(o.score) ? o.score : null);
            const riskAvailable = Number.isFinite(ad?.riskScore) && Boolean(ad?.riskLevel);
            const val = valuations[o.symbol];
            const valAvailable = val?.ok && Number.isFinite(val.valuationScore);
            return (
              <div key={o.symbol}>
                <div
                  {...(onSelectSymbol ? { onClick: () => onSelectSymbol(o.symbol), role: "button", tabIndex: 0 } : {})}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6, background: C.surface, cursor: onSelectSymbol ? "pointer" : "default" }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text, minWidth: 56 }}>{o.symbol}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: stage.color, minWidth: 130 }}>
                    {stage.text}
                    {o.edgeVelocity?.status === "ACCELERATING" && (
                      <span style={{ color: C.green, marginLeft: 4 }}>
                        ↑ ACCELERATING{o.edgeVelocity?.isProvisional ? " · PROVISIONAL" : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, minWidth: 90 }}>
                    Opportunity {opportunityScore ?? "—"}
                  </div>
                  {/* Real valuation (2026-09-17 follow-up) — the SAME
                      canonical valuation-engine.js profile every other
                      surface reads. Honestly omitted (not "0") while a
                      fresh per-symbol fetch is still in flight or genuinely
                      unavailable (e.g. FMP not configured). */}
                  {valAvailable && (
                    <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, minWidth: 90 }}>
                      Valuation {Math.round(val.valuationScore)}
                    </div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 13, color: riskAvailable ? riskColorFor(ad.riskLevel, C) : C.textDim, minWidth: 110 }}>
                    {riskAvailable ? `Risk ${ad.riskScore} · ${ad.riskLevel}` : "Risk unavailable"}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent, minWidth: 70 }}>
                    {ad?.verdict || "—"}
                  </div>
                  {o.verdictReason && (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.verdictReason}
                    </div>
                  )}
                </div>
                {valAvailable && (val.valuationLevel || val.revenueTrend) && (
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, padding: "0 8px 4px 8px", letterSpacing: "0.02em" }}>
                    {val.valuationLevel}
                    {val.revenueTrend === "ACCELERATING" ? " · REVENUE ACCELERATING" : ""}
                    {Number.isFinite(val.epsRevision30D) ? ` · EPS REVISIONS ${val.epsRevision30D >= 0 ? "↑" : "↓"}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {timingNotReady && (
        <div
          {...(onSelectSymbol ? { onClick: () => onSelectSymbol(timingNotReady.symbol), role: "button", tabIndex: 0 } : {})}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6, marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 10, cursor: onSelectSymbol ? "pointer" : "default" }}
        >
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text, minWidth: 56 }}>{timingNotReady.symbol}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.amber, minWidth: 130 }}>TIMING NOT READY</div>
          {/* Discovery-only — the real canonical verdict is always shown
              alongside, never replaced by the tag above. */}
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, minWidth: 70 }}>
            {timingNotReady.assetDecision.verdict}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, minWidth: 140 }}>
            Opportunity {timingNotReady.score} · Entry {timingNotReady.entryScore}
          </div>
          {timingNotReady.verdictReason && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {timingNotReady.verdictReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
