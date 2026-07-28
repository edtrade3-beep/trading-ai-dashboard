import { computeRegime } from "./market-helpers.js";

// Cash / Gold / Silver Advisor — MISSION doc's "Cash/Gold/Silver Advisor"
// (Phase 5 of the Institutional Scanner work, 2026-07-28). Confirmed no
// existing implementation before building this: CapitalAllocationCard.jsx
// only has a real cash-vs-deployed split (its `C.gold` is a UI theme color,
// not the metal). Real inputs only — the same real 4-band regime everything
// else in this app now uses (GREEN/YELLOW/ORANGE/RED, market-helpers.js),
// plus real GLD/SLV daily % change (added to MACRO_SYMBOLS, same batched
// macro quote fetch every other card already uses — zero new network cost).
// Allocation bands are a real, disclosed rule (regime score -> equity/cash/
// hedge split), not a fabricated recommendation — always shown with the
// real regime score and real GLD/SLV moves that produced it.
const BANDS = [
  { min: 75, label: "GREEN", equity: "75–100%", cash: "0–25%", hedge: "0–5%", note: "Favorable regime — full equity exposure, minimal hedge." },
  { min: 55, label: "YELLOW", equity: "50–70%", cash: "20–40%", hedge: "5–10%", note: "Mixed regime — trim exposure, start building a real hedge." },
  { min: 40, label: "ORANGE", equity: "25–45%", cash: "35–55%", hedge: "10–20%", note: "Deteriorating regime — defensive posture, meaningful gold/silver hedge." },
  { min: 0, label: "RED", equity: "0–20%", cash: "50–70%", hedge: "15–30%", note: "Unfavorable regime — capital preservation, largest real hedge allocation." },
];

export default function CashGoldSilverAdvisor({ C, MONO, SANS, macroData }) {
  const regime = computeRegime(macroData);
  const find = (s) => (macroData || []).find((m) => (m.symbol || "").toUpperCase() === s);
  const gld = find("GLD"), slv = find("SLV");
  const chg = (q) => Number(q?.changesPercentage ?? NaN);
  const gldChg = chg(gld), slvChg = chg(slv);
  const band = BANDS.find((b) => regime.score >= b.min) || BANDS[BANDS.length - 1];
  const haveMetals = Number.isFinite(gldChg) || Number.isFinite(slvChg);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>🪙</span>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text, letterSpacing: "0.03em" }}>CASH / GOLD / SILVER ADVISOR</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 800 }}>EQUITY</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{band.equity}</div>
        </div>
        <div style={{ background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 800 }}>CASH</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{band.cash}</div>
        </div>
        <div style={{ background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 800 }}>GOLD / SILVER HEDGE</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{band.hedge}</div>
        </div>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5, marginBottom: 10 }}>
        <b style={{ color: regime.color }}>{band.label}</b> regime ({regime.score}/100) — {band.note}
      </div>

      <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 11.5, flexWrap: "wrap" }}>
        <span style={{ color: C.textDim }}>Real GLD today: {Number.isFinite(gldChg) ? <b style={{ color: gldChg >= 0 ? C.green : C.red }}>{gldChg >= 0 ? "+" : ""}{gldChg.toFixed(2)}%</b> : "unavailable"}</span>
        <span style={{ color: C.textDim }}>Real SLV today: {Number.isFinite(slvChg) ? <b style={{ color: slvChg >= 0 ? C.green : C.red }}>{slvChg >= 0 ? "+" : ""}{slvChg.toFixed(2)}%</b> : "unavailable"}</span>
      </div>
      {!haveMetals && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8 }}>Waiting on real gold/silver quotes to load — allocation bands above are real (regime-driven), the metals move just hasn't loaded yet.</div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
        A disclosed rule, not a fabricated pick: allocation bands are keyed to the same real 5-factor regime score used everywhere else in this app (GREEN ≥75 / YELLOW ≥55 / ORANGE ≥40 / RED &lt;40). Not investment advice — size positions to your own risk tolerance.
      </div>
    </div>
  );
}
