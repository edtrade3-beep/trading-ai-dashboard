import { useEffect, useState, useMemo } from "react";

// Tournament500Panel.jsx (2026-09-17, "500-Stock Tournament" master
// prompt; design pass 2026-09-17 — "make it easier nicer more pro") — a
// real CONSUMER of the existing canonical pipeline
// (src/tournament-engine.js), never a second scoring/risk engine. Every
// score/tier/lifecycle field shown here is the SAME real field every
// other Trade Desk surface reads off canonical-decision-pipeline.js — the
// only new thing this panel presents is real cross-symbol RANK and rank
// velocity over time (tournament-store.js), which nothing else in this
// app tracks. Reachable from the sidebar ("500 Tournament") and from
// inside AI Trade Desk's Deep Analysis dropdown + dedicated button — same
// real component, three entry points.
const POLL_MS = 45_000;

const TIER_COLOR = { ELITE: "amber", GREAT: "green", STRONG: "green", GOOD: "amber", DEVELOPING: "textDim" };
const TIER_BG = { ELITE: "rgba(245,158,11,0.14)", GREAT: "rgba(34,197,94,0.14)", STRONG: "rgba(34,197,94,0.14)", GOOD: "rgba(245,158,11,0.14)", DEVELOPING: "rgba(148,163,184,0.12)" };
const VELOCITY_COLOR = { ACCELERATING: "green", IMPROVING: "green", STABLE: "textDim", WEAKENING: "amber", FALLING: "red" };
const RISK_BAND = (score) => (!Number.isFinite(score) ? null : score <= 25 ? "LOW" : score <= 50 ? "MEDIUM" : score <= 75 ? "HIGH" : "CRITICAL");
const RISK_COLOR = { LOW: "green", NORMAL: "green", MEDIUM: "amber", ELEVATED: "amber", HIGH: "red", CRITICAL: "red" };
const LIFECYCLE_LABEL = { SCANNING: "SCANNING", SETUP_FORMING: "SETUP FORMING", ARMED: "ARMED", ENTER_NOW: "ENTER NOW", CANCELLED: "CANCELLED" };

function money(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }
function pct(v) { return Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—"; }
function rankArrow(change) {
  if (!Number.isFinite(change) || change === 0) return "0";
  return change > 0 ? `+${change}` : `${change}`;
}
function lifecycleLabelFor(row) {
  if (row.tier === "EXTENDED") return "EXTENDED";
  if (row.tier === "INVALIDATED") return "EXHAUSTED";
  return LIFECYCLE_LABEL[row.signalState] || row.signalState || "—";
}
// Defensive — never render a raw non-string contributor. The real root
// cause (redFlags being objects, not strings) is fixed server-side in
// tournament-engine.js/routes/tournament.js, but the persisted store can
// still hold entries written before that fix until each symbol's next
// real tick refreshes it; this guarantees the UI can never crash on
// stale data either way.
function asText(v) { return typeof v === "string" ? v : v == null ? "" : (v.reason || v.label || v.key || JSON.stringify(v)); }

// Small, reusable pill badge — every tier/state/velocity indicator in
// this panel uses this same one component so they read as one coherent
// visual language instead of ad-hoc colored text scattered around.
function Badge({ text, color, bg, C, MONO }) {
  if (!text) return null;
  return (
    <span style={{
      display: "inline-block", fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.03em",
      color: C[color] || C.textDim, background: bg || `${C[color] || C.textDim}18`,
      borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

// Compact horizontal bar — used for the detail drawer's score breakdown
// so "13/25" reads at a glance instead of requiring mental math on a
// bare number. Purely a visual rendering of the exact real value passed
// in, never a recomputation.
function ScoreBar({ label, value, max = 25, C, MONO, SANS }) {
  const has = Number.isFinite(value);
  const widthPct = has ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontFamily: MONO, fontWeight: 700, color: has ? C.text : C.textDim }}>{has ? Math.round(value) : "unavailable"}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
        {has && <div style={{ height: "100%", width: `${widthPct}%`, borderRadius: 3, background: C.accent, transition: "width 0.4s ease" }} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, C, MONO, SANS }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 12, borderLeft: `2px solid ${accent ? C[accent] : C.border}` }}>
      <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: accent ? C[accent] : C.text }}>{value}</span>
    </div>
  );
}

