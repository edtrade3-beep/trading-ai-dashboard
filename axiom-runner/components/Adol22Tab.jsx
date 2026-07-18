export default function Adol22Tab({ C, MONO, SANS }) {
  const [scanning,  setScanning]  = React.useState(false);
  const [lastScan,  setLastScan]  = React.useState(null);
  const [status,    setStatus]    = React.useState("idle");
  const [history,   setHistory]   = React.useState([]);
  const [statusData, setStatusData] = React.useState(null);

  const loadHistory = React.useCallback(() => {
    fetch("/api/adol22/status")
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setStatusData(d.lastResult);
          setHistory(d.history || []);
          if (d.lastScan) setLastScan(new Date(d.lastScan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }
      }).catch(() => {});
  }, []);

  React.useEffect(() => { loadHistory(); }, [loadHistory]);

  const triggerScan = async () => {
    setScanning(true);
    setStatus("running");
    try {
      const r = await fetch("/api/adol22/scan", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setLastScan(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setTimeout(() => { setStatus("done"); loadHistory(); }, 45000);
      }
    } catch { setStatus("error"); }
    finally { setScanning(false); }
  };

  const PATTERNS_BULL = ["Bullish Engulfing","Hammer","Breakout Candle","Inside Bar Breakout","Morning Star"];
  const PATTERNS_BEAR = ["Bearish Engulfing","Shooting Star","Breakdown Candle","Inside Bar Breakdown","Evening Star"];
  const CONFIRMS = ["VWAP position","EMA 9 vs 21","Volume spike","1h trend","SPY/QQQ direction","VIX level","5m confirmation"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🔴 ADOL22 MARKET SCANNER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Multi-timeframe candle pattern scanner · 85%+ confidence only · Market hours only
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {lastScan && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Last: {lastScan}</span>}
          <button onClick={triggerScan} disabled={scanning}
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 20px", borderRadius: 8,
              border: "none", cursor: scanning ? "default" : "pointer",
              background: scanning ? C.surface : C.red, color: scanning ? C.textDim : "#fff" }}>
            {scanning ? "⏳ Scanning…" : "🔍 SCAN NOW"}
          </button>
        </div>
      </div>

      {/* Status */}
      {status === "running" && (
        <div style={{ padding: "10px 14px", background: `${C.amber}12`, border: `1px solid ${C.amber}33`,
          borderRadius: 8, fontFamily: SANS, fontSize: 13, color: C.amber }}>
          ⏳ Scanner running… Checking 35 symbols across 15m / 1h / 5m timeframes. Results sent to Telegram.
        </div>
      )}
      {status === "done" && (
        <div style={{ padding: "10px 14px", background: `${C.green}12`, border: `1px solid ${C.green}33`,
          borderRadius: 8, fontFamily: SANS, fontSize: 13, color: C.green }}>
          ✅ Scan complete — check Telegram for A+ signals (85%+ confidence only)
        </div>
      )}

      {/* How it works */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: `${C.green}0c`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 8, letterSpacing: "0.08em" }}>
            🟢 BULLISH PATTERNS
          </div>
          {PATTERNS_BULL.map(p => (
            <div key={p} style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginBottom: 4 }}>• {p}</div>
          ))}
        </div>
        <div style={{ background: `${C.red}0c`, border: `1px solid ${C.red}33`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 8, letterSpacing: "0.08em" }}>
            🔴 BEARISH PATTERNS
          </div>
          {PATTERNS_BEAR.map(p => (
            <div key={p} style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginBottom: 4 }}>• {p}</div>
          ))}
        </div>
      </div>

      {/* Confirmation signals */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 10, letterSpacing: "0.08em" }}>
          ✅ 7 CONFIRMATION SIGNALS (need 85%+ to fire)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CONFIRMS.map((c, i) => (
            <span key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.text,
              background: C.surface, borderRadius: 6, padding: "4px 10px",
              border: `1px solid ${C.border}` }}>
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Schedule */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 8, letterSpacing: "0.08em" }}>
          ⏱ SCAN SCHEDULE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Frequency",   "Every 15 minutes"],
            ["Hours",       "9:30 AM – 4:00 PM ET"],
            ["Days",        "Monday – Friday only"],
            ["Threshold",   "85%+ confidence only"],
            ["Cooldown",    "1 hour per symbol per direction"],
            ["Skip if",     "VIX > 40 or market choppy"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, flexShrink: 0, minWidth: 80 }}>{k}:</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Output format preview */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 8, letterSpacing: "0.08em" }}>
          📱 TELEGRAM ALERT FORMAT
        </div>
        <pre style={{ fontFamily: MONO, fontSize: 11, color: C.text, background: C.surface,
          padding: "12px 14px", borderRadius: 8, overflowX: "auto", margin: 0, lineHeight: 1.7 }}>
{`🚨 ADOL22 A+ SIGNAL

Direction: BULLISH 🟢
Ticker: AMD
Pattern: Bullish Engulfing
Entry: $164.20
Stop: $161.80
Target 1: $168.00
Target 2: $171.50
Confidence: 88%

Reason:
Above VWAP · EMA 9 > EMA 21 ✅ · Volume spike 2.1x
1h trend bullish · Market confirms (SPY up)

VWAP: $163.40  EMA9: $163.80  EMA21: $162.50
━━━━━━━━━━━━━━━━━━━━
⚠️ Not financial advice. Manage risk.`}
        </pre>
      </div>

      {/* Live signal history */}
      {history.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 10 }}>
            📋 RECENT SIGNALS ({history.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h, i) => {
              const isBull = h.type === "BULL";
              const col = isBull ? C.green : C.red;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 8, background: `${col}0c`, border: `1px solid ${col}33` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{isBull ? "🟢" : "🔴"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: col }}>{h.sym}</span>
                      <span style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{h.pattern}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: col,
                        background: `${col}18`, borderRadius: 4, padding: "1px 7px" }}>{h.confidence}%</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                      Entry ${ h.price} · {h.savedAt ? new Date(h.savedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }) + " ET" : ""}
                    </div>
                    {h.reasons && (
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                        {h.reasons.slice(0, 3).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current market context */}
      {statusData && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 8 }}>
            📊 LAST SCAN CONTEXT
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: (statusData.spyChg||0) >= 0 ? C.green : C.red }}>
              SPY {(statusData.spyChg||0) >= 0 ? "+" : ""}{(statusData.spyChg||0).toFixed(2)}%
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: (statusData.vix||18) > 25 ? C.red : (statusData.vix||18) > 18 ? C.amber : C.green }}>
              VIX {statusData.vix||"—"}
            </span>
            {statusData.bull && (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>
                🟢 Bull: {statusData.bull.sym} {statusData.bull.confidence}%
              </span>
            )}
            {statusData.bear && (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>
                🔴 Bear: {statusData.bear.sym} {statusData.bear.confidence}%
              </span>
            )}
            {!statusData.bull && !statusData.bear && (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>NO A+ SETUP — WAIT</span>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "10px 14px", background: `${C.amber}10`, border: `1px solid ${C.amber}33`,
        borderRadius: 8, fontFamily: SANS, fontSize: 12, color: C.amber }}>
        💡 Auto-scans every 15 min during market hours · Telegram: /adol22 scan · /adol22 for history
      </div>
    </div>
  );
}
