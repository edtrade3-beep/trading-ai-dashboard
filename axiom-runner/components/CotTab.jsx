import { useState, useEffect } from "react";

// AI TAKE — a real Claude call over the same allBiases/scores this tab
// already renders (never a number the model typed): what to do, what to
// avoid, and why. Same "real data in, judgment out" pattern as CEO AI
// (src/ceo-ai.js) / Advisor AI (src/advisor-ai.js). Self-contained, same
// fetch-on-mount + refresh-button shape as TradingLessonCard/AdvisorAiTab.
function AiTakeSection({ C, MONO, SANS, green, red, yellow, blue, dim }) {
  const [take, setTake] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/cot/ai-take").then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setGenerating(true);
    fetch("/api/cot/ai-take/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("error");
    }).catch(() => setState("error")).finally(() => setGenerating(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${blue}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.08em" }}>
          🤖 AI TAKE — WHAT TO DO
        </div>
        <button onClick={generate} disabled={generating}
          style={{ background: generating ? C.surface : `${blue}1a`, border: `1px solid ${blue}55`, color: generating ? dim : blue,
            fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 5, cursor: generating ? "not-allowed" : "pointer" }}>
          {generating ? "⏳ THINKING…" : take ? "↻ NEW TAKE" : "GENERATE TAKE"}
        </button>
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: dim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: red }}>Couldn't generate a take — check ANTHROPIC_API_KEY is set, and that COT data is loaded.</div>}
      {state === "empty" && !generating && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: dim }}>Click "GENERATE TAKE" for an honest AI read on what today's real positioning data means — what to do, what to avoid, and why.</div>
      )}

      {take && state === "ok" && (
        <>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 14 }}>{take.overallTake}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: green, letterSpacing: "0.06em", marginBottom: 8 }}>✅ DO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.doThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${green}0c`, border: `1px solid ${green}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: dim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: red, letterSpacing: "0.06em", marginBottom: 8 }}>🚫 AVOID</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.avoidThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${red}0c`, border: `1px solid ${red}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: dim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {take.watchFor && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: dim, lineHeight: 1.5, fontStyle: "italic", borderTop: `1px solid ${C.border}55`, paddingTop: 8 }}>
              👁 Watch for: {take.watchFor}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: dim, marginTop: 8 }}>
            AI-synthesized from real COT positioning data as of {take.reportDate || "—"} — not financial advice, weekly lagging read, cross-check before acting.
          </div>
        </>
      )}
    </div>
  );
}

