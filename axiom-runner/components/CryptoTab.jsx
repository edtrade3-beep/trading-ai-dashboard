import { useState, useEffect, useCallback } from "react";

// ─── CryptoLiquidations ──────────────────────────────────────────────────────
function CryptoLiquidations({ C, MONO, SANS }) {
  const [symbol, setSymbol] = React.useState("BTC");
  const [data, setData]     = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]   = React.useState(null);

  const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"];

  const load = React.useCallback(async (sym) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/crypto/liquidations?symbol=${sym}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed");
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(symbol); }, [symbol, load]);

  function fmtUsd(n) {
    if (!n) return "$0";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${Math.round(n)}`;
  }

  function fmtPrice(n) {
    if (!n) return "—";
    if (n >= 1000) return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `$${Number(n).toFixed(2)}`;
  }

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 };

  return (
    <div style={{ fontFamily: SANS }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, letterSpacing: "0.06em" }}>
          💧 LIQUIDATION LEVELS
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SYMBOLS.map(s => (
            <button key={s} onClick={() => setSymbol(s)} style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "4px 10px",
              borderRadius: 6, border: `1px solid ${symbol === s ? C.accent : C.border}`,
              background: symbol === s ? C.accent : "transparent",
              color: symbol === s ? "#fff" : C.textDim, cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>
        <button onClick={() => load(symbol)} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11,
          padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textDim, cursor: "pointer" }}>
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8,
          fontFamily: MONO, fontSize: 12, color: C.red, marginBottom: 14 }}>
          ⚠ {error}
        </div>
      )}

      {data && (
        <>
          {/* Price + 24h stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            {/* Current price */}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>{symbol} PRICE</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{fmtPrice(data.price)}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: data.change24h >= 0 ? C.green : C.red, marginTop: 2 }}>
                {data.change24h >= 0 ? "+" : ""}{Number(data.change24h || 0).toFixed(2)}% 24h
              </div>
            </div>

            {/* 24h Long liqs */}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>LONGS LIQ'D 24H</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.red }}>
                {data.liqs24h ? fmtUsd(data.liqs24h.longs) : "—"}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>bulls wiped</div>
            </div>

            {/* 24h Short liqs */}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>SHORTS LIQ'D 24H</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.green }}>
                {data.liqs24h ? fmtUsd(data.liqs24h.shorts) : "—"}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>bears wiped</div>
            </div>

            {/* OI */}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>OPEN INTEREST</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.amber }}>
                {data.oiUsd ? fmtUsd(data.oiUsd) : "—"}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>total leveraged</div>
            </div>
          </div>

          {/* Key levels callout */}
          {data.keyLevels && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {data.keyLevels.biggestLongLiq && (
                <div style={{ padding: "12px 14px", borderRadius: 8, background: `${C.red}12`,
                  border: `1px solid ${C.red}44` }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.red, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4 }}>
                    🔴 MAJOR LONG LIQ ZONE
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.red }}>
                    {fmtPrice(data.keyLevels.biggestLongLiq.price)}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 3 }}>
                    {fmtUsd(data.keyLevels.biggestLongLiq.liqUsd)} at {data.keyLevels.biggestLongLiq.leverage}x leverage
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 4 }}>
                    If price drops here, long liquidations cascade price lower
                  </div>
                </div>
              )}
              {data.keyLevels.biggestShortLiq && (
                <div style={{ padding: "12px 14px", borderRadius: 8, background: `${C.green}12`,
                  border: `1px solid ${C.green}44` }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.green, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4 }}>
                    🟢 MAJOR SHORT LIQ ZONE
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.green }}>
                    {fmtPrice(data.keyLevels.biggestShortLiq.price)}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 3 }}>
                    {fmtUsd(data.keyLevels.biggestShortLiq.liqUsd)} at {data.keyLevels.biggestShortLiq.leverage}x leverage
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 4 }}>
                    If price rises here, short liquidations cascade price higher
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Liquidation level map */}
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim,
              letterSpacing: "0.08em", marginBottom: 12 }}>
              LIQUIDATION MAP — {symbol}/USD
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: C.green }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Short liq zone (price pumps → bears wiped)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: C.red }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Long liq zone (price drops → bulls wiped)</span>
              </div>
            </div>

            {/* Level rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {data.levels.map((lvl, i) => {
                const pct = Math.max(4, Math.round((lvl.liqUsd / data.maxLiq) * 100));
                const isLong = lvl.side === "long";
                const color = isLong ? C.red : C.green;
                const distPct = data.price > 0
                  ? Math.abs((lvl.price - data.price) / data.price * 100).toFixed(1)
                  : "—";
                const isCurrent = lvl.price === data.price;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Price label */}
                    <div style={{ fontFamily: MONO, fontSize: 11, color: color, fontWeight: 700,
                      width: 100, flexShrink: 0, textAlign: "right" }}>
                      {fmtPrice(lvl.price)}
                    </div>

                    {/* Bar */}
                    <div style={{ flex: 1, position: "relative", height: 20, background: `${color}18`,
                      borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: `${color}55`,
                        borderRadius: 3, transition: "width 0.4s" }} />
                      <div style={{ position: "absolute", left: 8, top: 0, height: "100%",
                        display: "flex", alignItems: "center",
                        fontFamily: MONO, fontSize: 10, color: color, fontWeight: 700 }}>
                        {fmtUsd(lvl.liqUsd)} · {lvl.leverage}x {isLong ? "longs" : "shorts"}
                      </div>
                    </div>

                    {/* Distance from current price */}
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, width: 50, textAlign: "right", flexShrink: 0 }}>
                      {distPct}%
                    </div>
                  </div>
                );
              }).reduce((acc, el, i, arr) => {
                // Insert current price marker between long and short zones
                const levels = data.levels;
                if (i > 0 && levels[i - 1].price > data.price && levels[i].price <= data.price) {
                  acc.push(
                    <div key="current-price" style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                      <div style={{ width: 100, textAlign: "right", fontFamily: MONO, fontSize: 11,
                        color: C.accent, fontWeight: 900, flexShrink: 0 }}>
                        ▶ {fmtPrice(data.price)}
                      </div>
                      <div style={{ flex: 1, height: 2, background: `${C.accent}88`, borderRadius: 2 }} />
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, width: 50, textAlign: "right", flexShrink: 0 }}>
                        CURRENT
                      </div>
                    </div>
                  );
                }
                acc.push(el);
                return acc;
              }, [])}
            </div>
          </div>

          {data.estimated && (
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "center" }}>
              ⚠ Levels estimated from price + leverage distribution · Add COINGLASS_API_KEY for live precision data
            </div>
          )}
        </>
      )}

      {loading && !data && (
        <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
          Loading liquidation data…
        </div>
      )}
    </div>
  );
}

export default function CryptoTab({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market/crypto");
      const json = await res.json();
      if (!json.ok) throw new Error("Crypto fetch failed");
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 2 minutes (matches server-side cache TTL)
  useEffect(() => {
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  const card = {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: 18, boxSizing: "border-box",
  };

  const fgColor = (val) => {
    if (val >= 75) return C.green;
    if (val >= 55) return "#22c55e";
    if (val >= 45) return C.amber;
    if (val >= 25) return "#f97316";
    return C.red;
  };

  const fgLabel = (val) => {
    if (val >= 75) return "EXTREME GREED";
    if (val >= 55) return "GREED";
    if (val >= 45) return "NEUTRAL";
    if (val >= 25) return "FEAR";
    return "EXTREME FEAR";
  };

  const fmt = (n) => {
    if (!n) return "—";
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
    return `$${Number(n).toLocaleString()}`;
  };

  const fmtVol = (n) => {
    if (!n) return "—";
    if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>₿</span>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>CRYPTO MARKET</span>
          {data?.globalMacro && (
            <span style={{
              fontFamily: MONO, fontSize: 12, color: C.textDim,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "3px 8px",
            }}>
              MCAP {fmt(data.globalMacro.totalMarketCap)}
              &nbsp;·&nbsp;
              24h {data.globalMacro.marketCapChange24h > 0 ? "+" : ""}{data.globalMacro.marketCapChange24h}%
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastFetch && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 700,
              background: C.accent, color: "#fff", border: "none",
              borderRadius: 6, padding: "6px 14px", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "⟳ LOADING…" : "⟳ REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, color: C.red, fontFamily: MONO, fontSize: 12, marginBottom: 14 }}>
          ⚠ {error}
        </div>
      )}

      {/* Macro row: Fear & Greed + BTC Dom + ETH Dom + Volume */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        {/* Fear & Greed Meter */}
        {data?.fearGreed ? (() => {
          const fg = data.fearGreed;
          const col = fgColor(fg.value);
          return (
            <div style={{ ...card, gridColumn: "span 1", textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>FEAR & GREED INDEX</div>
              {/* Gauge arc */}
              <div style={{ position: "relative", width: 120, height: 68, margin: "0 auto 8px" }}>
                <svg viewBox="0 0 120 68" style={{ width: "100%", height: "100%" }}>
                  <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={C.border} strokeWidth="12" strokeLinecap="round" />
                  <path
                    d="M10,60 A50,50 0 0,1 110,60"
                    fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(fg.value / 100) * 157} 157`}
                    style={{ transition: "stroke-dasharray 0.8s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 900, color: col, lineHeight: 1 }}>{fg.value}</div>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: col, letterSpacing: "0.06em" }}>{fgLabel(fg.value)}</div>
              {/* 7-day sparkline */}
              {fg.history?.length > 1 && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, marginTop: 12, justifyContent: "center", height: 28 }}>
                  {[...fg.history].reverse().map((h, i) => (
                    <div key={i} title={`${h.label}: ${h.value}`} style={{
                      width: 12, borderRadius: 5,
                      height: `${Math.max(4, (h.value / 100) * 28)}px`,
                      background: fgColor(h.value),
                      opacity: i === fg.history.length - 1 ? 1 : 0.5,
                    }} />
                  ))}
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>7-DAY HISTORY</div>
            </div>
          );
        })() : (
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{loading ? "Loading…" : "Fear & Greed N/A"}</span>
          </div>
        )}

        {/* BTC Dominance */}
        {data?.globalMacro ? (() => {
          const g = data.globalMacro;
          return (
            <div style={{ ...card }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>MARKET DOMINANCE</div>
              {[
                ["BTC Dominance", `${g.btcDominance}%`, C.amber],
                ["ETH Dominance", `${g.ethDominance}%`, C.purple],
                ["Total Mkt Cap", fmt(g.totalMarketCap), C.text],
                ["24h Volume",    fmt(g.totalVolume24h), C.text],
                ["Mkt Cap Δ 24h", `${g.marketCapChange24h > 0 ? "+" : ""}${g.marketCapChange24h}%`, g.marketCapChange24h >= 0 ? C.green : C.red],
                ["Active Coins",  g.activeCurrencies?.toLocaleString(), C.textDim],
              ].map(([k, v, col]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>{k}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: col || C.text }}>{v || "—"}</span>
                </div>
              ))}
            </div>
          );
        })() : (
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{loading ? "Loading…" : "Global data N/A"}</span>
          </div>
        )}

        {/* BTC dominance bar */}
        {data?.globalMacro && (
          <div style={{ ...card }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>DOMINANCE BREAKDOWN</div>
            {[
              { label: "BTC", pct: data.globalMacro.btcDominance, col: C.amber },
              { label: "ETH", pct: data.globalMacro.ethDominance, col: C.purple },
              { label: "ALTs", pct: Math.max(0, 100 - data.globalMacro.btcDominance - data.globalMacro.ethDominance), col: C.cyan },
            ].map(({ label, pct, col }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 8, background: C.border, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: col, borderRadius: 6, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Movers summary */}
      {data?.coins?.length > 0 && (() => {
        const sorted = [...data.coins].sort((a, b) => b.changesPercentage - a.changesPercentage);
        const top3 = sorted.slice(0, 3);
        const bot3 = sorted.slice(-3).reverse();
        const MoverCard = ({ coin, rank }) => {
          const isUp = coin.changesPercentage >= 0;
          const col = isUp ? C.green : C.red;
          const COIN_ICONS = { BTC:"₿",ETH:"Ξ",SOL:"◎",BNB:"⬡",XRP:"✕",DOGE:"Ð",ADA:"₳",AVAX:"△",LINK:"⬡",DOT:"●",MATIC:"⬟",UNI:"🦄",LTC:"Ł",BCH:"Ƀ",ATOM:"⚛" };
          return (
            <div style={{ ...card, padding: "12px 16px", borderLeft: `3px solid ${col}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{COIN_ICONS[coin.symbol] || "◆"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{coin.symbol}</span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: col }}>
                  {isUp ? "+" : ""}{coin.changesPercentage.toFixed(2)}%
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>
                ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(coin.price >= 1 ? 2 : 6)}
              </div>
            </div>
          );
        };
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>▲ TOP GAINERS (24H)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {top3.map((c, i) => <MoverCard key={c.symbol} coin={c} rank={i+1} />)}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>▼ TOP LOSERS (24H)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bot3.map((c, i) => <MoverCard key={c.symbol} coin={c} rank={i+1} />)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Coin table */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>LIVE PRICES</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 10 }}>auto-refresh 60s · Yahoo Finance</span>
        </div>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "36px 90px 1fr 100px 90px 100px 100px 90px 100px",
          gap: 0, padding: "8px 18px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
        }}>
          {["#","COIN","NAME","PRICE","24H %","24H HI","24H LO","VOLUME","MARKET CAP"].map((h, i) => (
            <div key={h} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, fontWeight: 700, letterSpacing: "0.06em", textAlign: i > 1 ? "right" : "left" }}>{h}</div>
          ))}
        </div>
        {loading && !data?.coins?.length ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading crypto data…</div>
        ) : (data?.coins || []).map((coin, idx) => {
          const isUp = coin.changesPercentage >= 0;
          const col = isUp ? C.green : C.red;
          const COIN_ICONS = { BTC:"₿",ETH:"Ξ",SOL:"◎",BNB:"⬡",XRP:"✕",DOGE:"Ð",ADA:"₳",AVAX:"△",LINK:"⬡",DOT:"●",MATIC:"⬟",UNI:"🦄",LTC:"Ł",BCH:"Ƀ",ATOM:"⚛" };
          const icon = COIN_ICONS[coin.symbol] || "◆";
          const fmtPrice = (p) => p >= 1000 ? `$${p.toLocaleString()}` : `$${p.toFixed(p >= 1 ? 2 : 6)}`;
          return (
            <div key={coin.symbol} style={{
              display: "grid",
              gridTemplateColumns: "36px 90px 1fr 100px 90px 100px 100px 90px 100px",
              gap: 0, padding: "10px 18px",
              borderBottom: `1px solid ${C.border}`,
              background: idx % 2 === 0 ? "transparent" : C.surface,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, alignSelf: "center" }}>{idx + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, alignSelf: "center" }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{coin.symbol}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, alignSelf: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {coin.name?.replace(" USD","").replace("-USD","")}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, textAlign: "right", alignSelf: "center" }}>
                {fmtPrice(coin.price)}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: col, textAlign: "right", alignSelf: "center" }}>
                {isUp ? "▲" : "▼"} {Math.abs(coin.changesPercentage).toFixed(2)}%
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", alignSelf: "center" }}>{fmtPrice(coin.high24h)}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", alignSelf: "center" }}>{fmtPrice(coin.low24h)}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", alignSelf: "center" }}>{fmtVol(coin.volume)}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", alignSelf: "center" }}>{fmt(coin.marketCap)}</div>
            </div>
          );
        })}
      </div>

      {/* Liquidation Levels */}
      <div style={{ marginTop: 24, padding: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <CryptoLiquidations C={C} MONO={MONO} SANS={SANS} />
      </div>

      {/* Crypto News */}
      <CryptoNews C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}

function CryptoNews({ C, MONO, SANS }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/market/news?tickers=COIN,MSTR,RIOT,MARA,CLSK&limit=20")
      .then(r => r.json())
      .then(d => { setNews(Array.isArray(d) ? d : (d.news || [])); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };

  return (
    <div style={card}>
      <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>📰 CRYPTO NEWS</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 10 }}>BTC · ETH · COIN · MSTR</span>
      </div>
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading headlines…</div>
      ) : news.length === 0 ? (
        <div style={{ padding: "30px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No headlines available</div>
      ) : news.slice(0, 15).map((n, i) => {
        const ago = (() => {
          const ts = n.publishedAt || n.date || n.datetime;
          if (!ts) return "";
          const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
          if (diff < 60) return `${diff}m ago`;
          if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
          return `${Math.floor(diff / 1440)}d ago`;
        })();
        return (
          <a
            key={i}
            href={n.url || n.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", padding: "12px 18px",
              borderBottom: `1px solid ${C.border}`,
              textDecoration: "none",
              background: "transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5, flex: 1 }}>
                {n.headline || n.title || n.summary || ""}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>
                {ago}
              </div>
            </div>
            {n.source && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginTop: 4 }}>{n.source}</div>
            )}
          </a>
        );
      })}
    </div>
  );
}
