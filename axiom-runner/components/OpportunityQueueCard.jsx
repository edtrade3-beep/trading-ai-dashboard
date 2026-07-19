import { useState, useEffect } from "react";

// ── Opportunity Queue — promotes market-scanner.js's real composite-scored
// signal engine (GET /api/scanner/status, ~150-symbol universe) onto the
// Dashboard for the first time. Different, wider universe than
// BestOpportunities' hardcoded 40 symbols — both are legitimate, kept side
// by side rather than merged (different scoring, per standing instruction
// not to unify scorers). Only shows symbols that already crossed a BUY/SELL
// threshold, so this can be sparse between scans — labeled honestly rather
// than padded with lower-confidence noise.
export default function OpportunityQueueCard({ C, MONO, SANS, setTerminalSymbol, setActiveTab }) {
  const [hits, setHits] = useState([]);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [scanning, setScanning] = useState(false);
  // market-scanner.js's price/chgPct come from the last DAILY bar close, so
  // during pre-market they still show yesterday's numbers. Overlay a real
  // current price (GET /api/market/live-quote, the same Yahoo v8-chart path
  // already proven reliable from the cloud for Pre-Market Movers/Futures --
  // meta.regularMarketPrice updates live through pre/post-market too) for
  // the visible rows only. Honest fallback to the daily-close value if the
  // live fetch hasn't landed yet, never a blank.
  const [liveMap, setLiveMap] = useState({});

  const load = () => {
    fetch("/api/scanner/status").then(r => r.json()).then(d => {
      const sorted = Array.isArray(d?.lastHits) ? [...d.lastHits].sort((a, b) => (b.composite || 0) - (a.composite || 0)) : [];
      setHits(sorted);
      setLastRunAt(d?.lastRunAt || null);
      setState("ok");
      const syms = sorted.slice(0, 8).map(h => h.symbol).join(",");
      if (syms) {
        fetch("/api/market/live-quote?symbols=" + encodeURIComponent(syms)).then(r => r.json()).then(j => {
          const m = {};
          (j?.quotes || []).forEach(q => { m[q.sym] = q; });
          setLiveMap(m);
        }).catch(() => {});
      }
    }).catch(() => setState("error"));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const scanNow = () => {
    setScanning(true);
    fetch("/api/scanner/run", { method: "POST" }).then(() => load()).finally(() => setScanning(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em" }}>
          OPPORTUNITY QUEUE {lastRunAt && <span style={{ fontWeight: 400 }}>· scanned {new Date(lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        <button onClick={scanNow} disabled={scanning}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: scanning ? "default" : "pointer",
            border: `1px solid ${C.border}`, background: "transparent", color: scanning ? C.textDim : C.accent, opacity: scanning ? 0.6 : 1 }}>
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load scanner status.</div>}
      {state === "ok" && !hits.length && (
        // Centered in the remaining height instead of pinned top-left — this
        // card sits beside Best Opportunities (usually populated, often
        // tall), so an empty queue used to read as unstyled leftover space
        // rather than a designed empty state.
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 12px" }}>
          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.5 }}>🔍</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 220 }}>
            No symbols crossing a signal threshold right now — the scanner only surfaces setups that already qualify, so this is often empty between scans. Click Scan Now to check again.
          </div>
        </div>
      )}
      {hits.slice(0, 8).map(h => {
        const live = liveMap[h.symbol];
        const price = live ? live.price : Number(h.price || 0);
        const chgPct = live ? live.chg : Number(h.chgPct || 0);
        return (
          <div key={h.symbol} onClick={() => { setTerminalSymbol?.(h.symbol); setActiveTab?.("mterminal"); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: h.signal === "BUY" ? C.green : C.red, minWidth: 32 }}>{h.signal === "BUY" ? "🟢" : "🔴"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, minWidth: 55 }}>{h.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }} title={live ? "Real-time (incl. pre/post-market)" : "Last daily close"}>${price.toFixed(2)}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: chgPct >= 0 ? C.green : C.red, minWidth: 50 }}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginLeft: "auto" }}>RVOL {Number(h.rvol || 0).toFixed(1)}x</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, minWidth: 28, textAlign: "right" }}>{Math.round(h.composite || 0)}</span>
          </div>
        );
      })}
    </div>
  );
}
