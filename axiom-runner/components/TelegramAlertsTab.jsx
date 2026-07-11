import { useState, useEffect, useCallback } from "react";

export default function TelegramAlertsTab({ C, MONO, SANS, watchlistSymbols, watchlistData, onOpenTerminal }) {
  const [status, setStatus]       = useState(null);   // { ok, configured, botName, chatId, ... }
  const [checking, setChecking]   = useState(false);
  const [testMsg, setTestMsg]     = useState("");
  const [testState, setTestState] = useState("idle"); // idle | sending | ok | error
  const [alerts, setAlerts]       = useState([]);
  const [aLoading, setALoading]   = useState(false);
  // new alert form
  const [paSym, setPaSym]         = useState("");
  const [paDir, setPaDir]         = useState("above");
  const [paTarget, setPaTarget]   = useState("");
  const [paNote, setPaNote]       = useState("");
  const [paAdding, setPaAdding]   = useState(false);
  // quick notify
  const [notifyText, setNotifyText] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/telegram/status");
      const d = await r.json();
      setStatus(d);
    } catch { setStatus({ ok: false, error: "Network error" }); }
    setChecking(false);
  }, []);

  const loadAlerts = useCallback(async () => {
    setALoading(true);
    try {
      const r = await fetch("/api/price-alerts");
      const d = await r.json();
      setAlerts(Array.isArray(d.alerts) ? d.alerts : []);
    } catch {}
    setALoading(false);
  }, []);

  useEffect(() => { checkStatus(); loadAlerts(); }, []);

  const sendTest = async () => {
    setTestState("sending"); setTestMsg("");
    try {
      const r = await fetch("/api/telegram/test", { method: "POST" });
      const d = await r.json();
      if (d.ok) { setTestState("ok"); setTestMsg("✓ Message delivered!"); }
      else { setTestState("error"); setTestMsg(d.error || "Unknown error"); }
    } catch (e) { setTestState("error"); setTestMsg(e.message); }
  };

  const addAlert = async () => {
    if (!paSym || !paTarget) return;
    setPaAdding(true);
    try {
      await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: paSym.toUpperCase(), targetPrice: Number(paTarget), direction: paDir, note: paNote }),
      });
      setPaSym(""); setPaTarget(""); setPaNote("");
      await loadAlerts();
    } catch {}
    setPaAdding(false);
  };

  const cancelAlert = async (id) => {
    await fetch(`/api/price-alerts/${id}/cancel`, { method: "PATCH" });
    await loadAlerts();
  };

  const clearHistory = async () => {
    await fetch("/api/price-alerts/clear-history", { method: "DELETE" });
    await loadAlerts();
  };

  const sendNotify = async () => {
    if (!notifyText.trim()) return;
    setNotifySending(true); setNotifyMsg("");
    try {
      const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: notifyText }) });
      const d = await r.json();
      if (d.ok) { setNotifyMsg("✓ Sent!"); setNotifyText(""); }
      else setNotifyMsg("✗ " + (d.error || "Failed"));
    } catch (e) { setNotifyMsg("✗ " + e.message); }
    setNotifySending(false);
  };

  const isConfigured = status?.configured;
  const statusColor  = status === null ? C.textDim : (status.ok ? C.green : (status.configured ? C.red : C.amber));
  const statusLabel  = status === null ? "Checking…" : (status.ok ? `✓ Connected — @${status.botUsername || status.botName || "bot"}` : (status.configured ? `✗ Error: ${status.telegramError || status.error}` : "⚠ Not configured"));

  const ROW = { borderTop: `1px solid ${C.border}` };
  const TH  = (align = "center") => ({ padding: "6px 10px", textAlign: align, fontFamily: MONO, fontSize: 12, color: C.textDim, fontWeight: 400 });
  const TD  = (align = "center") => ({ padding: "7px 10px", textAlign: align, fontFamily: MONO, fontSize: 12 });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>TELEGRAM ALERTS — REAL-TIME NOTIFICATIONS</div>
        <button onClick={checkStatus} disabled={checking}
          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
          {checking ? "CHECKING…" : "↺ REFRESH"}
        </button>
      </div>

      {/* ── Status Card ── */}
      <div style={{ background: C.card, border: `1px solid ${isConfigured ? (status?.ok ? C.green + "44" : C.red + "44") : C.amber + "44"}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: statusColor, marginBottom: 4 }}>{statusLabel}</div>
            {status?.ok && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                Bot: {status.botName} &nbsp;·&nbsp; Chat ID: {status.chatId} &nbsp;·&nbsp; Alerts fired every ~90 s
              </div>
            )}
            {!isConfigured && status !== null && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber, marginTop: 4 }}>
                Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render → Environment, then redeploy.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={async () => {
              try {
                const r = await fetch("/api/telegram/getchatid");
                const d = await r.json();
                if (!d.ok) { alert("❌ " + d.error); return; }
                if (d.hint) { alert("⚠ " + d.hint); return; }
                const lines = d.chats.map(c => `ID: ${c.id}  ${c.type}  ${c.title || c.firstName || ""}`).join("\n");
                alert("Recent chats:\n\n" + lines + "\n\n→ Copy the correct ID → paste into Render env as TELEGRAM_CHAT_ID");
              } catch (e) { alert("❌ " + e.message); }
            }} style={{ border: "1px solid #7c3aed55", background: "#7c3aed12", color: "#a78bfa", borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              GET CHAT ID
            </button>
            <button onClick={sendTest} disabled={testState === "sending"}
              style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {testState === "sending" ? "SENDING…" : "SEND TEST"}
            </button>
          </div>
        </div>
        {testMsg && (
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: testState === "ok" ? C.green : C.red }}>{testMsg}</div>
        )}
      </div>

      {/* ── Setup Guide (only if not configured) ── */}
      {!isConfigured && status !== null && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 10 }}>HOW TO CONNECT TELEGRAM</div>
          {[
            ["1", "Create a bot", "Open Telegram → search @BotFather → send /newbot → follow prompts → copy the bot token"],
            ["2", "Set env var", "Go to Render.com → your service → Environment → add TELEGRAM_BOT_TOKEN = your token"],
            ["3", "Get your Chat ID", "Send any message to your new bot in Telegram, then click GET CHAT ID above"],
            ["4", "Set env var", "Add TELEGRAM_CHAT_ID = the ID shown (e.g. -1001234567890 for a group)"],
            ["5", "Redeploy", "In Render click Manual Deploy (or push a commit) — then click SEND TEST above"],
          ].map(([n, title, body]) => (
            <div key={n} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, minWidth: 18 }}>{n}</div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{title}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 2 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Notify ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 10 }}>QUICK NOTIFY</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={notifyText} onChange={e => setNotifyText(e.target.value)} placeholder="Type any message to send to Telegram…"
            onKeyDown={e => e.key === "Enter" && sendNotify()}
            style={{ flex: 1, minWidth: 200, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px", borderRadius: 6 }} />
          <button onClick={sendNotify} disabled={notifySending || !isConfigured}
            style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "8px 16px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: isConfigured ? "pointer" : "not-allowed", opacity: isConfigured ? 1 : 0.4 }}>
            {notifySending ? "SENDING…" : "SEND ▶"}
          </button>
        </div>
        {notifyMsg && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, color: notifyMsg.startsWith("✓") ? C.green : C.red }}>{notifyMsg}</div>}
        {!isConfigured && status !== null && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, color: C.amber }}>Configure Telegram above to enable sending.</div>}
      </div>

      {/* ── Price Target Alerts ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>PRICE TARGET ALERTS</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 10 }}>Server monitors every 90 s · fires Telegram when triggered</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {alerts.some(a => a.status !== "active") && (
              <button onClick={clearHistory}
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CLEAR HISTORY</button>
            )}
            <button onClick={loadAlerts} disabled={aLoading}
              style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
              {aLoading ? "…" : "↺"}
            </button>
          </div>
        </div>

        {/* Add alert form */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={paSym} onChange={e => setPaSym(e.target.value.toUpperCase())} placeholder="Symbol"
            style={{ width: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 6 }} />
          <select value={paDir} onChange={e => setPaDir(e.target.value)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 6 }}>
            <option value="above">Above ↑</option>
            <option value="below">Below ↓</option>
          </select>
          <input value={paTarget} onChange={e => setPaTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="$ price"
            style={{ width: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 6 }} />
          <input value={paNote} onChange={e => setPaNote(e.target.value)} placeholder="Note (optional)"
            style={{ flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 6 }} />
          {/* Quick-add from watchlist */}
          {watchlistSymbols && watchlistSymbols.slice(0, 8).map(sym => (
            <button key={sym} onClick={() => setPaSym(sym)}
              style={{ border: `1px solid ${C.border}`, background: paSym === sym ? `${C.accent}20` : C.surface, color: paSym === sym ? C.accent : C.textDim, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
              {sym}
            </button>
          ))}
          <button onClick={addAlert} disabled={paAdding || !paSym || !paTarget}
            style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (!paSym || !paTarget) ? 0.5 : 1 }}>
            {paAdding ? "…" : "+ SET ALERT"}
          </button>
        </div>

        {/* Alert list */}
        {alerts.length === 0 ? (
          <div style={{ padding: "16px 14px", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            {aLoading ? "Loading…" : "No price alerts. Add one above — you'll get a Telegram message when triggered."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["SYMBOL", "DIR", "TARGET", "LIVE", "DISTANCE", "NOTE", "STATUS", "CREATED", ""].map((h, i) => (
                    <th key={i} style={TH(h === "NOTE" ? "left" : "center")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => {
                  const liveQ = (watchlistData || []).find(q => q.symbol === a.symbol);
                  const livePrice = liveQ?.price || null;
                  let distLabel = "—", distColor = C.textDim;
                  if (livePrice && a.status === "active") {
                    const dist = ((a.targetPrice - livePrice) / livePrice) * 100;
                    const away = Math.abs(dist).toFixed(1);
                    const isBull = a.direction === "above";
                    distColor = Math.abs(dist) < 1.5 ? C.amber : (isBull ? (dist > 0 ? C.green : C.red) : (dist < 0 ? C.green : C.red));
                    distLabel = isBull ? (dist > 0 ? `${away}% away ▲` : "BREACHED ✓") : (dist < 0 ? `${away}% away ▼` : "BREACHED ✓");
                  }
                  const statusBg = a.status === "active" ? `${C.green}22` : a.status === "triggered" ? `${C.accent}22` : `${C.amber}22`;
                  const statusClr = a.status === "active" ? C.green : a.status === "triggered" ? C.accent : C.amber;
                  return (
                    <tr key={a.id} style={{ ...ROW, opacity: a.status !== "active" ? 0.6 : 1 }}>
                      <td style={TD()}>
                        <button onClick={() => onOpenTerminal && onOpenTerminal(a.symbol)}
                          style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{a.symbol}</button>
                      </td>
                      <td style={{ ...TD(), color: a.direction === "above" ? C.green : C.red }}>{a.direction.toUpperCase()}</td>
                      <td style={{ ...TD(), fontWeight: 700, color: C.text }}>${a.targetPrice.toLocaleString()}</td>
                      <td style={TD()}>{livePrice ? `$${livePrice.toFixed(2)}` : "—"}</td>
                      <td style={{ ...TD(), color: distColor, fontWeight: 700 }}>{distLabel}</td>
                      <td style={{ ...TD("left"), color: C.textSec, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.note || "—"}</td>
                      <td style={TD()}>
                        <span style={{ background: statusBg, color: statusClr, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{a.status}</span>
                      </td>
                      <td style={{ ...TD(), color: C.textSec, fontSize: 12 }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td style={TD()}>
                        {a.status === "active" && (
                          <button onClick={() => cancelAlert(a.id)}
                            style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CANCEL</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer info ── */}
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>
        📌 Price alerts are checked server-side every 90 s &nbsp;·&nbsp;
        📬 Telegram message fires automatically when a target is hit &nbsp;·&nbsp;
        🔔 Set up TradingView webhooks → Portfolio → Alerts for chart-based signals
      </div>
    </div>
  );
}
