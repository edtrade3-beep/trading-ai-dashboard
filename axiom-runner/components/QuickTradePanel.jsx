import { useState, useEffect, useMemo } from "react";
import { computeRegime } from "./market-helpers.js";
import { computeGreenLight } from "./trading-utils.js";

// ⚡ Quick Trade Engine — Phase 1 floating execution panel. Real Alpaca paper
// orders through /api/quick-trade/* (src/quick-trade-service.js), gated by
// the real pre-trade risk check (account health, daily loss breaker, open
// risk, sector cap, market hours) that the old manual order path never ran.
// Opposite side (bottom-left) from the existing Copilot/Checklist/
// RealityCheck stack (bottom-right), same offset formula so it never
// collides with them at any statusBarH.
const SIZE_METHODS = [
  { id: "shares", label: "Shares" },
  { id: "dollars", label: "$ Amount" },
  { id: "percent", label: "Port %" },
  { id: "risk", label: "$ Risk" },
];
const ORDER_TYPES = [
  { id: "market", label: "Market" },
  { id: "limit", label: "Limit" },
  { id: "stop", label: "Stop" },
  { id: "stop_limit", label: "Stop Limit" },
];
const SHARE_PRESETS = [10, 25, 50, 100, 250, 500];
const DOLLAR_PRESETS = [500, 1000, 2500, 5000];
const RISK_PRESETS = [50, 100, 250, 500];
const R_MULTIPLES = [1, 2, 3, 4];

