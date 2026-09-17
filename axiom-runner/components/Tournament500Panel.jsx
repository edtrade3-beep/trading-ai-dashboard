import { useEffect, useState, useMemo } from "react";

// Tournament500Panel.jsx (2026-09-17, "500-Stock Tournament" master
// prompt) — a real CONSUMER of the existing canonical pipeline
// (src/tournament-engine.js), never a second scoring/risk engine. Every
// score/tier/lifecycle field shown here is the SAME real field every
// other Trade Desk surface reads off canonical-decision-pipeline.js — the
// only new thing this panel presents is real cross-symbol RANK and rank
// velocity over time (tournament-store.js), which nothing else in this
// app tracks. Slotted into the existing Deep Analysis dropdown per the
// user's own explicit recommendation, not a new sidebar tab.
const POLL_MS = 45_000;

const TIER_COLOR = { ELITE: "amber", GREAT: "green", STRONG: "green", GOOD: "amber", DEVELOPING: "textDim" };
const VELOCITY_COLOR = { ACCELERATING: "green", IMPROVING: "green", STABLE: "textDim", WEAKENING: "amber", FALLING: "red" };
const RISK_BAND = (score) => (!Number.isFinite(score) ? null : score <= 25 ? "LOW" : score <= 50 ? "MEDIUM" : score <= 75 ? "HIGH" : "CRITICAL");
const RISK_COLOR = { LOW: "green", MEDIUM: "amber", HIGH: "red", CRITICAL: "red" };
const LIFECYCLE_LABEL = { SCANNING: "SCANNING", SETUP_FORMING: "SETUP FORMING", ARMED: "ARMED", ENTER_NOW: "ENTER NOW", CANCELLED: "CANCELLED" };

function money(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }
function pct(v) { return Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—"; }
function rankArrow(change) {
  if (!Number.isFinite(change) || change === 0) return "→ 0";
  return change > 0 ? `↑ +${change}` : `↓ ${change}`;
}
// Defensive — never render a raw non-string contributor. The real root
// cause (redFlags being objects, not strings) is fixed server-side in
// tournament-engine.js/routes/tournament.js, but the persisted store can
// still hold entries written before that fix until each symbol's next
// real tick refreshes it; this guarantees the UI can never crash on
// stale data either way.
function asText(v) { return typeof v === "string" ? v : v == null ? "" : (v.reason || v.label || v.key || JSON.stringify(v)); }

function lifecycleLabelFor(row) {
  if (row.tier === "EXTENDED") return "EXTENDED";
  if (row.tier === "INVALIDATED") return "EXHAUSTED";
  return LIFECYCLE_LABEL[row.signalState] || row.signalState || "—";
}

function ScoreRow({ label, value, C, MONO, SANS }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{Number.isFinite(value) ? Math.round(value) : "unavailable"}</span>
    </div>
  );
}

