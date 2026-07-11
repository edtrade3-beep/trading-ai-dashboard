import MonitorSection from "./MonitorSection.jsx";
import MonitorAthan from "./MonitorAthan.jsx";
import RiskTrafficLight from "./RiskTrafficLight.jsx";
import SpyVolumeWidget from "./SpyVolumeWidget.jsx";
import FedInterpreter from "./FedInterpreter.jsx";
import FedWatchWidget from "./FedWatchWidget.jsx";
import MacroEventsWidget from "./MacroEventsWidget.jsx";
import RegimeNewsPanel from "./RegimeNewsPanel.jsx";

export default function DashboardTab({
  C, MONO, SANS, watchlistData, macroData, distData, fearGreedData, sigData, sigFilter,
  newsSentiment, socialSentiment, flowBias, eventCountdowns, preMktMovers,
  tiltEnabled, tiltLocked, tiltStreak,
  setTerminalSymbol, setScanResults, setActiveTab, setScanExpanded, loadDeepDive, loadDeepSocial,
  setTiltLocked, setSigLoading, setSigData, fetchFearGreed, setDistData, setFuturesData, setPreMktMovers,
}) {
          const pulse = [["SPY","SPY"],["QQQ","QQQ"],["IWM","IWM"],["BTC","BTCUSD","BTC-USD"],["ETH","ETHUSD","ETH-USD"],["SOL","SOLUSD","SOL-USD"]].map(([label, ...syms]) => {
            let q = null;
            for (const s of syms) { q = watchlistData.find(w => w.symbol === s) || (macroData||[]).find(m => m.symbol === s); if (q) break; }
            if (!q) return null;
            const chg = Number(q.changesPercentage || q.delta1d || 0);
            return { sym: label, chg, price: Number(q.price || 0) };
          }).filter(Boolean);
          const radarAlert = distData?.alert || "NORMAL";
          const radarScore = distData?.riskScore || 0;
          const radarColor = radarAlert === "DANGER" ? C.red : radarAlert === "CAUTION" ? C.amber : radarAlert === "WATCH" ? "#4caf50" : C.green;
          const radarIcon  = radarAlert === "DANGER" ? "🚨" : radarAlert === "CAUTION" ? "⚠️" : radarAlert === "WATCH" ? "👁" : "✅";
          const highW = (distData?.warnings || []).filter(w => w.level === "HIGH");
          const fg = fearGreedData;
          const fgScore = fg?.score || 0;
          const fgColor = fgScore <= 25 ? C.red : fgScore <= 45 ? C.amber : fgScore <= 55 ? C.textSec : fgScore <= 75 ? "#22c55e" : C.green;
          const fgLabel = fgScore <= 25 ? "EXTREME FEAR" : fgScore <= 45 ? "FEAR" : fgScore <= 55 ? "NEUTRAL" : fgScore <= 75 ? "GREED" : "EXTREME GREED";
          const ACT_COL = { "LONG": C.green, "SHORT / AVOID": C.red, "WATCH SHORT": "#ff6b6b", "WATCH": C.amber };
          const filtered2 = (sigData?.signals || []).filter(s => {
            if (sigFilter === "LONG")    return s.action === "LONG" || s.action === "WATCH";
            if (sigFilter === "SHORT")   return s.action === "SHORT / AVOID" || s.action === "WATCH SHORT";
            
            return true;
          });
          const handleSigClick = (s) => {
            const ticker = s.sym;
            setTerminalSymbol(ticker);
            const row2 = { ticker, score: s.score||50, signal: s.action === "LONG" ? "BUY" : s.action === "SHORT / AVOID" ? "SELL" : "WATCH",
              signals: (s.rationale||[]).map(r => ({ txt: r, bull: s.action === "LONG" })),
              sColor: ACT_COL[s.action] || C.amber, rsiVal: null, macdBull: null, ema9v: null, ema21v: null,
              quote: { price: s.entry, changePercent: s.chgPct, yearHigh: s.hi52, priceAvg50: s.ma50, priceAvg200: s.ma200, volume: 0, avgVolume: 0 }, candles: null };
            setScanResults(prev => prev.some(r => r.ticker === ticker) ? prev : [row2, ...prev]);
            setActiveTab("smartscan"); setScanExpanded(ticker);
            loadDeepDive(ticker); loadDeepSocial(ticker);
          };
          return (
            <>
            {/* 1: MARKET PULSE STRIP */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 10, padding: "8px 16px",
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              overflowX: "auto", scrollbarWidth: "none" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, marginRight: 14, flexShrink: 0, letterSpacing: "0.08em" }}>
                MARKET
              </span>
              {pulse.map((p, i) => (
                <div key={p.sym} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span style={{ width: 1, height: 16, background: C.border, margin: "0 12px", flexShrink: 0 }} />}
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent }}>{p.sym}</div>
                    {p.price > 0 && (
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                        ${p.price < 1 ? p.price.toFixed(4) : p.price < 100 ? p.price.toFixed(2) : p.price.toFixed(2)}
                      </div>
                    )}
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: p.chg >= 0 ? C.green : C.red }}>
                      {p.chg >= 0 ? "+" : ""}{p.chg.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
              <span style={{ width: 1, height: 16, background: C.border, margin: "0 12px", flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                {distData && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>REGIME</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: radarColor }}>{radarIcon} {radarAlert}</div>
                  </div>
                )}
                {(distData?.vix || 0) > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>VIX</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                      color: distData.vix > 25 ? C.red : distData.vix > 18 ? C.amber : C.green }}>
                      {distData.vix.toFixed(1)}
                    </div>
                  </div>
                )}
                {fg && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>F&G</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: fgColor }}>{fgScore} · {fgLabel}</div>
                  </div>
                )}
                {tiltEnabled && (
                  <div style={{ textAlign: "center", cursor: "pointer" }} onClick={() => tiltLocked && setTiltLocked(false)} title={tiltLocked ? "Click to override tilt lock" : `${tiltStreak} consecutive losses today`}>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>TILT</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                      color: tiltLocked ? C.red : tiltStreak >= 2 ? C.amber : C.green }}>
                      {tiltLocked ? "🔒 LOCKED" : tiltStreak === 0 ? "✅ 0" : `⚠ ${tiltStreak}/3`}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => {
                setSigLoading(true);
                fetch("/api/market/trade-signals").then(r=>r.json()).then(d=>{if(d.ok)setSigData(d);}).catch(()=>{}).finally(()=>setSigLoading(false));
                if (!fearGreedData) fetchFearGreed();
                fetch("/api/market/distribution?refresh=1").then(r=>r.json()).then(d=>{if(d.ok)setDistData(d);}).catch(()=>{});
                fetch("/api/market/futures").then(r=>r.ok?r.json():null).then(d=>{if(d?.ok)setFuturesData(d.futures||[]);}).catch(()=>{});
                fetch("/api/market/premarket-movers").then(r=>r.ok?r.json():null).then(d=>{if(d?.ok)setPreMktMovers(d.movers||[]);}).catch(()=>{});
              }} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textDim, borderRadius: 6, padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}>
                ↺ REFRESH ALL
              </button>
            </div>

            {/* ── Prayer Times (collapsed, top) ── */}
            <MonitorSection C={C} MONO={MONO} label="🕌 PRAYER TIMES" storeKey="mon_prayer" defaultOpen={false}>
              <MonitorAthan C={C} MONO={MONO} SANS={SANS} />
            </MonitorSection>

            {/* ── 1. MARKET MODE — am I risk-on or risk-off right now? ── */}
            <MonitorSection C={C} MONO={MONO} label="🚦 MARKET MODE & FLOW" storeKey="mon_mode">
              <RiskTrafficLight C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
              <SpyVolumeWidget C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
            </MonitorSection>

            {/* ── 2. CATALYSTS — Fed + scheduled economic events ── */}
            <MonitorSection C={C} MONO={MONO} label="🏛 CATALYSTS & EVENTS" storeKey="mon_catalysts">
              <FedInterpreter C={C} MONO={MONO} SANS={SANS} />
              <FedWatchWidget C={C} MONO={MONO} SANS={SANS} />
              <MacroEventsWidget C={C} MONO={MONO} SANS={SANS} />
            </MonitorSection>

            {/* ── EVENT COUNTDOWN + PRE-MARKET MOVERS (under Catalysts) ── */}
            <div style={{ display: "grid", gridTemplateColumns: eventCountdowns.length > 0 && preMktMovers.length > 0 ? "1fr 1fr" : "1fr",
              gap: 10, marginBottom: 10 }}>

              {/* Event Countdown */}
              {eventCountdowns.length > 0 && (
                <div style={{ padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", flexShrink: 0 }}>
                    ⏰ EVENTS
                  </span>
                  {eventCountdowns.slice(0, 4).map((ev, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {i > 0 && <span style={{ width: 1, height: 14, background: C.border }} />}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700,
                          color: ev.days <= 1 ? C.red : ev.days <= 3 ? C.amber : C.textDim }}>
                          {ev.days === 0 ? "TODAY" : ev.days === 1 ? "TOMORROW" : `${ev.days}d`}
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, fontWeight: 600 }}>{ev.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pre-Market Movers */}
              {preMktMovers.length > 0 && (
                <div style={{ padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, overflowX: "auto", scrollbarWidth: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", flexShrink: 0 }}>
                      ⚡ PRE-MKT
                    </span>
                    {preMktMovers.slice(0, 6).map((m, i) => (
                      <div key={m.sym} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                        {i > 0 && <span style={{ width: 1, height: 14, background: C.border, marginRight: 12 }} />}
                        <div style={{ textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent }}>{m.sym}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: m.chg >= 0 ? C.green : C.red }}>
                            {m.chg >= 0 ? "+" : ""}{m.chg.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── MARKET REGIME DASHBOARD ── */}
            <MonitorSection C={C} MONO={MONO} label="🌡 MARKET CONDITIONS" storeKey="mon_regime">
            {(() => {
              const spy    = macroData.find(m => m.symbol === "SPY");
              const qqq    = macroData.find(m => m.symbol === "QQQ");
              const vix    = distData?.vix || 0;
              const spyChg = Number(spy?.changesPercentage || 0);
              const qqqChg = Number(qqq?.changesPercentage || 0);
              const loaded = !!spy;
              let regLabel, regColor, regIcon, regBg, regConf, playbook;
              if (!loaded) {
                regLabel = "LOADING…"; regIcon = "⏳"; regColor = C.textDim; regBg = C.card; regConf = 0;
                playbook = ["Waiting for market data…", "This card updates automatically", "Check back in a few seconds", "Data loads from Yahoo Finance"];
              } else if (vix > 30 || spyChg < -1.5) {
                regLabel = "BEAR / RISK-OFF"; regIcon = "🐻"; regColor = C.red; regBg = `${C.red}10`; regConf = vix > 35 ? 92 : 78;
                playbook = ["Reduce position size 50%", "Only take short setups or cash", "Tighten stops — volatility is high", "No longs unless SPY reclaims key level"];
              } else if (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) {
                regLabel = "BULL TREND"; regIcon = "🐂"; regColor = C.green; regBg = `${C.green}10`; regConf = vix < 13 ? 90 : 75;
                playbook = ["Full size on A+ long setups", "Let winners run — trend is your friend", "Buy pullbacks to EMA21", "Avoid shorting into strength"];
              } else if (Math.abs(spyChg) < 0.3 && vix < 22) {
                regLabel = "CHOP / NEUTRAL"; regIcon = "〰️"; regColor = C.amber; regBg = `${C.amber}10`; regConf = 65;
                playbook = ["Reduce size to 50–75%", "Take profits faster — don't hold overnight", "Avoid breakout trades — they fail in chop", "Wait for regime to resolve before adding risk"];
              } else if (spyChg > 0.5) {
                regLabel = "CAUTIOUS BULL"; regIcon = "📈"; regColor = "#22c55e"; regBg = "#22c55e10"; regConf = 68;
                playbook = ["Normal size on confirmed setups", "Watch for VIX spike that could reverse", "Focus on sector leaders, not laggards", "Keep stops tight"];
              } else {
                regLabel = "DEFENSIVE"; regIcon = "🛡️"; regColor = C.amber; regBg = `${C.amber}10`; regConf = 60;
                playbook = ["Smaller size — uncertainty is elevated", "Favor defensive sectors (XLU, XLV, XLP)", "No momentum plays until market stabilizes", "Keep 30–40% cash"];
              }
              const signals = [
                { label: "SPY",  val: loaded ? `${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%` : "—", color: spyChg > 0 ? C.green : C.red },
                { label: "QQQ",  val: loaded ? `${qqqChg >= 0 ? "+" : ""}${qqqChg.toFixed(2)}%` : "—", color: qqqChg > 0 ? C.green : C.red },
                { label: "VIX",  val: vix > 0 ? vix.toFixed(1) : "—", color: vix > 25 ? C.red : vix > 18 ? C.amber : C.green },
                { label: "FLOW", val: flowBias || "—", color: (flowBias||"").includes("CALL") ? C.green : (flowBias||"").includes("PUT") ? C.red : C.amber },
              ];
              return (
                <div style={{ marginBottom: 0, background: regBg, border: `2px solid ${regColor}55`,
                  borderBottom: "none", borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
                  {/* Title bar */}
                  <div style={{ padding: "8px 16px", background: `${regColor}22`, borderBottom: `1px solid ${regColor}33`,
                    display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: regColor, letterSpacing: "0.1em" }}>
                      📊 MARKET REGIME DASHBOARD
                    </span>
                    {regConf > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{regConf}% confidence</span>}
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    {/* Big regime label */}
                    <div style={{ flexShrink: 0, minWidth: 160 }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: regColor, lineHeight: 1.1 }}>
                        {regIcon} {regLabel}
                      </div>
                    </div>
                    {/* Signals */}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                      {signals.map(s => (
                        <div key={s.label} style={{ textAlign: "center", padding: "4px 10px",
                          background: `${regColor}15`, borderRadius: 6 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{s.label}</div>
                          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {/* Playbook */}
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim,
                        letterSpacing: "0.08em", marginBottom: 6 }}>TODAY'S PLAYBOOK</div>
                      {playbook.map((p, i) => (
                        <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: regColor,
                          display: "flex", gap: 6, marginBottom: 3 }}>
                          <span style={{ flexShrink: 0, opacity: 0.6 }}>{i + 1}.</span>{p}
                        </div>
                      ))}
                    </div>

                    {/* ── LIVE NEWS inside regime card ── */}
                    <RegimeNewsPanel C={C} MONO={MONO} SANS={SANS} />
                  </div>
                </div>
              );
            })()}
            {/* ── Next-day outlook (merged into Market Conditions) ── */}
            {(() => {
              const spy = (macroData||[]).find(m=>m.symbol==="SPY") || (watchlistData||[]).find(w=>w.symbol==="SPY");
              const qqq = (macroData||[]).find(m=>m.symbol==="QQQ") || (watchlistData||[]).find(w=>w.symbol==="QQQ");
              const spyChg = Number(spy?.changesPercentage || 0);
              const qqqChg = Number(qqq?.changesPercentage || 0);
              const spyPx  = Number(spy?.price || 0);
              const ma50   = Number(spy?.priceAvg50 || 0);
              const vix    = Number(distData?.vix || 0);
              const fg     = Number(fearGreedData?.score || 0);
              // Breadth from watchlist
              const wl = (watchlistData||[]).filter(q => q.symbol && Number(q.price) > 0);
              const adv = wl.filter(q => Number(q.changesPercentage||0) > 0).length;
              const breadthPct = wl.length ? Math.round(adv/wl.length*100) : 50;

              // Score the next-day bias (-100 to +100)
              let score = 0;
              const factors = [];
              if (spyChg > 0.5) { score += 20; factors.push("✅ SPY closed green"); }
              else if (spyChg < -1) { score -= 25; factors.push("🔴 SPY closed down hard"); }
              else if (spyChg < 0) { score -= 10; factors.push("⚠️ SPY closed red"); }
              if (ma50 > 0 && spyPx > ma50) { score += 15; factors.push("✅ SPY above 50D MA"); }
              else if (ma50 > 0) { score -= 15; factors.push("🔴 SPY below 50D MA"); }
              if (vix > 25) { score -= 20; factors.push(`🔴 VIX high (${vix.toFixed(0)}) — fear elevated`); }
              else if (vix > 0 && vix < 16) { score += 12; factors.push(`✅ VIX low (${vix.toFixed(0)}) — calm`); }
              if (breadthPct >= 60) { score += 15; factors.push(`✅ Strong breadth (${breadthPct}% up)`); }
              else if (breadthPct <= 35) { score -= 15; factors.push(`🔴 Weak breadth (${breadthPct}% up)`); }
              if (fg <= 25) { score += 10; factors.push("✅ Extreme fear — bounce odds rise"); }
              else if (fg >= 75) { score -= 10; factors.push("⚠️ Extreme greed — pullback risk"); }
              if (qqqChg > 0.5 && spyChg > 0) { score += 8; factors.push("✅ Tech leading"); }
              // ── News sentiment factor ──
              if (newsSentiment && (newsSentiment.bull + newsSentiment.bear) >= 3) {
                const np = newsSentiment.netPct;
                if (np >= 25)      { score += 18; factors.push(`📰 News BULLISH (${np>0?"+":""}${np}% net of ${newsSentiment.bull+newsSentiment.bear} headlines)`); }
                else if (np >= 8)  { score += 10; factors.push(`📰 News lean bullish (+${np}%)`); }
                else if (np <= -25){ score -= 18; factors.push(`📰 News BEARISH (${np}% net of ${newsSentiment.bull+newsSentiment.bear} headlines)`); }
                else if (np <= -8) { score -= 10; factors.push(`📰 News lean bearish (${np}%)`); }
                else               { factors.push(`📰 News mixed (${np>0?"+":""}${np}%)`); }
              }
              // ── Social (StockTwits) sentiment factor ──
              if (socialSentiment && (socialSentiment.totalBull + socialSentiment.totalBear) >= 5) {
                const sp = socialSentiment.netPct;
                if (sp >= 25)      { score += 12; factors.push(`💬 Traders BULLISH (${sp>0?"+":""}${sp}% on StockTwits)`); }
                else if (sp >= 8)  { score += 7;  factors.push(`💬 Traders lean bullish (+${sp}%)`); }
                else if (sp <= -25){ score -= 12; factors.push(`💬 Traders BEARISH (${sp}% on StockTwits)`); }
                else if (sp <= -8) { score -= 7;  factors.push(`💬 Traders lean bearish (${sp}%)`); }
              }

              const bias = score >= 25 ? "BULLISH" : score >= 5 ? "LEAN BULLISH" : score <= -25 ? "BEARISH" : score <= -5 ? "LEAN BEARISH" : "NEUTRAL";
              const biasCol = score >= 25 ? C.green : score >= 5 ? "#4caf50" : score <= -25 ? C.red : score <= -5 ? "#ff6b6b" : C.amber;
              const biasIcon = score >= 5 ? "📈" : score <= -5 ? "📉" : "➡️";
              const plan = score >= 25 ? "Look for GREEN LIGHT longs at the open. Buy pullbacks to support."
                         : score >= 5 ? "Cautiously bullish — take only A+ setups, normal size."
                         : score <= -25 ? "Defensive. Avoid longs until SPY reclaims 50D MA. Cash is a position."
                         : score <= -5 ? "Stay small. Wait for the open to confirm direction before committing."
                         : "Mixed signals. Let the first 30 min set the tone — don't predict, react.";
              // Key levels for tomorrow
              const support = ma50 > 0 ? Math.min(ma50, spyPx * 0.985) : spyPx * 0.985;
              const resist  = spyPx * 1.015;

              return (
                <div style={{ marginBottom: 14, background: `${biasCol}0c`, border: `2px solid ${biasCol}44`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                  <div style={{ padding: "14px 22px", background: `${biasCol}18`, borderBottom: `1px solid ${biasCol}33`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: biasCol, letterSpacing: "0.08em" }}>🔮 NEXT DAY OUTLOOK</span>
                    <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: biasCol }}>{biasIcon} {bias}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: "auto" }}>based on today's close · for next session</span>
                  </div>
                  <div style={{ padding: "18px 22px", display: "flex", gap: 28, flexWrap: "wrap" }}>
                    {/* Factors */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>WHAT'S DRIVING IT</div>
                      {factors.slice(0, 7).map((f, i) => (
                        <div key={i} style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, padding: "4px 0" }}>{f}</div>
                      ))}
                      {!factors.length && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textDim }}>Waiting for market data…</div>}
                    </div>
                    {/* News sentiment */}
                    {newsSentiment && (newsSentiment.bull + newsSentiment.bear) >= 3 && (
                      <div style={{ minWidth: 260, flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>
                          📰 NEWS SENTIMENT: <span style={{ color: newsSentiment.netPct >= 8 ? C.green : newsSentiment.netPct <= -8 ? C.red : C.amber, fontWeight: 800, fontSize: 15 }}>{newsSentiment.label} ({newsSentiment.netPct >= 0 ? "+" : ""}{newsSentiment.netPct}%)</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.green }}>🟢 {newsSentiment.bull} bullish</span>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.red }}>🔴 {newsSentiment.bear} bearish</span>
                        </div>
                        {newsSentiment.topBull.map((h,i) => <div key={"b"+i} style={{ fontFamily: SANS, fontSize: 13, color: C.green, lineHeight: 1.5, padding: "1px 0" }}>+ {h.slice(0,75)}</div>)}
                        {newsSentiment.topBear.map((h,i) => <div key={"r"+i} style={{ fontFamily: SANS, fontSize: 13, color: C.red, lineHeight: 1.5, padding: "1px 0" }}>− {h.slice(0,75)}</div>)}
                      </div>
                    )}
                    {/* Levels */}
                    <div style={{ minWidth: 190 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>SPY LEVELS TO WATCH</div>
                      {[["Resistance", resist, C.red], ["Current", spyPx, C.text], ["Support", support, C.green]].map(([l,v,col]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", gap: 16 }}>
                          <span style={{ fontFamily: SANS, fontSize: 15, color: C.textDim }}>{l}</span>
                          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: col }}>${v.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "14px 22px", borderTop: `1px solid ${biasCol}22`, background: `${biasCol}08` }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: biasCol }}>📋 TOMORROW'S PLAN: </span>
                    <span style={{ fontFamily: SANS, fontSize: 15, color: C.text }}>{plan}</span>
                  </div>
                </div>
              );
            })()}
            </MonitorSection>

            </>
          );
}

