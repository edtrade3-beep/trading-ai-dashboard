import { useState } from "react";
import { C, MONO, SANS } from "./theme.js";

// ─────────────────────────────────────────────────────────────────────────
// REALITY CHECK — a self-contained floating overlay widget.
//
// Answers "what is real money actually doing on this symbol, versus what
// the crowd/headlines are saying about it" — a divergence detector, not a
// signal generator. Pulls from data this platform already fetches
// elsewhere (options flow, insider transactions, StockTwits/Reddit) so
// nothing here is invented; when a source has no data (no provider key,
// no recent filings, etc.) it's shown as unavailable, never faked.
//
// Zero props — reads only what the user types into its own ticker input.
// Renders unconditionally in App(), stacked next to TradingCopilot's chat
// button (bottom-right), so it's unaffected by whatever tab is active.
// ─────────────────────────────────────────────────────────────────────────

function optionsFlowBias(flow) {
  const call = Number(flow?.summary?.callNotional || 0);
  const put = Number(flow?.summary?.putNotional || 0);
  if (call + put <= 0) return null; // no flow data — don't fabricate a score
  const score = Math.round(((call - put) / (call + put)) * 100);
  return { score, call, put };
}

function insiderSignal(insider) {
  const txns = insider?.insiderTransactions?.transactions || [];
  if (!txns.length) return { state: "QUIET", buyValue: 0, sellValue: 0 };
  const buyValue = txns.filter((t) => t.type === "BUY").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const sellValue = txns.filter((t) => t.type === "SELL").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const net = buyValue - sellValue;
  const state = net > 0 && buyValue > 0 ? "BUYING" : net < 0 && sellValue > 0 ? "SELLING" : "MIXED";
  return { state, buyValue, sellValue };
}

function narrativeScore(social) {
  const bullPct = social?.stocktwits?.bullPct;
  if (bullPct == null || social?.stocktwits?.total === 0) return null;
  return Math.round((bullPct - 50) * 2);
}

const fmtUSD = (n) =>
  Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;

const zoneColor = (score) => (score >= 20 ? C.green : score <= -20 ? C.red : C.amber);
const zoneLabel = (score) => (score >= 20 ? "BULLISH" : score <= -20 ? "BEARISH" : "NEUTRAL");