function DetailDrawer({ symbol, onClose, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    fetch(`/api/market/tournament/detail?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false) { setError(d.error || "unavailable"); return; }
      setData(d);
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [symbol]);

  const riskBand = data ? RISK_BAND(data.riskScore) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div className="tourn-drawer" style={{ width: "min(440px, 100%)", height: "100%", background: C.card, borderLeft: `1px solid ${C.border}`, padding: 22, overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: "0.01em" }}>{symbol}</span>
          <button onClick={onClose} className="tourn-icon-btn" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, color: C.textDim, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        {error && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, padding: "10px 0" }}>{error}</div>}
        {!data && !error && (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "10px 0" }}>
            <span className="tourn-spin">⟳</span>&nbsp; Loading real detail…
          </div>
        )}
        {data && (
          <>
            <div style={{ display: "flex", gap: 20, marginBottom: 14, padding: "12px 14px", background: C.surface || `${C.border}30`, borderRadius: 10 }}>
              <StatCard label="Opportunity" value={Number.isFinite(data.opportunityScore) ? Math.round(data.opportunityScore) : "—"} C={C} MONO={MONO} SANS={SANS} />
              <StatCard label="Risk" value={Number.isFinite(data.riskScore) ? Math.round(data.riskScore) : "—"} accent={RISK_COLOR[riskBand] || RISK_COLOR[data.riskLevel]} C={C} MONO={MONO} SANS={SANS} />
              <StatCard label="Rank" value={data.currentRank ? `#${data.currentRank}` : "—"} C={C} MONO={MONO} SANS={SANS} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <Badge text={lifecycleLabelFor(data)} color={data.tier === "EXTENDED" || data.tier === "INVALIDATED" ? "red" : "accent"} C={C} MONO={MONO} />
              <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>Stage: {data.opportunityStage || "—"}</span>
            </div>

            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>WHY IT'S RANKED HERE</div>
            {(data.positiveContributors || []).length > 0 ? (data.positiveContributors.slice(0, 3).map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, marginBottom: 5, paddingLeft: 14, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: C.green }}>▲</span>{asText(r)}
              </div>
            ))) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 5 }}>No real positive factors recorded.</div>}
            {(data.negativeContributors || []).length > 0 && data.negativeContributors.slice(0, 3).map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec || C.text, marginBottom: 5, paddingLeft: 14, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: C.red }}>▼</span>{asText(r)}
              </div>
            ))}

            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginTop: 18, marginBottom: 10 }}>SCORE BREAKDOWN</div>
            <ScoreBar label="Trend" value={data.trendScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Momentum" value={data.momentumScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Volume" value={data.volumeScore} max={10} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Relative Strength" value={data.relativeStrengthScore} max={10} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Catalyst" value={data.catalystScore} max={12} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Fundamental" value={data.fundamentalScore} max={100} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Valuation" value={data.valuationScore} max={100} C={C} MONO={MONO} SANS={SANS} />
            <ScoreBar label="Entry Quality" value={data.entryQualityScore} max={10} C={C} MONO={MONO} SANS={SANS} />

            {(data.riskContributors || []).length > 0 && (
              <>
                <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginTop: 18, marginBottom: 8 }}>RISK FACTORS</div>
                {data.riskContributors.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 4, gap: 8 }}>
                    <span>{asText(c)}</span>
                    <span style={{ fontFamily: MONO, color: C.amber, fontWeight: 700, flexShrink: 0 }}>+{Number.isFinite(c?.points) ? c.points : "—"}</span>
                  </div>
                ))}
              </>
            )}

            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginTop: 18, marginBottom: 8 }}>TRADE STRUCTURE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
              {[["Entry Zone", data.entryZone], ["Invalidation", data.invalidation], ["Stop", data.stop], ["Target", data.target]].map(([label, v]) => (
                <div key={label} style={{ background: `${C.border}25`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{Number.isFinite(v) ? money(v) : "unavailable"}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, padding: "10px 2px 0" }}>
              <span style={{ color: C.textDim }}>Risk / Reward</span>
              <span style={{ fontFamily: MONO, fontWeight: 800, color: C.text }}>{Number.isFinite(data.riskReward) ? `${data.riskReward.toFixed(1)}:1` : "unavailable"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ row, onSelect, C, MONO, SANS }) {
  const riskBand = RISK_BAND(row.riskScore);
  const changeUp = (row.changePct || 0) >= 0;
  const moveUp = Number.isFinite(row.rankChange) && row.rankChange > 0;
  const moveDown = Number.isFinite(row.rankChange) && row.rankChange < 0;
  return (
    <tr className="tourn-row" onClick={() => onSelect(row.symbol)}>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12.5, color: C.textDim, fontWeight: 700 }}>{row.tierIcon} #{row.rank}</td>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: C.text }}>
        {row.symbol}{row.isEarlyDiscovery && <span title="Early Discovery" style={{ marginLeft: 5 }}>🌱</span>}
      </td>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12.5, color: C.text, textAlign: "right" }}>{money(row.price)}</td>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12, textAlign: "right", fontWeight: 700, color: changeUp ? C.green : C.red }}>{pct(row.changePct)}</td>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 14, fontWeight: 900, textAlign: "right", color: C.text }}>{Number.isFinite(row.opportunityScore) ? Math.round(row.opportunityScore) : "—"}</td>
      <td style={{ padding: "9px 10px", textAlign: "right" }}><Badge text={Number.isFinite(row.riskScore) ? Math.round(row.riskScore) : "—"} color={RISK_COLOR[riskBand] || "textDim"} C={C} MONO={MONO} /></td>
      <td style={{ padding: "9px 10px" }}><Badge text={row.tournamentTier} color={TIER_COLOR[row.tournamentTier]} bg={TIER_BG[row.tournamentTier]} C={C} MONO={MONO} /></td>
      <td style={{ padding: "9px 10px", fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontWeight: 600 }}>{lifecycleLabelFor(row)}</td>
      <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12, textAlign: "right", fontWeight: 800, color: moveUp ? C.green : moveDown ? C.red : C.textDim }}>
        {moveUp ? "▲" : moveDown ? "▼" : "•"} {rankArrow(row.rankChange)}
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right" }}><Badge text={row.velocityLabel} color={VELOCITY_COLOR[row.velocityLabel]} C={C} MONO={MONO} /></td>
    </tr>
  );
}

