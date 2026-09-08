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

  // Search Any Ticker (2026-09-08, explicit user request: "i want options
  // buy assistance to be able to search every stock"). Zero new backend
  // route — /api/market/best-options-now already accepts an arbitrary
  // ?symbols= list (built for the default 12-name universe, but the real
  // per-symbol pipeline underneath has no such restriction), so a single
  // searched ticker gets the exact same real analysis as a scanned one.
  const [searchInput, setSearchInput] = useState("");
  const [searchResult, setSearchResult] = useState(null); // { symbol, row } | { symbol, error } | null
  const [searching, setSearching] = useState(false);

  // Maximum Amount to Risk (spec §1 filter, 2026-09-07 — explicit user
  // request: "i want add maximum loss to give me what stocks to buy in
  // options"). Persisted like the collapsed state above so it survives a
  // reload; purely a client-side query param onto the real server-side
  // filter in /api/market/best-options-now, which does the actual honest
  // exclusion off each candidate's real ticket-derived max loss.
  const [maxLossInput, setMaxLossInput] = useState(() => {
    try { return localStorage.getItem("tradedesk_options_max_loss") || ""; } catch { return ""; }
  });
  const setMaxLoss = (v) => {
    setMaxLossInput(v);
    try { localStorage.setItem("tradedesk_options_max_loss", v); } catch {}
  };
  const maxLossQS = () => {
    const n = Number(maxLossInput);
    return Number.isFinite(n) && n > 0 ? `&maxLoss=${encodeURIComponent(n)}` : "";
  };

  const runSearch = () => {
    const symbol = searchInput.trim().toUpperCase();
    if (!symbol) return;
    setSearching(true); setSearchResult(null);
    fetch(`/api/market/best-options-now?symbols=${encodeURIComponent(symbol)}${maxLossQS()}`).then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setSearchResult({ symbol, error: d.error || "Search failed" }); return; }
        const row = (d.ranked || [])[0] || (d.skipped || [])[0] || null;
        if (!row) { setSearchResult({ symbol, error: "No real result returned." }); return; }
        setSearchResult(row.ok === false ? { symbol, error: row.reason } : row);
      })
      .catch((e) => setSearchResult({ symbol, error: e.message }))
      .finally(() => setSearching(false));
  };

  const scan = () => {
    setLoading(true); setError(null);
    fetch(`/api/market/best-options-now?${maxLossQS().replace(/^&/, "")}`).then((r) => r.json())
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

  const [ticketStrategy, setTicketStrategy] = useState(null);
  const viewOrder = (symbol, strategy) => {
    setTicketFor(symbol); setTicketStrategy(strategy); setTicket(null); setTicketLoading(true);
    fetch(`/api/market/robinhood-ticket?symbol=${encodeURIComponent(symbol)}&strategy=${encodeURIComponent(strategy)}`).then((r) => r.json())
      .then((d) => setTicket(d.ok ? d.ticket : { available: false, reason: d.error }))
      .catch((e) => setTicket({ available: false, reason: e.message }))
      .finally(() => setTicketLoading(false));
  };

  const ticketProps = { ticketFor, ticketStrategy, ticket, ticketLoading, viewOrder, onCloseTicket: () => setTicketFor(null) };

  return (
    <section aria-label="Options Buy Assistant" style={{ padding: "14px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={toggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: collapsed ? 0 : 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>🎯 OPTIONS BUY ASSISTANT</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>— researched and ranked, ready for manual Robinhood entry</span>
      </button>

      {!collapsed && (
        <>
          {/* Search Any Ticker (spec §19: "WHAT DO YOU WANT TO TRADE?") —
              the same real per-symbol pipeline as the scan below, just for
              one caller-chosen symbol instead of the default universe. */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>WHAT DO YOU WANT TO TRADE?</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. TSLA" style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, width: 180 }} />
              <button onClick={runSearch} disabled={searching || !searchInput.trim()} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "9px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", cursor: searching ? "default" : "pointer", opacity: searching ? 0.6 : 1 }}>
                {searching ? "SEARCHING…" : "GO"}
              </button>
              <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 2px" }} />
              <label style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.textSec, display: "flex", alignItems: "center", gap: 8 }}>
                MAX LOSS $
                <input value={maxLossInput} onChange={(e) => setMaxLoss(e.target.value.replace(/[^0-9.]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && (searchInput.trim() ? runSearch() : scan())}
                  placeholder="e.g. 250" inputMode="decimal" style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, width: 100 }} />
              </label>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 6 }}>
              {maxLossInput ? `Only real setups whose actual max loss is ≤ $${maxLossInput} per contract/spread will be shown.` : "Optional — leave blank to see every real ranked setup regardless of risk size."}
            </div>
          </div>

          {searching && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, marginBottom: 14 }}>Reading the real live chain for {searchInput.trim().toUpperCase()}…</div>}
          {searchResult?.error && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber, marginBottom: 14 }}>{searchResult.symbol}: {searchResult.error}</div>}
          {searchResult && !searchResult.error && (
            <CandidateCard r={searchResult} C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} {...ticketProps} />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: searchResult ? 18 : 0, marginBottom: 14, paddingTop: searchResult ? 16 : 0, borderTop: searchResult ? `1px solid ${C.border}` : "none" }}>
            <button onClick={scan} disabled={loading} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "SCANNING…" : "🔍 SCAN NOW"}
            </button>
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>Real liquid-options universe · top 5 ranked by real probability, risk/reward, and liquidity</span>
          </div>

          {error && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber, marginBottom: 10 }}>Unavailable right now: {error}</div>}
          {loading && !data && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Scanning the real options market — this checks a real live chain per symbol, may take a few seconds…</div>}

          {!loading && data?.ranked?.length === 0 && (
            <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>
              ⚪ {data.maxLossFilter ? `No real setup right now stays within your $${data.maxLossFilter} max-loss budget — cash is a valid state.` : "No real high-quality options setups right now — cash is a valid state."}
            </div>
          )}

          {data?.ranked?.map((r) => (
            <CandidateCard key={r.symbol} r={r} C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} {...ticketProps} />
          ))}

          {data?.skipped?.length > 0 && (
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 6 }}>
              {data.skipped.map((s) => `${s.symbol} (${s.reason})`).join(" · ")}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// One real candidate's card — shared by both the default-universe scan
