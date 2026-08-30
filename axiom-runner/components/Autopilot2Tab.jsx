import { useState, useEffect, useCallback } from "react";

// ADOL22 Autopilot 2.0 — Command Center. A real internal $100k simulated
// paper account (src/autopilot2-account.js) run by a real autonomous
// scan->enter->manage->exit loop (src/autopilot2-engine.js) — never a
// real order, never Alpaca. Stocks + long calls during market hours, plus
// real 24/7 spot crypto (BTC/ETH/SOL/XRP/DOGE/ADA/AVAX/LINK/LTC/BCH/DOT,
// unconditional of market hours) since 2026-08-30. Puts and spreads are
// real, disclosed gaps, not silently missing (Autopilot goal audit,
// 2026-08-30). The "No puts, spreads, or crypto yet" line that used to be
// here was stale after crypto shipped and was the direct cause of a real
// user-reported "not working, not even crypto" bug report — fixed same day.
//
// Deliberately no manual Buy/Sell anywhere on this page (spec §31) — the
// only controls are the 5 the spec lists. This is a monitoring surface,
// not a trading console.
const STATE_META = {
  OFF: { icon: "⚪", color: "#8a94a6", label: "OFF" },
  RUNNING: { icon: "🟢", color: "#0d9465", label: "RUNNING" },
  PAUSED: { icon: "🟡", color: "#d6a312", label: "PAUSED" },
  SAFE_MODE: { icon: "🟠", color: "#e07b1a", label: "SAFE MODE" },
};

function fmtMoney(n) {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// Same real universe as src/autopilot2-engine.js's CRYPTO_UNIVERSE — kept
// as a small client-side literal (that file is server-only, requires
// Node's ./config) rather than imported, same "duplicate the fixed list,
// not the engine" precedent as btc-hpc-scan.js's own client twin.
const CRYPTO_WATCH_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "BCH-USD", "DOT-USD"];
const VERDICT_COLOR = (C) => ({
  EARLY_BUY: C.green, BUY: C.green, AVOID_LONG: C.red, HOLD: C.accent, EXIT: C.red, TAKE_PROFIT: C.green,
});

// Real-time visibility into WHY crypto is or isn't trading right now — the
// exact same real trend-screen data src/autopilot2-engine.js's
// fetchCryptoCandidates() scans every 5 minutes (GET /api/market/
// trend-screen, no second engine), so "the account is empty" is never
// indistinguishable from "the engine is broken." Added 2026-08-30 as the
// direct fix for a real user report ("still autopilot 2.0 not working not
// even crypto") that was actually correct, honest selectivity (an
// extended BTC + two Stage-4-downtrend coins, both real anti-chase/
// structure gates working as designed) with zero visibility into why.
// Verdicts that mean "this could actually enter a trade" vs. ones that
// mean "sitting out right now" — used to sort the watch grid so anything
// real actually clear to trade surfaces first instead of being buried
// among 11 alphabetically-fixed AVOID_LONG cards (2026-08-31, "make it
// better easier to use": the whole point of this grid is answering "is
// anything about to trade," and that answer was previously invisible
// without reading every single card).
const ACTIONABLE_VERDICTS = new Set(["EARLY_BUY", "BUY", "TAKE_PROFIT"]);
const VERDICT_RANK = { EARLY_BUY: 0, BUY: 0, TAKE_PROFIT: 0, HOLD: 1, AVOID_LONG: 2, EXIT: 2 };

