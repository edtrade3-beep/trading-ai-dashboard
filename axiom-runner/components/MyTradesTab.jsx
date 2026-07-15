import { useState, useEffect } from "react";
import { GL_TRADES_KEY } from "./trading-utils.js";

// ── MY TRADES tab — auto-pilot controls + paper positions (its own tab under Green Light) ──
function AlpacaPanel({ C, MONO, SANS }) {
  const [acct, setAcct] = React.useState(null);
  const [positions, setPositions] = React.useState([]);
  const [state, setState] = React.useState("loading"); // loading | ok | nokey | error
  React.useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/account").then(r => r.json()).then(d => {
        if (d?.reason === "no-alpaca-key") { setState("nokey"); return; }
        if (!d?.ok) { setState("error"); return; }
        setAcct(d.account); setState("ok");
        fetch("/api/alpaca/positions").then(r => r.json()).then(p => { if (p?.ok) setPositions(p.positions || []); }).catch(() => {});
      }).catch(() => setState("error"));
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const wrap = { background: "#10b98112", border: `1px solid #10b98144`, borderRadius: 10, padding: "12px 16px", marginBottom: 14 };
  if (state === "nokey") {
    return (
      <div style={wrap}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: "#10b981", marginBottom: 6 }}>🦙 ALPACA PAPER — not connected</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          Add your Alpaca <b>paper</b> keys in Render → Environment as <code>ALPACA_KEY_ID</code> and <code>ALPACA_SECRET_KEY</code>, then redeploy.
          Get free paper keys at <span style={{ color: "#10b981" }}>alpaca.markets</span> → Paper Trading → API Keys. Orders route server-side; keys never touch the browser.
        </div>
      </div>
    );
  }
  if (state === "error") return <div style={wrap}><div style={{ fontFamily: MONO, fontSize: 12, color: C.amber }}>🦙 Alpaca: couldn't reach account (check keys / try again).</div></div>;
  if (state === "loading" || !acct) return <div style={wrap}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>🦙 Connecting to Alpaca paper…</div></div>;
  const fmt = v => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const dayChg = (Number(acct.equity) || 0) - (Number(acct.lastEquity) || Number(acct.equity) || 0);
  const dayPct = acct.lastEquity ? (dayChg / acct.lastEquity) * 100 : 0;
  const openPL = positions.reduce((s, p) => s + (Number(p.unrealizedPL) || 0), 0);
  const stat = (label, value, color) => (
    <div style={{ flex: "1 1 110px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: color || C.text }}>{value}</div>
    </div>
  );
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      {/* Hero: equity + today's change */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
            🦙 ALPACA PAPER <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} /> <span style={{ color: C.textDim, fontWeight: 500 }}>{acct.status}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: C.text, lineHeight: 1.1, marginTop: 4 }}>{fmt(acct.equity)}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>account equity</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em" }}>TODAY</div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: dayChg >= 0 ? C.green : C.red }}>
            {dayChg >= 0 ? "+" : ""}{fmt(Math.abs(dayChg)).replace("$", dayChg < 0 ? "-$" : "$")} <span style={{ fontSize: 13 }}>({dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%)</span>
          </div>
          {positions.length > 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: openPL >= 0 ? C.green : C.red, marginTop: 2 }}>open P&L {openPL >= 0 ? "+" : ""}${Math.round(openPL)}</div>}
        </div>
      </div>
      {/* Stat row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat("BUYING POWER", fmt(acct.buyingPower))}
        {stat("CASH", fmt(acct.cash))}
        {stat("POSITIONS", String(positions.length))}
        {stat("OPTIONS", acct.optionsApprovedLevel != null ? ("Lvl " + acct.optionsApprovedLevel + (acct.optionsApprovedLevel >= 2 ? " ✓" : "")) : "—", acct.optionsApprovedLevel >= 2 ? C.green : acct.optionsApprovedLevel != null ? C.amber : C.textDim)}
      </div>
      {/* Open positions */}
      {positions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>OPEN POSITIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {positions.map(p => (
              <div key={p.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: C.surface, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent }}>{p.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{p.qty} sh @ ${Number(p.avgEntry).toFixed(2)}</span>
                  {p.openedAt && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }} title={`Opened ${new Date(p.openedAt).toLocaleString()}`}>
                    🕒 {new Date(p.openedAt).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(p.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: p.unrealizedPL >= 0 ? C.green : C.red }}>{p.unrealizedPL >= 0 ? "+" : ""}${p.unrealizedPL.toFixed(0)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: p.unrealizedPL >= 0 ? C.green : C.red, marginLeft: 6 }}>({p.unrealizedPLpc >= 0 ? "+" : ""}{p.unrealizedPLpc.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 📊 REPORT CARD — win rate / expectancy / edge check from real Alpaca closed trades ──
function AlpacaReportCard({ C, MONO, SANS }) {
  const [trades, setTrades] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/alpaca/closed-trades").then(r => r.json())
      .then(d => { if (!alive) return; if (d.ok) setTrades(d.trades || []); else setErr(d.reason === "no-alpaca-key" ? "nokey" : (d.error || "error")); })
      .catch(() => alive && setErr("error"));
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (err === "nokey") return null;
  const wrap = (inner) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>{inner}</div>;
  if (trades === null && !err) return wrap(<div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading report card…</div>);
  if (err) return wrap(<div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>Couldn't load closed trades — {err}.</div>);

  const closed = trades;
  const wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl <= 0);
  const n = closed.length;
  const winRate = n ? Math.round(wins.length / n * 100) : 0;
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const lossRate = n ? losses.length / n : 0;
  const expectancy = n ? ((winRate / 100) * avgWin - lossRate * avgLoss) : 0;
  const profitFactor = avgLoss > 0 && losses.length ? (avgWin * wins.length) / (avgLoss * losses.length) : (wins.length ? Infinity : 0);
  const edgeReady = n >= 20 && expectancy > 0;
  const chrono = [...closed].sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  let cum = 0; const eq = chrono.map(t => (cum += t.pnl));

  const stats = [
    ["TRADES", String(n), C.text],
    ["WIN RATE", winRate + "%", winRate >= 50 ? C.green : C.amber],
    ["AVG WIN", "$" + Math.round(avgWin), C.green],
    ["AVG LOSS", "$" + Math.round(avgLoss), C.red],
    ["EXPECTANCY/TRADE", (expectancy >= 0 ? "+" : "") + "$" + expectancy.toFixed(0), expectancy >= 0 ? C.green : C.red],
    ["PROFIT FACTOR", profitFactor === Infinity ? "∞" : profitFactor.toFixed(2), profitFactor >= 1.5 ? C.green : profitFactor >= 1 ? C.amber : C.red],
    ["TOTAL P&L", (totalPnl >= 0 ? "+" : "") + "$" + Math.round(totalPnl), totalPnl >= 0 ? C.green : C.red],
  ];
  return wrap(<>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textSec, letterSpacing: "0.06em" }}>📊 REPORT CARD</span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>real Alpaca closed trades</span>
      {n < 20
        ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.amber, background: `${C.amber}18`, borderRadius: 5, padding: "3px 8px" }}>⏳ {n}/20 trades — keep going</span>
        : edgeReady
          ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, background: `${C.green}18`, borderRadius: 5, padding: "3px 8px" }}>✓ POSITIVE EDGE — you may be ready to scale</span>
          : <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, background: `${C.red}18`, borderRadius: 5, padding: "3px 8px" }}>✕ NO EDGE YET — refine before sizing up</span>}
    </div>
    {n === 0
      ? <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No closed trades yet. Once the autopilot opens and closes round-trips on Alpaca, your win rate and edge will appear here.</div>
      : <>
        <div style={{ display: "flex", gap: 22, rowGap: 12, flexWrap: "wrap" }}>
          {stats.map(([l, v, col]) => (
            <div key={l}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>{l}</div>
              <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: col }}>{v}</div></div>
          ))}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8 }}>
          Expectancy = (win% × avg win) − (loss% × avg loss) — the average you make per trade. Positive over 20+ trades = a real edge.
        </div>
        {eq.length >= 2 && (() => {
          const w = 100, h = 36, m = eq.length;
          const lo = Math.min(0, ...eq), hi = Math.max(0, ...eq), span = (hi - lo) || 1;
          const x = i => (i / (m - 1)) * w, y = v => h - ((v - lo) / span) * h;
          const path = eq.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
          const up = eq[m - 1] >= 0;
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>📈 EQUITY CURVE — cumulative realized P&L over {m} closed trades</div>
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 60, display: "block" }}>
                <line x1="0" y1={y(0).toFixed(1)} x2={w} y2={y(0).toFixed(1)} stroke={C.border} strokeWidth="0.4" strokeDasharray="1 1" />
                <path d={path} fill="none" stroke={up ? C.green : C.red} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        })()}
        {/* Recent closed trades with open → close times */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>RECENT CLOSED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {closed.slice(0, 12).map((t, i) => {
              const ft = d => { try { const x = new Date(d); return x.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + x.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
              const held = (t.openedAt && t.closedAt) ? Math.max(0, Math.round((new Date(t.closedAt) - new Date(t.openedAt)) / 60000)) : null;
              const heldStr = held == null ? "" : held < 60 ? `${held}m` : held < 1440 ? `${Math.round(held / 60)}h` : `${Math.round(held / 1440)}d`;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", background: C.surface, borderRadius: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 150 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{t.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{t.side === "short" ? "SHORT " : ""}{t.qty} @ ${Number(t.entry).toFixed(2)}→${Number(t.exit).toFixed(2)}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, flex: 1, textAlign: "center", minWidth: 160 }}>
                    🕒 {ft(t.openedAt)} → {ft(t.closedAt)}{heldStr ? ` · ${heldStr}` : ""}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: t.pnl >= 0 ? C.green : C.red, minWidth: 60, textAlign: "right" }}>{t.pnl >= 0 ? "+" : ""}${Math.round(t.pnl)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>}
  </>);
}

// ── 🎯 BY SETUP TIER — win rate / avg R / P&L per tagged setup tier, so you can ──
// see which tiers actually make money vs which just look good and cut the losers.
function TierStatsCard({ C, MONO, SANS }) {
  const [tiers, setTiers] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/alpaca/tier-stats").then(r => r.json())
      .then(d => { if (!alive) return; if (d.ok) setTiers(d.tiers || []); else setErr(d.reason === "no-alpaca-key" ? "nokey" : (d.error || "error")); })
      .catch(() => alive && setErr("error"));
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (err === "nokey") return null;
  const wrap = (inner) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>{inner}</div>;
  if (tiers === null && !err) return wrap(<div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading tier breakdown…</div>);
  if (err) return wrap(<div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>Couldn't load tier stats — {err}.</div>);
  if (!tiers.length) return wrap(<>
    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textSec, letterSpacing: "0.06em", marginBottom: 4 }}>🎯 BY SETUP TIER</div>
    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No tagged trades yet. Once the auto-pilot closes round-trips, each tier's real win rate and R-multiple will show up here.</div>
  </>);

  const MIN_SAMPLE = 5; // below this, a tier's stats aren't reliable enough to call good/bad yet
  return wrap(<>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textSec, letterSpacing: "0.06em" }}>🎯 BY SETUP TIER</span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>which setups actually work</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", width: 70 }}>TIER</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", width: 60, textAlign: "right" }}>TRADES</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", width: 60, textAlign: "right" }}>WIN%</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", width: 70, textAlign: "right" }}>AVG R</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em", flex: 1, textAlign: "right" }}>P&L</span>
      </div>
      {tiers.map(t => {
        const reliable = t.n >= MIN_SAMPLE;
        const good = reliable && t.avgR != null && t.avgR > 0;
        const bad = reliable && t.avgR != null && t.avgR <= 0;
        const rowColor = good ? C.green : bad ? C.red : C.textDim;
        const label = t.tier === "?" ? "UNTAGGED" : `TIER ${t.tier}`;
        return (
          <div key={t.tier} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            background: C.surface, borderRadius: 8, border: `1px solid ${reliable ? `${rowColor}33` : "transparent"}` }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: reliable ? rowColor : C.text, width: 70 }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, width: 60, textAlign: "right" }}>{t.n}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: t.winRate >= 50 ? C.green : C.amber, width: 60, textAlign: "right" }}>{t.winRate}%</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: t.avgR == null ? C.textDim : t.avgR > 0 ? C.green : C.red, width: 70, textAlign: "right" }}>
              {t.avgR == null ? "—" : `${t.avgR >= 0 ? "+" : ""}${t.avgR}R`}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: t.pnl >= 0 ? C.green : C.red, flex: 1, textAlign: "right" }}>
              {t.pnl >= 0 ? "+" : ""}${t.pnl}
            </span>
          </div>
        );
      })}
    </div>
    {(() => {
      const worst = tiers.filter(t => t.n >= MIN_SAMPLE && t.avgR != null).sort((a, b) => a.avgR - b.avgR)[0];
      if (!worst || worst.avgR > 0) return null;
      const label = worst.tier === "?" ? "untagged trades" : `Tier ${worst.tier}`;
      return (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 10 }}>
          ⚠️ <b style={{ color: C.red }}>{label}</b> is losing money over {worst.n} trades ({worst.avgR}R avg) — consider cutting this setup.
        </div>
      );
    })()}
  </>);
}

