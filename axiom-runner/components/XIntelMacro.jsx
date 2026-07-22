import RiskTrafficLight from "./RiskTrafficLight.jsx";

// MACRO — Module 7. Does NOT build a new macro scorer — embeds the real
// existing one (src/market-scanner.js computeMacroRegime, rendered here via
// RiskTrafficLight.jsx), extended this session with oil (USO) and bitcoin
// (BTC-USD) inputs to close the spec's gap versus what it already tracked
// (SPY/QQQ/IWM, bonds, credit, VIX, dollar, gold, EM, cyclicals-vs-
// defensives). A third parallel heatmap/macro widget is explicitly out of
// scope per the approved plan — this cross-links the real one instead.
export default function XIntelMacro({ C, MONO, SANS, macroData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, background: `${C.textDim}0a`, borderRadius: 8, padding: "8px 12px" }}>
        Real macro composite from src/market-scanner.js's computeMacroRegime — SPY/QQQ/IWM, TLT/IEF bonds, HYG credit, UVXY vol, UUP dollar, GLD gold, EEM, XLY-vs-XLP cyclicals, plus oil (USO) and bitcoin (BTC-USD) added this session.
      </div>
      <RiskTrafficLight C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
    </div>
  );
}
