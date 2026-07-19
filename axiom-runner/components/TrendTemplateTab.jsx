import { NUM } from "./theme.js";
import TrendChart from "./TrendChart.jsx";

export default function TrendTemplateTab({ C, MONO, SANS, watchlistSymbols }) {
  const [sym, setSym]   = React.useState("ARM");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr]   = React.useState(null);
  const [screen, setScreen] = React.useState(null);
  const [screening, setScreening] = React.useState(false);
  const [scoreFilter, setScoreFilter] = React.useState("ALL"); // ALL | BUY | 8 | 7 | 6
  const [showHelp, setShowHelp] = React.useState(false);
  const [showReport, setShowReport] = React.useState(false);
  const [rowOpen, setRowOpen] = React.useState(null);   // symbol expanded inline in the table
  const [rowData, setRowData] = React.useState({});      // symbol -> full trend-template payload
  const [rowLoading, setRowLoading] = React.useState(null);

  const toggleRow = React.useCallback((symbol) => {
    if (rowOpen === symbol) { setRowOpen(null); return; }
    setRowOpen(symbol);
    if (!rowData[symbol]) {
      setRowLoading(symbol);
      fetch("/api/market/trend-template?symbol=" + encodeURIComponent(symbol))
        .then(r => r.json())
        .then(d => { if (!d.error) setRowData(prev => ({ ...prev, [symbol]: d })); })
        .catch(() => {})
        .finally(() => setRowLoading(null));
    }
  }, [rowOpen, rowData]);

  const scanWatchlist = React.useCallback(() => {
    setScreening(true); setScreen(null);
    const go = (syms) => {
      const list = (syms || []).map(s => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 60);
      if (!list.length) { setScreening(false); setScreen({ results: [], empty: true }); return; }
      fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(list.join(",")))
        .then(r => r.json())
        .then(d => setScreen(d))
        .catch(e => setScreen({ error: e.message }))
        .finally(() => setScreening(false));
    };
    if (watchlistSymbols && watchlistSymbols.length) return go(watchlistSymbols);
    fetch("/api/watchlist").then(r => r.json()).then(d => go(d.symbols)).catch(() => go([]));
  }, [watchlistSymbols]);

  const [alertMsg, setAlertMsg] = React.useState("");
  const armPivotAlert = React.useCallback((symbol, pivot) => {
    fetch("/api/price-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, targetPrice: pivot, direction: "above", requireVolume: true, note: "Minervini pivot breakout" }),
    }).then(r => r.json())
      .then(d => setAlertMsg(d.error ? `${symbol}: ${d.error}` : `🔔 Alert armed — ${symbol} above ${pivot}`))
      .catch(e => setAlertMsg(symbol + ": " + e.message));
    setTimeout(() => setAlertMsg(""), 4000);
  }, []);

  // Auto-arm: when ON, every screener refresh arms pivot alerts for any NEW buy points (deduped).
  const [autoAlert, setAutoAlert] = React.useState(() => localStorage.getItem("axiom_tt_autoalert") === "on");
  const armedRef = React.useRef(new Set());
  const armNewPivotAlerts = React.useCallback((results) => {
    const fresh = (results || []).filter(r => !r.error && !r.extended && Number(r.pivot) > 0 && !armedRef.current.has(`${r.symbol}:${r.pivot}`));
    if (!fresh.length) return;
    fresh.forEach(r => armedRef.current.add(`${r.symbol}:${r.pivot}`));
    Promise.all(fresh.map(r =>
      fetch("/api/price-alerts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: r.symbol, targetPrice: Number(r.pivot), direction: "above", requireVolume: true, note: "Minervini buy point (auto)" }),
      }).then(res => res.json()).catch(() => ({ error: 1 }))
    )).then(res => {
      const ok = res.filter(d => d && !d.error).length;
      if (ok) { setAlertMsg(`🔔 Auto-armed ${ok} new buy-point alert${ok === 1 ? "" : "s"}`); setTimeout(() => setAlertMsg(""), 5000); }
    });
  }, []);
  React.useEffect(() => {
    if (autoAlert && screen?.results) armNewPivotAlerts(screen.results);
  }, [screen, autoAlert, armNewPivotAlerts]);

  // Arm a pivot-breakout alert on EVERY watch name at once, so you get pinged the moment each buy point triggers.
  const armAllPivotAlerts = React.useCallback((results) => {
    const targets = (results || []).filter(r => !r.error && !r.extended && Number(r.pivot) > 0);
    if (!targets.length) { setAlertMsg("No names with a valid pivot to arm."); setTimeout(() => setAlertMsg(""), 4000); return; }
    Promise.all(targets.map(r =>
      fetch("/api/price-alerts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: r.symbol, targetPrice: Number(r.pivot), direction: "above", requireVolume: true, note: "Minervini buy point (auto-armed)" }),
      }).then(res => res.json()).catch(() => ({ error: 1 }))
    )).then(res => {
      const ok = res.filter(d => d && !d.error).length;
      setAlertMsg(`🔔 Armed ${ok} buy-point alerts — you'll be pinged the moment each crosses its pivot.`);
      setTimeout(() => setAlertMsg(""), 6000);
    });
  }, []);

  const load = React.useCallback((s, silent) => {
    const symbol = (s || sym || "ARM").trim().toUpperCase();
    if (!symbol) return;
    if (!silent) { setLoading(true); setErr(null); }
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json())
      .then(d => { if (d.error) { if (!silent) { setErr(d.error); setData(null); } } else { setData(d); } })
      .catch(e => { if (!silent) { setErr(e.message); setData(null); } })
      .finally(() => { if (!silent) setLoading(false); });
  }, [sym]);

  React.useEffect(() => { load("ARM"); }, []); // eslint-disable-line

  const [chartView, setChartView] = React.useState("analysis"); // analysis | tv
  const tvTheme = (C.bg && /^#0|^#1/i.test(C.bg)) ? "dark" : "light";
  // ── Live auto-refresh: silently re-pull the current symbol every 30s ──
  const [live, setLive] = React.useState(true);
  const liveSym = data && data.symbol;
  React.useEffect(() => {
    if (!live || !liveSym) return;
    const t = setInterval(() => load(liveSym, true), 30000);
    return () => clearInterval(t);
  }, [live, liveSym, load]);

  const stageColor = !data ? C.textDim : data.qualifies ? C.green : data.passCount >= 4 ? "#d6a312" : C.red;
  const chip = (k, v, col) => (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px",
      fontFamily: MONO, fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ color: C.textDim, fontWeight: 600 }}>{k}</span>
      <span style={{ color: col || C.text, fontWeight: 800 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🏆 TREND TEMPLATE</div>
        <input value={sym} maxLength={6} onChange={e => setSym(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") load(); }}
          style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6,
            padding: "7px 10px", fontFamily: MONO, fontSize: 15, fontWeight: 700, width: 100, textTransform: "uppercase" }} />
        <button onClick={() => load()} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 16px",
          borderRadius: 6, border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent, cursor: "pointer" }}>
          {loading ? "…" : "Scan"}</button>
        {["NVDA","TSLA","PLTR","AAPL","AMD"].map(s => (
          <button key={s} onClick={() => { setSym(s); load(s); }}
            style={{ fontFamily: MONO, fontSize: 11, padding: "6px 10px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>{s}</button>
        ))}
        <button onClick={scanWatchlist} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 14px",
          borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}18`, color: C.green, cursor: "pointer" }}>
          {screening ? "Scanning…" : "📋 Scan Watchlist"}</button>
        <button onClick={() => setShowReport(r => !r)} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 12px",
          borderRadius: 6, border: `1px solid ${C.border}`, background: showReport ? `${C.accent}18` : "transparent", color: showReport ? C.accent : C.textDim, cursor: "pointer" }}>
          📋 VCP Report</button>
        <button onClick={() => setShowHelp(h => !h)} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 12px",
          borderRadius: 6, border: `1px solid ${C.border}`, background: showHelp ? `${C.accent}18` : "transparent", color: showHelp ? C.accent : C.textDim, cursor: "pointer" }}>
          {showHelp ? "✕ Close" : "❔ How to use"}</button>
        <button onClick={() => setLive(v => !v)} title="Auto-refresh the chart every 30s"
          style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 12px",
            borderRadius: 6, border: `1px solid ${live ? C.green : C.border}`, background: live ? `${C.green}18` : "transparent", color: live ? C.green : C.textDim, cursor: "pointer" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: live ? C.green : C.textDim, animation: live ? "pulse 1.4s infinite" : "none" }} />
          {live ? "LIVE" : "PAUSED"}</button>
        <div style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          {live ? "🟢 Live · auto-refresh 30s" : "Yahoo daily · Minervini SEPA criteria"}</div>
      </div>

      {showHelp && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px",
          fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
          <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: 15, marginBottom: 4 }}>How to use the Trend Template</div>
          <div style={{ color: C.textDim, fontSize: 12, marginBottom: 14 }}>
            Based on Mark Minervini's SEPA® method (<i>Trade Like a Stock Market Wizard</i>). This is an educational tool, not financial advice — verify every level on the chart and manage your own risk.</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ fontFamily: MONO, fontWeight: 800, color: C.accent, marginBottom: 6 }}>① The Trend Template (8 rules)</div>
              <div style={{ color: C.textDim, marginBottom: 8 }}>A stock must pass <b>all 8</b> to be a Stage 2 leader worth trading. The score tells you trend quality at a glance:</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: C.text }}>
                <li>Price above the 150 &amp; 200-day MA</li>
                <li>150-day MA above the 200-day MA</li>
                <li>200-day MA trending up (≥1 month)</li>
                <li>50-day MA above the 150 &amp; 200-day MA</li>
                <li>Price above the 50-day MA</li>
                <li>Price ≥30% above its 52-week low</li>
                <li>Price within 25% of its 52-week high</li>
                <li>Relative Strength rating ≥70 (leader vs the market)</li>
              </ol>
              <div style={{ color: C.textDim, marginTop: 8, fontSize: 12 }}>
                <b style={{ color: C.green }}>8/8</b> = textbook uptrend. <b style={{ color: "#d6a312" }}>6–7/8</b> = transition, watch. <b style={{ color: C.red }}>≤5/8</b> = avoid (Stage 1/4).</div>
            </div>

            <div>
              <div style={{ fontFamily: MONO, fontWeight: 800, color: C.accent, marginBottom: 6 }}>② Entry — the VCP &amp; pivot</div>
              <div style={{ color: C.text, marginBottom: 8 }}>
                The template alone isn't a buy signal. Wait for a <b>VCP</b> (Volatility Contraction Pattern): a base where each pullback gets <b>shallower</b> and volume <b>dries up</b> — the stock coiling before a breakout. The <b style={{ color: C.accent }}>pivot</b> is the high of that tight base.</div>
              <div style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>
                A textbook VCP has:
                <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                  <li><b>2–4 contractions</b> ("T-count" footprint, e.g. <b>3T</b>)</li>
                  <li>each pullback <b>shallower</b> than the last (e.g. −25% → −13% → −7%)</li>
                  <li>a <b>tight final contraction</b> (ideally under 5–8%)</li>
                  <li><b>volume drying up</b> into the apex (vol ratio &lt; 1)</li>
                </ul>
                The tool grades each base <b style={{ color: C.green }}>A</b>–<b style={{ color: C.red }}>D</b> on these. On the chart, the dashed zig-zag marks the base swings and each leg's depth. Higher grade = cleaner, more reliable base.</div>
              <div style={{ color: C.text, marginBottom: 10 }}>
                👉 <b>Buy when price breaks above the pivot on volume ≥1.4× average.</b></div>
              <div style={{ fontFamily: MONO, fontWeight: 800, color: C.accent, marginBottom: 6 }}>③ Exit — stop &amp; targets</div>
              <div style={{ color: C.text }}>
                <b style={{ color: C.red }}>Stop:</b> just below the pivot / contraction low — tightest of −8% or the base low.<br/>
                <b style={{ color: C.green }}>Targets:</b> sell into strength at 2×–3× your risk, <i>or</i> when price closes below the 50-day MA / 21-day EMA (trend over).</div>
            </div>
          </div>

          <div style={{ fontFamily: MONO, fontWeight: 800, color: C.accent, margin: "16px 0 6px" }}>④ Reading this tool</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: C.text }}>
            <div style={{ flex: "1 1 180px" }}><b style={{ color: C.green }}>GO</b> — 8/8 &amp; broke the pivot on volume. A real buy trigger.</div>
            <div style={{ flex: "1 1 180px" }}><b style={{ color: "#d6a312" }}>WAIT</b> — trend is there but price isn't at the pivot yet (or no volume). Arm an alert.</div>
            <div style={{ flex: "1 1 180px" }}><b style={{ color: C.red }}>AVOID</b> — trend not in gear. No trade.</div>
            <div style={{ flex: "1 1 180px" }}><b style={{ color: C.green }}>🟢 / VCP ✓</b> — at a valid buy point / contractions are tightening (good base).</div>
          </div>

          <div style={{ fontFamily: MONO, fontWeight: 800, color: C.accent, margin: "16px 0 6px" }}>⑤ A daily workflow</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: C.text }}>
            <li><b>📋 Scan Watchlist</b> → filter to <b>🟢 Buy point</b> to see only actionable names.</li>
            <li>Click a row → check the chart: is the pivot a real tight VCP base? Is the verdict <b>GO</b> or <b>WAIT</b>?</li>
            <li><b>WAIT</b> setups → hit <b>🔔 Alert at pivot</b> so you're pinged on the breakout.</li>
            <li>On a <b>GO</b>, buy near the pivot, set the stop shown, and size so the stop = ~1% of your account.</li>
            <li>Manage: take partials into strength at 2R–3R; exit if it closes below the 50-day MA.</li>
          </ol>
          <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 12 }}>
            ⚠ RS is a true percentile (1–99) ranked across the names you screen — bigger lists give a more accurate rating. Buy points now require a volume-confirmed breakout (≥1.4× the 50-day average). Pivot/VCP detection is automated and not perfect — always confirm against the chart before acting.</div>
        </div>
      )}

      {screen && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {screen.error && <div style={{ padding: 12, color: C.red, fontFamily: SANS, fontSize: 13 }}>Screen failed: {screen.error}</div>}
          {screen.empty && <div style={{ padding: 12, color: C.textDim, fontFamily: SANS, fontSize: 13 }}>Your watchlist is empty — add symbols first.</div>}
          {Array.isArray(screen.results) && screen.results.length > 0 && (() => {
            const match = (r) => {
              if (r.error) return false;
              if (scoreFilter === "BUY") return r.atBuyPoint;
              if (scoreFilter === "8") return r.passCount === 8;
              if (scoreFilter === "7") return r.passCount >= 7;
              if (scoreFilter === "6") return r.passCount >= 6;
              return true;
            };
            const filtered = screen.results.filter(match);
            const counts = {
              ALL: screen.results.filter(r => !r.error).length,
              BUY: screen.results.filter(r => r.atBuyPoint).length,
              "8": screen.results.filter(r => r.passCount === 8).length,
              "7": screen.results.filter(r => r.passCount >= 7).length,
              "6": screen.results.filter(r => r.passCount >= 6).length,
            };
            const filters = [["ALL", "All"], ["BUY", "🟢 Buy point"], ["8", "8/8"], ["7", "≥7/8"], ["6", "≥6/8"]];
            return (
            <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 10px 6px", alignItems: "center" }}>
              {filters.map(([k, lbl]) => (
                <button key={k} onClick={() => setScoreFilter(k)}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 6,
                    border: `1px solid ${scoreFilter === k ? C.accent : C.border}`,
                    background: scoreFilter === k ? `${C.accent}18` : "transparent",
                    color: scoreFilter === k ? C.accent : C.textDim, cursor: "pointer" }}>
                  {lbl} <span style={{ opacity: .7 }}>({counts[k]})</span>
                </button>
              ))}
              <button onClick={() => armAllPivotAlerts(screen.results)} title="Arm a pivot alert on every name in this screen right now."
                style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 6,
                  border: `1px solid ${C.green}66`, background: `${C.green}14`, color: C.green, cursor: "pointer" }}>
                🔔 Alert all now
              </button>
              <button onClick={() => { const v = !autoAlert; setAutoAlert(v); localStorage.setItem("axiom_tt_autoalert", v ? "on" : "off"); if (v && screen?.results) armNewPivotAlerts(screen.results); }}
                title="When ON, every screener refresh auto-arms alerts for any new buy points — hands-off."
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${autoAlert ? C.green : C.border}`, background: autoAlert ? C.green : "transparent", color: autoAlert ? "#fff" : C.textDim }}>
                {autoAlert ? "🔔 Auto-alert: ON" : "🔕 Auto-alert: OFF"}
              </button>
            </div>
            {/* This table has 12 columns (Sym/Score/RS/VCP/Price/Pivot/vs Pivot/
                Entry/Stop/Risk/State) — on a narrow mobile viewport it's wider
                than the screen. The card's own overflow:"hidden" (above, kept
                for its rounded corners) was clipping columns past the visible
                width instead of letting them scroll, so on mobile several
                columns (Price/Pivot/vs Pivot/Entry/Stop/Risk/State) were
                genuinely inaccessible, not just visually cramped. Same
                overflowX:"auto" wrapper pattern already used correctly by
                every other table in this app (ShortIntTab, SqueezeTab,
                Under10Tab, ScreenerTab, TelegramAlertsTab). */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
              <thead><tr style={{ color: C.textDim, textAlign: "left" }}>
                {["", "Sym", "Score", "RS", "VCP", "Price", "Pivot", "vs Pivot", "Entry", "Stop", "Risk", "State"].map((h, i) => (
                  <th key={i} style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 10.5, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={12} style={{ padding: 14, color: C.textDim, fontFamily: SANS, fontSize: 12 }}>No symbols match this filter.</td></tr>
                )}
                {filtered.map((r) => {
                  if (r.error) return (
                    <tr key={r.symbol}><td style={{ padding: "7px 10px" }}></td>
                      <td style={{ padding: "7px 10px", fontWeight: 800 }}>{r.symbol}</td>
                      <td colSpan={10} style={{ padding: "7px 10px", color: C.textDim }}>{r.error}</td></tr>
                  );
                  const sCol = r.qualifies ? C.green : r.passCount >= 4 ? "#d6a312" : C.red;
                  const open = rowOpen === r.symbol;
                  const rd = rowData[r.symbol];
                  return (
                    <React.Fragment key={r.symbol}>
                    <tr onClick={() => toggleRow(r.symbol)}
                      style={{ cursor: "pointer", background: open ? `${C.accent}12` : r.atBuyPoint ? `${C.green}12` : "transparent" }}>
                      <td style={{ padding: "7px 10px" }}>{open ? "▼" : r.atBuyPoint ? "🟢" : r.extended ? "⚠" : "▸"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 800, color: C.text }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          {r.symbol}
                          {r.earningsSoon && <span title={`Reports earnings in ${r.earningsDte} day${r.earningsDte === 1 ? "" : "s"} — breakout risk.`} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: "#d97706", background: "#d9770618", borderRadius: 4, padding: "1px 4px" }}>⚠ER {r.earningsDte}d</span>}
                          {typeof r.epsGrowth === "number" && <span title="Forward EPS vs trailing EPS — the fundamental half of SEPA." style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: r.epsGrowth > 0 ? C.green : C.textDim }}>{r.epsGrowth > 0 ? "📈" : "📉"}{r.epsGrowth > 0 ? "+" : ""}{r.epsGrowth}%</span>}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", color: sCol, fontWeight: 800 }}>{r.passCount}/8</td>
                      <td style={{ padding: "7px 10px", color: r.rsRating >= 70 ? C.green : C.textDim }}>{r.rsRating ?? "—"}</td>
                      <td style={{ padding: "7px 10px" }}>{(() => { const g = r.vcpGrade; const gc = g === "A" ? C.green : g === "B" ? "#5ab552" : g === "C" ? "#d6a312" : C.textDim;
                        return <span style={{ color: gc, fontWeight: 800 }}>{r.tCount} {g}</span>; })()}</td>
                      <td style={{ padding: "7px 10px", color: C.text }}>{r.price}</td>
                      <td style={{ padding: "7px 10px", color: C.textDim }}>{r.pivot}</td>
                      <td style={{ padding: "7px 10px", color: Math.abs(r.abovePivotPct) <= 5 ? C.green : C.textDim }}>{r.abovePivotPct}%</td>
                      <td style={{ padding: "7px 10px", color: C.accent }}>{r.entry}</td>
                      <td style={{ padding: "7px 10px", color: C.red }}>{r.stop}</td>
                      <td style={{ padding: "7px 10px", color: C.textDim }}>{r.riskPct}%</td>
                      <td style={{ padding: "7px 10px" }}>{(() => { const st = r.state || "WATCH";
                        const col = st === "CONFIRMED" ? C.green : st === "BREAKOUT_ACTIVE" ? C.accent : st === "SETUP_READY" ? "#d6a312" : st === "FAILED" ? C.red : C.textDim;
                        const vr = Number(r.volRatio) || 0;
                        return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: col, fontWeight: 800, fontSize: 11 }} title={`signal ${r.signal} · ${r.confidence}%`}>{st.replace("_", " ")}{r.signal && r.signal !== "NONE" ? " ●" : ""}</span>
                          {vr > 0 && <span title={`Today's volume vs 50-day average. ≥1.4× confirms a real breakout.`} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: r.volConfirmed ? C.green : C.textDim }}>🔊{vr.toFixed(1)}×</span>}
                        </span>; })()}</td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={12} style={{ padding: "0 10px 12px", background: `${C.accent}08` }}>
                          {rowLoading === r.symbol && <div style={{ padding: 16, color: C.textDim, fontFamily: SANS, fontSize: 12 }}>Loading {r.symbol} chart…</div>}
                          {rd && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, paddingTop: 8 }}>
                              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                                <TrendChart data={rd} C={C} MONO={MONO} SANS={SANS} height={360} />
                              </div>
                              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                                {(() => { const vc = rd.setup.verdict === "GO" ? C.green : rd.setup.verdict === "AVOID" ? C.red : "#d6a312";
                                  return <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: 6, fontFamily: MONO, fontSize: 14, fontWeight: 900,
                                    border: `1px solid ${vc}`, background: `${vc}1e`, color: vc, marginBottom: 6 }} title={rd.setup.verdictReason}>{rd.setup.verdict}</div>; })()}
                                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 6 }}>{rd.setup.verdictReason}</div>
                                {rd.setup.breakout && (() => { const st = rd.setup.breakout.state;
                                  const col = st === "CONFIRMED" ? C.green : st === "BREAKOUT_ACTIVE" ? C.accent : st === "SETUP_READY" ? "#d6a312" : st === "FAILED" ? C.red : C.textDim;
                                  return <div style={{ display: "inline-block", padding: "2px 9px", borderRadius: 5, fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
                                    border: `1px solid ${col}`, background: `${col}1e`, color: col, marginBottom: 6 }}>{st.replace("_", " ")} · {rd.setup.breakout.confidence}%{rd.setup.breakout.signal !== "NONE" ? " · " + rd.setup.breakout.signal : ""}</div>; })()}
                                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: sCol }}>{rd.passCount}/8 · {rd.stage}</div>
                                {rd.setup.vcp && (() => { const gc = rd.setup.vcp.grade === "A" ? C.green : rd.setup.vcp.grade === "B" ? "#5ab552" : rd.setup.vcp.grade === "C" ? "#d6a312" : C.red;
                                  return <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 4 }}>
                                    VCP <b style={{ color: C.accent }}>{rd.setup.vcp.footprint}</b> <b style={{ color: gc }}>{rd.setup.vcp.grade}</b> · {rd.setup.vcp.depths.map(c => "-" + c + "%").join(" → ")}{rd.setup.tightening ? " ✓" : ""}<br/>
                                    <span style={{ fontSize: 10 }}>base {rd.setup.vcp.baseDepth}% · {rd.setup.vcp.weeks}wk · vol {rd.setup.vcp.volTrend}×</span></div>; })()}
                                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
                                  {[["Pivot", rd.setup.entry, C.accent], ["Stop", rd.setup.stop, C.red], ["Risk", rd.setup.riskPct + "%", C.textDim],
                                    ["Target 2R", rd.setup.target2, C.green], ["Target 3R", rd.setup.target3, C.green], ["RS", rd.rsRating, rd.rsRating >= 70 ? C.green : C.textDim]].map(([k, v, col]) => (
                                    <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                                      <span style={{ color: C.textDim }}>{k}</span><span style={{ color: col, fontWeight: 700 }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                                {!rd.setup.actionable && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8 }}>
                                  No actionable setup — {Math.abs(rd.setup.abovePivotPct)}% below pivot.</div>}
                                <button onClick={(e) => { e.stopPropagation(); armPivotAlert(r.symbol, rd.setup.entry); }}
                                  style={{ marginTop: 10, width: "100%", fontFamily: MONO, fontSize: 11, padding: "6px 0", borderRadius: 6,
                                    border: `1px solid ${C.accent}`, background: `${C.accent}12`, color: C.accent, cursor: "pointer" }}>🔔 Alert at pivot {rd.setup.entry}</button>
                                <button onClick={(e) => { e.stopPropagation(); setSym(r.symbol); load(r.symbol); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                                  style={{ marginTop: 6, width: "100%", fontFamily: MONO, fontSize: 11, padding: "6px 0", borderRadius: 6,
                                    border: `1px solid ${C.border}`, background: "transparent", color: C.accent, cursor: "pointer" }}>Open full view ↑</button>
                                <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.text }}>Trend Template</div>
                                {rd.criteria.map(c => (
                                  <div key={c.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "5px 0",
                                    borderTop: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 11.5, color: c.pass ? C.text : C.textDim }}>
                                    <div style={{ width: 15, height: 15, borderRadius: "50%", flex: "0 0 15px", display: "flex",
                                      alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, marginTop: 1,
                                      border: `1px solid ${c.pass ? C.green : C.red}`, background: `${c.pass ? C.green : C.red}22`,
                                      color: c.pass ? C.green : C.red }}>{c.pass ? "✓" : "✕"}</div>
                                    <span>{c.label}{c.value != null ? ` · ${c.value}` : ""}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
            );
          })()}
        </div>
      )}

      {err && <div style={{ color: C.red, fontFamily: SANS, fontSize: 13 }}>Could not load: {err}</div>}

      {data && showReport && data.setup.report && (() => {
        const rp = data.setup.report;
        const vc = rp.verdict === "A+ SETUP" ? C.green : rp.verdict === "WATCHLIST" ? "#5ab552" : rp.verdict === "WEAK SETUP" ? "#d6a312" : C.red;
        const rc = rp.riskState === "LOW" ? C.green : rp.riskState === "MEDIUM" ? "#d6a312" : C.red;
        const comps = [["Trend", rp.components.trend, 20], ["Contraction", rp.components.contraction, 30], ["Volatility", rp.components.volatility, 20], ["Volume", rp.components.volume, 20], ["Breakout", rp.components.breakout, 10]];
        return (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: 15 }}>📋 VCP Report · {data.symbol}</div>
              <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: 26, color: vc }}>{rp.score}<span style={{ fontSize: 13, color: C.textDim }}>/100</span></div>
              <div style={{ padding: "5px 14px", borderRadius: 6, fontFamily: MONO, fontSize: 13, fontWeight: 900, border: `1px solid ${vc}`, background: `${vc}1e`, color: vc }}>{rp.verdict}</div>
              <div style={{ padding: "5px 12px", borderRadius: 6, fontFamily: MONO, fontSize: 12, fontWeight: 800, border: `1px solid ${rc}`, background: `${rc}1e`, color: rc }}>RISK {rp.riskState}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                {comps.map(([k, v, max]) => (
                  <div key={k} style={{ marginBottom: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                      <span>{k}</span><span style={{ color: C.text, fontWeight: 700 }}>{v}/{max}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: `${C.textDim}22`, marginTop: 2 }}>
                      <div style={{ height: 6, borderRadius: 3, width: (v / max * 100) + "%", background: v / max >= 0.66 ? C.green : v / max >= 0.4 ? "#d6a312" : C.red }} /></div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                <div><b style={{ color: C.accent }}>Trend:</b> {rp.structure.trend}</div>
                <div><b style={{ color: C.accent }}>Contractions:</b> {rp.structure.contractions}</div>
                <div><b style={{ color: C.accent }}>Volatility:</b> {rp.structure.volatility}</div>
                <div><b style={{ color: C.accent }}>Volume:</b> {rp.structure.volume}</div>
                <div><b style={{ color: C.accent }}>Breakout:</b> {rp.structure.breakout}</div>
                <div style={{ marginTop: 8, color: C.textDim }}><b>Why:</b> {rp.explanation}</div>
              </div>
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(rp.text).catch(() => {}); }}
              style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>⧉ Copy report</button>
          </div>
        );
      })()}

      {data && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {chip("$", data.price.toFixed(2))}
          {chip("Score", data.passCount + "/8", stageColor)}
          {chip("RS", data.rsRating == null ? "—" : data.rsRating, data.rsRating >= 70 ? C.green : data.rsRating >= 40 ? "#d6a312" : C.red)}
          {chip("50MA", data.ma.ma50?.toFixed(2) ?? "—")}
          {chip("150MA", data.ma.ma150?.toFixed(2) ?? "—")}
          {chip("200MA", data.ma.ma200?.toFixed(2) ?? "—")}
          {chip("52wH", data.hi52?.toFixed(2) ?? "—")}
          {chip("52wL", data.lo52?.toFixed(2) ?? "—")}
          {chip("vs High", data.pctFromHigh + "%", data.pctFromHigh >= -25 ? C.green : C.red)}
          {chip("vs Low", "+" + data.pctFromLow + "%", C.green)}
          <div style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 7, fontFamily: MONO, fontSize: 12,
            fontWeight: 800, border: `1px solid ${stageColor}`, background: `${stageColor}1e`, color: stageColor }}>
            {data.stage}</div>
        </div>
      )}

      {data && data.setup && (() => {
        const su = data.setup;
        const sc = !su.actionable ? C.textDim : su.breakoutConfirmed ? C.green : su.extended ? C.red : "#d6a312";
        const box = (label, val, col, sub) => (
          <div style={{ flex: "1 1 120px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 13px" }}>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
            <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 700, color: col || C.text, lineHeight: 1.1, letterSpacing: "0.01em" }}>{val}</div>
            {sub && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 1 }}>{sub}</div>}
          </div>
        );
        // Plain-English bottom line — turns the 8 checks + verdict into one sentence.
        const passN = Number(data.score) || 0;
        const bl = (() => {
          if (su.verdict === "GO") return `Buy candidate — ${passN}/8 trend checks pass and it's breaking out. Enter above the ${su.entry} pivot with a stop at ${su.stop}.`;
          if (su.verdict === "WAIT" && passN >= 6) return `Strong trend (${passN}/8) but not at a buy point yet — wait for a break above the ${su.entry} pivot on volume before buying.`;
          if (/Stage\s*4/i.test(data.stage || "")) return `Downtrend — ${8 - passN} of 8 trend checks failing (price below its key moving averages). Not a buy; wait for it to reclaim the averages and rebuild a base.`;
          if (passN <= 5) return `Not in gear — only ${passN}/8 trend checks pass. Avoid until the trend re-aligns (price back above the 50/150/200-day MAs).`;
          return su.verdictReason || `${passN}/8 — ${su.status}.`;
        })();
        const blColor = su.verdict === "GO" ? C.green : su.verdict === "AVOID" ? C.red : "#d6a312";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.5,
              background: `${blColor}12`, border: `1px solid ${blColor}55`, borderLeft: `3px solid ${blColor}`, borderRadius: 8, padding: "9px 13px" }}>
              <b style={{ color: blColor }}>Bottom line:</b> {bl}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>🎯 TRADE SETUP</div>
              {(() => { const vc = su.verdict === "GO" ? C.green : su.verdict === "AVOID" ? C.red : "#d6a312";
                return <div style={{ padding: "4px 12px", borderRadius: 6, fontFamily: MONO, fontSize: 13, fontWeight: 900,
                  border: `1px solid ${vc}`, background: `${vc}1e`, color: vc }} title={su.verdictReason}>{su.verdict}</div>; })()}
              {su.breakout && (() => { const st = su.breakout.state;
                const col = st === "CONFIRMED" ? C.green : st === "BREAKOUT_ACTIVE" ? C.accent : st === "SETUP_READY" ? "#d6a312" : st === "FAILED" ? C.red : C.textDim;
                return <div style={{ padding: "4px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800,
                  border: `1px solid ${col}`, background: `${col}1e`, color: col }}
                  title={`signal ${su.breakout.signal} · confidence ${su.breakout.confidence} · vol ${su.breakout.volume.grade}`}>
                  {st.replace("_", " ")}{su.breakout.signal !== "NONE" ? ` · ${su.breakout.signal}` : ""} · {su.breakout.confidence}%</div>; })()}
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{su.verdictReason}</div>
              <div style={{ padding: "4px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800,
                border: `1px solid ${sc}`, background: `${sc}1e`, color: sc }}>{su.status}</div>
              {su.vcp && (() => { const gc = su.vcp.grade === "A" ? C.green : su.vcp.grade === "B" ? "#5ab552" : su.vcp.grade === "C" ? "#d6a312" : C.red;
                return <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }} title={`base ${su.vcp.baseDepth}% deep over ${su.vcp.weeks} wk, volume ${su.vcp.volTrend}x`}>
                  VCP <b style={{ color: C.accent }}>{su.vcp.footprint}</b> <b style={{ color: gc }}>Grade {su.vcp.grade}</b> · {su.vcp.depths.map(c => "-" + c + "%").join(" → ")}{su.tightening ? " ✓" : ""}</div>; })()}
              <button onClick={() => armPivotAlert(data.symbol, su.entry)}
                style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6,
                  border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: "pointer" }}>🔔 Alert at pivot {su.entry}</button>
              {su.extended && <div style={{ fontFamily: SANS, fontSize: 11, color: C.red }}>⚠ Extended {su.abovePivotPct}% above pivot</div>}
            </div>
            {alertMsg && <div style={{ fontFamily: MONO, fontSize: 11, color: C.green }}>{alertMsg}</div>}
            {!su.actionable && (
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, background: `${C.textDim}14`,
                border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                No actionable setup — price is {Math.abs(su.abovePivotPct)}% below the pivot {su.entry}.
                Wait for a base to form near the pivot; entry/stop/targets shown muted until then.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {box("Entry (pivot)", su.entry, C.accent, su.breakoutConfirmed ? "breakout confirmed" : `price ${su.abovePivotPct}% vs pivot`)}
              {box("Stop", su.stop, C.red, `risk ${su.riskPct}%`)}
              {box("Target 2R", su.target2, C.green, "+" + (su.riskPct * 2).toFixed(1) + "%")}
              {box("Target 3R", su.target3, C.green, "+" + (su.riskPct * 3).toFixed(1) + "%")}
              {su.vcp && su.vcp.baseDepth != null && (() => {
                const d = Number(su.vcp.baseDepth);
                const c = d < 15 ? C.green : d < 25 ? "#5ab552" : d < 35 ? "#d6a312" : C.red;
                const sub = d < 15 ? "tight — strong" : d < 25 ? "healthy" : d < 35 ? "wide — caution" : "deep — low odds";
                return (
                  <div key="basedepth" style={{ flex: "1 1 120px", background: `${c}18`, border: `1.5px solid ${c}`, borderRadius: 8, padding: "8px 12px", boxShadow: `0 0 0 3px ${c}14` }}>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: c, textTransform: "uppercase", letterSpacing: .4, fontWeight: 800 }}>Base depth</div>
                    <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 700, color: c, lineHeight: 1.1, letterSpacing: "0.01em" }}>{d}%</div>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: c }}>{sub}</div>
                  </div>
                );
              })()}
              {box("Tightness", su.tightnessPct + "%", su.tightnessPct <= 10 ? C.green : C.text, "10d range")}
              {box("Vol dry-up", su.volDryup == null ? "—" : su.volDryup + "×", su.volDryup != null && su.volDryup < 0.9 ? C.green : C.text, "vs 50d avg")}
              {box("Breakout vol", su.volSurge + "×", su.volSurge >= 1.4 ? C.green : C.textDim, "need ≥1.4×")}
            </div>
            {su.sellSignals.length > 0 && (() => {
              const isStage2 = /Stage\s*2/i.test(data.stage || "");
              const note = isStage2
                ? " The trend is still Stage 2 — this flags where a holder would take profits or tighten stops, not a short signal."
                : ` The trend has already weakened (${data.stage}) — these confirm loss of momentum. A holder would reduce or exit; it's not a spot to buy.`;
              return (
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.amber, background: `${C.amber}14`, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
                  ⚠️ <b>Exit / trim trigger</b> (for holders): {su.sellSignals.join(" · ")}.
                  <span style={{ color: C.textDim }}>{note}</span>
                </div>
              );
            })()}
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
              Pivot = high of the recent base (buy on a break above it with volume ≥1.4× average).
              Stop = tighter of −8% or just under the last contraction low. Targets are 2× and 3× your risk —
              sell into strength or when price closes below the 50-day MA / 21-day EMA.
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
            {[["analysis", "📊 Analysis"], ["tv", "📺 TradingView (live)"]].map(([v, l]) => (
              <button key={v} onClick={() => setChartView(v)}
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${chartView === v ? C.accent : C.border}`, background: chartView === v ? `${C.accent}18` : "transparent",
                  color: chartView === v ? C.accent : C.textDim }}>{l}</button>
            ))}
            {chartView === "analysis" && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", alignSelf: "center" }}>
                {[["MA50", C.accent], ["MA150", "#d6a312"], ["MA200", "#c94440"], ["Bollinger", "#4ea86e"]].map(([lbl, col]) => (
                  <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
                    <span style={{ width: 14, height: 0, borderTop: `2px solid ${col}`, display: "inline-block" }} />{lbl}
                  </span>
                ))}
              </span>
            )}
          </div>
          {chartView === "tv" && data ? (
            <iframe key={`tt-tv-${data.symbol}`} title="TradingView chart"
              src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(data.symbol)}&t=${tvTheme}&h=520&iv=D`}
              style={{ width: "100%", height: 520, border: "none", display: "block" }} />
          ) : (
            <TrendChart data={data} C={C} MONO={MONO} SANS={SANS} />
          )}
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          {data && (<>
            <div style={{ textAlign: "center", paddingBottom: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 900, color: stageColor }}>{data.passCount}/8</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{data.stage}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>Minervini Trend Template</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, margin: "2px 0 10px" }}>
              All 8 must pass for a Stage 2 buy candidate.</div>
            {data.criteria.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 0",
                borderTop: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12.5,
                color: c.pass ? C.text : C.textDim }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", flex: "0 0 18px", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, marginTop: 1,
                  border: `1px solid ${c.pass ? C.green : C.red}`, background: `${c.pass ? C.green : C.red}22`,
                  color: c.pass ? C.green : C.red }}>{c.pass ? "✓" : "✕"}</div>
                <span>{c.label}{c.value != null ? ` · ${c.value}` : ""}</span>
              </div>
            ))}
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
              RS rating is approximate (weighted momentum vs SPY mapped 1–99), not a true full-universe
              percentile. Everything else is computed from live Yahoo daily bars
              {data.asOf ? ` (${new Date(data.asOf).toLocaleDateString()})` : ""}.</div>
          </>)}
          {!data && !err && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Scanning…</div>}
        </div>
      </div>
    </div>
  );
}
