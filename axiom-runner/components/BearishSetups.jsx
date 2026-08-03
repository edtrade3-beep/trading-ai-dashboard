import { useState, useEffect } from "react";
import { computeRegime } from "./market-helpers.js";

// Best Bearish Setups Now — the real counterpart to BestOpportunities
// (terminal-panels.jsx): "market is bullish -> what to buy" already had a
// dedicated, prominent screen; "market is bearish -> what to short" did not
// (explicit user request, 2026-08-03: "when market is down what stocks to
// short"). Confirmed via AskUserQuestion: puts, not equity shorts — this
// app's long-only guardrail (src/routes/alpaca.js, real "Shorting disabled"
// block) stays intact; bearish conviction here means real put-buying
// candidates, defined risk (max loss = premium), not unlimited-risk shorts.
//
// Reuses an already-real, already-computed, already-server-cached (60s)
// engine that was virtually invisible before this — /api/market/trade-
// signals (src/routes/market.js) scores a real ~48-symbol universe on
// MA trend + day momentum + RVOL + 52w position + VIX regime, and already
// classifies each into LONG / SHORT / AVOID / WATCH / WATCH SHORT with real
// entry/stop/target1/target2/R:R and a real IV-aware option recommendation
// (BUY PUTS / SELL CALLS / PUTS or SHORT, with strike/expiry/premium/
// contracts). Before this, its only UI surface was a 9px badge on up to 8
// Watchlist rows (DashboardTab.jsx's WatchlistCard) — no dedicated,
// browsable screen existed. This is that screen, mirroring
// BestOpportunities' own UI pattern for consistency.
//
// Deliberately uses its own ~48-symbol universe (trade-signals' own,
// pre-existing) rather than the app's main 100-symbol SCAN_UNIVERSE — that
// divergence already existed before this component and isn't silently
// reconciled here; flagging it rather than guessing which one should win.
export function BearishSetups({ C, MONO, SANS, onPick, macroData, setActiveTab }) {
  const [sigData, setSigData] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ok | err
  const [lastScan, setLastScan] = useState(0);
  const seenShortRef = useState(() => new Set())[0];

  const regime = computeRegime(macroData);
  const marketWeak = regime.score < 45;

  const scan = () => {
    setState(s => s === "ok" ? "ok" : "loading");
    fetch("/api/market/trade-signals")
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setState(s => s === "ok" ? "ok" : "err"); return; }
        setSigData(d);
        setState("ok");
        setLastScan(Date.now());
      })
      .catch(() => setState(s => s === "ok" ? "ok" : "err"));
  };

  useEffect(() => {
    const kick = setTimeout(scan, 1800);
    const t = setInterval(scan, 60_000); // matches the route's own 60s server cache — no point polling faster
    return () => { clearTimeout(kick); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = (sigData?.signals || []);
  const shortRows = all.filter(s => s.action === "SHORT / AVOID");
  const watchRows = all.filter(s => s.action === "WATCH SHORT");
  shortRows.forEach(r => { if (!seenShortRef.has(r.sym)) seenShortRef.add(r.sym); });

  const confColor = (c) => c === "HIGH" ? "#8f1c1e" : c === "MEDIUM" ? "#c8282a" : "#d6a312";

  const pushTelegram = (r, btn) => {
    const defaultTitle = `Send ${r.sym}'s real current bearish setup to your Telegram right now`;
    const lines = [
      `📉 ${r.sym} — $${r.entry.toFixed(2)} (${r.chgPct >= 0 ? "+" : ""}${r.chgPct.toFixed(2)}%)`,
      `Signal: ${r.action} (${r.confidence}) · Score ${r.score}/100`,
      r.optDetail ? r.optDetail.tradeStr : (r.optionType || ""),
      `Stop $${r.stop} · T1 $${r.target1} · T2 $${r.target2} · R:R ${r.rr}:1`,
      r.rationale?.length ? r.rationale.join(" · ") : "",
    ].filter(Boolean);
    btn.textContent = "…sending";
    const shortReason = (err) => {
      if (!err) return "✗ failed";
      if (/unauthorized/i.test(err)) return "✗ no API token";
      if (/rate limited/i.test(err)) return "✗ rate limited";
      if (/daily/i.test(err)) return "✗ daily cap hit";
      if (/not configured/i.test(err)) return "✗ Telegram not set up";
      if (/rejected/i.test(err)) return "✗ Telegram rejected it";
      return "✗ failed";
    };
    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) })
      .then(res => res.json())
      .then(d => {
        btn.textContent = d?.ok ? "✓ sent" : shortReason(d?.error);
        btn.title = d?.ok ? defaultTitle : (d?.error || "Send failed — see server logs.");
      })
      .catch(() => { btn.textContent = "✗ network error"; btn.title = "Network error reaching the server."; })
      .finally(() => { setTimeout(() => { btn.textContent = "✈ TELEGRAM"; btn.title = defaultTitle; }, 5000); });
  };

  const planHandoff = (sym) => {
    try { localStorage.setItem("tradeplanner_load_sym", sym); } catch {}
    setActiveTab && setActiveTab("tradeplanner");
  };

  const Row = ({ r, dim }) => (
    <div key={r.sym} onClick={() => onPick && onPick(r.sym)}
      style={{ marginBottom: 8, padding: "11px 12px", cursor: "pointer", borderRadius: 10,
        background: C.bg, border: `1px solid ${dim ? C.border : "#c8282a55"}`, opacity: dim ? 0.85 : 1 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px", minWidth: 180 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 17, fontWeight: 900, color: C.text }}>{r.sym}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#c8282a" }}>
              ${r.entry.toFixed(2)} {r.chgPct >= 0 ? "+" : ""}{r.chgPct.toFixed(1)}%
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff", background: confColor(r.confidence), borderRadius: 5, padding: "2px 8px" }}>
              {dim ? "WATCH SHORT" : "PUT BUY"} · {r.confidence}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>R:R {r.rr}:1</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {r.rationale?.slice(0, 2).join(" · ") || `${r.chgPct.toFixed(1)}% weakness`}
          </div>
          {r.optDetail && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#c8282a", marginTop: 4, fontWeight: 700 }}>
              {r.optDetail.tradeStr}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap" }}>
          <div style={{ color: "#c8282a" }}>Stop ${r.stop}</div>
          <div style={{ color: "#0d9465" }}>T1 ${r.target1}</div>
          <div style={{ color: "#0d9465" }}>T2 ${r.target2}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); pushTelegram(r, e.currentTarget); }}
          title={`Send ${r.sym}'s real current bearish setup to your Telegram right now`}
          style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 800, border: `1px solid ${C.accent}55`, background: `${C.accent}18`, color: C.accent, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
          ✈ TELEGRAM
        </button>
        <button onClick={(e) => { e.stopPropagation(); planHandoff(r.sym); }}
          title={`Plan this trade — opens Trade Planner for ${r.sym}`}
          style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 800, border: `1px solid #c8282a`, background: "#c8282a14", color: "#c8282a", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
          🎯 Plan
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 14, border: `2px solid #c8282a`, borderRadius: 12, background: "#c8282a0a", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 900, color: C.text }}>Best Bearish Setups Now</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#c8282a", display: "inline-block" }} /> Auto-scans every 60s</span>
            {lastScan ? ` · updated ${Math.round((Date.now() - lastScan) / 1000) < 60 ? "just now" : Math.round((Date.now() - lastScan) / 60000) + "m ago"}` : ""}
          </div>
        </div>
        <button onClick={scan} disabled={state === "loading"}
          style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, padding: "10px 20px", borderRadius: 10, cursor: state === "loading" ? "wait" : "pointer",
            border: "none", background: "#c8282a", color: "#fff" }}>
          {state === "loading" && !sigData ? "Scanning market…" : "↻ Rescan now"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: `${regime.color}14`, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: regime.color }}>MARKET: {regime.label} {regime.score}/100</span>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>
          {marketWeak ? "⚠️ Weak market — breakdowns more likely to work." : "Market's still strong — puts fight the trend here; be selective."}
        </span>
      </div>
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: "#c8282a", padding: "12px 16px" }}>⚠ Scan failed — try again.</div>}
      {state === "ok" && !shortRows.length && !watchRows.length && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, padding: "12px 16px" }}>No real bearish setups right now — nothing in the scanned universe is showing clean breakdown conviction.</div>
      )}
      {(shortRows.length > 0 || watchRows.length > 0) && (
        <div style={{ padding: "10px 12px 12px" }}>
          {shortRows.slice(0, 5).map(r => <Row key={r.sym} r={r} />)}
          {watchRows.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, textTransform: "uppercase", margin: "10px 4px 6px" }}>
                Developing weakness — not confirmed yet
              </div>
              {watchRows.slice(0, 4).map(r => <Row key={r.sym} r={r} dim />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
