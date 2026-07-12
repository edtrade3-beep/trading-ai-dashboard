import { Badge } from "./ui-atoms.jsx";

export default function AgentTab({
  C, MONO, SANS, regime, setAgentPrompt, runAIAgent, agentLoading, agentPrompt, terminalSymbol,
  marketSession, flowBias, combinedAlerts, watchlistData, agentRunAt, agentOutput, telegramOk,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                AI AGENT - INSTITUTIONAL COPILOT
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={regime === "Risk-On" ? C.green : regime === "Risk-Off" ? C.red : C.amber}>{regime.toUpperCase()}</Badge>
                <button
                  onClick={() => setAgentPrompt("Give me market regime, top 5 longs, top 3 risks, and a clear execution plan.")}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  RESET PROMPT
                </button>
                <button
                  onClick={runAIAgent}
                  style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {agentLoading ? "RUNNING..." : "RUN AGENT"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>PROMPT</div>
                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="Ask: Is market bullish or bearish? What names should I focus on? Show risk plan for today."
                  style={{ width: "100%", minHeight: 106, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {[
                    "Bullish or bearish today?",
                    "Top 5 long setups right now",
                    "Top risks and hedges now",
                    "Build me execution plan for today",
                    "Sector rotation — where is money flowing?",
                    "What's my biggest risk today?",
                    "Options flow summary — calls or puts leading?",
                    ...(terminalSymbol ? [`Analyze ${terminalSymbol} — entry, stop, target, score`] : []),
                  ].map((q) => (
                    <button
                      key={`aq-${q}`}
                      onClick={() => setAgentPrompt(q)}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 999, padding: "4px 9px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>LIVE CONTEXT</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Session:</b> {marketSession}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Regime:</b> {regime}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Flow Bias:</b> {flowBias}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Alerts:</b> {combinedAlerts.length}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Watchlist:</b> {watchlistData.length} symbols</div>
                <div style={{ fontSize: 12, color: C.textSec }}><b>Last run:</b> {agentRunAt || "Not yet"}</div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AGENT OUTPUT</div>
                {agentOutput && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        try {
                          const truncated = agentOutput.length > 4000 ? agentOutput.slice(0, 4000) + "\n…(truncated)" : agentOutput;
                          await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `🤖 *AI Agent — ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}*\n\n${truncated}` }) });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${telegramOk ? C.green + "44" : C.border}`, background: telegramOk ? `${C.green}0f` : C.surface, color: telegramOk ? C.green : C.textDim, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: telegramOk ? "pointer" : "not-allowed" }}
                      title={telegramOk ? "Send to Telegram" : "Telegram not configured"}
                    >SEND TO BOT</button>
                    <button
                      onClick={() => navigator.clipboard.writeText(agentOutput).catch(() => {})}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >COPY</button>
                  </div>
                )}
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 14, lineHeight: 1.55, color: C.text }}>
                {agentOutput || "No output yet. Click RUN AGENT."}
              </pre>
            </div>
          </div>
  );
}
