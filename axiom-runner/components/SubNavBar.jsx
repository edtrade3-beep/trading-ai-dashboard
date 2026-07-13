export default function SubNavBar({ C, MONO, activeTab, isMobile, tvChartMode, setTvChartMode, setActiveTab, triggeredAlertBadge }) {
        const SUB_GROUPS = {
          // Trimmed 2026-07-11: was 12 tabs — breadth/sectors/rotation/cot are
          // real, fully-built, non-redundant widgets (added 2026-07-10) but
          // more "occasional deep lens" than "check every time" like the 8
          // below. Same "hide, don't delete" treatment as the PRO TRADE trim —
          // all 4 still fully work via the command palette (BREADTH GO,
          // SECTORS GO, ROTATION GO, COT GO). Add a line back here to
          // re-surface any of them.
          // Also left dormant (still work, just not surfaced — code untouched):
          // "calendar" (TV-iframe dup of Events), "heatmap" (portfolio P&L
          // heatmap, belongs nearer Holdings not market-wide monitoring),
          // feargreed/correlation/seasonality/darkpool/social/insider (real,
          // but lower daily-monitoring priority — most now live under the
          // 🕵️ SMART MONEY group instead).
          // Trimmed 2026-07-12 per user request ("fewer tabs, only what I use,
          // no distraction") — was 8 tabs. START HERE is onboarding-only (still
          // lands there automatically on first visit, no button needed) and
          // QUOTES/CRYPTO/NEWS/EVENTS/MACRO are all still fully wired, just not
          // in this bar — reachable via command palette (QUOTES/CRYPTO/NEWS/
          // EVENTS/MACRO GO).
          // MOVERS moved to TERMINAL 2026-07-12 per user request — now the
          // sole tab here, matching the existing single-tab precedent (coach).
          dashboard: [
            { id: "dashboard",  label: "📊 MONITOR" },
          ],
          terminal: [
            { id: "multitf",    label: "📈 CHART" },
            { id: "tv",         label: "📺 TV LIVE" },
          ],
          mterminal: [
            { id: "mterminal",  label: "🖥 MARKET TERMINAL" },
            { id: "daytrade",   label: "⚡ DAY TRADE" },
            { id: "movers",     label: "🔥 MOVERS" },
            { id: "sm-brief",   label: "🧠 AI BRIEF" },
            { id: "darkpool",   label: "🌊 DARK POOL" },
            { id: "flow",       label: "⚡ OPTIONS FLOW" },
          ],
          // Trimmed 2026-07-10: was 18 tabs (8 of them near-duplicate "rank
          // stocks, find setups" scanners). Kept the ones covering distinct,
          // non-overlapping jobs. The rest (GL Backtest, Compression+Signal,
          // Dip Buy, Squeeze, Under $10, Gap Scanner, Adol22, Smart Scan,
          // Predictions, Outlook) still work exactly as before — their code,
          // routes, and (for Adol22) backend Telegram alerts are untouched —
          // they're just not cluttering this bar. Add a line back here to
          // re-surface any of them.
          // Trimmed 2026-07-12 per user request — was 8 tabs, kept the 3 named
          // explicitly (autopilot + the two scanners). COMMAND DECK/HEAT MAP/
          // WATCHLISTS/HOLDINGS are still fully wired, just not in this bar —
          // reachable via command palette (DECK/SECTORHEAT/WATCHLISTS/HOLDINGS
          // GO). TRADE PLANNER and AI COACH added back 2026-07-12 — both are
          // complete, valuable features that just weren't discoverable.
          rhpro: [
            { id: "rhpro-apex", label: "🧠 TRADE PRO AI" },
            { id: "rhpro-scan", label: "🎯 SNIPER SCANNER" },
            { id: "greenlight",  label: "🟢 GREEN LIGHT + AUTOPILOT" },
            { id: "tradeplanner", label: "🎯 TRADE PLANNER" },
            { id: "rhpro-coach", label: "🎓 AI COACH" },
          ],
          // SMART MONEY folded into the mterminal group above 2026-07-12 —
          // AI Brief/Dark Pool/Options Flow are now part of SUB_GROUPS.mterminal.
          coach: [
            { id: "coach",        label: "🧭 المدرّب اليومي" },
          ],
          // Trimmed 2026-07-12 (LEARN nav trim) — was 4 tabs, kept the 2 with the
          // most content/daily use. PRO PATH and OPTIONS 101 are still fully
          // wired, just not in this bar — reachable via command palette
          // (PROPATH/OPTIONSEDU GO).
          education: [
            { id: "education",       label: "🎓 PSYCHOLOGY" },
            { id: "notes",           label: "📝 NOTES" },
          ],
          // TOOLS removed as a top-level group 2026-07-12 per user request
          // ("remove tools") — Settings/Deal Finder/Flight Finder/Lead
          // Responder are all still fully wired, just not in the nav bar,
          // reachable via command palette (TOOLS/DEALFINDER/FLIGHTFINDER/
          // LEADRESPONDER GO).
          // halal/soccer hidden 2026-07-10 (removed from nav, code untouched —
          // same "hide, don't delete" treatment as the PRO TRADE trim above).
          islamic: [
            { id: "quran",  label: "قرآن" },
            { id: "athan",  label: "الصلاة" },
            { id: "athkar", label: "أذكار" },
            { id: "tasbih", label: "تسبيح" },
          ],
        };
        const activeGroup = Object.entries(SUB_GROUPS).find(([, tabs]) =>
          tabs.some(t => !t.divider && t.id === activeTab)
        );
        if (!activeGroup) return null;
        const [, subTabs] = activeGroup;
        return (
          <div style={{
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
            padding: isMobile ? "0 6px" : "0 18px",
            display: "flex", alignItems: "center", gap: 1,
            overflowX: "auto", scrollbarWidth: "none",
          }}>
            {/* USE MY CHART button — only on CHART tab */}
            {activeTab === "terminal" && (
              <div style={{ marginLeft: "auto", padding: "0 4px", flexShrink: 0 }}>
                {tvChartMode === "widget" ? (
                  <button
                    onClick={() => { setTvChartMode("my_chart"); localStorage.setItem("tv_chart_mode","my_chart"); }}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${C.accent}`, background: `${C.accent}18`,
                      color: C.accent, borderRadius: 6,
                      padding: isMobile ? "8px 12px" : "3px 10px",
                      minHeight: isMobile ? 36 : "auto",
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    📊 MY TV CHART
                  </button>
                ) : (
                  <button
                    onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${C.border}`, background: C.surface,
                      color: C.textSec, borderRadius: 6,
                      padding: isMobile ? "8px 12px" : "3px 10px",
                      minHeight: isMobile ? 36 : "auto",
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    ← BUILT-IN CHART
                  </button>
                )}
              </div>
            )}

            {subTabs.map((t, ti) => {
              if (t.divider) return (
                <div key={`div-${ti}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px", flexShrink: 0 }}>
                  <div style={{ width: 1, height: 16, background: C.border }} />
                  <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 900, color: C.textDim,
                    letterSpacing: "0.12em", opacity: 0.6 }}>{t.divider}</span>
                </div>
              );
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: isActive ? C.accent : C.textDim,
                    fontFamily: MONO, fontSize: isMobile ? 11 : 9, fontWeight: isActive ? 800 : 500,
                    padding: isMobile ? "10px 14px" : "5px 10px", cursor: "pointer",
                    borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                    letterSpacing: "0.06em", whiteSpace: "nowrap",
                    transition: "color 0.12s",
                    display: "inline-flex", alignItems: "center", gap: 4,
                    minHeight: isMobile ? 44 : "auto",
                  }}
                >
                  {t.label}
                  {t.id === "alerts" && triggeredAlertBadge > 0 && (
                    <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "2px 5px", fontSize: 7, fontWeight: 800 }}>{triggeredAlertBadge}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
}