export default function MyTradesTab({ C, MONO, SANS, watchlistData }) {
  const [autoPilot, setAutoPilot] = useState(() => localStorage.getItem("axiom_autopilot") === "on");
  const [autoThreshold, setAutoThreshold] = useState(() => Number(localStorage.getItem("axiom_autopilot_min")) || 5);
  const [aPlusOn, setAPlusOn] = useState(() => localStorage.getItem("axiom_autopilot_aplus") !== "off");
  const [aiGateOn, setAiGateOn] = useState(() => localStorage.getItem("axiom_autopilot_aigate") === "on");
  const [atrMode, setAtrMode] = useState(() => localStorage.getItem("axiom_autopilot_atr") !== "off");
  const [sharesOn, setSharesOn] = useState(() => localStorage.getItem("axiom_autopilot_shares") !== "off"); // default ON
  const [optsOn, setOptsOn] = useState(() => localStorage.getItem("axiom_autopilot_opts") === "on");        // default OFF
  const [shortOn, setShortOn] = useState(() => localStorage.getItem("axiom_autopilot_short") === "on");      // default OFF
  const [trailMode, setTrailMode] = useState(() => localStorage.getItem("axiom_autopilot_trail") !== "off");
  const [exitMode, setExitMode] = useState(() => localStorage.getItem("axiom_autopilot_exit") || "trail");
  const broker = "alpaca";  // SIM removed — Alpaca-only
  const [maxPos, setMaxPos] = useState(() => Number(localStorage.getItem("axiom_autopilot_maxpos")) || 12);
  const [lastCheck, setLastCheck] = useState(() => Number(localStorage.getItem("axiom_autopilot_lastcheck")) || 0);
  const [closing, setClosing] = useState(false);
  const [showSetup, setShowSetup] = useState(() => localStorage.getItem("axiom_autopilot") !== "on"); // collapsed once running
  // ── SIM fully removed: migrate broker to Alpaca and wipe any old SIM paper-trade data (one-time). ──
  useEffect(() => {
    localStorage.setItem("axiom_autopilot_broker", "alpaca");
    if (!localStorage.getItem("axiom_sim_purged")) {
      localStorage.removeItem(GL_TRADES_KEY);
      localStorage.removeItem("axiom_perf_broker");
      localStorage.removeItem("axiom_daily_summary_date");
      localStorage.setItem("axiom_sim_purged", "1");
      window.dispatchEvent(new Event("gl-trades-changed"));
    }
  }, []);
  // Live status inputs (recomputed each render; the tick re-renders this via setLastCheck every 15s).
  const maxLoss = Number(localStorage.getItem("axiom_autopilot_maxloss")) || 0;
  const halted = maxLoss > 0 && localStorage.getItem("axiom_autopilot_halt_date") === new Date().toISOString().slice(0, 10);
  let open = [];
  try { open = (JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []).filter(t => t.status === "OPEN" && t.mode === "PAPER"); } catch {}
  useEffect(() => {
    const onTick = () => setLastCheck(Number(localStorage.getItem("axiom_autopilot_lastcheck")) || 0);
    window.addEventListener("autopilot-tick", onTick);
    return () => window.removeEventListener("autopilot-tick", onTick);
  }, []);
  const toggleAuto = () => { const v = !autoPilot; setAutoPilot(v); localStorage.setItem("axiom_autopilot", v ? "on" : "off"); };
  // ── One-click preset modes — set every toggle at once ──
  const applyPreset = (p) => {
    var cfg = {
      simple:  { shares:"on", opts:"off", short:"off", min:5 },
      calls:   { shares:"on", opts:"on",  short:"off", min:5 },
      full:    { shares:"on", opts:"on",  short:"on",  min:4 },
    }[p];
    if (!cfg) return;
    localStorage.setItem("axiom_autopilot_shares", cfg.shares);
    localStorage.setItem("axiom_autopilot_opts", cfg.opts);
    localStorage.setItem("axiom_autopilot_short", cfg.short);
    localStorage.setItem("axiom_autopilot_min", String(cfg.min));
    setSharesOn(cfg.shares === "on"); setOptsOn(cfg.opts === "on"); setShortOn(cfg.short === "on"); setAutoThreshold(cfg.min);
  };
  const activeMode = (sharesOn && optsOn && shortOn) ? "full" : (sharesOn && optsOn) ? "calls" : "simple";
  const flattenAll = async () => {
    if (!window.confirm("Close ALL open paper positions now?")) return;
    setClosing(true);
    const priceOf = sym => Number((watchlistData || []).find(q => q.symbol === sym)?.price || 0);
    try {
      const trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || [];
      let changed = false;
      const updated = trades.map(t => {
        if (t.status !== "OPEN" || t.mode !== "PAPER") return t;
        changed = true;
        const px = t.instrument === "OPTION" ? optionValue(t, priceOf(t.ticker)) : (priceOf(t.ticker) || t.entry);
        const dir = t.side === "SHORT" ? -1 : 1;
        const rem = t.remaining ?? t.shares;
        const realized = (t.realized || 0) + rem * (px - t.entry) * dir;
        return { ...t, status: "CLOSED", remaining: 0, realized, exit: +px.toFixed(2), closedAt: new Date().toISOString(), exitReason: "MANUAL" };
      });
      if (changed) { localStorage.setItem(GL_TRADES_KEY, JSON.stringify(updated)); window.dispatchEvent(new Event("gl-trades-changed")); }
    } catch {}
    if (broker === "alpaca") {
      try {
        const r = await fetch("/api/alpaca/positions").then(x => x.json());
        if (r?.ok) for (const p of (r.positions || [])) await alpacaClose(p.symbol);
      } catch {}
    }
    logTradeNote("exit", "⏹ CLOSE ALL — flattened every open paper position manually.");
    setClosing(false);
  };

  // Reusable labeled setting block: title + caption + segmented buttons
  const Setting = ({ label, hint, options, value, onPick, accent = C.purple }) => (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textSec, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
        {options.map(([lbl, val, col]) => {
          const sel = value === val;
          const c = col || accent;
          return (
            <button key={String(val)} onClick={() => onPick(val)}
              style={{ background: sel ? c : C.surface, color: sel ? "#fff" : C.textSec,
                border: `1px solid ${sel ? c : C.border}`, borderRadius: 6,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", cursor: "pointer" }}>
              {lbl}
            </button>
          );
        })}
      </div>
      {hint && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 4, maxWidth: 200, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", maxWidth: 980, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🤖 AUTO-PILOT</div>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#10b981", padding: "3px 8px", borderRadius: 6, border: `1px solid #10b98155`, background: "#10b98114" }}>🅰 ALPACA PAPER</span>
        <button onClick={flattenAll} disabled={closing}
          style={{ marginLeft: "auto", background: closing ? C.surface : `${C.red}15`, color: C.red, border: `1px solid ${C.red}55`, borderRadius: 10,
            fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "10px 18px", cursor: closing ? "default" : "pointer" }}>
          {closing ? "closing…" : "⏹ CLOSE ALL"}
        </button>
      </div>

      <>
      {/* ── 1. Master switch (top) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, padding: "16px 18px",
        background: autoPilot ? "#16a34a14" : C.card, border: `2px solid ${autoPilot ? "#16a34a" : C.border}`, borderRadius: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30 }}>🤖</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: autoPilot ? "#16a34a" : C.text }}>
            AUTO-PILOT {autoPilot ? "ON" : "OFF"}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3 }}>
            {autoPilot
              ? `Buying the best ${autoThreshold === 5 ? "5/5" : "4/5+"} setups (up to ${maxPos}), auto-exiting via ${exitMode === "trail" ? "trailing stop" : exitMode === "trend" ? "trend turn" : "price targets"}${broker === "alpaca" ? ", through Alpaca paper" : ""}. Runs in the background on every tab — hands-off.`
              : "Turn on to let the system auto-buy and auto-exit paper trades for you, 100% hands-free."}
          </div>
          {autoPilot && (() => {
            const openCount = open.length;
            const slotsFree = Math.max(0, maxPos - openCount);
            const secsAgo = lastCheck ? Math.round((Date.now() - lastCheck) / 1000) : null;
            const dot = halted ? C.red : "#22c55e";
            const state = halted ? "PAUSED — circuit breaker" : slotsFree > 0 ? "SCANNING for setups" : "FULL — holding best positions";
            const chip = (txt, col) => <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, borderRadius: 5, padding: "2px 7px" }}>{txt}</span>;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, display: "inline-block", boxShadow: `0 0 6px ${dot}`, animation: halted ? "none" : "pulse 1.5s infinite" }} />
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: dot }}>{state}</span>
                {chip(`${openCount}/${maxPos} open`, C.textSec)}
                {!halted && chip(`${slotsFree} slot${slotsFree === 1 ? "" : "s"} free`, slotsFree > 0 ? C.green : C.amber)}
                {maxLoss > 0 && chip(halted ? `stopped at −$${maxLoss}` : `breaker −$${maxLoss}`, halted ? C.red : C.textDim)}
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                  · checked {secsAgo == null ? "starting…" : secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo / 60)}m ago`} (every 15s)
                </span>
              </div>
            );
          })()}
        </div>
        <button onClick={toggleAuto}
          style={{ background: autoPilot ? "#16a34a" : C.surface, color: autoPilot ? "#fff" : C.textSec,
            border: `2px solid ${autoPilot ? "#16a34a" : C.border}`, borderRadius: 10,
            fontFamily: MONO, fontSize: 15, fontWeight: 900, padding: "14px 30px", cursor: "pointer", letterSpacing: "0.04em" }}>
          {autoPilot ? "⏹ TURN OFF" : "▶ TURN ON"}
        </button>
      </div>

      {/* ── Account hero (equity, today, positions) ── */}
      <AlpacaPanel C={C} MONO={MONO} SANS={SANS} />

      {/* ── Setup (collapsible) — quick modes + fine-tune + broker panel ── */}
      <button onClick={() => setShowSetup(s => !s)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: showSetup ? 14 : 12, padding: "10px 16px",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textSec }}>
        <span style={{ transform: showSetup ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span>
        ⚙️ AUTOPILOT SETUP
        <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 500, color: C.textDim }}>
          {showSetup ? "— quick modes, fine-tune, broker" : `— ${activeMode === "simple" ? "Simple" : activeMode === "calls" ? "Long + Calls" : activeMode === "full" ? "Full Auto" : "Custom"} · ${broker.toUpperCase()} · tap to change`}
        </span>
      </button>

      {showSetup && <>
      {/* ── Quick Modes — one-click presets ── */}
      <div style={{ marginBottom: 14, padding: "14px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textSec, letterSpacing: "0.06em", marginBottom: 4 }}>⚡ QUICK MODE — one click sets everything</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 12 }}>Don't want to fiddle with toggles? Pick a mode and the auto-pilot configures itself.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["simple", "🟢 Simple", "Long stocks only", "Buys shares on green setups. Safest, easiest."],
            ["calls", "📈 Long + Calls", "Stocks + call options", "Adds call options on bullish setups for more upside."],
            ["full", "🔥 Full Auto", "Long + calls, short + conservative puts", "Calls on bullish setups; shorts weak stocks (shares); only 5/5 bearish setups buy a single defined-risk put."],
          ].map(([id, label, sub, desc]) => {
            const on = activeMode === id;
            return (
              <button key={id} onClick={() => applyPreset(id)} title={desc}
                style={{ flex: "1 1 180px", textAlign: "left", cursor: "pointer", borderRadius: 10, padding: "12px 14px",
                  border: `1px solid ${on ? C.accent : C.border}`, background: on ? `${C.accent}14` : "transparent" }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: on ? C.accent : C.text }}>{label}{on ? " ✓" : ""}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginTop: 3 }}>{sub}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Settings ── */}
      <div style={{ marginBottom: 14, padding: "14px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textSec, letterSpacing: "0.06em", marginBottom: 12 }}>⚙️ FINE-TUNE (optional)</div>
        <div style={{ display: "flex", gap: 22, rowGap: 16, flexWrap: "wrap" }}>
          <Setting label="A+ MODE" hint="ON = only buys A+ Institutional setups (score ≥90, market green), sized by confidence (1% / 0.75% / 0.5%), max 5 trades/day." value={aPlusOn}
            onPick={on => { setAPlusOn(on); localStorage.setItem("axiom_autopilot_aplus", on ? "on" : "off"); }}
            options={[["A+ ✓", true], ["BASIC", false]]} />
          <Setting label="🤖 AI GATE" hint="ON = Claude reviews every trade before it's placed and can veto it (only proceeds on a BUY verdict). Adds ~1 cheap Haiku call per trade. Fails open if the API is down." value={aiGateOn}
            onPick={on => { setAiGateOn(on); localStorage.setItem("axiom_autopilot_aigate", on ? "on" : "off"); }}
            options={[["ON", true], ["OFF", false]]} />
          <Setting label="WHEN TO BUY" hint="(Basic mode) How strict the entry is. 5/5 = fewer, perfect setups." value={autoThreshold}
            onPick={n => { setAutoThreshold(n); localStorage.setItem("axiom_autopilot_min", n); }}
            options={[["4/5+", 4], ["5/5 only", 5]]} />
          <Setting label="MAX POSITIONS" hint="Holds only the best-ranked setups, up to this many at once." value={maxPos}
            onPick={n => { setMaxPos(n); localStorage.setItem("axiom_autopilot_maxpos", n); }}
            options={[["10", 10], ["12", 12], ["15", 15]]} />
          <Setting label="STOP SIZE" hint="ATR sizes the stop to each stock's volatility. FIXED uses a flat %." value={atrMode}
            onPick={on => { setAtrMode(on); localStorage.setItem("axiom_autopilot_atr", on ? "on" : "off"); }}
            options={[["ATR", true], ["FIXED", false]]} />
          <Setting label="TRAILING STOP" hint="Ratchets the stop up as price rises to lock in gains. Never moves down." value={trailMode}
            onPick={on => { setTrailMode(on); localStorage.setItem("axiom_autopilot_trail", on ? "on" : "off"); }}
            options={[["ON", true], ["OFF", false]]} />
          <Setting label="HOW TO EXIT" hint="TRAIL = the backtest-validated exit (+1.70R). Let winners run." value={exitMode}
            onPick={val => { setExitMode(val); localStorage.setItem("axiom_autopilot_exit", val); }}
            options={[["TRAIL ✓", "trail"], ["TARGETS", "targets"], ["TREND", "trend"]]} />
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 6 }}>BROKER</div>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#10b981", background: "#10b98118", border: "1px solid #10b98144", borderRadius: 6, padding: "5px 10px" }}>🅰 ALPACA PAPER</span>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 4, maxWidth: 200, lineHeight: 1.4 }}>All trades run through your Alpaca paper account.</div>
          </div>
        </div>
      </div>
      </>}
      </>

      <AlpacaReportCard C={C} MONO={MONO} SANS={SANS} />
      <TierStatsCard C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}
