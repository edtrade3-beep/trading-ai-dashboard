import { useState, useEffect } from "react";

// OptionsBuyAssistantPanel — new Trade Desk primary section (2026-09-07,
// user's own spec: "I should NEVER have to open Robinhood and randomly
// choose expiration/strike/call/put/premium... Robinhood should mainly
// become the final manual order-entry step"). Reuses the exact same real
// engines already wired into OptionsStrategyRankPanel.jsx (strategy-
// selector.js/strategy-ranking.js/strategy-explain.js) via two new,
// additive routes (GET /api/market/best-options-now, GET /api/market/
// robinhood-ticket) — options-buy-assistant.js does zero new options math
// beyond the real ticket format + Party-Stage->Entry-Timing remap. No
// live brokerage order placement anywhere in this file — the output is
// always a manual-entry card.
//
// Readability (spec's own §23): this is a NEW primary section, sized to
// the spec's own explicit minimums from the start — 24-30px ticker, 17px+
// body, high-contrast labels — not the smaller "secondary dock card" tier
// used elsewhere in the Workspace Grid.

const DIRECTION_COLOR = (C, label) => (label === "BULLISH" ? C.green : label === "BEARISH" ? C.red : C.amber);
const TIMING_COLOR = (C, stage) => {
  if (stage == null) return C.textSec;
  if (stage <= 1) return "#9b6fd1"; // purple — developing
  if (stage === 2) return C.accent; // blue — early
  if (stage === 3) return C.green; // green — confirmed
  if (stage === 4) return C.amber; // yellow — move already started
  if (stage === 5) return "#e07b1a"; // orange — late
  return C.red; // overextended
};

