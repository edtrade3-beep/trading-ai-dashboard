export default function DealsTab({
  C, MONO, SANS, isMobile, themeMode,
  dealsCategory, dealsSources, dealsQuery, dealsMaxPrice, dealsLoading, dealsError,
  dealsSearched, dealsResults, dealsWatches, dealsWatchesLoading, dealsAlerts,
  setDealsCategory, setDealsQuery, setDealsMaxPrice,
  fetchDealsWatches, runDealsSearch, addDealsWatch, removeDealsWatch,
}) {
        const DEAL_CATS = [
          { id: "electronics", label: "🖥️ Electronics" },
          { id: "realestate",  label: "🏠 Real Estate" },
          { id: "cars",        label: "🚗 Cars" },
          { id: "furniture",   label: "🛋️ Furniture" },
          { id: "general",     label: "🛒 General" },
          { id: "jobs",        label: "💼 Jobs" },
        ];
        const catLabel = DEAL_CATS.find(c => c.id === dealsCategory)?.label || dealsCategory;
        const showLocation = dealsCategory === "realestate" || dealsCategory === "cars";
        const SOURCE_META = [["reddit","Reddit","#ff4500"],["slickdeals","SlickDeals","#e31c23"],["dealnews","DealNews","#0066cc"],["google","Google","#4285f4"],["dealslist","DealsList","#16a34a"]];
        const allSourcesBlocked = Object.keys(dealsSources).length > 0 && Object.values(dealsSources).every(v => v === 0 || v === -1);
        return (
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>🛒 DEALS FINDER</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Powered by Reddit deal communities — 100% free · Set Telegram alerts</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => fetch("/api/deals/ping").then(r => r.json()).then(d => alert(d.ok ? "✅ Server alive — deals endpoint working!" : "❌ Endpoint error")).catch(e => alert("❌ " + e.message))}
                  style={{ background: `${C.green}14`, border: `1px solid ${C.green}44`, color: C.green, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >🔌 PING</button>
                <button
                  onClick={() => fetch("/api/deals/debug").then(r => r.json()).then(d => alert("Source test:\n" + Object.entries(d.status || {}).map(([k,v]) => `${k}: ${v}`).join("\n"))).catch(e => alert("❌ " + e.message))}
                  style={{ background: "#7c3aed18", border: "1px solid #7c3aed44", color: "#7c3aed", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >🔬 DEBUG</button>
                <button
                  onClick={() => fetch("/api/deals/test-alert", { method: "POST" }).then(() => alert("Test Telegram alert sent!"))}
                  style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >📱 TEST TELEGRAM</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap: 16 }}>
              {/* LEFT: Search + Results */}
              <div>
                {/* Search panel */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  {/* Category tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
                    {DEAL_CATS.map(c => (
                      <button key={c.id} onClick={() => setDealsCategory(c.id)}
                        style={{ background: dealsCategory === c.id ? `${C.accent}18` : C.surface, border: `1px solid ${dealsCategory === c.id ? C.accent : C.border}`, color: dealsCategory === c.id ? C.accent : C.textSec, borderRadius: 20, padding: "5px 12px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Search inputs row */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={dealsQuery}
                      onChange={e => setDealsQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && runDealsSearch()}
                      placeholder={`Search ${catLabel} deals… (leave blank for hot deals)`}
                      style={{ flex: "2 1 200px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                    />
                    <input
                      value={dealsMaxPrice}
                      onChange={e => setDealsMaxPrice(e.target.value)}
                      placeholder="Max $ price"
                      type="number"
                      style={{ flex: "0 1 110px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                    />
                    <button onClick={runDealsSearch} disabled={dealsLoading}
                      style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 6, padding: "9px 18px", fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: dealsLoading ? 0.7 : 1, flexShrink: 0 }}>
                      {dealsLoading ? "SEARCHING…" : "SEARCH"}
                    </button>
                    <button onClick={addDealsWatch} disabled={!dealsQuery.trim() || dealsWatchesLoading}
                      title="Save this search — get Telegram alerts when new deals appear"
                      style={{ background: `${C.green}14`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 6, padding: "9px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !dealsQuery.trim() ? 0.5 : 1, flexShrink: 0 }}>
                      🔔 WATCH
                    </button>
                  </div>

                  {dealsError && (
                    <div style={{ marginTop: 10, padding: "8px 12px", background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 6, fontFamily: MONO, fontSize: 12, color: C.red }}>
                      ⚠ {dealsError}
                    </div>
                  )}
                </div>

                {/* Results */}
                {dealsLoading && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                    ⟳ Searching for deals…
                  </div>
                )}
                {!dealsLoading && dealsResults.length === 0 && !dealsError && !dealsSearched && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                    Enter a search above and press SEARCH, or leave blank for hot deals.<br/>
                    <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      Sources: Reddit · SlickDeals · DealNews · Google News · DealsList
                    </span>
                    <span style={{ fontSize: 12, color: C.textDim }}>
                      Examples: "gaming laptop" · "iPhone 15" · "TV under 500" · "used car deals"
                    </span>
                  </div>
                )}
                {!dealsLoading && dealsResults.length === 0 && !dealsError && dealsSearched && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{allSourcesBlocked ? "🚫" : "🔍"}</div>
                    {allSourcesBlocked ? (
                      <div>
                        <span style={{ color: C.red, fontWeight: 700 }}>All deal sources blocked or unreachable.</span><br/>
                        <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>The server could not reach any deal site. Common on cloud servers.<br/>Click DEBUG above to see which sources work.</span>
                      </div>
                    ) : (
                      <div>
                        <span>No deals found for that search.</span><br/>
                        <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>Try a broader term or leave blank for hot deals.</span>
                      </div>
                    )}
                    {Object.keys(dealsSources).length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                        {SOURCE_META.map(([key, label, color]) => {
                          const v = dealsSources[key];
                          const bad = v === 0 || v === -1;
                          return (
                            <span key={key} style={{ background: bad ? C.surface : color, color: bad ? C.textDim : "#fff", border: `1px solid ${bad ? C.border : color}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                              {bad ? "✕" : "✓"} {label}{v > 0 ? " " + v : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={runDealsSearch} style={{ marginTop: 12, background: C.accent, border: "none", color: "#fff", borderRadius: 6, padding: "8px 18px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      TRY AGAIN
                    </button>
                  </div>
                )}
                {!dealsLoading && dealsResults.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span style={{ color: C.text, fontWeight: 700 }}>{dealsResults.length} RESULTS</span>
                      {dealsQuery && <span style={{ color: C.textDim }}>for "{dealsQuery}"</span>}
                      {Object.keys(dealsSources).length > 0 && <span>·</span>}
                      {SOURCE_META.map(([key, label, color]) => {
                        const v = dealsSources[key];
                        if (v === undefined) return null;
                        const bad = v === 0 || v === -1;
                        return (
                          <span key={key} style={{ background: bad ? C.surface : color, color: bad ? C.textDim : "#fff", border: `1px solid ${bad ? C.border : "transparent"}`, borderRadius: 6, padding: "1px 6px", fontSize: 12, fontWeight: 700 }}>
                            {bad ? ("✕ " + label) : (label + " " + v)}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                      {dealsResults.map(deal => {
                        const srcColors = { reddit:"#ff4500", slickdeals:"#e31c23", dealnews:"#0066cc", google:"#4285f4", dealslist:"#16a34a" };
                        const srcLabels = { reddit:"Reddit", slickdeals:"SlickDeals", dealnews:"DealNews", google:"Google News", dealslist:"DealsList" };
                        const catIcons  = { electronics:"💻", realestate:"🏠", cars:"🚗", furniture:"🛋️", jobs:"💼", luxury:"💎", general:"🛒" };
                        const srcColor  = srcColors[deal.sourceKey] || C.accent;
                        const srcLabel  = srcLabels[deal.sourceKey] || deal.source || "Deal";
                        const catIcon   = catIcons[deal.category]   || "🛒";
                        return (
                          <div key={deal.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            {/* Image area */}
                            <div style={{ width: "100%", height: 160, background: themeMode === "dark" ? "#111827" : "#f0f2f5", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                              {deal.image ? (
                                <img src={deal.image} alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  onError={e => { e.target.style.display = "none"; }}
                                />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <span style={{ fontSize: 38 }}>{catIcon}</span>
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{srcLabel}</span>
                                </div>
                              )}
                              {/* Source badge top-left */}
                              <div style={{ position: "absolute", top: 8, left: 8, background: srcColor, borderRadius: 5, padding: "3px 8px" }}>
                                <span style={{ fontFamily: MONO, fontSize: 12, color: "#fff", fontWeight: 700 }}>{srcLabel}</span>
                              </div>
                              {/* Age badge top-right */}
                              {deal.age !== null && (
                                <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "3px 7px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: "#e5e7eb" }}>
                                    {deal.age < 24 ? `${deal.age}h ago` : `${Math.floor(deal.age / 24)}d ago`}
                                  </span>
                                </div>
                              )}
                              {/* Upvote score bottom-left (Reddit only) */}
                              {deal.score > 0 && (
                                <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "3px 7px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>▲ {deal.score?.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                            {/* Card body */}
                            <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                                {deal.title}
                              </div>
                              {deal.description && (
                                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.4 }}>
                                  {deal.description.slice(0, 100)}{deal.description.length > 100 ? "…" : ""}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 6 }}>
                                {deal.price && <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.green }}>{deal.price}</span>}
                                {deal.comments > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>💬 {deal.comments}</span>}
                              </div>
                              <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                                <a href={deal.link} target="_blank" rel="noopener noreferrer"
                                  style={{ flex: 1, background: srcColor, color: "#fff", textDecoration: "none", borderRadius: 5, padding: "6px 0", fontFamily: MONO, fontSize: 12, fontWeight: 700, textAlign: "center", display: "block" }}>
                                  VIEW DEAL →
                                </a>
                                {deal.sourceKey === "reddit" && deal.redditLink && deal.redditLink !== deal.link && (
                                  <a href={deal.redditLink} target="_blank" rel="noopener noreferrer"
                                    style={{ background: "#ff4500", color: "#fff", textDecoration: "none", borderRadius: 5, padding: "6px 8px", fontFamily: MONO, fontSize: 12, fontWeight: 700, display: "block" }}>
                                    💬
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Watches + Recent Alerts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Active watches */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>🔔 TELEGRAM WATCHES ({dealsWatches.length})</span>
                    <button onClick={fetchDealsWatches} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>REFRESH</button>
                  </div>
                  {dealsWatches.length === 0 ? (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "12px 0" }}>
                      No watches yet.<br/>
                      Search for something then click 🔔 WATCH to get Telegram alerts every 30 min when new deals appear.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {dealsWatches.map(w => (
                        <div key={w.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.query}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>
                              {w.category.toUpperCase()}{w.maxPrice ? ` · max $${w.maxPrice}` : ""}{w.location ? ` · ${w.location}` : ""}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: w.lastAlerted ? C.green : C.textDim, marginTop: 2 }}>
                              {w.lastAlerted ? `Last alerted: ${new Date(w.lastAlerted).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not yet checked"}
                            </div>
                          </div>
                          <button onClick={() => removeDealsWatch(w.id)}
                            style={{ background: C.redBg, border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Telegram alerts */}
                {dealsAlerts.length > 0 && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 10 }}>
                      📨 RECENT TELEGRAM ALERTS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {dealsAlerts.slice(0, 10).map(a => (
                        <div key={a.id} style={{ background: `${C.green}08`, border: `1px solid ${C.green}22`, borderRadius: 7, padding: "8px 10px" }}>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{a.query} <span style={{ color: C.green, fontWeight: 900 }}>+{a.count} new</span></div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>{new Date(a.at).toLocaleString()}</div>
                          {a.preview?.map((p, i) => (
                            <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 3 }}>
                              • {p.title.slice(0, 50)}{p.title.length > 50 ? "…" : ""} {p.price && <span style={{ color: C.green, fontWeight: 700 }}>{p.price}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}22`, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 6 }}>HOW DEAL ALERTS WORK</div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                    1. Search or browse hot deals by category<br/>
                    2. Click 🔔 WATCH to save the search<br/>
                    3. Server checks Reddit every 30 min<br/>
                    4. New posts → instant Telegram message<br/>
                    5. Works 24/7 even when browser is closed<br/><br/>
                    <span style={{ color: C.accent, fontWeight: 700 }}>✓ 100% Free — no API key needed</span><br/>
                    Sources: r/deals, r/buildapcsales, r/frugal,<br/>
                    r/realestate, r/cardeals, r/techdeals + more
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
}