const RISK_FILTERS = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const LIFECYCLE_FILTERS = [["ALL", "All"], ["ARMED", "Armed"], ["ENTER_NOW", "Enter Now"], ["EXTENDED", "Extended"]];

export default function Tournament500Panel({ onSelectSymbol, C, MONO, SANS }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [lifecycleFilter, setLifecycleFilter] = useState("ALL");
  const [detailSymbol, setDetailSymbol] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/tournament").then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d?.ok === false) { setError(d.error || "unavailable"); return; }
        setBoard(d);
        setError(null);
      }).catch((err) => { if (alive) setError(err.message); });
    };
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const filteredTop25 = useMemo(() => {
    if (!board?.top25) return [];
    return board.top25.filter((r) => {
      if (riskFilter !== "ALL" && RISK_BAND(r.riskScore) !== riskFilter) return false;
      if (lifecycleFilter !== "ALL") {
        const lc = lifecycleLabelFor(r);
        if (lifecycleFilter === "ARMED" && lc !== "ARMED") return false;
        if (lifecycleFilter === "ENTER_NOW" && lc !== "ENTER NOW") return false;
        if (lifecycleFilter === "EXTENDED" && lc !== "EXTENDED") return false;
      }
      return true;
    });
  }, [board, riskFilter, lifecycleFilter]);

  const select = (symbol) => { setDetailSymbol(symbol); if (onSelectSymbol) onSelectSymbol(symbol); };

  const styleBlock = (
    <style>{`
      .tourn-row { border-top: 1px solid ${C.border}; cursor: pointer; transition: background 0.12s ease; }
      .tourn-row:hover { background: ${C.accent}0f; }
      .tourn-filter-btn { transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
      .tourn-filter-btn:hover { border-color: ${C.accent} !important; }
      .tourn-chip { transition: transform 0.12s ease, border-color 0.12s ease; }
      .tourn-chip:hover { transform: translateY(-1px); border-color: ${C.accent} !important; }
      .tourn-icon-btn:hover { border-color: ${C.accent} !important; color: ${C.accent} !important; }
      .tourn-drawer { animation: tournSlideIn 0.22s ease; }
      @keyframes tournSlideIn { from { transform: translateX(24px); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
      .tourn-spin { display: inline-block; animation: tournSpin 0.9s linear infinite; }
      @keyframes tournSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .tourn-thead th { position: sticky; top: 0; z-index: 1; }
    `}</style>
  );

  if (error) return (
    <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.red, padding: 20, background: `${C.red}10`, border: `1px solid ${C.red}44`, borderRadius: 10 }}>⚠️ {error}</div>
  );
  if (!board) return (
    <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 24, textAlign: "center" }}>
      <span className="tourn-spin" style={{ fontSize: 18 }}>⟳</span>
      {styleBlock}
      <div style={{ marginTop: 8 }}>Loading real 500-stock tournament…</div>
    </div>
  );

  return (
    <div>
      {styleBlock}

      {/* HEADER — one compact strip, real stat cards instead of plain text */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: "0.01em" }}>🏆 500-STOCK TOURNAMENT</span>
        <StatCard label="Scanning" value={board.scanning} C={C} MONO={MONO} SANS={SANS} />
        <StatCard label="Qualified" value={board.qualified} C={C} MONO={MONO} SANS={SANS} />
        <StatCard label="Top 25" value={board.top25Count} C={C} MONO={MONO} SANS={SANS} />
        <StatCard label="Elite" value={board.eliteCount} accent="amber" C={C} MONO={MONO} SANS={SANS} />
        <StatCard
          label="Regime" value={board.marketRegime || "unavailable"}
          accent={board.marketRegime === "RISK_ON" ? "green" : board.marketRegime === "RISK_OFF" || board.marketRegime === "CRISIS" ? "red" : undefined}
          C={C} MONO={MONO} SANS={SANS}
        />
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginLeft: "auto" }}>
          {board.lastUpdate ? `Updated ${new Date(board.lastUpdate).toLocaleTimeString()}` : "Not yet scanned"}
        </span>
      </div>

      {/* FILTERS — two labeled segmented groups, minimal per spec */}
      <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, letterSpacing: "0.06em", marginRight: 2 }}>RISK</span>
          {RISK_FILTERS.map((r) => (
            <button key={r} className="tourn-filter-btn" onClick={() => setRiskFilter(r)} style={{ background: riskFilter === r ? C.accent : "transparent", color: riskFilter === r ? "#fff" : C.textDim, border: `1px solid ${riskFilter === r ? C.accent : C.border}`, borderRadius: 999, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>{r}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, letterSpacing: "0.06em", marginRight: 2 }}>LIFECYCLE</span>
          {LIFECYCLE_FILTERS.map(([key, label]) => (
            <button key={key} className="tourn-filter-btn" onClick={() => setLifecycleFilter(key)} style={{ background: lifecycleFilter === key ? C.accent : "transparent", color: lifecycleFilter === key ? "#fff" : C.textDim, border: `1px solid ${lifecycleFilter === key ? C.accent : C.border}`, borderRadius: 999, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* TOP 25 LEADERBOARD */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 560, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead className="tourn-thead">
            <tr style={{ background: C.card }}>
              {["RANK", "TICKER", "PRICE", "CHG%", "OPP", "RISK", "TIER", "STATE", "MOVE", "VELOCITY"].map((h) => (
                <th key={h} style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", textAlign: h === "TICKER" ? "left" : "right", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTop25.map((row) => <Row key={row.symbol} row={row} onSelect={select} C={C} MONO={MONO} SANS={SANS} />)}
          </tbody>
        </table>
        {!filteredTop25.length && <div style={{ padding: 20, fontFamily: SANS, fontSize: 12.5, color: C.textDim, textAlign: "center" }}>No real candidates match this filter right now.</div>}
      </div>

      {/* NEXT CHALLENGERS + RECENTLY DROPPED — side by side on wide screens */}
      <div style={{ display: "grid", gridTemplateColumns: (board.challengers?.length && board.dropZone?.length) ? "1fr 1fr" : "1fr", gap: 18 }}>
        {board.challengers?.length > 0 && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>
              NEXT CHALLENGERS <span style={{ color: C.textDim, fontWeight: 500 }}>#{board.top25Count + 1}–#{board.top25Count + board.challengers.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {board.challengers.map((c) => {
                const up = Number.isFinite(c.rankChange) && c.rankChange > 0;
                const down = Number.isFinite(c.rankChange) && c.rankChange < 0;
                return (
                  <div key={c.symbol} className="tourn-chip" onClick={() => select(c.symbol)} style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 11px", fontFamily: MONO, fontSize: 11.5 }}>
                    <b style={{ color: C.text }}>#{c.rank} {c.symbol}</b>
                    <span style={{ color: up ? C.green : down ? C.red : C.textDim, marginLeft: 6 }}>{up ? "▲" : down ? "▼" : "•"} {rankArrow(c.rankChange)}</span>
                    <span style={{ color: C.textDim, marginLeft: 6 }}>· {Math.round(c.opportunityScore)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {board.dropZone?.length > 0 && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>RECENTLY DROPPED</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {board.dropZone.map((d) => (
                <div key={d.symbol} style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, background: `${C.red}0a`, border: `1px solid ${C.red}22`, borderRadius: 8, padding: "6px 10px" }}>
                  <b style={{ color: C.text, fontFamily: MONO }}>{d.symbol}</b>{" "}
                  <span style={{ color: C.textDim }}>#{d.previousRank} → {d.currentRank ? `#${d.currentRank}` : "unranked"}</span>
                  <div style={{ marginTop: 2 }}>{d.reasons?.[0] ? asText(d.reasons[0]) : "Score declined."}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {detailSymbol && <DetailDrawer symbol={detailSymbol} onClose={() => setDetailSymbol(null)} C={C} MONO={MONO} SANS={SANS} />}
    </div>
  );
}
