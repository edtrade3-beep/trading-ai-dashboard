import { useEffect, useState } from "react";

// Sniper AI — a real, separate tab from Discover (2026-08-23, explicit
// user request: "separate sniper ai from discover tab but sniper ai lead
// to discover"). Shows Sniper's own real, narrow, hard-gated entry-timing
// verdict (ENTER_LONG/WAIT/NO_CHASE/AVOID, computeSniperDecision) over the
// same ~100-stock SCAN_UNIVERSE the Telegram /sniper command already
// scans — /api/market/sniper-scan reuses the exact same real
// rankSniperScan both callers now share, so this tab and Telegram's
// /sniper can never quietly disagree. Distinct from Discover
// (ScanTerminalHub.jsx), which shows a different, broader 9-tier quality
// vocabulary (ai-actions.js) — this is deliberately narrower: "should you
// press the button right now," not "is this a good business."
//
// "Leads to Discover": tapping a row hands the symbol off into
// ScanTerminalHub via the same real localStorage handoff convention every
// other cross-tab jump in this app already uses (mterminal_load_sym,
// scanhub_last_symbol), plus a one-shot scanhub_force_open flag so the
// detail panel opens immediately instead of requiring an extra tap.
export default function SniperAITab({ C, MONO, SANS, setActiveTab }) {
  const [data, setData] = useState(null); // { counts, results } | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/market/sniper-scan").then((res) => res.json());
      if (!r.ok) throw new Error(r.error || "Scan failed");
      setData(r);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openInDiscover = (symbol) => {
    try {
      localStorage.setItem("scanhub_last_symbol", symbol);
      localStorage.setItem("mterminal_load_sym", symbol);
      localStorage.setItem("scanhub_force_open", "1");
    } catch {}
    setActiveTab && setActiveTab("rhpro-scan");
  };

  const counts = data?.counts || { ENTER_LONG: 0, WAIT: 0, NO_CHASE: 0, AVOID: 0 };
  const results = data?.results || [];

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🔭 SNIPER AI</div>
          <button onClick={load} disabled={loading} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "⏳ Scanning…" : "↻ Refresh"}
          </button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Real hard-gated entry-timing verdict — the same signal Telegram's <code>/sniper</code> command and Cortex's Sniper Timing card use. Distinct from Discover's broader quality scan: this answers "should you press the button right now," not "is this a good business."
        </div>
      </div>

      {error && <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#c8282a", marginBottom: 14 }}>{error}</div>}

      {loading && !data && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: "30px 0" }}>
          Scanning the real ~100-stock universe…
        </div>
      )}

      {data && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, fontFamily: MONO, fontSize: 12 }}>
            <span style={{ color: "#0d9465", fontWeight: 800 }}>🟢 {counts.ENTER_LONG || 0} enter long</span>
            <span style={{ color: "#d6a312", fontWeight: 800 }}>🟡 {counts.WAIT || 0} wait</span>
            <span style={{ color: "#f97316", fontWeight: 800 }}>🟠 {counts.NO_CHASE || 0} no chase</span>
            <span style={{ color: "#c8282a", fontWeight: 800 }}>🔴 {counts.AVOID || 0} avoid</span>
            <span style={{ color: C.textDim, marginLeft: "auto" }}>{results.length} real stocks scanned</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map((r, i) => (
              <div key={r.symbol} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${r.meta.color}33`, borderLeft: `3px solid ${r.meta.color}`, borderRadius: 8, padding: "10px 12px" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, width: 24, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, width: 62 }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, width: 80 }}>{r.price != null ? `$${Number(r.price).toFixed(2)}` : "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: r.meta.color, width: 130 }}>{r.meta.icon} {r.meta.label.toUpperCase()}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, width: 60 }}>{r.passCount ?? "?"}/8</span>
                <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</span>
                <button onClick={() => openInDiscover(r.symbol)} style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>
                  🎯 Open in Discover
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