export default function CotTab({
  C, MONO, SANS, cotData, cotError, cotLastSent, cotLoading, cotRunning, isMobile,
  setCotData, setCotLastSent, setCotRunning,
}) {
        const green  = "#00c878";
        const red    = "#ff4455";
        const yellow = "#f5c842";
        const blue   = "#4a9eff";
        const dim    = C.textDim;

        function scoreColor(score) {
          if (score === undefined || score === null) return dim;
          if (score >= 60)  return green;
          if (score >= 25)  return "#6ec97a";
          if (score >= -24) return blue;
          if (score >= -59) return "#ff8855";
          return red;
        }

        function scoreBar(score) {
          if (score === undefined || score === null) return "─";
          const pct = Math.round(((score + 100) / 200) * 20);
          const filled = Math.max(0, Math.min(20, pct));
          const bar = "█".repeat(filled) + "░".repeat(20 - filled);
          return bar;
        }

        function biasTag(label = "") {
          const l = label.toLowerCase();
          const col = l.includes("strong bullish") ? green
                    : l.includes("bullish")         ? "#6ec97a"
                    : l.includes("strong bearish")  ? red
                    : l.includes("bearish")         ? "#ff8855"
                    : l.includes("crowded")         ? yellow
                    : blue;
          return (
            <span style={{ background: `${col}1a`, border: `1px solid ${col}44`, color: col,
              fontFamily: MONO, fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 8px",
              letterSpacing: "0.05em" }}>
              {label || "—"}
            </span>
          );
        }

        const summary   = cotData?.summary || {};
        const allBiases = cotData?.allBiases || {};
        const fresh     = cotData?.fresh;
        const repDate   = cotData?.reportDate;

        const CATEGORY_GROUPS = [
          { label: "Equity Indexes", biasKey: summary.equityBias, keys: ["sp500","nasdaq","dow","russell"] },
          { label: "Bonds / Rates",  biasKey: summary.bondBias,   keys: ["10y","2y"] },
          { label: "Dollar",         biasKey: summary.dollarBias, keys: ["dxy","eurusd","usdjpy","gbpusd"] },
          { label: "Gold / Metals",  biasKey: summary.goldBias,   keys: ["gold","silver"] },
          { label: "Energy",         biasKey: summary.oilBias,    keys: ["crude","natgas"] },
          { label: "Bitcoin",        biasKey: summary.bitcoinBias,keys: ["bitcoin"] },
        ];

        return (
          <div style={{ padding: isMobile ? "10px 8px" : "18px 20px", maxWidth: 1100, margin: "0 auto" }}>

            {/* ── Header ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>
                  📊 COMMITMENTS OF TRADERS
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: dim, marginTop: 3, letterSpacing: "0.06em" }}>
                  CFTC WEEKLY INSTITUTIONAL POSITIONING DATA
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* Freshness badge */}
                <div style={{ fontFamily: MONO, fontSize: 12, padding: "4px 10px", borderRadius: 5,
                  background: fresh ? `${green}18` : `${yellow}18`,
                  border: `1px solid ${fresh ? green : yellow}44`,
                  color: fresh ? green : yellow }}>
                  {fresh ? "✅ DATA FRESH" : "⚠️ MAY BE STALE"}
                </div>
                {repDate && (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: dim, padding: "4px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 5 }}>
                    COT date: {repDate}
                  </div>
                )}
                {/* Update button */}
                <button
                  disabled={cotRunning}
                  onClick={() => {
                    setCotRunning(true);
                    // Fire the async download (server returns 202 immediately; download takes ~60s)
                    fetch("/api/cot/run-update").catch(() => {});
                    // Poll /api/cot/status every 12s for up to 120s until biases appear
                    let attempts = 0;
                    const maxAttempts = 10;
                    const poll = () => {
                      attempts++;
                      fetch("/api/cot/status")
                        .then(r => r.json())
                        .then(d => {
                          const hasBiases = d.allBiases && Object.keys(d.allBiases).length > 0;
                          if (hasBiases || attempts >= maxAttempts) {
                            setCotData(d);
                            setCotRunning(false);
                          } else {
                            setTimeout(poll, 12000);
                          }
                        })
                        .catch(() => { if (attempts >= maxAttempts) setCotRunning(false); else setTimeout(poll, 12000); });
                    };
                    setTimeout(poll, 12000); // first check after 12s
                  }}
                  style={{ background: cotRunning ? C.surface : `${blue}1a`, border: `1px solid ${blue}55`,
                    color: blue, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px",
                    borderRadius: 5, cursor: cotRunning ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
                  {cotRunning ? "⏳ DOWNLOADING…" : "⬇ UPDATE COT"}
                </button>
                {/* Send Telegram button */}
                <button
                  disabled={cotRunning}
                  onClick={() => {
                    setCotRunning(true); setCotLastSent(null);
                    fetch("/api/cot/run-now")
                      .then(r => r.json())
                      .then(d => setCotLastSent(d.ok ? "✅ Sent!" : `❌ ${d.message}`))
                      .catch(e => setCotLastSent(`❌ ${e.message}`))
                      .finally(() => setCotRunning(false));
                  }}
                  style={{ background: cotRunning ? C.surface : `${green}1a`, border: `1px solid ${green}55`,
                    color: green, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px",
                    borderRadius: 5, cursor: cotRunning ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
                  📤 SEND TELEGRAM
                </button>
                {cotLastSent && (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: cotLastSent.startsWith("✅") ? green : red }}>
                    {cotLastSent}
                  </span>
                )}
              </div>
            </div>

            {/* Stale warning */}
            {summary.staleWarning && (
              <div style={{ background: `${yellow}14`, border: `1px solid ${yellow}44`, borderRadius: 8,
                padding: "8px 14px", fontFamily: MONO, fontSize: 12, color: yellow, marginBottom: 14 }}>
                ⚠️ {summary.staleWarning}
              </div>
            )}

            {/* Error / loading */}
            {cotLoading && (
              <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 12, color: dim }}>
                ⏳ Loading COT data…
              </div>
            )}
            {cotError && !cotLoading && (
              <div style={{ background: `${red}14`, border: `1px solid ${red}44`, borderRadius: 8,
                padding: "10px 14px", fontFamily: MONO, fontSize: 12, color: red, marginBottom: 14 }}>
                ❌ {cotError}
              </div>
            )}

            {!cotLoading && !cotError && !cotData && (
              <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 12, color: dim }}>
                No COT data loaded yet. Click "UPDATE COT" to download the latest CFTC report.
              </div>
            )}

            {cotData && !cotLoading && (
              <>
                <AiTakeSection C={C} MONO={MONO} SANS={SANS} green={green} red={red} yellow={yellow} blue={blue} dim={dim} />

                {/* ── Macro Bias Summary Row ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Equity Indexes", value: summary.equityBias },
                    { label: "Bonds / Rates",  value: summary.bondBias   },
                    { label: "Dollar",         value: summary.dollarBias },
                    { label: "Gold",           value: summary.goldBias   },
                    { label: "Oil / Energy",   value: summary.oilBias    },
                    { label: "Bitcoin",        value: summary.bitcoinBias },
                  ].map(({ label, value }) => {
                    const score = (summary.equity?.score) || 0;
                    return (
                      <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                        padding: "10px 12px" }}>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: dim, letterSpacing: "0.08em", marginBottom: 5 }}>
                          {label.toUpperCase()}
                        </div>
                        {biasTag(value || "N/A")}
                      </div>
                    );
                  })}
                </div>

                {/* ── Market-by-market table ── */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "14px 16px", marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text,
                    letterSpacing: "0.08em", marginBottom: 12 }}>
                    MARKET POSITIONING TABLE
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: MONO }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["MARKET","CATEGORY","SCORE","BIAS","13W PCT","52W PCT","WK CHG","REPORT DATE","STATUS"].map(h => (
                          <th key={h} style={{ padding: "4px 10px", textAlign: "left", color: dim,
                            fontWeight: 600, fontSize: 12, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(allBiases).map(([key, b]) => {
                        const sc = b.score || 0;
                        // dataStale means THIS market's own matched CFTC row is
                        // meaningfully older than its peers from the same fetch
                        // (e.g. a thinly-traded contract CFTC hasn't re-published
                        // recently) — dim the score/bias so a month-old read
                        // doesn't read as equally confident as a fresh one.
                        const col = b.dataStale ? dim : scoreColor(sc);
                        const extreme = b.positioningExtreme;
                        return (
                          <tr key={key} style={{ borderBottom: `1px solid ${C.border}22`,
                            background: b.dataStale ? `${yellow}0a` : extreme ? `${yellow}08` : "transparent" }}>
                            <td style={{ padding: "6px 10px", color: C.text, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {b.name || key}
                            </td>
                            <td style={{ padding: "6px 10px", color: dim, fontSize: 12 }}>
                              {b.category || "—"}
                            </td>
                            <td style={{ padding: "6px 10px", color: col, fontWeight: 800 }}>
                              {sc > 0 ? "+" : ""}{sc}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              {b.dataStale ? biasTag("Stale — low confidence") : biasTag(b.label || "—")}
                            </td>
                            <td style={{ padding: "6px 10px", color: dim }}>
                              {b.primaryPct13 !== undefined ? `${b.primaryPct13}%` : "—"}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <span style={{ color: b.primaryPct52 >= 90 ? yellow : b.primaryPct52 <= 10 ? yellow : dim }}>
                                {b.primaryPct52 !== undefined ? `${b.primaryPct52}%` : "—"}
                                {b.crowdedLong  ? " 🟡CL" : ""}
                                {b.crowdedShort ? " 🟡CS" : ""}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px",
                              color: b.weekChange > 0 ? green : b.weekChange < 0 ? red : dim }}>
                              {b.weekChange !== undefined
                                ? (b.weekChange > 0 ? "+" : "") + Number(b.weekChange).toLocaleString()
                                : "—"}
                            </td>
                            <td style={{ padding: "6px 10px", color: b.dataStale ? yellow : dim, fontSize: 12 }}>
                              {b.reportDate || "—"}
                            </td>
                            <td style={{ padding: "6px 10px", fontSize: 12 }}>
                              {b.dataStale
                                ? <span style={{ color: yellow }}>⚠️ STALE</span>
                                : extreme
                                ? <span style={{ color: yellow }}>⚠️ EXTREME</span>
                                : <span style={{ color: `${green}88` }}>OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {Object.keys(allBiases).length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: "20px 10px", textAlign: "center", color: dim, fontSize: 12 }}>
                            No data — click UPDATE COT to download CFTC report
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── Score bars ── */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {Object.entries(allBiases).map(([key, b]) => {
                    const sc = b.score || 0;
                    const col = b.dataStale ? dim : scoreColor(sc);
                    const pct = Math.max(0, Math.min(100, ((sc + 100) / 200) * 100));
                    return (
                      <div key={key} style={{ background: C.card, border: `1px solid ${b.dataStale ? `${yellow}44` : C.border}`, borderRadius: 8,
                        padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>
                            {b.name || key}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: col }}>
                            {sc > 0 ? "+" : ""}{sc}
                          </span>
                        </div>
                        <div style={{ height: 5, background: C.surface, borderRadius: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 5,
                            transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: red }}>BEARISH</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: dim }}>NEUTRAL</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: green }}>BULLISH</span>
                        </div>
                        {b.dataStale && <div style={{ fontFamily: MONO, fontSize: 12, color: yellow, marginTop: 3 }}>⚠️ Stale report ({b.reportDate}) — low confidence, ignore crowding flags below</div>}
                        {!b.dataStale && b.crowdedLong  && <div style={{ fontFamily: MONO, fontSize: 12, color: yellow, marginTop: 3 }}>⚠️ Crowded Long — monitor for reversal</div>}
                        {!b.dataStale && b.crowdedShort && <div style={{ fontFamily: MONO, fontSize: 12, color: yellow, marginTop: 3 }}>⚠️ Crowded Short — squeeze risk</div>}
                      </div>
                    );
                  })}
                </div>

                {/* ── COT Methodology note ── */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: "12px 16px", fontFamily: MONO, fontSize: 12, color: dim, lineHeight: 1.7 }}>
                  <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>ℹ️ COT METHODOLOGY</div>
                  COT data is released by the CFTC each Friday at 3:30 PM ET, reflecting positions as of the prior Tuesday close.<br/>
                  <strong style={{ color: C.text }}>TFF</strong> (Traders in Financial Futures) is used for equity indexes, rates, FX, and bonds.<br/>
                  <strong style={{ color: C.text }}>Disaggregated</strong> is used for commodities (gold, oil, gas).<br/>
                  <strong style={{ color: C.text }}>Legacy</strong> is used for Bitcoin.<br/>
                  Scores run from -100 (strong bearish) to +100 (strong bullish) based on asset-manager and leveraged-fund net positioning percentiles.<br/>
                  <strong style={{ color: yellow }}>⚠️ Crowded Long/Short</strong>: 52-week percentile above 90 or below 10 — high reversal risk.
                  <strong style={{ color: C.text }}>  COT is a higher-timeframe positioning bias, not a live entry signal.</strong>
                </div>
              </>
            )}
          </div>
        );
}
