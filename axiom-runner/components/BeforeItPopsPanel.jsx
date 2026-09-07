import { useState, useEffect } from "react";

// BeforeItPopsPanel — "3-Second AI Decision System" spec (2026-09-07),
// §3: dedicated early-opportunity surface, shown directly on Trade Desk's
// primary page (not buried in a scanner tab). Reads GET /api/market/
// before-it-pops, which reuses the SAME cached full-universe opportunity
// scan every other Trade Desk surface already reads — this component adds
// zero new fetches beyond that one, and zero new scoring (party-stage-
// engine.js does the real work server-side). Collapsed to the top 3 real
// candidates by default, matching the spec's own "do not show 30 stocks
// on the main screen" rule; "VIEW MORE" expands the rest of whatever the
// server already returned (max 10).

export default function BeforeItPopsPanel({ C, MONO, SANS, setTerminalSymbol, setActiveTab }) {
  const [candidates, setCandidates] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Defaults COLLAPSED (2026-09-07) — Trade Desk's core zone is a fixed,
  // viewport-derived height shared by every flex child above ChartPane
  // (see TradeDeskTab.jsx's own rootRef/rootHeight comment: the chart is
  // deliberately given "a stable, generous, never-squeezed budget," a
  // real prior bug class this codebase has already been burned by once).
  // An always-open panel here would eat directly into that budget on
  // every load; collapsed-by-default keeps the existing chart real estate
  // intact while still surfacing the capability one click away, always
  // visible as a header even when closed.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("tradedesk_before_it_pops_open") !== "on"; } catch { return true; }
  });

  useEffect(() => {
    let alive = true;
    fetch("/api/market/before-it-pops").then((r) => r.json())
      .then((d) => { if (alive) { if (d.ok) setCandidates(d.candidates || []); else setError(d.error || "Unavailable"); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  const toggleCollapsed = () => setCollapsed((v) => {
    const nv = !v;
    try { localStorage.setItem("tradedesk_before_it_pops_open", nv ? "off" : "on"); } catch {}
    return nv;
  });

  const shown = expanded ? (candidates || []) : (candidates || []).slice(0, 3);

  return (
    <section aria-label="Before It Pops — early opportunity detection" style={{ padding: "14px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={toggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: collapsed ? 0 : 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>🚨 BEFORE IT POPS</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>— early setups, before the crowd arrives</span>
      </button>

      {!collapsed && (
        <>
          {error && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber }}>Unavailable right now: {error}</div>}
          {!error && candidates === null && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Scanning the real broad universe for early accumulation…</div>}
          {!error && candidates && candidates.length === 0 && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>⚪ No real early-stage candidates right now — cash is a valid state.</div>}

          {!error && candidates && candidates.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {shown.map((c) => (
                <BeforeItPopsRow key={c.symbol} c={c} C={C} MONO={MONO} SANS={SANS}
                  onOpen={() => { setTerminalSymbol?.(c.symbol); try { localStorage.setItem("mterminal_load_sym", c.symbol); } catch {} }} />
              ))}
              {candidates.length > 3 && (
                <button onClick={() => setExpanded((v) => !v)} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.accent, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  {expanded ? "SHOW FEWER" : `VIEW ${candidates.length - 3} MORE →`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BeforeItPopsRow({ c, C, MONO, SANS, onOpen }) {
  const pressureColor = !Number.isFinite(c.pressure?.score) ? C.textDim : c.pressure.score >= 75 ? C.green : c.pressure.score >= 55 ? C.amber : C.textSec;
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer" }}>
      <div style={{ minWidth: 90 }}>
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{c.symbol}</div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>${Number(c.price).toFixed(2)}</div>
      </div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>PARTY STAGE</div>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text }}>{c.partyStageIcon} {c.partyStage} — {c.partyStageLabel}</div>
      </div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>PRESSURE</div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: pressureColor }}>{Number.isFinite(c.pressure?.score) ? `${c.pressure.score}/100` : "—"}</div>
      </div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>CROWDING</div>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: (c.crowdingScore ?? 0) <= 25 ? C.green : (c.crowdingScore ?? 0) <= 55 ? C.amber : C.red }}>
          {(c.crowdingScore ?? 0) <= 25 ? "LOW" : (c.crowdingScore ?? 0) <= 55 ? "MODERATE" : "HIGH"}
        </div>
      </div>
      {c.earlyPressure?.detected && (
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.gold, background: `${C.gold}18`, borderRadius: 6, padding: "5px 10px" }}>
          🚨 EARLY PRESSURE DETECTED
        </div>
      )}
      <div style={{ flex: 1, minWidth: 200, fontFamily: SANS, fontSize: 14, color: C.textSec }}>
        {(c.partyStageReasons || []).slice(0, 2).join(" · ")}
      </div>
    </div>
  );
}