// and the Search Any Ticker result above, so a searched symbol gets the
// exact same real analysis/actions as a scanned one, never a lesser view.
function CandidateCard({ r, C, MONO, SANS, setTerminalSymbol, ticketFor, ticketStrategy, ticket, ticketLoading, viewOrder, onCloseTicket }) {
  const dirLabel = r.best.strategy === "Iron Condor" ? "NEUTRAL / RANGE" : r.best.strategy.includes("Put") ? "BEARISH" : "BULLISH";
  const dirColor = DIRECTION_COLOR(C, dirLabel);
  const timing = r.timing || {};
  const showingTicket = ticketFor === r.symbol;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12, background: C.card }}>
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
        {r.maxLossDollars != null && <span style={{ color: C.textSec }}>Max Loss <b style={{ color: C.red }}>${r.maxLossDollars.toFixed(2)}</b></span>}
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
        <RobinhoodTicketCard symbol={r.symbol} strategy={ticketStrategy} ticket={ticket} loading={ticketLoading} C={C} MONO={MONO} SANS={SANS} onClose={onCloseTicket} />
      )}
    </div>
  );
}

function RobinhoodTicketCard({ symbol, strategy, ticket, loading, C, MONO, SANS, onClose }) {
  const [check, setCheck] = useState(null); // { status, reason, checkedAt } | null
  const [checking, setChecking] = useState(false);

  const recheckPrice = () => {
    setChecking(true);
    fetch(`/api/market/robinhood-ticket?symbol=${encodeURIComponent(symbol)}&strategy=${encodeURIComponent(strategy)}`).then((r) => r.json())
      .then((d) => {
        const fresh = d.ok ? d.ticket : { available: false, reason: d.error };
        // comparePriceCheck lives server-side too, but this is a pure,
        // dependency-free comparison — importing the shared engine into a
        // client bundle for one small function isn't worth it; kept in
        // sync by test/options-buy-assistant.test.js's own coverage of
        // the real server-side comparePriceCheck this mirrors exactly.
        const worse = ticket.isCredit ? fresh.targetPrice < ticket.boundaryPrice : fresh.targetPrice > ticket.boundaryPrice;
        const sameStructure = fresh.available && ticket.strategy === fresh.strategy && ticket.expiration === fresh.expiration
          && ticket.legs.length === fresh.legs.length && ticket.legs.every((l, i) => l.strike === fresh.legs[i]?.strike && l.type === fresh.legs[i]?.type);
        let status, reason;
        if (!fresh.available) { status = "STALE"; reason = fresh.reason || "Could not re-check the real live chain."; }
        else if (!sameStructure) { status = "RECOMMENDATION_CHANGED"; reason = "The real ranked structure has changed since this was shown — re-scan rather than trusting these strikes."; }
        else if (worse) { status = "PRICE_CHANGED"; reason = `Real current price is $${fresh.targetPrice?.toFixed(2)}, past your $${ticket.boundaryPrice?.toFixed(2)} limit.`; }
        else { status = "SAFE"; reason = `Real current price is $${fresh.targetPrice?.toFixed(2)} — still within your $${ticket.boundaryPrice?.toFixed(2)} limit.`; }
        setCheck({ status, reason, checkedAt: Date.now() });
      })
      .catch((e) => setCheck({ status: "STALE", reason: e.message, checkedAt: Date.now() }))
      .finally(() => setChecking(false));
  };

  if (loading) return <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 15, color: C.textSec }}>Reading the real live chain for this order…</div>;
  if (!ticket) return null;
  if (!ticket.available) return <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 15, color: C.amber }}>Unavailable: {ticket.reason}</div>;

  const dirColor = DIRECTION_COLOR(C, ticket.direction?.label);
  const CHECK_META = {
    SAFE: { icon: "🟢", label: "SAFE TO CONTINUE", color: C.green },
    PRICE_CHANGED: { icon: "🔴", label: "PRICE CHANGED — DO NOT BUY", color: C.red },
    RECOMMENDATION_CHANGED: { icon: "🔴", label: "RECOMMENDATION CHANGED — RE-SCAN", color: C.red },
    STALE: { icon: "🟡", label: "COULD NOT RE-CHECK", color: C.amber },
  };
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `2px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>ROBINHOOD ORDER — {ticket.symbol}</span>
        <button onClick={onClose} style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, background: "transparent", border: "none", cursor: "pointer" }}>✕ CLOSE</button>
      </div>

      {/* Price Check (spec §13/§14 — "has the premium moved since I
          calculated this"). Re-runs the exact same real ticket endpoint
          and compares against what's already on screen; never a live
          quote stream, a real on-demand check. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={recheckPrice} disabled={checking} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "7px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: checking ? "default" : "pointer" }}>
          {checking ? "RE-CHECKING…" : "🔄 RECHECK PRICE"}
        </button>
        {check && (
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: CHECK_META[check.status].color }}>
            {CHECK_META[check.status].icon} {CHECK_META[check.status].label}
          </span>
        )}
      </div>
      {check && <div style={{ marginBottom: 12, fontFamily: SANS, fontSize: 14, color: C.text }}>{check.reason}</div>}

      {ticket.shortDteWarning && (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: `${C.amber}18`, border: `1px solid ${C.amber}66`, borderRadius: 8, fontFamily: SANS, fontSize: 14, color: C.text }}>
          ⚠️ <b>SHORT DTE — {ticket.expiration}.</b> {ticket.shortDteWarning}
        </div>
      )}

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