export default function QuickTradePanel({ C, MONO, SANS, terminalSymbol, setTerminalSymbol, macroData, scanResults, statusBarH = 40, fabFading = false }) {
  const [open, setOpen] = useState(false);
  const [symbolInput, setSymbolInput] = useState(terminalSymbol || "AAPL");
  const [quote, setQuote] = useState(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [trend, setTrend] = useState(null);

  const [sizeMethod, setSizeMethod] = useState("shares");
  const [shares, setShares] = useState(10);
  const [dollars, setDollars] = useState(1000);
  const [percent, setPercent] = useState(5);
  const [riskDollars, setRiskDollars] = useState(100);
  const [riskQty, setRiskQty] = useState(null); // server-computed via precheck

  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [useBracket, setUseBracket] = useState(true);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [confirm, setConfirm] = useState(null); // { side, qty, opts, positionValue } | null
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  // Stay in sync with whatever symbol the rest of the app has selected
  // (Market Terminal, Green Light deep-dive, etc.) — same shared source of
  // truth every other tab already reads.
  useEffect(() => { if (terminalSymbol) setSymbolInput(terminalSymbol); }, [terminalSymbol]);
  const symbol = (symbolInput || "").trim().toUpperCase();

  // Real quote poll — same 60s Alpaca-first fast path HoldingsTab uses.
  useEffect(() => {
    if (!open || !symbol) return;
    let alive = true;
    const load = () => fetch(`/api/market/quote?symbols=${encodeURIComponent(symbol)}`)
      .then(r => r.json()).then(d => { if (alive) setQuote(Array.isArray(d) ? (d[0] || null) : null); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [open, symbol]);

  // Real account + positions poll — same 30s pattern GreenLightTab's
  // AutopilotStatusCard already uses, independent interval (no shared
  // top-level Alpaca state exists anywhere in this app).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => {
      fetch("/api/alpaca/account").then(r => r.json()).then(d => { if (alive && d.ok) setAccount(d.account); }).catch(() => {});
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => { if (alive && d.ok) setPositions(d.positions || []); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [open]);

  // Real trend-template fetch — same endpoint TrendSetupPanel/DashboardTab
  // use, needed for the ATR/Prev-Low stop methods and (with a real matching
  // scanResults row) the honest AI Score below.
  useEffect(() => {
    if (!open || !symbol) { setTrend(null); return; }
    let alive = true;
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json()).then(d => { if (alive && d && !d.error) setTrend(d); }).catch(() => {});
    return () => { alive = false; };
  }, [open, symbol]);

  const price = Number(quote?.price || quote?.regularMarketPrice || 0);
  const chgPct = Number(quote?.changesPercentage || 0);
  const regime = useMemo(() => computeRegime(macroData), [macroData]);
  const spyChg = useMemo(() => Number((macroData || []).find(m => m.symbol === "SPY")?.changesPercentage || 0), [macroData]);

  // Never fabricate a score for an arbitrary typed-in symbol — only render
  // one when a real scanned row for this exact symbol exists (GreenLight's
  // own scan output, wired in by the caller). Otherwise honest "—".
  const scanRow = useMemo(() => (scanResults || []).find(r => r.ticker === symbol), [scanResults, symbol]);
  const aiScore = useMemo(() => {
    if (!quote || !scanRow) return null;
    try { return computeGreenLight(quote, spyChg, scanRow, regime.score, trend).score; } catch { return null; }
  }, [quote, scanRow, spyChg, regime.score, trend]);

  const heldPosition = positions.find(p => p.symbol === symbol) || null;

  // Real ATR stop formula — same one HoldingsTab uses (day-range proxy,
  // floored/capped 1%-5%, ×1.5 for the stop distance).
  const atrStop = (dir) => {
    if (!(price > 0)) return null;
    const dayRange = Number(quote?.dayHigh || 0) - Number(quote?.dayLow || 0);
    let atrPct = price > 0 && dayRange > 0 ? dayRange / price : 0.025;
    atrPct = Math.max(0.01, Math.min(0.05, atrPct));
    return dir === "short" ? +(price * (1 + atrPct * 1.5)).toFixed(2) : +(price * (1 - atrPct * 1.5)).toFixed(2);
  };
  const applyStopMethod = (method, dir = "long") => {
    if (method === "atr") { const s = atrStop(dir); if (s) setStopLoss(String(s)); return; }
    if (method === "prevlow" && trend?.setup?.stop) { setStopLoss(String(trend.setup.stop)); return; }
    if (method === "manual") return; // leave field as-is for manual typing
  };

  const rTarget = (mult, dir = "long") => {
    const entry = orderType === "limit" && limitPrice ? Number(limitPrice) : price;
    const stop = Number(stopLoss);
    if (!(entry > 0) || !(stop > 0)) return null;
    const riskPerShare = Math.abs(entry - stop);
    return dir === "short" ? +(entry - riskPerShare * mult).toFixed(2) : +(entry + riskPerShare * mult).toFixed(2);
  };

  // Dollar-risk sizing goes through the real server-side precheck/sizeByRisk
  // (one real source of truth) instead of a duplicated client formula —
  // expressed here as a flat $ amount, converted to the riskPct the server
  // API expects.
  useEffect(() => {
    if (sizeMethod !== "risk" || !open || !symbol || !(price > 0) || !(Number(stopLoss) > 0) || !account?.equity) { setRiskQty(null); return; }
    const riskPct = (riskDollars / account.equity) * 100;
    const dir = Number(stopLoss) > price ? "short" : "long";
    const qs = new URLSearchParams({ symbol, riskPct: String(riskPct), entry: String(price), stop: String(stopLoss), side: dir });
    fetch(`/api/quick-trade/precheck?${qs}`).then(r => r.json()).then(d => { if (d.ok && d.sizing) setRiskQty(d.sizing.qty); }).catch(() => {});
  }, [sizeMethod, open, symbol, price, stopLoss, riskDollars, account?.equity]);

  const computedQty = useMemo(() => {
    if (sizeMethod === "shares") return Math.max(0, Math.floor(Number(shares) || 0));
    if (sizeMethod === "dollars") return price > 0 ? Math.max(0, Math.floor(Number(dollars) / price)) : 0;
    if (sizeMethod === "percent") return price > 0 && account?.equity ? Math.max(0, Math.floor((account.equity * (Number(percent) / 100)) / price)) : 0;
    if (sizeMethod === "risk") return riskQty || 0;
    return 0;
  }, [sizeMethod, shares, dollars, percent, price, account?.equity, riskQty]);

  const positionValue = +(computedQty * price).toFixed(2);

  const submit = async (side) => {
    if (!symbol || computedQty < 1) { setStatus("Set a symbol and a size > 0."); return; }
    const opts = {
      type: orderType,
      limitPrice: (orderType === "limit" || orderType === "stop_limit") ? Number(limitPrice) || undefined : undefined,
      stopPrice: (orderType === "stop" || orderType === "stop_limit") ? Number(stopPrice) || undefined : undefined,
      stopLoss: useBracket && Number(stopLoss) > 0 ? Number(stopLoss) : undefined,
      takeProfit: useBracket && Number(takeProfit) > 0 ? Number(takeProfit) : undefined,
    };
    const needsConfirm = side === "short" || positionValue > 2500 || (account?.buyingPower > 0 && positionValue > account.buyingPower * 0.03);
    if (needsConfirm && !confirm) { setConfirm({ side, qty: computedQty, opts, positionValue }); return; }
    setConfirm(null);
    setBusy(true); setStatus("Submitting…");
    try {
      const r = await fetch("/api/quick-trade/order", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, qty: computedQty, side, ...opts }) });
      const d = await r.json();
      if (d.ok) setStatus(`✅ ${side.toUpperCase()} ${computedQty} ${symbol} — order ${d.order.status}`);
      else setStatus(`⚠ ${d.reason || d.error || "order blocked"}`);
    } catch (e) { setStatus(`⚠ ${e.message}`); }
    setBusy(false);
  };

  const panic = async (path, label) => {
    setBusy(true); setStatus(`${label}…`);
    try {
      const body = path === "close" ? { symbol } : undefined;
      const r = await fetch(`/api/quick-trade/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      setStatus(d.ok ? `✅ ${label} done` : `⚠ ${d.reason || d.error || "failed"}`);
    } catch (e) { setStatus(`⚠ ${e.message}`); }
    setBusy(false);
  };

  const chip = (bg, fg, text) => <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: bg, color: fg }}>{text}</span>;
  const inputStyle = { fontFamily: MONO, fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, width: "100%", outline: "none" };
  const btn = (active, danger) => ({
    fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 10px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${active ? "#c96f00" : C.border}`, background: active ? "#c96f0022" : C.card, color: active ? "#c96f00" : C.textSec,
  });

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Quick Trade"
        style={{ position: "fixed", bottom: 18 + statusBarH, left: 18, zIndex: 9999, width: 54, height: 54, borderRadius: "50%", cursor: "pointer",
          border: "none", background: "#c96f00", color: "#fff", fontSize: 22, boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
          opacity: fabFading && !open ? 0 : 1, pointerEvents: fabFading && !open ? "none" : "auto", transition: "opacity 0.2s" }}>{open ? "✕" : "⚡"}</button>

      {open && (
        <div style={{ position: "fixed", bottom: 82 + statusBarH, left: 18, zIndex: 9999, width: "min(360px, 92vw)", maxHeight: "min(680px, 80vh)",
          display: "flex", flexDirection: "column", background: "#14120f", border: "1px solid #3a2f22", borderRadius: 14,
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden", color: "#e8e0d4" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #3a2f22", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: "#c96f00" }}>⚡ QUICK TRADE</span>
            {chip(regime.color + "22", regime.color, regime.label)}
            <div style={{ flex: 1 }} />
            {chip("#c96f0022", "#c96f00", "PAPER")}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Symbol + price */}
            <div>
              <input value={symbolInput} onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                onBlur={() => setTerminalSymbol && setTerminalSymbol(symbol)}
                onKeyDown={e => { if (e.key === "Enter") setTerminalSymbol && setTerminalSymbol(symbol); }}
                placeholder="Symbol" style={{ ...inputStyle, fontSize: 16, fontWeight: 800, textAlign: "center" }} />
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{price > 0 ? `$${price.toFixed(2)}` : "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: chgPct >= 0 ? "#22c55e" : "#ef4444" }}>{chgPct ? `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%` : ""}</span>
                {chip("#33291c", "#d6a312", aiScore != null ? `AI ${aiScore}` : "AI —")}
              </div>
              {heldPosition && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: "#a89a86", textAlign: "center", marginTop: 2 }}>
                  Holding {heldPosition.qty} sh · {heldPosition.side} · P/L {heldPosition.unrealizedPL >= 0 ? "+" : ""}{heldPosition.unrealizedPL?.toFixed(0)}
                </div>
              )}
            </div>

            {/* Account strip */}
            <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 10, color: "#a89a86", justifyContent: "space-between", padding: "6px 8px", background: "#1d1a15", borderRadius: 8 }}>
              <span>BP ${account ? Math.round(account.buyingPower).toLocaleString() : "—"}</span>
              <span>Positions {positions.length}</span>
              <span>P/L {account ? `${account.equity - account.lastEquity >= 0 ? "+" : ""}${Math.round(account.equity - account.lastEquity)}` : "—"}</span>
            </div>

            {/* Side buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button disabled={busy} onClick={() => submit("buy")} style={{ ...btn(false), background: "#0d946522", border: "1px solid #0d9465", color: "#22c55e", padding: "10px", fontSize: 13 }}>BUY</button>
              <button disabled={busy} onClick={() => submit("sell")} style={{ ...btn(false), background: "#c8282a22", border: "1px solid #c8282a", color: "#ef4444", padding: "10px", fontSize: 13 }}>SELL</button>
              <button disabled={busy} onClick={() => submit("short")} style={{ ...btn(false), background: "#7a1f2222", border: "1px solid #7a1f22", color: "#f87171", padding: "10px", fontSize: 13 }}>SHORT</button>
              <button disabled={busy} onClick={() => submit("cover")} style={{ ...btn(false), background: "#1d4ed822", border: "1px solid #1d4ed8", color: "#60a5fa", padding: "10px", fontSize: 13 }}>COVER</button>
            </div>

            {/* Sizing */}
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {SIZE_METHODS.map(m => <button key={m.id} onClick={() => setSizeMethod(m.id)} style={{ ...btn(sizeMethod === m.id), flex: 1 }}>{m.label}</button>)}
              </div>
              {sizeMethod === "shares" && (<>
                <input type="number" value={shares} onChange={e => setShares(e.target.value)} style={inputStyle} />
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{SHARE_PRESETS.map(v => <button key={v} onClick={() => setShares(v)} style={btn(false)}>{v}</button>)}</div>
              </>)}
              {sizeMethod === "dollars" && (<>
                <input type="number" value={dollars} onChange={e => setDollars(e.target.value)} style={inputStyle} />
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{DOLLAR_PRESETS.map(v => <button key={v} onClick={() => setDollars(v)} style={btn(false)}>${v}</button>)}</div>
              </>)}
              {sizeMethod === "percent" && <input type="number" value={percent} onChange={e => setPercent(e.target.value)} style={inputStyle} placeholder="% of equity" />}
              {sizeMethod === "risk" && (<>
                <input type="number" value={riskDollars} onChange={e => setRiskDollars(e.target.value)} style={inputStyle} placeholder="$ risk (needs a stop set below)" />
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{RISK_PRESETS.map(v => <button key={v} onClick={() => setRiskDollars(v)} style={btn(false)}>${v}</button>)}</div>
              </>)}
              <div style={{ fontFamily: MONO, fontSize: 11, color: "#a89a86", marginTop: 4 }}>
                {computedQty} sh · ${positionValue.toLocaleString()} position value
              </div>
            </div>

            {/* Order type */}
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {ORDER_TYPES.map(t => <button key={t.id} onClick={() => setOrderType(t.id)} style={{ ...btn(orderType === t.id), flex: 1, fontSize: 10 }}>{t.label}</button>)}
              </div>
              {(orderType === "limit" || orderType === "stop_limit") && <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder="Limit price" style={{ ...inputStyle, marginBottom: 4 }} />}
              {(orderType === "stop" || orderType === "stop_limit") && <input type="number" value={stopPrice} onChange={e => setStopPrice(e.target.value)} placeholder="Stop trigger price" style={inputStyle} />}
            </div>

            {/* Bracket / stop-loss */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#a89a86", marginBottom: 6 }}>
                <input type="checkbox" checked={useBracket} onChange={e => setUseBracket(e.target.checked)} /> Bracket (stop + target)
              </label>
              {useBracket && (<>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="Stop loss" style={inputStyle} />
                  <input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} placeholder="Take profit" style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                  <button onClick={() => applyStopMethod("atr")} style={btn(false)}>ATR stop</button>
                  <button onClick={() => applyStopMethod("prevlow")} style={btn(false)} disabled={!trend?.setup?.stop}>Prev low</button>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {R_MULTIPLES.map(m => <button key={m} disabled={!Number(stopLoss)} onClick={() => setTakeProfit(String(rTarget(m)))} style={btn(false)}>{m}R</button>)}
                </div>
              </>)}
            </div>

            {/* Panic buttons */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#7a6a55", marginBottom: 4 }}>PANIC BUTTONS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <button disabled={busy || !heldPosition} onClick={() => panic("close", "Close position")} style={btn(false)}>Close {symbol}</button>
                <button disabled={busy} onClick={() => panic("flatten", "Flatten account")} style={{ ...btn(false), border: "1px solid #c8282a", color: "#ef4444" }}>FLATTEN ALL</button>
                <button disabled={busy} onClick={() => panic("close-all-longs", "Close all longs")} style={btn(false)}>Close longs</button>
                <button disabled={busy} onClick={() => panic("close-all-shorts", "Close all shorts")} style={btn(false)}>Close shorts</button>
              </div>
            </div>

            {status && <div style={{ fontFamily: MONO, fontSize: 11, color: status.startsWith("⚠") ? "#ef4444" : "#22c55e", textAlign: "center" }}>{status}</div>}
          </div>
        </div>
      )}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#14120f", border: "1px solid #3a2f22", borderRadius: 12, padding: 20, width: "min(320px, 90vw)", color: "#e8e0d4" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: "#c96f00", marginBottom: 10 }}>CONFIRM {confirm.side.toUpperCase()}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.7 }}>
              {confirm.qty} sh {symbol} @ ~${price.toFixed(2)}<br />
              Est. value: ${confirm.positionValue.toLocaleString()}<br />
              {confirm.opts.stopLoss && <>Stop: ${confirm.opts.stopLoss}<br /></>}
              {confirm.opts.takeProfit && <>Target: ${confirm.opts.takeProfit}<br /></>}
              {confirm.side === "short" && <span style={{ color: "#f87171" }}>Short sale — unlimited downside risk.<br /></span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setConfirm(null)} style={{ ...btn(false), flex: 1, padding: 10 }}>Cancel</button>
              <button onClick={() => submit(confirm.side)} style={{ ...btn(true), flex: 1, padding: 10 }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
