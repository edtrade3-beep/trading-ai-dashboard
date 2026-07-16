import { Badge } from "./ui-atoms.jsx";

export default function ToolsTab({
  C, MONO, riskPlan,
  riskAccount, setRiskAccount, riskPct, setRiskPct, riskEntry, setRiskEntry, riskStop, setRiskStop,
  riskSide, setRiskSide, riskMaxPosPct, setRiskMaxPosPct, riskCorrCap, setRiskCorrCap,
  riskAtrPct, setRiskAtrPct, riskSlipBps, setRiskSlipBps, riskSetupQuality, setRiskSetupQuality,
  terminalSymbol, selectedStock, scannerRank,
  providerKeys, setProviderKeys, apiKey, setLoading, fetchAll,
  tvWebhookSecured, tvWebhookRows, tvWebhookToken, setSettings, runTvWebhookTest, tvWebhookUrl,
}) {
  return (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PRO TOOLBOX — EXECUTION DISCIPLINE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>Position Sizing Engine Pro</div>
                  <Badge color={riskPlan.regime === "Risk-On" || riskPlan.regime === "Goldilocks" ? C.green : riskPlan.regime === "Risk-Off" ? C.red : C.amber}>
                    {riskPlan.regime}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 8 }}>
                  <input value={riskAccount} onChange={(e) => setRiskAccount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Account $" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskPct} onChange={(e) => setRiskPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Risk %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskEntry} onChange={(e) => setRiskEntry(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Entry" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskStop} onChange={(e) => setRiskStop(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Stop" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <select value={riskSide} onChange={(e) => setRiskSide(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 10 }}>
                  <input value={riskMaxPosPct} onChange={(e) => setRiskMaxPosPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Max Pos %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskCorrCap} onChange={(e) => setRiskCorrCap(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Corr Cap 0-1" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskAtrPct} onChange={(e) => setRiskAtrPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ATR % Proxy" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <input value={riskSlipBps} onChange={(e) => setRiskSlipBps(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Slip bps" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  <select value={riskSetupQuality} onChange={(e) => setRiskSetupQuality(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
                    <option value="A+">A+ Setup</option>
                    <option value="A">A Setup</option>
                    <option value="B">B Setup</option>
                    <option value="C">C Setup</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Risk Budget $ (Adj)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.riskDollars.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Per-share Risk</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.perShare.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Final Size (Shares)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.accent, fontWeight: 700 }}>{riskPlan.shares}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Position $</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.position.toFixed(0)}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Est. $ Risk</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.red }}>${riskPlan.estRisk.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>T1 (1R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t1.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>T2 (2R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t2.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>Stop Distance</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{riskPlan.stopPct.toFixed(2)}%</div></div>
                </div>
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ fontSize: 12, color: C.textSec }}>Base Risk Budget: <span style={{ fontFamily: MONO, color: C.text }}>${riskPlan.baseRiskDollars.toFixed(2)}</span></div>
                  <div style={{ fontSize: 12, color: C.textSec }}>Regime Mult: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.regimeMult.toFixed(2)}x</span> · Quality: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.qualityMult.toFixed(2)}x</span></div>
                  <div style={{ fontSize: 12, color: C.textSec }}>Vol Adj: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.volAdj.toFixed(2)}x</span> · Corr Cap: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.corrCap.toFixed(2)}x</span></div>
                </div>
                <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <button
                    onClick={async () => {
                      const sym = (terminalSymbol || selectedStock?.symbol || "").toUpperCase();
                      if (!sym || !riskPlan.shares) return;
                      try {
                        await fetch("/api/journal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ticker: sym,
                            side: riskSide === "short" ? "SELL" : "BUY",
                            score: 72,
                            entry: Number(riskEntry) || 0,
                            stopLoss: Number(riskStop) || 0,
                            target: riskPlan.t1 || 0,
                            notes: `${riskSetupQuality} setup · ${riskPlan.shares} shares · risk $${riskPlan.estRisk.toFixed(0)} · regime ${riskPlan.regime}`,
                            timeframe: "1D",
                            style: "Swing",
                          }),
                        });
                      } catch {}
                    }}
                    style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                  >LOG TRADE TO JOURNAL</button>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Live Opportunity Scanner</div>
                {scannerRank.map((q, i) => (
                  <div key={`${q.symbol}-${i}`} style={{ display: "grid", gridTemplateColumns: "56px 1fr 66px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{q.symbol}</span>
                    <span style={{ fontSize: 12, color: C.textSec }}>5m {q.delta5m == null ? "—" : `${q.delta5m >= 0 ? "+" : ""}${q.delta5m.toFixed(2)}%`} · RS {q.rel >= 0 ? "+" : ""}{q.rel.toFixed(2)}%</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: q.score >= 8 ? C.green : q.score >= 3 ? C.amber : C.red, textAlign: "right" }}>{q.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Data Provider Keys (Local)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="password"
                  value={providerKeys.finnhubKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, finnhubKey: e.target.value.trim() }))}
                  placeholder="Finnhub API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <input
                  type="password"
                  value={providerKeys.fmpKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, fmpKey: e.target.value.trim() }))}
                  placeholder="FMP API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <input
                  type="password"
                  value={providerKeys.polygonKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, polygonKey: e.target.value.trim() }))}
                  placeholder="Polygon API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  value={providerKeys.uwKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, uwKey: e.target.value.trim() }))}
                  placeholder="Unusual Whales API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <input
                  type="password"
                  value={providerKeys.tradierKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, tradierKey: e.target.value.trim() }))}
                  placeholder="Tradier API Key (Options Flow)"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
                Keys are saved in local storage on this browser only. Add Polygon, Unusual Whales, and Tradier keys for richer options flow and provider coverage.
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.cyan }}>TradingView Webhook Bridge</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge color={tvWebhookSecured ? C.green : C.amber}>{tvWebhookSecured ? "SECURED" : "OPEN"}</Badge>
                  <Badge color={tvWebhookRows.length ? C.green : C.amber}>{tvWebhookRows.length ? `${tvWebhookRows.length} RECEIVED` : "WAITING"}</Badge>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="password"
                  value={tvWebhookToken}
                  onChange={(e) => setSettings((s) => ({ ...s, tvWebhookToken: e.target.value.trim() }))}
                  placeholder="Webhook token (must match TV_WEBHOOK_SECRET on server)"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <button
                  onClick={runTvWebhookTest}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "8px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  TEST
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  readOnly
                  value={tvWebhookUrl}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <button
                  onClick={() => { try { navigator.clipboard.writeText(tvWebhookUrl); } catch {} }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "8px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  COPY URL
                </button>
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                In TradingView alert, use this webhook URL and JSON message body:
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, fontFamily: MONO, fontSize: 12, color: C.textSec }}>
{`{"symbol":"{{ticker}}","side":"BUY","price":"{{close}}","timeframe":"{{interval}}","message":"{{exchange}}:{{ticker}} breakout"}`}
              </pre>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
                Incoming TradingView signals are merged into Alerts, AI Agent, and Market Report automatically.
                {tvWebhookSecured ? " Token verification is ON." : " Set TV_WEBHOOK_SECRET on server to lock this endpoint."}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {(tvWebhookRows || []).slice(0, 4).map((r, i) => (
                  <div key={`tv-row-${i}`} style={{ display: "grid", gridTemplateColumns: "80px 1fr 70px", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{r.symbol}</span>
                    <span style={{ fontSize: 12, color: C.textSec }}>{r.message || "Signal received"}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right" }}>{String(r.side || "INFO").toUpperCase()}</span>
                  </div>
                ))}
                {!tvWebhookRows.length && <div style={{ fontSize: 12, color: C.textDim }}>No TradingView webhook alerts received yet.</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {[
                {
                  t: "Risk Calculator",
                  d: "Set max risk per trade (0.5%–1%), derive share size from stop distance before entry.",
                },
                {
                  t: "Technical Trigger Matrix",
                  d: "Require 3 of 5: trend alignment, RVOL > 1.2, RS > 0, reclaim/hold key average, clean structure.",
                },
                {
                  t: "Fundamental Quality Check",
                  d: "Check revenue/EPS trend, balance sheet, margins, and catalyst window before scaling position size.",
                },
                {
                  t: "Macro Gate",
                  d: "Only take aggressive longs when macro tone is Risk-On; reduce size when regime conflicts.",
                },
                {
                  t: "Rotation Checklist",
                  d: "Confirm stock > sector ETF and sector ETF > SPY before rotating capital to a new leader.",
                },
                {
                  t: "Post-Trade Journal",
                  d: "Log setup type, regime, entry/exit, invalidation respect, and lesson to improve process edge.",
                },
              ].map((x) => (
                <div key={x.t} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 8 }}>{x.t}</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{x.d}</div>
                </div>
              ))}
            </div>
          </div>
  );
}
