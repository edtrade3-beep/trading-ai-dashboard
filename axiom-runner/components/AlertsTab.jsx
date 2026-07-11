import { Badge, ScoreBar } from "./ui-atoms.jsx";

export default function AlertsTab({
  C, MONO,
  tvWebhookRows, combinedAlerts, telegramOk,
  customAlertSymbol, setCustomAlertSymbol, customAlertMin, setCustomAlertMin, setCustomAlerts,
  setTerminalSymbol, setActiveTab, setQuickLogModal,
  priceAlerts, paSymbol, setPaSymbol, paDirection, setPaDirection, paTarget, setPaTarget,
  paNote, setPaNote, loadPriceAlertList, watchlistData,
  tvWebhookFilter, setTvWebhookFilter, alertSoundEnabled, setAlertSoundEnabled, setTvWebhookRows,
  tvWebhookSecured, tvWebhookLoggedRows, setTvWebhookLoggedRows,
}) {
  return (
          <div>
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const todayFired = tvWebhookRows.filter(r => r?.at && r.at.slice(0, 10) === today).length;
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                    ALERT CENTER — {combinedAlerts.length} LIVE SIGNALS
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {todayFired > 0 && (
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 6, padding: "3px 8px" }}>
                        {todayFired} TV WEBHOOK{todayFired !== 1 ? "S" : ""} TODAY
                      </div>
                    )}
                    <Badge color={telegramOk ? C.green : C.textDim}>{telegramOk ? "TELEGRAM ON" : "TELEGRAM OFF"}</Badge>
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={customAlertSymbol}
                onChange={(e) => setCustomAlertSymbol(e.target.value.toUpperCase())}
                placeholder="Custom symbol (e.g. NVDA)"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px", minWidth: 220 }}
              />
              <input
                value={customAlertMin}
                onChange={(e) => setCustomAlertMin(e.target.value)}
                placeholder="Min score"
                style={{ width: 110, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }}
              />
              <button onClick={() => {
                const symbol = customAlertSymbol.trim().toUpperCase();
                const minScore = Math.max(1, Math.min(99, Number(customAlertMin || 70)));
                if (!symbol) return;
                setCustomAlerts((prev) => {
                  const next = prev.filter((x) => x.symbol !== symbol);
                  next.push({ symbol, minScore });
                  return next;
                });
                setCustomAlertSymbol("");
              }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "8px 10px", cursor: "pointer" }}>
                ADD CUSTOM ALERT
              </button>
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
              {combinedAlerts.map((a, idx) => {
                const alertColor = a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green;
                const alertSide = a.type === "risk" ? "SELL" : "BUY";
                return (
                  <div key={`${a.symbol}-${idx}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => { setTerminalSymbol(a.symbol); try { localStorage.setItem("mterminal_load_sym", a.symbol); } catch {} setActiveTab("mterminal"); }}
                          style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: 0 }}>{a.symbol}</button>
                        <Badge color={alertColor}>{a.type}</Badge>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Priority {a.score}</span>
                        <button
                          onClick={() => setQuickLogModal({ symbol: a.symbol, price: 0, entry: "", stopLoss: "", target: "", size: "", side: alertSide, timeframe: "1D", style: "Alert", notes: a.text || "", score: a.score || 70, chg: 0, rvol: 0 })}
                          style={{ border: `1px solid ${alertColor}55`, background: `${alertColor}12`, color: alertColor, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                        >LOG</button>
                        <button
                          onClick={async () => {
                            const emoji = a.type === "risk" ? "🔴" : a.type === "flow" ? "🟡" : "🟢";
                            const msg = `${emoji} *${a.symbol}* — ${a.type.toUpperCase()} Alert\nPriority: ${a.score}/100\n_${a.text}_`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                          title="Send to Telegram"
                        >NOTIFY</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: C.textSec, marginBottom: 8 }}>{a.text}</div>
                    <ScoreBar value={a.score} color={alertColor} />
                  </div>
                );
              })}
              {combinedAlerts.length === 0 && <div style={{ color: C.textDim, fontSize: 13 }}>No active alerts yet.</div>}
            </div>

            {/* Price target alerts panel */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>PRICE TARGET ALERTS</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Server-side · Telegram notification when triggered</span>
                  {priceAlerts.some(a => a.status !== "active") && (
                    <button onClick={async () => {
                      await fetch("/api/price-alerts/clear-history", { method: "DELETE" });
                      loadPriceAlertList();
                    }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                      CLEAR HISTORY
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input value={paSymbol} onChange={e => setPaSymbol(e.target.value.toUpperCase())} placeholder="Symbol (e.g. NVDA)"
                  style={{ width: 130, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px" }} />
                <select value={paDirection} onChange={e => setPaDirection(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px" }}>
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input value={paTarget} onChange={e => setPaTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Price (e.g. 890)"
                  style={{ width: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px" }} />
                <input value={paNote} onChange={e => setPaNote(e.target.value)} placeholder="Note (optional)"
                  style={{ flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px" }} />
                <button onClick={async () => {
                  if (!paSymbol || !paTarget) return;
                  await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ symbol: paSymbol, targetPrice: Number(paTarget), direction: paDirection, note: paNote }) });
                  setPaSymbol(""); setPaTarget(""); setPaNote("");
                  loadPriceAlertList();
                }} style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "7px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                  + SET ALERT
                </button>
              </div>
              {priceAlerts.length === 0 ? (
                <div style={{ padding: "14px 14px", color: C.textDim, fontSize: 12, fontFamily: MONO }}>No price alerts set. Add one above.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["SYMBOL", "DIRECTION", "TARGET", "LIVE", "DISTANCE", "NOTE", "STATUS", "CREATED", "ACTION"].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: h === "NOTE" ? "left" : "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceAlerts.map(a => (
                      <tr key={a.id} style={{ borderTop: `1px solid ${C.border}`, opacity: a.status !== "active" ? 0.55 : 1 }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                          <button onClick={() => { setTerminalSymbol(a.symbol); try { localStorage.setItem("mterminal_load_sym", a.symbol); } catch {} setActiveTab("mterminal"); }}
                            style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{a.symbol}</button>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: a.direction === "above" ? C.green : C.red }}>{a.direction.toUpperCase()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>${a.targetPrice.toLocaleString()}</td>
                        {(() => {
                          const liveQ = watchlistData.find(q => q.symbol === a.symbol);
                          const livePrice = liveQ?.price || null;
                          if (!livePrice || a.status !== "active") return (
                            <>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</td>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</td>
                            </>
                          );
                          const dist = ((a.targetPrice - livePrice) / livePrice) * 100;
                          const away = Math.abs(dist).toFixed(1);
                          const isBull = a.direction === "above";
                          const isClose = Math.abs(dist) < 1.5;
                          const distColor = isClose ? C.amber : (isBull ? (dist > 0 ? C.green : C.red) : (dist < 0 ? C.green : C.red));
                          const label = isBull ? (dist > 0 ? `${away}% away ▲` : `BREACHED ✓`) : (dist < 0 ? `${away}% away ▼` : `BREACHED ✓`);
                          return (
                            <>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.text }}>${livePrice.toFixed(2)}</td>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: distColor }}>{label}</td>
                            </>
                          );
                        })()}
                        <td style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textSec, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.note || "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          <span style={{ background: a.status === "active" ? `${C.green}22` : a.status === "triggered" ? `${C.accent}22` : `${C.amber}22`, color: a.status === "active" ? C.green : a.status === "triggered" ? C.accent : C.amber, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{a.status}</span>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textSec }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          {a.status === "active" && (
                            <button onClick={async () => {
                              await fetch(`/api/price-alerts/${a.id}/cancel`, { method: "PATCH" });
                              loadPriceAlertList();
                            }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CANCEL</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {tvWebhookRows.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>TRADINGVIEW WEBHOOK HISTORY ({tvWebhookRows.length})</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={tvWebhookFilter}
                      onChange={(e) => setTvWebhookFilter(e.target.value.toUpperCase())}
                      placeholder="Filter symbol…"
                      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "4px 8px", width: 120, borderRadius: 6 }}
                    />
                    <button
                      onClick={() => setAlertSoundEnabled(v => !v)}
                      style={{ border: `1px solid ${alertSoundEnabled ? C.green : C.border}`, background: alertSoundEnabled ? `${C.green}12` : C.surface, color: alertSoundEnabled ? C.green : C.textDim, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                      title={alertSoundEnabled ? "Mute alert sound" : "Enable alert sound"}
                    >{alertSoundEnabled ? "SOUND ON" : "MUTED"}</button>
                    <button
                      onClick={async () => {
                        try {
                          const r = await fetch("/api/market/tv-alerts?action=dedup", { method: "PATCH" });
                          const d = await r.json();
                          if (d.ok) {
                            // Reload alerts from server
                            const fresh = await fetch("/api/market/tv-alerts?limit=100").then(x=>x.json());
                            if (fresh.rows) setTvWebhookRows(fresh.rows);
                          }
                        } catch {}
                      }}
                      style={{ border: `1px solid ${C.amber}55`, background: `${C.amber}12`, color: C.amber, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >DEDUP</button>
                    <button
                      onClick={async () => {
                        setTvWebhookRows([]);
                        try { await fetch("/api/market/tv-alerts", { method: "DELETE" }); } catch {}
                      }}
                      style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >CLEAR ALL</button>
                    <Badge color={tvWebhookSecured ? C.green : C.amber}>{tvWebhookSecured ? "SECURED" : "OPEN"}</Badge>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>TIME</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>SYMBOL</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>SIDE</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>TF</th>
                        <th style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>PRICE</th>
                        <th style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>SCORE</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>MESSAGE</th>
                        <th style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>LOG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tvWebhookRows
                        .filter((row) => !tvWebhookFilter || String(row?.symbol || "").toUpperCase().includes(tvWebhookFilter))
                        .slice(0, 20)
                        .map((row, i) => {
                          const rowKey = `${row?.symbol}-${row?.at || i}`;
                          const side = String(row?.side || "INFO").toUpperCase();
                          const sideColor = side === "BUY" ? C.green : side === "SELL" ? C.red : C.textDim;
                          const px = Number(row?.price || 0);
                          const logged = tvWebhookLoggedRows[rowKey];
                          return (
                            <tr key={`tvh-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
                                {row?.at ? new Date(row.at).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                                <button onClick={() => { if (row?.symbol) { setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab("mterminal"); } }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{row?.symbol || "?"}</button>
                              </td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: sideColor, fontWeight: 700 }}>{side}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{row?.timeframe || "—"}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: C.text }}>{px > 0 ? `$${px.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: C.accent }}>{row?.score || "—"}</td>
                              <td style={{ padding: "7px 10px", fontSize: 12, color: C.textSec, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row?.message || "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      await fetch("/api/journal", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          ticker: row?.symbol || "TV",
                                          side: side === "BUY" ? "BUY" : side === "SELL" ? "SELL" : "WAIT",
                                          score: row?.score || 72,
                                          entry: px || 0,
                                          notes: row?.message || "",
                                          timeframe: row?.timeframe || "1D",
                                          style: "Swing",
                                        }),
                                      });
                                      setTvWebhookLoggedRows((prev) => ({ ...prev, [rowKey]: true }));
                                    } catch {}
                                  }}
                                  style={{ border: `1px solid ${logged ? C.green + "55" : C.border}`, background: logged ? `${C.green}12` : C.surface, color: logged ? C.green : C.accent, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                >{logged ? "OK ✓" : "LOG"}</button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
  );
}
