import { useState, useEffect, useRef } from "react";
import { NUM } from "./theme.js";

// Trade-setup verdict banner (GO/WAIT/AVOID) + entry/stop/target stat boxes +
// the 8-point Minervini trend-template checklist, off the same
// /api/market/trend-template payload TrendChart consumes. Shared by
// DayTradeTab and MarketTerminalTab.
export default function TrendSetupPanel({ data, C, MONO, SANS }) {
  const [alertMsg, setAlertMsg] = useState("");
  const su = data && data.setup;
  const armAlert = (auto) => {
    fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: data.symbol, targetPrice: su.entry, direction: "above", requireVolume: true, note: "Minervini pivot breakout" }) })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setAlertMsg(d.error); return; }
        const already = d.deduped ? "already armed" : "Armed";
        setAlertMsg(`🔔 ${already} — you'll be alerted when ${data.symbol} breaks $${su.entry} on volume`);
      })
      .catch(e => setAlertMsg(e.message));
    if (!auto) setTimeout(() => setAlertMsg(""), 5000);
  };
  // Auto-arm — was previously a manual click only. Fires once per real
  // symbol+pivot combo (not on every re-render/poll refresh) via the ref
  // guard below; the new server-side dedup in routes/price-alerts.js
  // (added alongside this) means even a remount/revisit of the same
  // symbol never creates a duplicate alert or duplicate Telegram message.
  const armedFor = useRef(null);
  useEffect(() => {
    if (!su || !data?.symbol) return;
    const key = `${data.symbol}@${su.entry}`;
    if (armedFor.current === key) return;
    armedFor.current = key;
    armAlert(true);
  }, [data?.symbol, su?.entry]);
  if (!data || !data.setup) return null;
  const passN = Number(data.score) || 0;
  const vColor = su.verdict === "GO" ? "#0d9465" : su.verdict === "WAIT" ? "#d6a312" : "#c8282a";
  const bl = (() => {
    if (su.verdict === "GO") return `Buy candidate — ${passN}/8 pass and it's breaking out. Enter above ${su.entry} pivot, stop ${su.stop}.`;
    if (su.verdict === "WAIT" && passN >= 6) return `Strong trend (${passN}/8) but not at a buy point — wait for a break above ${su.entry} on volume.`;
    if (/Stage\s*4/i.test(data.stage || "")) return `Downtrend — ${8 - passN}/8 checks failing (below key MAs). Not a buy; wait to reclaim the averages.`;
    if (passN <= 5) return `Not in gear — ${passN}/8 pass. Avoid until the trend re-aligns.`;
    return su.verdictReason || `${passN}/8 — ${su.status}.`;
  })();
  const box = (label, val, col, sub) => (
    <div key={label} style={{ flex: "1 1 100px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px" }}>
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 22, fontWeight: 700, color: col || C.text, lineHeight: 1.1 }}>{val}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>{sub}</div>}
    </div>
  );
  const d = su.vcp && su.vcp.baseDepth != null ? Number(su.vcp.baseDepth) : null;
  const dCol = d == null ? C.text : d < 15 ? "#0d9465" : d < 25 ? "#5ab552" : d < 35 ? "#d6a312" : "#c8282a";
  const dSub = d == null ? "" : d < 15 ? "tight" : d < 25 ? "healthy" : d < 35 ? "wide" : "deep — low odds";
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.5,
        background: `${vColor}12`, border: `1px solid ${vColor}55`, borderLeft: `3px solid ${vColor}`, borderRadius: 8, padding: "9px 13px" }}>
        <b style={{ color: vColor }}>{su.verdict} · {data.stage}:</b> {bl}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Auto-armed on load (see the useEffect above) — this button is
            now a manual re-arm fallback for if that silently failed
            (network hiccup), not the only way to set the alert. */}
        <button onClick={() => armAlert(false)}
          title="Alert is set automatically — click to re-confirm/re-arm"
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
          🔔 Alert armed at pivot ${su.entry}
        </button>
        {alertMsg && <span style={{ fontFamily: MONO, fontSize: 11, color: alertMsg.includes("Armed") || alertMsg.includes("armed") ? "#0d9465" : "#c8282a" }}>{alertMsg}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {box("Entry (pivot)", "$" + su.entry, C.accent, `${su.abovePivotPct}% vs pivot`)}
        {box("Stop", "$" + su.stop, "#c8282a", `risk ${su.riskPct}%`)}
        {box("Target 1R", "$" + (Math.round((su.entry + (su.entry - su.stop)) * 100) / 100), "#5ab552", "+" + su.riskPct.toFixed(1) + "% · scale out")}
        {box("Target 2R", "$" + su.target2, "#0d9465", "+" + (su.riskPct * 2).toFixed(1) + "%")}
        {box("Target 3R", "$" + su.target3, "#0d9465", "+" + (su.riskPct * 3).toFixed(1) + "%")}
        {d != null && box("Base depth", d + "%", dCol, dSub)}
        {box("Breakout vol", su.volSurge + "×", su.volSurge >= 1.4 ? "#0d9465" : C.textDim, "need ≥1.4×")}
      </div>
      {Array.isArray(data.criteria) && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            MINERVINI TREND TEMPLATE · {passN}/8
          </div>
          {data.criteria.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 12px", borderTop: c.id > 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: c.pass ? "#0d9465" : "#c8282a", fontWeight: 800, fontFamily: SANS, fontSize: 13 }}>{c.pass ? "✓" : "✗"}</span>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.text }}>{c.label}</div>
                {c.value && <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{c.value}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