function CryptoWatch({ C, MONO, SANS }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/market/trend-screen?symbols=${CRYPTO_WATCH_SYMBOLS.join(",")}&withDecision=1`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.results)) { setRows(d.results); setError(null); } else setError("no real data returned"); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const actionableCount = rows ? rows.filter((r) => !r.error && ACTIONABLE_VERDICTS.has(r.coreVerdict)).length : 0;
  const sortedRows = rows ? [...rows].sort((a, b) => {
    const ra = a.error ? 3 : (VERDICT_RANK[a.coreVerdict] ?? 1);
    const rb = b.error ? 3 : (VERDICT_RANK[b.coreVerdict] ?? 1);
    return ra - rb;
  }) : null;

  return (
    <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>
          CRYPTO WATCH — scanned unconditionally, 24/7, every 5 min
        </div>
        {rows && (
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: actionableCount > 0 ? C.green : C.textDim }}>
            {actionableCount > 0 ? `${actionableCount} of ${rows.length} clear to trade` : `0 of ${rows.length} clear to trade right now`}
          </div>
        )}
      </div>
      {error && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Couldn't load live crypto scan: {error}</div>}
      {!error && !rows && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading real crypto scan…</div>}
      {sortedRows && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {sortedRows.map((r) => {
            const vColor = r.error ? C.textDim : (VERDICT_COLOR(C)[r.coreVerdict] || C.textDim);
            return (
              <div key={r.symbol} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${vColor}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.text }}>{r.symbol.replace("-USD", "")}</span>
                  {!r.error && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${r.price?.toLocaleString()}</span>}
                </div>
                {r.error ? (
                  <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 3 }}>Unavailable: {r.error}</div>
                ) : (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: vColor, marginTop: 3 }}>{r.coreVerdict || "—"}</div>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 2 }}>{r.coreReason || r.stage}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtPct(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export default function Autopilot2Tab({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [missed, setMissed] = useState(null);
  // "How It Trades" — collapsed to a pill by default (2026-08-31, "make it
  // better easier to use"): same real-user-driven precedent as the chart's
  // Trend & Base Rating overlay (collapsed 2026-08-05 because the full
  // card crowded out the thing people actually came to look at). This
  // explainer is genuinely useful once, not on every visit — persisted so
  // a user who wants it open every time only has to say so once.
  const [showHowItTrades, setShowHowItTrades] = useState(() => {
    try { return localStorage.getItem("autopilot2_how_it_trades_visible") === "on"; } catch { return false; }
  });
  const toggleHowItTrades = () => setShowHowItTrades((v) => {
    const nv = !v;
    try { localStorage.setItem("autopilot2_how_it_trades_visible", nv ? "on" : "off"); } catch {}
    return nv;
  });

  const load = useCallback(() => {
    fetch("/api/autopilot2/status").then(r => r.json()).then(d => {
      if (d?.ok) { setData(d); setError(null); } else setError(d?.error || "status fetch failed");
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // real refresh — same status the engine itself just updated on its own tick
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/autopilot2/missed-opportunities").then(r => r.json()).then(setMissed).catch(() => setMissed(null));
  }, []);

  const runAction = async (path, body) => {
    setLoading(true);
    try {
      await fetch(`/api/autopilot2/${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      await load();
    } finally { setLoading(false); }
  };

  const doReset = async () => {
    if (!confirmingReset) { setConfirmingReset(true); return; }
    await runAction("reset", { confirm: true });
    setConfirmingReset(false);
  };

  // The app's one, real, SHARED kill switch (src/emergency-stop.js) — not
  // an Autopilot-2.0-only stop. Deliberately a direct fetch, not
  // runAction's /api/autopilot2/ prefix, since this is a different real
  // route every other autopilot in the app already honors too.
  const doEmergencyStop = async () => {
    if (!window.confirm("Real Emergency Stop — this halts EVERY autopilot in the app (Green Light, Light Box, and this one), cancels open real orders on the real broker, not just Autopilot 2.0. Continue?")) return;
    setLoading(true);
    try {
      await fetch("/api/emergency-stop/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "ADOL22 Autopilot 2.0 manual stop", activatedBy: "adol22-tab" }) });
      await load();
    } finally { setLoading(false); }
  };

  if (error && !data) {
    return (
      <div style={{ padding: "16px 20px", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
        ⚠ Couldn't load Autopilot 2.0 status: {error}
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: "16px 20px", fontFamily: MONO, fontSize: 13, color: C.textDim }}>Loading ADOL22 Autopilot 2.0…</div>;
  }

  const state = data.state?.state || "OFF";
  const meta = STATE_META[state] || STATE_META.OFF;
  const acct = data.account || {};
  const best = data.bestOpportunity;

  const stat = (label, value, color) => (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 900, color: color || C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header + top strip */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🤖 ADOL22 AUTOPILOT 2.0</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}55`, borderRadius: 999, padding: "3px 10px" }}>
            {meta.icon} {meta.label}
          </span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3 }}>
          A real internal $100,000 simulated paper account — stocks + long calls (market hours) and real 24/7 spot crypto, no real orders ever. No puts or spreads yet. {data.state?.reason ? `(${data.state.reason})` : ""}
        </div>
      </div>

      {/* How it trades — a plain-English brief, not marketing copy. Every
          step named here is a real function this engine actually calls,
          in this order, every tick (src/autopilot2-engine.js). Collapsed
          to a pill by default; click to expand. */}
      {showHowItTrades ? (
        <div style={{ padding: "12px 16px", background: `${C.accent}0a`, border: `1px solid ${C.accent}33`, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 0.5 }}>HOW IT TRADES</div>
            <button onClick={toggleHowItTrades} title="Hide this explainer"
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              ▴ Hide
            </button>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
            Every 5 minutes: <b>scans</b> the real scan universe through the platform's one canonical engine (am-core-engine.js) → <b>scores</b> and ranks real candidates by expected value, probability, and risk → <b>checks risk</b> (position/sector/portfolio-risk limits, daily/weekly/drawdown breakers — risk always wins, a blocked trade never fires) → <b>enters</b> the best real candidate as a stock, a long call, or spot crypto, sized to the risk limit → <b>manages</b> every open position each tick (stop, trail, partial profit, or exit) using that same one verdict engine → <b>exits</b> on a hard stop, invalidated thesis, or (for calls) an approaching expiration. Trades that get skipped are logged with the real reason, and revisited later to see what actually happened (Missed Opportunities). Stock/call scanning only runs during market hours (stale quotes outside them); <b>crypto scans unconditionally, 24/7</b>, every single tick. The same real anti-chase and structure gates apply identically to crypto — an extended or downtrending coin is correctly skipped, not a bug. With no real candidate that clears every gate, it correctly does nothing — an empty account isn't a bug, it's the risk rules working.
          </div>
        </div>
      ) : (
        <button onClick={toggleHowItTrades} title="Show how this autopilot actually trades, step by step"
          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700,
            color: C.accent, background: `${C.accent}0a`, border: `1px solid ${C.accent}33`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>
          ❓ How it trades <span style={{ color: C.textDim }}>▾</span>
        </button>
      )}

      <CryptoWatch C={C} MONO={MONO} SANS={SANS} />

      <div style={{ display: "flex", gap: 24, rowGap: 12, flexWrap: "wrap", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {stat("PAPER EQUITY", fmtMoney(acct.equity))}
        {stat("TODAY P&L", fmtMoney(acct.dailyPnl), acct.dailyPnl >= 0 ? C.green : C.red)}
        {stat("TOTAL P&L", fmtMoney(acct.totalPnl), acct.totalPnl >= 0 ? C.green : C.red)}
        {stat("OPEN POSITIONS", acct.openPositions?.length ?? 0)}
        {stat("PORTFOLIO HEAT", fmtPct(acct.portfolioHeatPct, 1))}
        {stat("DRAWDOWN", fmtPct(acct.drawdownPct, 1), acct.drawdownPct < -5 ? C.red : C.text)}
      </div>

      {/* Controls — exactly the spec §31 list, no manual buy/sell anywhere */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={loading || state === "RUNNING"} onClick={() => runAction("start")}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", cursor: loading ? "default" : "pointer", background: C.green, color: "#fff", opacity: state === "RUNNING" ? 0.5 : 1 }}>
          ▶ AUTOPILOT ON
        </button>
        <button disabled={loading || state === "OFF"} onClick={() => runAction("off")}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, cursor: loading ? "default" : "pointer", background: C.surface, color: C.textSec }}>
          ⏻ AUTOPILOT OFF
        </button>
        {state === "RUNNING"
          ? <button disabled={loading} onClick={() => runAction("pause")}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.amber}`, cursor: loading ? "default" : "pointer", background: `${C.amber}18`, color: C.amber }}>
              ⏸ PAUSE NEW TRADES
            </button>
          : <button disabled={loading || state === "OFF"} onClick={() => runAction("resume")}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.green}`, cursor: loading ? "default" : "pointer", background: `${C.green}18`, color: C.green, opacity: state === "OFF" ? 0.5 : 1 }}>
              ▶ RESUME
            </button>}
        <button disabled={loading} onClick={doEmergencyStop}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, padding: "8px 16px", borderRadius: 8, border: "none", cursor: loading ? "default" : "pointer", background: C.red, color: "#fff" }}>
          🛑 EMERGENCY STOP
        </button>
        <button disabled={loading} onClick={doReset}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${confirmingReset ? C.red : C.border}`, cursor: loading ? "default" : "pointer", background: confirmingReset ? `${C.red}18` : C.surface, color: confirmingReset ? C.red : C.textSec }}>
          {confirmingReset ? "⚠ CLICK AGAIN TO CONFIRM — WIPES TO $100K" : "↺ RESET PAPER ACCOUNT"}
        </button>
      </div>

      {/* Best opportunity */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>BEST OPPORTUNITY RIGHT NOW</div>
        {best ? (
          <div style={{ display: "flex", gap: 20, rowGap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.accent }}>{best.symbol}</span>
            {best.stage && (
              <span title="EARLY = just clearing entry criteria, before it's obvious. CONFIRMED = fully confirmed breakout/retest."
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  color: best.stage === "EARLY" ? "#0d9465" : C.accent,
                  background: `${best.stage === "EARLY" ? "#0d9465" : C.accent}18`,
                  border: `1px solid ${best.stage === "EARLY" ? "#0d9465" : C.accent}55`, borderRadius: 4, padding: "2px 7px" }}>
                {best.stage}
              </span>
            )}
            {stat("TRADE QUALITY", best.score)}
            {stat("PROBABILITY", best.probability != null ? `${best.probability}%` : "insufficient data")}
            {stat("EXPECTED R", Number.isFinite(best.expectedValue) ? `${best.expectedValue >= 0 ? "+" : ""}${best.expectedValue}%` : "—")}
            {stat("CHASE RISK", best.chaseRisk || "—")}
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, flex: 1, minWidth: 200 }}>{best.verdictReason}</div>
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real actionable candidate right now — honestly none, not hidden.</div>
        )}
      </div>

      {/* Open positions */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>OPEN POSITIONS</div>
        {acct.openPositions?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {acct.openPositions.map(p => (
              <div key={p.id} style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, minWidth: 60 }}>{p.symbol}</span>
                {p.assetType === "CALL" ? (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: `${C.accent}18`, borderRadius: 4, padding: "1px 6px" }}>CALL</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{p.qty} ct ${p.strike} strike @ ${p.entryPrice?.toFixed(2)}</span>
                  </>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{p.qty} sh @ ${p.entryPrice?.toFixed(2)}</span>
                )}
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: p.unrealizedPnl >= 0 ? C.green : C.red }}>{fmtMoney(p.unrealizedPnl)} ({fmtPct(p.unrealizedPnlPct)})</span>
                {p.assetType === "CALL" ? (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>exp {p.expiry}{Number.isFinite(p.dte) ? ` (${p.dte}d)` : ""}</span>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>stop ${p.stop?.toFixed(2)} · target ${p.target?.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real open positions right now.</div>
        )}
      </div>

      {/* Activity feed */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>AUTOPILOT ACTIVITY</div>
        {data.activity?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {data.activity.map((a, i) => {
              const col = a.type === "ENTER" ? C.green : a.type === "REJECT" ? C.textDim : (a.type === "HARD_EXIT" || a.type === "SAFE_MODE") ? C.red : a.type === "EXIT" ? C.amber : C.accent;
              return (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, fontFamily: SANS, color: C.textSec, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 48 }}>{new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: col, minWidth: 70 }}>{a.type}</span>
                  {a.symbol && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{a.symbol}</span>}
                  <span>{a.reason}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No activity logged yet.</div>
        )}
      </div>

      {/* Missed opportunities — real forward-outcome tracking for candidates
          this engine detected but did NOT enter (risk/sizing gates). See
          src/missed-opportunity-tracker.js. Observability only — never
          feeds back into the entry decision. */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>MISSED OPPORTUNITIES — WHAT SKIPPED TRADES DID AFTERWARD</div>
        {missed?.available ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
              {missed.resolvedCount} of {missed.totalRecordsChecked} rejected candidates from {missed.daysAgo}+ real days ago, checked against today's real price:
            </div>
            {Object.entries(missed.categories || {}).map(([cat, d]) => (
              <div key={cat} style={{ display: "flex", gap: 12, alignItems: "baseline", fontFamily: MONO, fontSize: 11 }}>
                <span style={{ color: C.textDim, minWidth: 140 }}>{cat}</span>
                <span style={{ color: C.text }}>{d.count} skipped</span>
                <span style={{ color: d.avgForwardReturnPct >= 0 ? C.green : C.red }}>{fmtPct(d.avgForwardReturnPct)} avg</span>
                <span style={{ color: C.textDim }}>{d.wouldHaveGainedRate}% would have gained</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{missed?.reason || "Loading…"}</div>
        )}
      </div>

      {/* System status */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>MARKET SCANNING</span><span>·</span><span>RISK MONITORING</span><span>·</span><span>POSITION MANAGEMENT</span>
        {acct.stalePricing?.length > 0 && <span style={{ color: C.amber }}>· ⚠ stale pricing: {acct.stalePricing.join(", ")}</span>}
      </div>
    </div>
  );
}
