import { Badge, ScoreBar, TrendTag, formatNum } from "./ui-atoms.jsx";
import { LAYOUT } from "./theme.js";
import { computeScores, classifyTrend, computeMTFSignal } from "./trading-utils.js";

export default function QuotesTab({
  C, MONO, SANS, isTablet, apiKey, settings, marketSession,
  watchlistData, watchlistSymbols, watchlists, watchlistNotes,
  activeWlistId, openAlertSymbol, openNoteSymbol,
  scoreFilter, signalFilter, trendFilter, volumeFilter,
  wlAlertDir, wlAlertPrice, wlCardView, wlistRenameVal, wlistRenaming, wlSearchFocused, wlSearchQuery,
  sorted, signalFiltered, sortCol, sortDir, handleSort, trendMap,
  setActiveTab, setActiveWlistId, setLoading, setOpenAlertSymbol, setOpenNoteSymbol, setQuickLogModal,
  setScanExpanded, setScanResults, setScoreFilter, setSelectedStock, setSettings, setSignalFilter,
  setTerminalSymbol, setTrendFilter, setVolumeFilter, setWatchlistInput, setWatchlistNotes,
  setWatchlists, setWatchlistSymbols, setWlAlertDir, setWlAlertPrice, setWlCardView,
  setWlistRenameVal, setWlistRenaming, setWlSearchFocused, setWlSearchQuery,
  fetchAll, openTradingView, loadDeepDive, loadDeepSocial,
}) {
  const SortH = ({ col, children, align = "left" }) => (
    <th onClick={() => handleSort(col)} style={{
      padding: "10px 8px", fontSize: 12, fontFamily: MONO, letterSpacing: "0.04em",
      color: sortCol === col ? C.accent : C.textDim, textAlign: align, cursor: "pointer",
      borderBottom: `1px solid ${C.border}`, userSelect: "none", whiteSpace: "nowrap",
    }}>
      {children}{sortCol === col ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return watchlistData.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: LAYOUT.gridGap, alignItems: "start", width: "100%", overflow: "hidden" }}>
            {/* Watchlist Table */}
            <div>
              {/* ── Named Watchlist Tabs ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                {watchlists.map(wl => (
                  <div key={wl.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {wlistRenaming === wl.id ? (
                      <input
                        autoFocus
                        value={wlistRenameVal}
                        onChange={e => setWlistRenameVal(e.target.value)}
                        onBlur={() => {
                          if (wlistRenameVal.trim()) setWatchlists(prev => prev.map(w => w.id === wl.id ? { ...w, name: wlistRenameVal.trim() } : w));
                          setWlistRenaming(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") e.target.blur();
                          if (e.key === "Escape") { setWlistRenaming(null); }
                        }}
                        style={{ width: 90, background: C.surface, border: `1px solid ${C.accent}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "4px 8px", borderRadius: "5px 0 0 5px" }}
                      />
                    ) : (
                      <button
                        onClick={() => setActiveWlistId(wl.id)}
                        onDoubleClick={() => { setWlistRenaming(wl.id); setWlistRenameVal(wl.name); }}
                        title={`${wl.symbols.length} symbols · double-click to rename`}
                        style={{
                          fontFamily: MONO, fontSize: 12, fontWeight: activeWlistId === wl.id ? 800 : 400,
                          color: activeWlistId === wl.id ? C.accent : C.textDim,
                          background: activeWlistId === wl.id ? C.accentGlow : "transparent",
                          border: `1px solid ${activeWlistId === wl.id ? C.accent : C.border}`,
                          borderRight: "none", borderRadius: "5px 0 0 5px",
                          padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {wl.name} <span style={{ opacity: 0.6, fontSize: 12 }}>({wl.symbols.length})</span>
                      </button>
                    )}
                    {watchlists.length > 1 && (
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete list "${wl.name}"?`)) return;
                          const remaining = watchlists.filter(w => w.id !== wl.id);
                          setWatchlists(remaining);
                          if (activeWlistId === wl.id) setActiveWlistId(remaining[0].id);
                        }}
                        style={{ fontFamily: MONO, fontSize: 12, color: C.red, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "0 5px 5px 0", padding: "4px 6px", cursor: "pointer" }}
                        title="Delete this list"
                      >✕</button>
                    )}
                    {watchlists.length === 1 && (
                      <div style={{ width: 1, height: 28, background: C.border, borderRadius: "0 5px 5px 0", border: `1px solid ${C.border}`, borderLeft: "none" }} />
                    )}
                  </div>
                ))}
                {/* New list button */}
                <button
                  onClick={() => {
                    const id = `list_${Date.now()}`;
                    const name = `List ${watchlists.length + 1}`;
                    setWatchlists(prev => [...prev, { id, name, symbols: [] }]);
                    setActiveWlistId(id);
                  }}
                  style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}
                  title="New watchlist"
                >+ NEW LIST</button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                  {watchlists.find(w => w.id === activeWlistId)?.name?.toUpperCase() || "WATCHLIST"} — {watchlistData.length} SYMBOLS — REAL-TIME QUOTES
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* ── Search + Add ── */}
                  <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${wlSearchFocused ? C.accent : C.border}`, borderRadius: 6, background: C.surface, overflow: "visible" }}>
                      <span style={{ padding: "0 8px", color: C.textDim, fontSize: 13 }}>🔍</span>
                      <input
                        value={wlSearchQuery}
                        onChange={e => setWlSearchQuery(e.target.value.toUpperCase())}
                        onFocus={() => setWlSearchFocused(true)}
                        onBlur={() => setTimeout(() => setWlSearchFocused(false), 200)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && wlSearchQuery.trim()) {
                            const sym = wlSearchQuery.trim().toUpperCase();
                            if (!watchlistSymbols.includes(sym)) {
                              const next = [...watchlistSymbols, sym];
                              setWatchlistSymbols(next);
                              setWatchlistInput(next.join(","));
                              setLoading(true);
                              fetchAll(apiKey).finally(() => setLoading(false));
                            }
                            setWlSearchQuery("");
                          }
                          if (e.key === "Escape") setWlSearchQuery("");
                        }}
                        placeholder="Search ticker…"
                        style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 4px", width: 130 }}
                      />
                      {wlSearchQuery && (
                        <button
                          onMouseDown={e => {
                            e.preventDefault();
                            const sym = wlSearchQuery.trim().toUpperCase();
                            if (sym && !watchlistSymbols.includes(sym)) {
                              const next = [...watchlistSymbols, sym];
                              setWatchlistSymbols(next);
                              setWatchlistInput(next.join(","));
                              setLoading(true);
                              fetchAll(apiKey).finally(() => setLoading(false));
                            }
                            setWlSearchQuery("");
                          }}
                          style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 10px", cursor: "pointer", borderRadius: "0 5px 5px 0", whiteSpace: "nowrap" }}
                        >+ ADD</button>
                      )}
                    </div>
                    {/* Suggestion dropdown from market universe */}
                    {wlSearchFocused && wlSearchQuery.length >= 1 && (() => {
                      const q = wlSearchQuery.toUpperCase();
                      const suggestions = MARKET_UNIVERSE_SYMBOLS.filter(s => s.startsWith(q) && !watchlistSymbols.includes(s)).slice(0, 8);
                      if (!suggestions.length) return null;
                      return (
                        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 180, marginTop: 2 }}>
                          {suggestions.map(sym => (
                            <div
                              key={sym}
                              onMouseDown={e => {
                                e.preventDefault();
                                const next = [...watchlistSymbols, sym];
                                setWatchlistSymbols(next);
                                setWatchlistInput(next.join(","));
                                setWlSearchQuery("");
                                setLoading(true);
                                fetchAll(apiKey).finally(() => setLoading(false));
                              }}
                              style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 13, color: C.text, cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                              onMouseEnter={e => e.currentTarget.style.background = C.surface}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >
                              <span>{sym}</span>
                              <span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>+ ADD</span>
                            </div>
                          ))}
                          {!MARKET_UNIVERSE_SYMBOLS.includes(wlSearchQuery) && (
                            <div
                              onMouseDown={e => {
                                e.preventDefault();
                                const sym = wlSearchQuery.trim();
                                if (sym && !watchlistSymbols.includes(sym)) {
                                  const next = [...watchlistSymbols, sym];
                                  setWatchlistSymbols(next);
                                  setWatchlistInput(next.join(","));
                                  setLoading(true);
                                  fetchAll(apiKey).finally(() => setLoading(false));
                                }
                                setWlSearchQuery("");
                              }}
                              style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 12, color: C.accent, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                            >
                              <span>Add "{wlSearchQuery}"</span>
                              <span style={{ fontWeight: 700 }}>↵</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: watchlistSymbols }) });
                        alert(`✅ Pushed ${watchlistSymbols.length} symbols to bot watchlist.`);
                      } catch (e) { alert("Push failed: " + e.message); }
                    }}
                    style={{ background: `${C.green}12`, border: `1px solid ${C.green}44`, color: C.green, fontFamily: MONO, fontSize: 12, padding: "6px 8px", cursor: "pointer", borderRadius: 5 }}
                    title="Push current watchlist to the bot"
                  >↑ BOT</button>
                  <button
                    onClick={async () => {
                      try {
                        const data = await fetch("/api/watchlist").then(r => r.json());
                        if (data.symbols && data.symbols.length) {
                          setWatchlistSymbols(data.symbols);
                          setWatchlistInput(data.symbols.join(","));
                          setLoading(true);
                          fetchAll(apiKey).finally(() => setLoading(false));
                        } else { alert("Bot watchlist is empty. Push from bot first."); }
                      } catch (e) { alert("Pull failed: " + e.message); }
                    }}
                    style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: MONO, fontSize: 12, padding: "6px 8px", cursor: "pointer", borderRadius: 5 }}
                    title="Load bot watchlist into platform"
                  >↓ BOT</button>
                  <select
                    value={String(settings.refreshMs)}
                    onChange={(e) => setSettings((s) => ({ ...s, refreshMs: Number(e.target.value) }))}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px" }}
                  >
                    <option value="60000">Refresh 1m</option>
                    <option value="180000">Refresh 3m</option>
                    <option value="300000">Refresh 5m</option>
                  </select>
                </div>
              </div>
              {watchlistData.length >= 3 && (() => {
                const anyFilter = signalFilter !== "ALL" || trendFilter !== "ALL" || volumeFilter !== "ALL" || scoreFilter !== "ALL";
                const Pill = ({ active, col, bg, bdr, onClick, children }) => (
                  <button onClick={onClick} style={{
                    fontFamily: MONO, fontSize: 12, fontWeight: active ? 800 : 400,
                    color: active ? col : C.textDim,
                    background: active ? bg : "transparent",
                    border: `1px solid ${active ? bdr : C.border}`,
                    borderRadius: 5, padding: "3px 10px", cursor: "pointer", transition: "all 0.12s",
                  }}>{children}</button>
                );
                const Sep = () => <span style={{ color: C.border, fontSize: 14, userSelect: "none" }}>│</span>;
                return (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

                    {/* Signal */}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>SIGNAL</span>
                    {[
                      { v: "ALL",  col: C.text,  bg: C.card,    bdr: C.border },
                      { v: "BUY",  col: C.green, bg: C.greenBg, bdr: C.green  },
                      { v: "HOLD", col: C.amber, bg: C.amberBg, bdr: C.amber  },
                      { v: "SELL", col: C.red,   bg: C.redBg,   bdr: C.red    },
                    ].map(({ v, col, bg, bdr }) => (
                      <Pill key={v} active={signalFilter === v} col={col} bg={bg} bdr={bdr} onClick={() => setSignalFilter(v)}>{v}</Pill>
                    ))}

                    <Sep />

                    {/* Trend */}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>TREND</span>
                    {[
                      { v: "ALL",        label: "ALL"   },
                      { v: "Strong Up",  label: "▲▲"   },
                      { v: "Up",         label: "▲"    },
                      { v: "Flat",       label: "─"    },
                      { v: "Weak",       label: "▼"    },
                      { v: "Down",       label: "▼▼"   },
                    ].map(({ v, label }) => {
                      const col = v === "Strong Up" ? C.green : v === "Up" ? C.green : v === "Flat" ? C.textDim : v === "Weak" ? C.red : v === "Down" ? C.red : C.text;
                      const bg  = v === "Strong Up" || v === "Up" ? C.greenBg : v === "Weak" || v === "Down" ? C.redBg : C.card;
                      return <Pill key={v} active={trendFilter === v} col={col} bg={bg} bdr={col} onClick={() => setTrendFilter(v)}>{label}</Pill>;
                    })}

                    <Sep />

                    {/* Volume */}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>VOL</span>
                    {[
                      { v: "ALL",    label: "ALL",    col: C.text,  bg: C.card    },
                      { v: "HIGH",   label: "HIGH",   col: C.green, bg: C.greenBg },
                      { v: "NORMAL", label: "NORMAL", col: C.amber, bg: C.amberBg },
                      { v: "LOW",    label: "LOW",    col: C.red,   bg: C.redBg   },
                    ].map(({ v, label, col, bg }) => (
                      <Pill key={v} active={volumeFilter === v} col={col} bg={bg} bdr={col} onClick={() => setVolumeFilter(v)}>{label}</Pill>
                    ))}

                    <Sep />

                    {/* Score */}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>SCORE</span>
                    {["ALL","70+","60+","50+","<50"].map(v => (
                      <Pill key={v} active={scoreFilter === v} col={C.accent} bg={C.accentGlow} bdr={C.accent} onClick={() => setScoreFilter(v)}>{v}</Pill>
                    ))}

                    {/* Reset all */}
                    {anyFilter && (
                      <>
                        <Sep />
                        <button onClick={() => { setSignalFilter("ALL"); setTrendFilter("ALL"); setVolumeFilter("ALL"); setScoreFilter("ALL"); }}
                          style={{ fontFamily: MONO, fontSize: 12, color: C.red, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                          ✕ RESET
                        </button>
                      </>
                    )}

                    {/* Result count + view toggle */}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: "auto" }}>
                      {signalFiltered.length} / {sorted.length}
                    </span>
                    <button onClick={() => setWlCardView(v => !v)}
                      title={wlCardView ? "Switch to table view" : "Switch to card view"}
                      style={{ border: `1px solid ${C.border}`, background: wlCardView ? `${C.accent}18` : C.surface, color: wlCardView ? C.accent : C.textDim, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                      {wlCardView ? "⊞ CARDS" : "☰ TABLE"}
                    </button>
                  </div>
                );
              })()}
              {watchlistData.length >= 3 && (() => {
                const isPreMkt = marketSession === "PREMARKET";
                const isPostMkt = marketSession === "AFTERMARKET";
                const isExt = isPreMkt || isPostMkt;
                const extColor = isPreMkt ? C.accent : C.amber;
                const extLabel = isPreMkt ? "PRE" : "POST";
                const getChg = (q) => isExt
                  ? Number(isPreMkt ? q.preMarketChangePercent : q.postMarketChangePercent) || 0
                  : (q.changesPercentage || 0);
                const moversBase = [...watchlistData].sort((a, b) => getChg(b) - getChg(a));
                const top3 = moversBase.slice(0, 3);
                const bot3 = moversBase.slice(-3).reverse();
                return (
                  <div>
                    {isExt && (
                      <div style={{ fontFamily: MONO, fontSize: 12, color: extColor, fontWeight: 700, marginBottom: 4, letterSpacing: "0.1em" }}>
                        {extLabel}MARKET MOVERS
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 10 }}>
                      {top3.map((q) => {
                        const chg = getChg(q);
                        return (
                          <div key={`mv-t-${q.symbol}`} onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{q.symbol}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>+{chg.toFixed(2)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{isExt ? <span style={{ color: extColor, fontWeight: 700 }}>{extLabel} </span> : null}${(q.price || 0).toFixed(2)}</div>
                          </div>
                        );
                      })}
                      {bot3.map((q) => {
                        const chg = getChg(q);
                        return (
                          <div key={`mv-b-${q.symbol}`} onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{q.symbol}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700 }}>{chg.toFixed(2)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{isExt ? <span style={{ color: extColor, fontWeight: 700 }}>{extLabel} </span> : null}${(q.price || 0).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {wlCardView ? (
                /* ── CARD VIEW — optimised for iPad touch ───────────────── */
                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "repeat(auto-fill, minmax(180px, 1fr))" : "repeat(auto-fill, minmax(160px, 1fr))", gap: isTablet ? 12 : 10, marginBottom: 6 }}>
                  {signalFiltered.map(q => {
                    const chg    = q.changesPercentage || 0;
                    const isUp   = chg >= 0;
                    const scores = computeScores(q, trendMap?.[q.symbol]);
                    const trend  = classifyTrend(q);
                    const rvol   = q.avgVolume ? (q.volume / q.avgVolume) : 0;
                    const mtf    = computeMTFSignal(q, trendMap?.[q.symbol]);
                    const sigCol = mtf.signal === "BUY" ? C.green : mtf.signal === "SELL" ? C.red : C.amber;
                    const trendArrow = trend.includes("Up") ? "▲" : trend.includes("Down") ? "▼" : "─";
                    const trendCol   = trend.includes("Up") ? C.green : trend.includes("Down") ? C.red : C.textDim;
                    return (
                      <div key={q.symbol}
                        onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                          padding: isTablet ? "16px" : "12px 14px",
                          minHeight: isTablet ? 100 : "auto",
                          cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                          borderLeft: `3px solid ${isUp ? C.green : C.red}` }}
                        onMouseEnter={e => { e.currentTarget.style.borderLeftColor = sigCol; e.currentTarget.style.background = C.cardHover; }}
                        onMouseLeave={e => { e.currentTarget.style.borderLeftColor = isUp ? C.green : C.red; e.currentTarget.style.background = C.card; }}
                      >
                        {/* Symbol + signal + alert toggle */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 6 }}>
                          <span style={{ fontFamily: MONO, fontSize: isTablet ? 16 : 14, fontWeight: 800, color: C.accent }}>{q.symbol}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontFamily: MONO, fontSize: isTablet ? 10 : 9, fontWeight: 700, color: sigCol, background: `${sigCol}22`, borderRadius: 5, padding: "3px 7px" }}>{mtf.signal}</span>
                            <button
                              onClick={e => { e.stopPropagation(); if (openAlertSymbol === q.symbol) { setOpenAlertSymbol(null); } else { setOpenAlertSymbol(q.symbol); setWlAlertDir("above"); setWlAlertPrice(q.price ? (q.price * 1.02).toFixed(2) : ""); } }}
                              title="Set price alert"
                              style={{ flexShrink: 0, border: `1px solid ${openAlertSymbol === q.symbol ? C.amber + "99" : C.border}`, background: openAlertSymbol === q.symbol ? `${C.amber}18` : "transparent", color: openAlertSymbol === q.symbol ? C.amber : C.textDim, borderRadius: 5, padding: "2px 5px", fontSize: 11, cursor: "pointer", lineHeight: 1 }}>
                              🔔
                            </button>
                          </div>
                        </div>
                        {/* Price */}
                        <div style={{ fontFamily: MONO, fontSize: isTablet ? 20 : 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                          ${(q.price || 0).toFixed(2)}
                        </div>
                        {/* Change */}
                        <div style={{ fontFamily: MONO, fontSize: isTablet ? 15 : 12, fontWeight: 700, color: isUp ? C.green : C.red, marginBottom: 8 }}>
                          {isUp ? "+" : ""}{chg.toFixed(2)}%
                        </div>
                        {/* Trend + Score row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: isTablet ? 12 : 11, color: trendCol }}>{trendArrow} {trend.replace(" Up","").replace(" Down","").replace("Strong","").trim() || trend}</span>
                          <span style={{ fontFamily: MONO, fontSize: isTablet ? 12 : 11, color: C.textDim }}>S:{Math.round(scores.composite)}</span>
                        </div>
                        {/* RVOL */}
                        {rvol > 0 && (
                          <div style={{ fontFamily: MONO, fontSize: isTablet ? 12 : 10, color: rvol >= 2 ? C.accent : rvol >= 1.2 ? C.amber : C.textDim, marginTop: 4 }}>
                            RVOL {rvol.toFixed(1)}×
                          </div>
                        )}
                        {/* Inline price-alert form — was table-view-only, cards
                            (the mobile default view) had no way to set a
                            per-symbol alert at all. Stacked vertically, not
                            the table version's single flex row, since a card
                            is only 160-180px wide -- a horizontal row of
                            select+input+2 buttons doesn't fit that width. */}
                        {openAlertSymbol === q.symbol && (
                          <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <select value={wlAlertDir} onChange={e => setWlAlertDir(e.target.value)}
                                style={{ flex: 1, minWidth: 0, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 6px", borderRadius: 6 }}>
                                <option value="above">Above</option>
                                <option value="below">Below</option>
                              </select>
                              <input type="number" step="0.01" value={wlAlertPrice} onChange={e => setWlAlertPrice(e.target.value)}
                                placeholder="Target"
                                style={{ flex: 1, minWidth: 0, background: C.surface, border: `1px solid ${C.amber}66`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 6px", borderRadius: 6, outline: "none" }}
                              />
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>now: ${(q.price || 0).toFixed(2)}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (!wlAlertPrice) return;
                                  await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: q.symbol, targetPrice: Number(wlAlertPrice), direction: wlAlertDir }) });
                                  setOpenAlertSymbol(null);
                                }}
                                style={{ flex: 1, border: `1px solid ${C.amber}66`, background: `${C.amber}22`, color: C.amber, borderRadius: 6, padding: "5px 0", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                SET ALERT
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setOpenAlertSymbol(null); }}
                                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              /* ── TABLE VIEW ────────────────────────────────────────────── */
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 5,
                overflow: "hidden",
              }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <SortH col="symbol">SYMBOL</SortH>
                        <SortH col="price" align="right">PRICE</SortH>
                        <SortH col="change" align="right">CHG%</SortH>
                        {(marketSession === "PREMARKET" || marketSession === "AFTERMARKET") && (
                          <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em", color: marketSession === "PREMARKET" ? C.accent : C.amber }}>
                            {marketSession === "PREMARKET" ? "PRE%" : "POST%"}
                          </th>
                        )}
                        {!isTablet && <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>5M</th>}
                        {!isTablet && <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>30M</th>}
                        <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "center", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>TREND</th>
                        <SortH col="rvol" align="right">RVOL</SortH>
                        <SortH col="volume" align="right">VOLUME</SortH>
                        {!isTablet && <SortH col="mktcap" align="right">MKT CAP</SortH>}
                        <SortH col="composite">SCORE</SortH>
                        <SortH col="tech">TECH</SortH>
                        {!isTablet && <SortH col="fund">FUND</SortH>}
                        <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "center", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>SIGNAL</th>
                        <th style={{ padding: "10px 8px", fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "center", borderBottom: `1px solid ${C.border}` }}>⚡</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signalFiltered.map(q => {
                        const chg = q.changesPercentage || 0;
                        const isUp = chg >= 0;
                        const scores = computeScores(q, trendMap?.[q.symbol]);
                        const trend = classifyTrend(q);
                        const rvol = q.avgVolume ? (q.volume / q.avgVolume) : 0;
                        const mtf = computeMTFSignal(q, trendMap?.[q.symbol]);
                        const colSpan = ((marketSession === "PREMARKET" || marketSession === "AFTERMARKET") ? 15 : 14) - (isTablet ? 4 : 0);
                        return (
                          <React.Fragment key={q.symbol}>
                          <tr
                            className="wl-row"
                            onClick={() => setSelectedStock(q)}
                            style={{ cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; const btns = e.currentTarget.querySelector(".wl-btns"); if(btns) btns.style.opacity="1"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; const btns = e.currentTarget.querySelector(".wl-btns"); if(btns) btns.style.opacity="0"; }}
                          >
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div>
                                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.text }}>{q.symbol}</div>
                                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</div>
                                </div>
                                <div className="wl-btns" style={{ display: "flex", gap: 3, opacity: 0, transition: "opacity 0.15s" }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                                  style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                                >
                                  CHART
                                </button>
                                {!isTablet && <button
                                  onClick={(e) => { e.stopPropagation(); openTradingView(q.symbol); }}
                                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                >
                                  TV
                                </button>}
                                {!isTablet && <button
                                  onClick={(e) => { e.stopPropagation(); setScanResults(prev => prev.some(r=>r.ticker===q.symbol)?prev:[{ticker:q.symbol,score:scores.composite||50,signal:"WATCH",scannerScore:scores.composite||50,signals:[],sColor:"#f59e0b",quote:{price:q.price||0,changePercent:q.changesPercentage||0},candles:null},...prev]); setActiveTab("smartscan"); setTimeout(()=>{setScanExpanded(q.symbol);loadDeepDive(q.symbol);loadDeepSocial(q.symbol);},100); }}
                                  style={{ border: `1px solid ${C.accent}44`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                                >DIVE</button>}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setQuickLogModal({ symbol: q.symbol, price: q.price || 0, entry: (q.price || 0).toFixed(2), stopLoss: "", target: "", size: "", side: "BUY", timeframe: "1D", style: "Watchlist", notes: `CHG ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% · RVOL ${rvol.toFixed(2)}x`, score: scores.composite || 0, chg, rvol }); }}
                                  style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                                >
                                  LOG
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenNoteSymbol(openNoteSymbol === q.symbol ? null : q.symbol); }}
                                  style={{ border: `1px solid ${watchlistNotes[q.symbol] ? C.amber + "88" : C.border}`, background: watchlistNotes[q.symbol] ? C.amber + "18" : C.surface, color: watchlistNotes[q.symbol] ? C.amber : C.textDim, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  title="Add note"
                                >
                                  NOTE
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (openAlertSymbol === q.symbol) { setOpenAlertSymbol(null); } else { setOpenAlertSymbol(q.symbol); setWlAlertDir("above"); setWlAlertPrice((q.price ? (q.price * 1.02).toFixed(2) : "")); } }}
                                  style={{ border: `1px solid ${openAlertSymbol === q.symbol ? C.amber + "99" : C.border}`, background: openAlertSymbol === q.symbol ? `${C.amber}18` : C.surface, color: openAlertSymbol === q.symbol ? C.amber : C.textDim, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  title="Set price alert"
                                >
                                  ALERT
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setWatchlistSymbols(prev => prev.filter(s => s !== q.symbol)); }}
                                  style={{ border: `1px solid ${C.red}44`, background: C.surface, color: C.red, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  title={`Remove ${q.symbol} from watchlist`}
                                >
                                  ×
                                </button>
                                </div>
                              </div>
                              {watchlistNotes[q.symbol] && openNoteSymbol !== q.symbol && (
                                <div style={{ fontFamily: MONO, fontSize: 11, color: C.amber, marginTop: 2, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  📝 {watchlistNotes[q.symbol]}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 14, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontWeight: 700, verticalAlign: "middle" }}>
                              ${q.price?.toFixed(2)}
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 15, fontWeight: 700, textAlign: "right",
                              color: isUp ? C.green : C.red, borderBottom: `1px solid ${C.border}`,
                              background: isUp ? C.greenBg : C.redBg,
                            }}>
                              {isUp ? "+" : ""}{chg.toFixed(2)}%
                            </td>
                            {(marketSession === "PREMARKET" || marketSession === "AFTERMARKET") && (() => {
                              const extChg = marketSession === "PREMARKET"
                                ? Number(q.preMarketChangePercent || 0)
                                : Number(q.postMarketChangePercent || 0);
                              const extColor = marketSession === "PREMARKET" ? C.accent : C.amber;
                              const extBg = marketSession === "PREMARKET" ? C.accentGlow : C.amberBg;
                              return (
                                <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", color: extChg !== 0 ? extColor : C.textDim, background: extChg !== 0 ? extBg : "transparent" }}>
                                  {extChg !== 0 ? `${extChg >= 0 ? "+" : ""}${extChg.toFixed(2)}%` : "—"}
                                </td>
                              );
                            })()}
                            {/* delta5m/delta30m are null (not 0) until the server has
                                accumulated enough real price history for this symbol —
                                shown honestly as "—" rather than a fabricated "+0.00%"
                                that would look identical to real flat price action. */}
                            {!isTablet && <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", color: q.delta5m == null ? C.textDim : q.delta5m >= 0 ? C.green : C.red }}>
                              {q.delta5m == null ? "—" : `${q.delta5m >= 0 ? "+" : ""}${q.delta5m.toFixed(2)}%`}
                            </td>}
                            {!isTablet && <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", color: q.delta30m == null ? C.textDim : q.delta30m >= 0 ? C.green : C.red }}>
                              {q.delta30m == null ? "—" : `${q.delta30m >= 0 ? "+" : ""}${q.delta30m.toFixed(2)}%`}
                            </td>}
                            <td style={{ padding: "8px 8px", textAlign: "center", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" }}>
                              <TrendTag trend={trend} />
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 13, textAlign: "right",
                              color: rvol > 1.3 ? C.green : rvol > 1 ? C.text : C.textDim,
                              borderBottom: `1px solid ${C.border}`,
                            }}>
                              {rvol.toFixed(2)}x
                            </td>
                            <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" }}>
                              {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}
                            </td>
                            {!isTablet && <td style={{ padding: "8px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" }}>
                              {formatNum(q.marketCap)}
                            </td>}
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 65 }}>
                              <ScoreBar value={scores.composite} />
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.tech} color={C.cyan} />
                            </td>
                            {!isTablet && <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.fund} color={C.purple} />
                            </td>}
                            <td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "center", minWidth: 90 }}>
                              {(() => {
                                const sigColor = mtf.signal === "BUY" ? C.green : mtf.signal === "SELL" ? C.red : C.amber;
                                const sigBg    = mtf.signal === "BUY" ? C.greenBg : mtf.signal === "SELL" ? C.redBg : C.amberBg;
                                return (
                                  <div>
                                    <div style={{
                                      fontFamily: MONO, fontSize: 12, fontWeight: 900,
                                      color: sigColor, background: sigBg,
                                      borderRadius: 5, padding: "3px 8px",
                                      display: "inline-block", letterSpacing: "0.06em",
                                    }}>
                                      {mtf.signal}
                                    </div>
                                    <div style={{ display: "flex", gap: 2, marginTop: 4, justifyContent: "center" }}>
                                      {mtf.timeframes.map(tf => (
                                        <div key={tf.label} title={`${tf.label}: ${tf.neutral ? "neutral" : tf.bull ? "bullish" : "bearish"}`} style={{
                                          display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                                        }}>
                                          <div style={{
                                            width: 10, height: 10, borderRadius: 2,
                                            background: tf.neutral ? C.border : tf.bull ? C.green : C.red,
                                            opacity: tf.neutral ? 0.4 : 1,
                                          }} />
                                          <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, lineHeight: 1 }}>{tf.label}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            {/* Quick Alert button — was POSTing to /api/alerts/price,
                                which doesn't exist anywhere in the backend (confirmed
                                live: 404 "Not found"). Every click silently failed --
                                the fetch's own .catch(()=>{}) swallowed the error, so
                                a user filling in the prompt() dialog and clicking OK
                                got no feedback that nothing happened. This row already
                                has a real, working alert mechanism a few columns over
                                (the "⚡"-adjacent ALERT text button, openAlertSymbol +
                                POST /api/price-alerts) -- routed this one through the
                                same real toggle instead of the dead endpoint + a
                                second, redundant prompt()-based UI. */}
                            <td style={{ padding: "6px 8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (openAlertSymbol === q.symbol) { setOpenAlertSymbol(null); }
                                  else { setOpenAlertSymbol(q.symbol); setWlAlertDir("above"); setWlAlertPrice(q.price ? (q.price * 1.02).toFixed(2) : ""); }
                                }}
                                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${openAlertSymbol === q.symbol ? C.amber + "99" : C.amber + "44"}`, background: openAlertSymbol === q.symbol ? `${C.amber}22` : `${C.amber}12`,
                                  color: C.amber, borderRadius: 5, padding: "4px 7px", cursor: "pointer" }}
                                title="Set price alert">
                                🔔
                              </button>
                            </td>
                          </tr>
                          {openNoteSymbol === q.symbol && (
                            <tr style={{ background: C.card }}>
                              <td colSpan={colSpan} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  <textarea
                                    autoFocus
                                    value={watchlistNotes[q.symbol] || ""}
                                    onChange={e => setWatchlistNotes(n => ({ ...n, [q.symbol]: e.target.value }))}
                                    onClick={e => e.stopPropagation()}
                                    placeholder={`Notes for ${q.symbol} — thesis, key levels, catalysts…`}
                                    rows={2}
                                    style={{ flex: 1, background: C.surface, border: `1px solid ${C.amber}44`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", borderRadius: 6, resize: "vertical", outline: "none" }}
                                  />
                                  <button
                                    onClick={e => { e.stopPropagation(); setWatchlistNotes(n => { const next = { ...n }; delete next[q.symbol]; return next; }); setOpenNoteSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    CLEAR
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setOpenNoteSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    DONE
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {openAlertSymbol === q.symbol && (
                            <tr style={{ background: C.card }}>
                              <td colSpan={colSpan} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.amber, fontWeight: 700 }}>🔔 ALERT {q.symbol}</span>
                                  <select value={wlAlertDir} onChange={e => setWlAlertDir(e.target.value)}
                                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "4px 8px", borderRadius: 6 }}>
                                    <option value="above">Above</option>
                                    <option value="below">Below</option>
                                  </select>
                                  <input type="number" step="0.01" value={wlAlertPrice} onChange={e => setWlAlertPrice(e.target.value)}
                                    placeholder="Target price"
                                    style={{ width: 110, background: C.surface, border: `1px solid ${C.amber}66`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "4px 8px", borderRadius: 6, outline: "none" }}
                                  />
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>now: ${(q.price || 0).toFixed(2)}</span>
                                  <button
                                    onClick={async e => {
                                      e.stopPropagation();
                                      if (!wlAlertPrice) return;
                                      await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: q.symbol, targetPrice: Number(wlAlertPrice), direction: wlAlertDir }) });
                                      setOpenAlertSymbol(null);
                                    }}
                                    style={{ border: `1px solid ${C.amber}66`, background: `${C.amber}22`, color: C.amber, borderRadius: 6, padding: "4px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}
                                  >
                                    SET ALERT
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setOpenAlertSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, fontFamily: MONO, color: C.textDim, textAlign: "center" }}>
                {wlCardView ? "Tap card to open terminal" : "Click any row for deep-dive"} · Auto-refreshes every {Math.round(settings.refreshMs / 60000)}m · Data via multi-provider quote engine
              </div>
            </div>

          </div>
  );
}