export default function OptionsBuyAssistantPanel({ C, MONO, SANS, setTerminalSymbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("tradedesk_options_assistant_open") !== "on"; } catch { return true; }
  });
  const [ticketFor, setTicketFor] = useState(null); // symbol currently showing a ticket
  const [ticket, setTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);

  const scan = () => {
    setLoading(true); setError(null);
    fetch("/api/market/best-options-now").then((r) => r.json())
      .then((d) => { if (d.ok) setData(d); else setError(d.error || "Scan failed"); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (!collapsed && !data && !loading) scan(); }, [collapsed]);

  const toggleCollapsed = () => setCollapsed((v) => {
    const nv = !v;
    try { localStorage.setItem("tradedesk_options_assistant_open", nv ? "off" : "on"); } catch {}
    return nv;
  });

  const viewOrder = (symbol, strategy) => {
    setTicketFor(symbol); setTicket(null); setTicketLoading(true);
    fetch(`/api/market/robinhood-ticket?symbol=${encodeURIComponent(symbol)}&strategy=${encodeURIComponent(strategy)}`).then((r) => r.json())
      .then((d) => setTicket(d.ok ? d.ticket : { available: false, reason: d.error }))
      .catch((e) => setTicket({ available: false, reason: e.message }))
      .finally(() => setTicketLoading(false));
  };

  return (
    <section aria-label="Options Buy Assistant" style={{ padding: "14px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={toggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: collapsed ? 0 : 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>🎯 OPTIONS BUY ASSISTANT</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>— researched and ranked, ready for manual Robinhood entry</span>
      </button>

      {!collapsed && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button onClick={scan} disabled={loading} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "SCANNING…" : "🔍 SCAN NOW"}
            </button>
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>Real liquid-options universe · top 5 ranked by real probability, risk/reward, and liquidity</span>
          </div>

          {error && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber, marginBottom: 10 }}>Unavailable right now: {error}</div>}
          {loading && !data && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Scanning the real options market — this checks a real live chain per symbol, may take a few seconds…</div>}

          {!loading && data?.ranked?.length === 0 && (
            <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>⚪ No real high-quality options setups right now — cash is a valid state.</div>
          )}

          {data?.ranked?.map((r) => {
            const dirLabel = r.best.strategy === "Iron Condor" ? "NEUTRAL / RANGE" : r.best.strategy.includes("Put") ? "BEARISH" : "BULLISH";
            const dirColor = DIRECTION_COLOR(C, dirLabel);
            const timing = r.timing || {};
            const showingTicket = ticketFor === r.symbol;
            return (
              <div key={r.symbol} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12, background: C.card }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: C.text }}>{r.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: dirColor }}>{dirLabel === "BULLISH" ? "🟢" : dirLabel === "BEARISH" ? "🔴" : "🟡"} {r.best.strategy.toUpperCase()}</span>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: C.textSec }}>Score <b style={{ color: C.text }}>{r.best.composite}/100</b></span>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: TIMING_COLOR(C, timing.stage) }}>{timing.icon} {timing.label}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 10, fontFamily: MONO, fontSize: 15 }}>
                  <span style={{ color: C.textSec }}>Underlying <b style={{ color: C.text }}>${r.underlying}</b></span>
                  <span style={{ color: C.textSec }}>POP <b style={{ color: C.text }}>{r.best.pop != null ? `${r.best.pop}%` : "—"}</b></span>
                  <span style={{ color: C.textSec }}>R:R <b style={{ color: C.text }}>{r.best.riskReward ?? "—"}</b></span>
                  {r.best.construction?.netDebit != null && <span style={{ color: C.textSec }}>Est. Debit <b style={{ color: C.text }}>${r.best.construction.netDebit}</b></span>}
                  {r.best.construction?.netCredit != null && <span style={{ color: C.textSec }}>Est. Credit <b style={{ color: C.text }}>${r.best.construction.netCredit}</b></span>}
                </div>
                {r.best.explanation?.whyThis?.[0] && (
                  <div style={{ fontFamily: SANS, fontSize: 15, color: C.text, marginBottom: 10, lineHeight: 1.5 }}>
                    <b>Why: </b>{r.best.explanation.whyThis[0]}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => viewOrder(r.symbol, r.best.strategy)} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "9px 14px", borderRadius: 7, border: "none", background: dirColor, color: "#fff", cursor: "pointer" }}>
                    VIEW ROBINHOOD ORDER
                  </button>
                  <button onClick={() => setTerminalSymbol?.(r.symbol)} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, padding: "9px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: "pointer" }}>
                    OPEN CHART
                  </button>
                </div>

                {showingTicket && (
                  <RobinhoodTicketCard ticket={ticket} loading={ticketLoading} C={C} MONO={MONO} SANS={SANS} onClose={() => setTicketFor(null)} />
                )}
              </div>
            );
          })}

          {data?.skipped?.length > 0 && (
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 6 }}>
              Skipped (no real tradeable chain): {data.skipped.map((s) => s.symbol).join(", ")}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RobinhoodTicketCard({ ticket, loading, C, MONO, SANS, onClose }) {
  if (loading) return <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 15, color: C.textSec }}>Reading the real live chain for this order…</div>;
  if (!ticket) return null;
  if (!ticket.available) return <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 15, color: C.amber }}>Unavailable: {ticket.reason}</div>;

  const dirColor = DIRECTION_COLOR(C, ticket.direction?.label);
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `2px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>ROBINHOOD ORDER — {ticket.symbol}</span>
        <button onClick={onClose} style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, background: "transparent", border: "none", cursor: "pointer" }}>✕ CLOSE</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <Field label="Direction" value={`${ticket.direction.icon} ${ticket.direction.label}`} color={dirColor} C={C} MONO={MONO} />
        <Field label="Strategy" value={ticket.strategy} C={C} MONO={MONO} />
        <Field label="Expiration" value={ticket.expiration} C={C} MONO={MONO} />
        <Field label="Quantity" value={ticket.quantity} C={C} MONO={MONO} />
        {ticket.legs.map((l, i) => (
          <Field key={i} label={l.action} value={`$${l.strike} ${l.type === "call" ? "Call" : "Put"}`} color={l.action === "BUY" ? C.green : C.red} C={C} MONO={MONO} />
        ))}
        <Field label="Order Type" value={ticket.orderType} C={C} MONO={MONO} />
        <Field label={ticket.isCredit ? "Target Credit" : "Target Debit"} value={`$${ticket.targetPrice?.toFixed(2)}`} C={C} MONO={MONO} />
        <Field label={ticket.isCredit ? "Do Not Accept Less Than" : "Do Not Pay More Than"} value={`$${ticket.boundaryPrice?.toFixed(2)}`} color={C.amber} C={C} MONO={MONO} />
        {ticket.estimatedCost != null && <Field label="Estimated Cost" value={`$${ticket.estimatedCost}`} C={C} MONO={MONO} />}
        {ticket.maxLoss != null && <Field label="Maximum Loss" value={`$${ticket.maxLoss}`} color={C.red} C={C} MONO={MONO} />}
        {ticket.maxProfit != null && <Field label="Maximum Profit" value={typeof ticket.maxProfit === "number" ? `$${ticket.maxProfit}` : ticket.maxProfit} color={C.green} C={C} MONO={MONO} />}
        {ticket.breakevens?.length > 0 && <Field label="Break-even" value={ticket.breakevens.map((b) => `$${b}`).join(" / ")} C={C} MONO={MONO} />}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>HOW TO ENTER IN ROBINHOOD</div>
      <ol style={{ margin: "0 0 14px", paddingLeft: 22, fontFamily: SANS, fontSize: 16, color: C.text, lineHeight: 1.7 }}>
        {ticket.instructions.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>VERIFY BEFORE SUBMITTING</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6, fontFamily: SANS, fontSize: 14 }}>
        {Object.entries({ Ticker: ticket.verify.ticker, Expiration: ticket.verify.expiration, Strikes: ticket.verify.strikes, "Buy/Sell": ticket.verify.direction, Quantity: ticket.verify.quantity, "Limit Price": ticket.verify.limitPrice, "Max Risk": ticket.verify.maxRisk }).map(([k, v]) => (
          <div key={k} style={{ color: C.text }}>✅ <span style={{ color: C.textSec }}>{k}:</span> <b>{v}</b></div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, color, C, MONO }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: color || C.text }}>{value ?? "—"}</div>
    </div>
  );
}