function DetailDrawer({ symbol, onClose, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/market/tournament/detail?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false) { setError(d.error || "unavailable"); return; }
      setData(d);
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [symbol]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: "min(420px, 100%)", height: "100%", background: C.card, borderLeft: `1px solid ${C.border}`, padding: 18, overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>{symbol}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {error && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>{error}</div>}
        {!data && !error && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading real detail…</div>}
        {data && (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>OPPORTUNITY</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>{Number.isFinite(data.opportunityScore) ? Math.round(data.opportunityScore) : "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>RISK</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C[RISK_COLOR[data.riskLevel]] || C.text }}>{Number.isFinite(data.riskScore) ? Math.round(data.riskScore) : "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>RANK</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>{data.currentRank ? `#${data.currentRank}` : "unranked"}</div>
              </div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginBottom: 12 }}>
              State: <b>{lifecycleLabelFor(data)}</b> · Stage: {data.opportunityStage || "—"}
            </div>

            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginTop: 10, marginBottom: 6 }}>WHY IT IS RANKED HERE</div>
            {(data.positiveContributors || []).length > 0 ? (data.positiveContributors.slice(0, 3).map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.green, marginBottom: 3 }}>+ {asText(r)}</div>
            ))) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real positive factors recorded.</div>}
            {(data.negativeContributors || []).length > 0 && data.negativeContributors.slice(0, 3).map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 3 }}>− {asText(r)}</div>
            ))}

            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginTop: 14, marginBottom: 4 }}>SCORE BREAKDOWN</div>
            <ScoreRow label="Trend" value={data.trendScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Momentum" value={data.momentumScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Volume" value={data.volumeScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Relative Strength" value={data.relativeStrengthScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Catalyst" value={data.catalystScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Fundamental" value={data.fundamentalScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Valuation" value={data.valuationScore} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Entry Quality" value={data.entryQualityScore} C={C} MONO={MONO} SANS={SANS} />

            {(data.riskContributors || []).length > 0 && (
              <>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginTop: 14, marginBottom: 4 }}>RISK FACTORS</div>
                {data.riskContributors.map((c, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 3 }}>• {asText(c)} <span style={{ color: C.text }}>(+{Number.isFinite(c?.points) ? c.points : "—"})</span></div>
                ))}
              </>
            )}

            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginTop: 14, marginBottom: 4 }}>TRADE STRUCTURE</div>
            <ScoreRow label="Entry Zone" value={data.entryZone} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Invalidation" value={data.invalidation} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Stop" value={data.stop} C={C} MONO={MONO} SANS={SANS} />
            <ScoreRow label="Target" value={data.target} C={C} MONO={MONO} SANS={SANS} />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, padding: "3px 0" }}>
              <span style={{ color: C.textDim }}>Risk/Reward</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{Number.isFinite(data.riskReward) ? `${data.riskReward.toFixed(1)}:1` : "unavailable"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ row, onSelect, C, MONO, SANS }) {
  return (
    <tr onClick={() => onSelect(row.symbol)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{row.tierIcon} #{row.rank}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{row.symbol}{row.isEarlyDiscovery ? " 🌱" : ""}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, textAlign: "right" }}>{money(row.price)}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: (row.changePct || 0) >= 0 ? C.green : C.red }}>{pct(row.changePct)}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 13, fontWeight: 800, textAlign: "right", color: C.text }}>{Number.isFinite(row.opportunityScore) ? Math.round(row.opportunityScore) : "—"}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: C[RISK_COLOR[RISK_BAND(row.riskScore)]] || C.textDim }}>{Number.isFinite(row.riskScore) ? Math.round(row.riskScore) : "—"}</td>
      <td style={{ padding: "6px 8px", fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: C[TIER_COLOR[row.tournamentTier]] || C.textDim }}>{row.tournamentTier}</td>
      <td style={{ padding: "6px 8px", fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{lifecycleLabelFor(row)}</td>
      <td style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 11.5, textAlign: "right", color: C[VELOCITY_COLOR[row.velocityLabel]] || C.textDim }}>{rankArrow(row.rankChange)}</td>
      <td style={{ padding: "6px 8px", fontFamily: SANS, fontSize: 9.5, color: C[VELOCITY_COLOR[row.velocityLabel]] || C.textDim, textAlign: "right" }}>{row.velocityLabel}</td>
    </tr>
  );
}

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
        if (lifecycleFilter === "EARLY" && r.opportunityStage !== "EARLY" && r.opportunityStage !== "DEVELOPING") return false;
        if (lifecycleFilter === "ARMED" && lc !== "ARMED") return false;
        if (lifecycleFilter === "ENTER_NOW" && lc !== "ENTER NOW") return false;
        if (lifecycleFilter === "EXTENDED" && lc !== "EXTENDED") return false;
      }
      return true;
    });
  }, [board, riskFilter, lifecycleFilter]);

  const select = (symbol) => { setDetailSymbol(symbol); if (onSelectSymbol) onSelectSymbol(symbol); };

  if (error) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, padding: 14 }}>{error}</div>;
  if (!board) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 14 }}>Loading real 500-stock tournament…</div>;

  return (
    <div>
      {/* HEADER — section 15: no unnecessary cards, one compact strip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>🏆 500-STOCK TOURNAMENT</span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Scanning: <b style={{ color: C.text }}>{board.scanning}</b></span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Qualified: <b style={{ color: C.text }}>{board.qualified}</b></span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Top 25: <b style={{ color: C.text }}>{board.top25Count}</b></span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Elite: <b style={{ color: C.text }}>{board.eliteCount}</b></span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Regime: <b style={{ color: C.text }}>{board.marketRegime || "unavailable"}</b></span>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginLeft: "auto" }}>{board.lastUpdate ? `Updated ${new Date(board.lastUpdate).toLocaleTimeString()}` : "Not yet scanned"}</span>
      </div>

      {/* FILTERS — section 13: minimal, only 2 real ones (both backed by real fields) */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((r) => (
          <button key={r} onClick={() => setRiskFilter(r)} style={{ background: riskFilter === r ? C.accent : C.card, color: riskFilter === r ? "#fff" : C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>{r === "ALL" ? "RISK: ALL" : r}</button>
        ))}
        {[["ALL", "ALL"], ["ARMED", "ARMED"], ["ENTER_NOW", "ENTER NOW"], ["EXTENDED", "EXTENDED"]].map(([key, label]) => (
          <button key={key} onClick={() => setLifecycleFilter(key)} style={{ background: lifecycleFilter === key ? C.accent : C.card, color: lifecycleFilter === key ? "#fff" : C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {/* TOP 25 LEADERBOARD */}
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.card }}>
              {["RANK", "TICKER", "PRICE", "CHG%", "OPP", "RISK", "TIER", "STATE", "MOVE", "VELOCITY"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: h === "TICKER" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTop25.map((row) => <Row key={row.symbol} row={row} onSelect={select} C={C} MONO={MONO} SANS={SANS} />)}
          </tbody>
        </table>
        {!filteredTop25.length && <div style={{ padding: 14, fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real candidates match this filter right now.</div>}
      </div>

      {/* NEXT CHALLENGERS — section 11 */}
      {board.challengers?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>NEXT CHALLENGERS (#{board.top25Count + 1}–#{board.top25Count + board.challengers.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {board.challengers.map((c) => (
              <div key={c.symbol} onClick={() => select(c.symbol)} style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontFamily: MONO, fontSize: 11 }}>
                <b style={{ color: C.text }}>#{c.rank} {c.symbol}</b>{" "}
                <span style={{ color: C[VELOCITY_COLOR[c.velocityLabel]] || C.textDim }}>{rankArrow(c.rankChange)}</span>{" "}
                <span style={{ color: C.textDim }}>Score {Math.round(c.opportunityScore)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENTLY DROPPED — section 12 */}
      {board.dropZone?.length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>RECENTLY DROPPED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {board.dropZone.map((d) => (
              <div key={d.symbol} style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>
                <b style={{ color: C.text, fontFamily: MONO }}>{d.symbol}</b> #{d.previousRank} → {d.currentRank ? `#${d.currentRank}` : "unranked"} — {d.reasons?.[0] ? asText(d.reasons[0]) : "Score declined."}
              </div>
            ))}
          </div>
        </div>
      )}

      {detailSymbol && <DetailDrawer symbol={detailSymbol} onClose={() => setDetailSymbol(null)} C={C} MONO={MONO} SANS={SANS} />}
    </div>
  );
}
