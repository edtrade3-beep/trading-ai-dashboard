export default function QuickLogModal({ C, MONO, quickLogModal, setQuickLogModal }) {
  if (!quickLogModal) return null;
  return (
        <div onClick={() => setQuickLogModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.58)", zIndex: 1350, display: "grid", placeItems: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: "94vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.30)", padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: MONO, fontSize: 17, color: C.text, fontWeight: 800 }}>{quickLogModal.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginLeft: 10 }}>${Number(quickLogModal.price).toFixed(2)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: quickLogModal.chg >= 0 ? C.green : C.red, marginLeft: 8, fontWeight: 700 }}>{quickLogModal.chg >= 0 ? "+" : ""}{quickLogModal.chg.toFixed(2)}%</span>
                {quickLogModal.score > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 10 }}>Score {Math.round(quickLogModal.score)}</span>}
              </div>
              <button onClick={() => setQuickLogModal(null)} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>

            {/* BUY / SELL toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["BUY", "SELL"].map(s => (
                <button key={s} onClick={() => setQuickLogModal(m => ({ ...m, side: s }))}
                  style={{ flex: 1, border: `1px solid ${s === "BUY" ? C.green : C.red}66`, background: quickLogModal.side === s ? (s === "BUY" ? `${C.green}22` : `${C.red}22`) : C.card, color: s === "BUY" ? C.green : C.red, borderRadius: 5, padding: "7px 0", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 800, letterSpacing: "0.05em" }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Numeric fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                { label: "ENTRY", key: "entry" },
                { label: "STOP", key: "stopLoss" },
                { label: "TARGET", key: "target" },
                { label: "SHARES", key: "size", step: "1" },
              ].map(({ label, key, step }) => (
                <div key={key}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                  <input type="number" step={step || "0.01"} value={quickLogModal[key]}
                    onChange={e => setQuickLogModal(m => ({ ...m, [key]: e.target.value }))}
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, outline: "none" }} />
                </div>
              ))}
            </div>

            {/* R:R badge */}
            {(() => {
              const entry = Number(quickLogModal.entry) || 0;
              const stop = Number(quickLogModal.stopLoss) || 0;
              const target = Number(quickLogModal.target) || 0;
              if (entry > 0 && stop > 0 && target > 0 && Math.abs(entry - stop) > 0) {
                const rr = Math.abs(target - entry) / Math.abs(entry - stop);
                return (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: rr >= 2 ? C.green : rr >= 1 ? C.amber : C.red, textAlign: "right", marginBottom: 10, fontWeight: 700 }}>
                    R:R {rr.toFixed(1)}:1 {rr >= 2 ? "✓" : rr >= 1 ? "~" : "✗"}
                  </div>
                );
              }
              return <div style={{ marginBottom: 10 }} />;
            })()}

            {/* Timeframe + Style */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>TIMEFRAME</div>
                <select value={quickLogModal.timeframe} onChange={e => setQuickLogModal(m => ({ ...m, timeframe: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["1m","5m","15m","1H","4H","1D","1W"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>STYLE</div>
                <select value={quickLogModal.style} onChange={e => setQuickLogModal(m => ({ ...m, style: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["Breakout","Pullback","Reversal","Momentum","Scalp","Swing","Watchlist"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>NOTES</div>
              <textarea rows={2} value={quickLogModal.notes} onChange={e => setQuickLogModal(m => ({ ...m, notes: e.target.value }))}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, resize: "none", outline: "none" }} />
            </div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  const m = quickLogModal;
                  const entry = Number(m.entry) || 0;
                  const stop = Number(m.stopLoss) || 0;
                  const target = Number(m.target) || 0;
                  const rr = entry > 0 && stop > 0 && target > 0 ? (Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(1) : "?";
                  const plan = [
                    `📋 ${m.symbol} | ${m.side} | ${m.style} | ${m.timeframe}`,
                    `Entry: $${entry.toFixed(2)} | Stop: $${stop.toFixed(2)} | Target: $${target.toFixed(2)}`,
                    `Size: ${Number(m.size) || "?"} shares | R:R ${rr}:1`,
                    m.notes ? `Notes: ${m.notes}` : "",
                  ].filter(Boolean).join("\n");
                  navigator.clipboard.writeText(plan).catch(() => {});
                }}
                style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 5, padding: "11px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                title="Copy trade plan to clipboard"
              >
                COPY
              </button>
              <button onClick={async () => {
                try {
                  await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ticker: quickLogModal.symbol,
                      side: quickLogModal.side,
                      score: Math.round(quickLogModal.score || 0),
                      entry: Number(quickLogModal.entry) || 0,
                      stopLoss: Number(quickLogModal.stopLoss) || 0,
                      target: Number(quickLogModal.target) || 0,
                      size: Number(quickLogModal.size) || 0,
                      timeframe: quickLogModal.timeframe,
                      style: quickLogModal.style,
                      notes: quickLogModal.notes,
                    }),
                  });
                  setQuickLogModal(null);
                } catch {}
              }} style={{ flex: 1, border: "none", background: quickLogModal.side === "BUY" ? C.green : C.red, color: "#fff", borderRadius: 5, padding: "11px 0", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 800, letterSpacing: "0.06em" }}>
                LOG {quickLogModal.side} — {quickLogModal.symbol}
              </button>
            </div>
          </div>
        </div>
  );
}