export default function RealityCheckWidget() {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { symbol, flow, insider, social }

  const check = async (symOverride) => {
    const sym = String(symOverride || ticker).trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 10);
    if (!sym) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const [flowRes, insiderRes, socialRes] = await Promise.all([
        fetch(`/api/market/options-flow?symbols=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/market/insider?ticker=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/market/social?ticker=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setResult({ symbol: sym, flow: flowRes, insider: insiderRes, social: socialRes });
    } catch (e) {
      setError(e?.message || "Failed to fetch data");
    }
    setLoading(false);
  };

  const flowBias = result ? optionsFlowBias(result.flow) : null;
  const insider = result ? insiderSignal(result.insider) : null;
  const narrScore = result ? narrativeScore(result.social) : null;
  const redditMentions = result?.social?.redditMentions ?? null;
  const divergence = flowBias != null && narrScore != null ? flowBias.score - narrScore : null;

  const takeaway = (() => {
    if (!result) return "";
    const bits = [];
    if (divergence != null) {
      if (divergence >= 40) bits.push("Options flow is leaning bullish while the crowd isn't buying it yet — divergences like this are where real edges tend to hide.");
      else if (divergence <= -40) bits.push("Options flow is leaning bearish while retail sentiment stays upbeat — be skeptical of the hype here.");
      else bits.push("Real flow and crowd sentiment are roughly aligned right now — no notable divergence.");
    } else if (flowBias != null) {
      bits.push(`Options flow alone leans ${zoneLabel(flowBias.score).toLowerCase()} — no crowd-sentiment data to compare it against.`);
    } else if (narrScore != null) {
      bits.push(`Only crowd sentiment is available right now (${zoneLabel(narrScore).toLowerCase()}) — no options flow data to check it against.`);
    } else {
      bits.push("No flow or sentiment data available for this symbol right now.");
    }
    if (insider && insider.state === "BUYING") bits.push(`Insiders have also been net buying (${fmtUSD(insider.buyValue - insider.sellValue)} recently disclosed).`);
    else if (insider && insider.state === "SELLING") bits.push(`Insiders have been net selling (${fmtUSD(insider.sellValue - insider.buyValue)} recently disclosed) — worth noting.`);
    return bits.join(" ");
  })();

  return (
    <div style={{ position: "fixed", bottom: 18, right: 86, zIndex: 300, fontFamily: SANS }}>
      {open && (
        <div
          role="dialog"
          aria-label="Reality Check"
          style={{
            position: "absolute", bottom: 64, right: 0, width: 360, maxWidth: "90vw",
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 18 }}>🕵️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 13, letterSpacing: "0.02em", fontFamily: MONO }}>REALITY CHECK</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>Real flow vs. the narrative — not advice, just data</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 4 }}>
              ×
            </button>
          </div>

          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Ticker input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && check()}
                placeholder="NVDA, TSLA, AMD…"
                style={{
                  flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                  borderRadius: 8, padding: "9px 12px", fontFamily: MONO, fontSize: 13, fontWeight: 700, outline: "none",
                }}
              />
              <button onClick={() => check()} disabled={loading}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "9px 16px", borderRadius: 8, border: "none",
                  background: loading ? C.textDim : C.accent, color: "#fff", cursor: loading ? "default" : "pointer" }}>
                {loading ? "…" : "CHECK"}
              </button>
            </div>

            {error && <div style={{ color: C.red, fontSize: 12 }}>⚠ {error}</div>}

            {!result && !loading && !error && (
              <div style={{ color: C.textDim, fontSize: 12, textAlign: "center", padding: "12px 4px" }}>
                Enter a ticker to compare real options/insider flow against crowd sentiment.
              </div>
            )}

            {result && (
              <>
                <div style={{ color: C.text, fontFamily: MONO, fontSize: 16, fontWeight: 900 }}>{result.symbol}</div>

                {/* Smart money side */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ color: C.textDim, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 8 }}>
                    🕵️ SMART MONEY (real flow)
                  </div>
                  {flowBias != null ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: C.textSec, fontSize: 11.5 }}>Options flow</span>
                      <span style={{ color: zoneColor(flowBias.score), fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                        {zoneLabel(flowBias.score)} ({flowBias.score >= 0 ? "+" : ""}{flowBias.score})
                      </span>
                    </div>
                  ) : (
                    <div style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>Options flow: no data available</div>
                  )}
                  {flowBias != null && (
                    <div style={{ color: C.textDim, fontSize: 10.5, marginBottom: 6 }}>
                      Calls {fmtUSD(flowBias.call)} · Puts {fmtUSD(flowBias.put)}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.textSec, fontSize: 11.5 }}>Insider transactions</span>
                    <span style={{
                      color: insider?.state === "BUYING" ? C.green : insider?.state === "SELLING" ? C.red : C.textDim,
                      fontFamily: MONO, fontSize: 12, fontWeight: 800,
                    }}>
                      {insider?.state || "QUIET"}
                    </span>
                  </div>
                </div>

                {/* Narrative side */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ color: C.textDim, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 8 }}>
                    📢 THE NARRATIVE (crowd/hype)
                  </div>
                  {narrScore != null ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: C.textSec, fontSize: 11.5 }}>StockTwits crowd</span>
                      <span style={{ color: zoneColor(narrScore), fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                        {zoneLabel(narrScore)} ({result.social?.stocktwits?.bullPct ?? "—"}% bull)
                      </span>
                    </div>
                  ) : (
                    <div style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>StockTwits: no data available</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.textSec, fontSize: 11.5 }}>Reddit (r/WSB, 7d)</span>
                    <span style={{ color: C.textDim, fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                      {redditMentions != null ? `${redditMentions} mentions` : "—"}
                    </span>
                  </div>
                </div>

                {/* Verdict */}
                <div style={{
                  display: "flex", gap: 8, alignItems: "flex-start", borderRadius: 10, padding: "10px 12px",
                  background: divergence != null && Math.abs(divergence) >= 40 ? `${C.amber}14` : `${C.green}10`,
                  border: `1px solid ${divergence != null && Math.abs(divergence) >= 40 ? C.amber : C.green}33`,
                }}>
                  <span style={{ fontSize: 14 }}>{divergence != null && Math.abs(divergence) >= 40 ? "⚠️" : "🔎"}</span>
                  <div style={{ color: C.text, fontSize: 11.5, lineHeight: 1.5 }}>{takeaway}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Reality Check" : "Open Reality Check"}
        title="Reality Check — real flow vs. the narrative"
        style={{
          width: 52, height: 52, borderRadius: "50%", cursor: "pointer",
          background: C.bg, border: `2px solid ${C.accent}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}
      >
        {open ? <span style={{ color: C.text, fontSize: 20 }}>×</span> : "🕵️"}
      </button>
    </div>
  );
}
