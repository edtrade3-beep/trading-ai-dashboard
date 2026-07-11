// ── Auto-Execute Panel ────────────────────────────────────────────────────────
export default function AutoExecPanel({ C, MONO, SANS }) {
  const [cfg,       setCfg]       = React.useState(null);
  const [positions, setPositions] = React.useState([]);
  const [orders,    setOrders]    = React.useState([]);
  const [saving,    setSaving]    = React.useState(false);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState(null);
  const [tab,       setTab]       = React.useState("settings"); // settings | positions | orders

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/autoexec/config");
      const d = await r.json();
      setCfg(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadPositions = React.useCallback(async () => {
    try {
      const r = await fetch("/api/autoexec/positions");
      const d = await r.json();
      if (d.positions) setPositions(d.positions);
    } catch {}
  }, []);

  const loadOrders = React.useCallback(async () => {
    try {
      const r = await fetch("/api/autoexec/orders");
      const d = await r.json();
      if (d.orders) setOrders(d.orders);
    } catch {}
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (tab === "positions") loadPositions();
    if (tab === "orders")    loadOrders();
  }, [tab]);

  const save = React.useCallback(async (patch) => {
    setSaving(true);
    try {
      const r = await fetch("/api/autoexec/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (d.config) setCfg(prev => ({ ...prev, ...d.config }));
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }, []);

  const cancelOrder = React.useCallback(async (id) => {
    await fetch(`/api/autoexec/order/${id}`, { method: "DELETE" });
    loadOrders();
  }, [loadOrders]);

  const card  = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", marginBottom: 12 };
  const label = { fontFamily: MONO, fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 };
  const input = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" };
  const btn   = (active, color) => ({ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: `1px solid ${color || C.border}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", background: active ? (color || C.accent) : "transparent", color: active ? "#fff" : (color || C.text) });

  if (loading) return <div style={{ padding: 40, fontFamily: MONO, color: C.textDim, textAlign: "center" }}>Loading…</div>;
  if (!cfg)    return <div style={{ padding: 40, fontFamily: MONO, color: C.red }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px 4px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>🤖 AUTO-EXECUTE</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            {cfg.live ? "🔴 LIVE TRADING" : "🧪 PAPER / SANDBOX"} &nbsp;•&nbsp;
            {cfg.brokerConfigured ? <span style={{ color: C.green }}>Tradier connected</span> : <span style={{ color: C.red }}>Tradier not configured</span>}
          </div>
        </div>
        {/* Master toggle */}
        <button
          onClick={() => save({ enabled: !cfg.enabled })}
          style={{ ...btn(cfg.enabled, cfg.enabled ? C.green : C.red), fontSize: 13, padding: "8px 20px" }}>
          {cfg.enabled ? "● ACTIVE" : "○ DISABLED"}
        </button>
      </div>

      {!cfg.brokerConfigured && (
        <div style={{ ...card, borderColor: C.amber, background: "rgba(245,158,11,0.07)", marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber }}>
            ⚠️ Set <b>TRADIER_API_KEY</b> and <b>TRADIER_ACCOUNT_ID</b> in Render.com environment variables to enable order placement.
            Set <b>TRADIER_LIVE=true</b> to switch from paper to live trading.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["settings","positions","orders"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={btn(tab === t)}>
            {t === "settings" ? "⚙️ SETTINGS" : t === "positions" ? "📊 POSITIONS" : "📋 ORDERS"}
          </button>
        ))}
        <button onClick={load} style={{ ...btn(false), marginLeft: "auto" }}>↻ REFRESH</button>
      </div>

      {/* ── SETTINGS TAB ── */}
      {tab === "settings" && (
        <div>
          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 12, letterSpacing: "0.06em" }}>TRADE PARAMETERS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <span style={label}>POSITION SIZE ($)</span>
                <input style={input} type="number" value={cfg.positionSize} min={50} step={50}
                  onChange={e => setCfg(p => ({ ...p, positionSize: +e.target.value }))}
                  onBlur={() => save({ positionSize: cfg.positionSize })} />
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>$ per trade (shares = size ÷ price)</div>
              </div>
              <div>
                <span style={label}>MAX OPEN POSITIONS</span>
                <input style={input} type="number" value={cfg.maxPositions} min={1} max={10}
                  onChange={e => setCfg(p => ({ ...p, maxPositions: +e.target.value }))}
                  onBlur={() => save({ maxPositions: cfg.maxPositions })} />
              </div>
              <div>
                <span style={label}>MAX DAILY LOSS ($)</span>
                <input style={input} type="number" value={cfg.maxDailyLoss} min={0} step={50}
                  onChange={e => setCfg(p => ({ ...p, maxDailyLoss: +e.target.value }))}
                  onBlur={() => save({ maxDailyLoss: cfg.maxDailyLoss })} />
              </div>
              <div>
                <span style={label}>ORDER TYPE</span>
                <select style={input} value={cfg.orderType} onChange={e => { setCfg(p => ({ ...p, orderType: e.target.value })); save({ orderType: e.target.value }); }}>
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 12, letterSpacing: "0.06em" }}>SIGNAL FILTERS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <span style={label}>MIN SCORE (default 88)</span>
                <input style={input} type="number" value={cfg.scoreThreshold} min={70} max={99}
                  onChange={e => setCfg(p => ({ ...p, scoreThreshold: +e.target.value }))}
                  onBlur={() => save({ scoreThreshold: cfg.scoreThreshold })} />
              </div>
              <div>
                <span style={label}>MIN RVOL (default 2.0×)</span>
                <input style={input} type="number" value={cfg.rvolThreshold} min={1} max={10} step={0.1}
                  onChange={e => setCfg(p => ({ ...p, rvolThreshold: +e.target.value }))}
                  onBlur={() => save({ rvolThreshold: cfg.rvolThreshold })} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="allowShorts" checked={!!cfg.allowShorts}
                onChange={e => { save({ allowShorts: e.target.checked }); setCfg(p => ({ ...p, allowShorts: e.target.checked })); }} />
              <label htmlFor="allowShorts" style={{ fontFamily: MONO, fontSize: 12, color: C.text, cursor: "pointer" }}>
                Allow short sells on SELL signals (requires margin account)
              </label>
            </div>
          </div>

          <div style={{ ...card, borderColor: C.amber, background: "rgba(245,158,11,0.05)" }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber, lineHeight: 1.7 }}>
              ⚠️ <b>Safety rules:</b> Only 1 trade per symbol per day. Max {cfg.maxPositions} simultaneous auto positions.
              Auto-exec only fires on score ≥ {cfg.scoreThreshold} with RVOL ≥ {cfg.rvolThreshold}×.
              Every trade is confirmed via Telegram. {cfg.live ? "LIVE mode — real money." : "Paper mode — no real money at risk."}
            </div>
          </div>

          {saving && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", marginTop: 8 }}>Saving…</div>}
        </div>
      )}

      {/* ── POSITIONS TAB ── */}
      {tab === "positions" && (
        <div style={card}>
          {positions.length === 0
            ? <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 12, padding: 20, textAlign: "center" }}>No open positions</div>
            : positions.map(p => (
              <div key={p.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>{p.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{p.quantity} shares</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Cost ${p.costBasis?.toFixed(2)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{p.dateAcquired?.slice(0,10)}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === "orders" && (
        <div style={card}>
          {orders.length === 0
            ? <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 12, padding: 20, textAlign: "center" }}>No recent orders</div>
            : orders.map(o => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: o.side === "buy" ? C.green : C.red }}>{o.side?.toUpperCase()}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{o.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{o.quantity} sh</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>#{o.id}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: o.status === "filled" ? C.green : o.status === "canceled" ? C.red : C.amber, marginLeft: "auto" }}>{o.status?.toUpperCase()}</span>
                {o.status === "open" || o.status === "pending" ? (
                  <button onClick={() => cancelOrder(o.id)} style={{ ...btn(false, C.red), padding: "3px 8px", fontSize: 12 }}>CANCEL</button>
                ) : null}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
