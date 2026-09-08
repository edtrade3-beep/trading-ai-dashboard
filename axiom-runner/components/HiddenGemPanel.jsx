import { useState, useEffect } from "react";

// HiddenGemPanel — "3-Second AI Decision System" spec (2026-09-07), §4:
// Hidden Gems / Undervalued Opportunities, for the currently selected
// Trade Desk symbol. Reads GET /api/market/hidden-gem?symbol=X, which
// reuses future-value-scoring.js's existing Quality/Growth/Value scores
// plus mispricing-engine.js's new Fundamental Divergence + Mispricing
// Score + 5-question narrative — zero new client-side computation, this
// component only renders what the server already computed.
//
// Defaults COLLAPSED, same real reasoning as BeforeItPopsPanel.jsx: Trade
// Desk's core zone is a fixed, viewport-derived height shared with
// ChartPane, so an always-open panel here would eat into that budget.

const WHEN_COLOR = { ACCUMULATE_NOW: "green", EXCELLENT_COMPANY_WAIT: "amber", NOT_A_GEM: "textDim", INSUFFICIENT_DATA: "textDim", VALUE_TRAP_AVOID: "red" };

export default function HiddenGemPanel({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("tradedesk_hidden_gem_open") !== "on"; } catch { return true; }
  });

  useEffect(() => {
    if (!symbol || collapsed) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/market/hidden-gem?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setData({ ok: false, error: e.message }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [symbol, collapsed]);

  const toggleCollapsed = () => setCollapsed((v) => {
    const nv = !v;
    try { localStorage.setItem("tradedesk_hidden_gem_open", nv ? "off" : "on"); } catch {}
    return nv;
  });

  const profile = data?.profile;
  const when = profile?.when;
  const whenColorKey = when ? WHEN_COLOR[when.verdict] || "textDim" : "textDim";

  return (
    <section aria-label="Hidden Gem — undervalued opportunity analysis" style={{ padding: "14px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={toggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: collapsed ? 0 : 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>💎 HIDDEN GEM — {symbol || "—"}</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>— is this business mispriced?</span>
      </button>

      {!collapsed && (
        <>
          {loading && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Reading real fundamentals + multi-quarter trend…</div>}
          {!loading && data?.reason === "NO_FMP_KEY" && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Unavailable — no FMP API key configured for real fundamental history.</div>}
          {!loading && data?.reason === "NO_FUNDAMENTALS_DATA" && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>No real fundamentals data available for {symbol}.</div>}
          {!loading && data && !data.ok && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber }}>Unavailable right now: {data.error}</div>}

          {!loading && profile && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>MISPRICING SCORE</div>
                  <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: Number.isFinite(profile.mispricing.score) ? (profile.mispricing.score >= 65 ? C.green : profile.mispricing.score >= 45 ? C.amber : C.textDim) : C.textDim }}>
                    {Number.isFinite(profile.mispricing.score) ? `${profile.mispricing.score}/100` : "—"}
                  </div>
                </div>
                {when && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>VERDICT</div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C[whenColorKey] || C.textDim }}>{when.icon} {when.label}</div>
                  </div>
                )}
                {profile.divergence.detected && (
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.gold, background: `${C.gold}18`, borderRadius: 6, padding: "6px 12px" }}>
                    🚨 FUNDAMENTAL DIVERGENCE
                  </div>
                )}
                {profile.valueTrapRisk?.atRisk && (
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.red, background: `${C.red}18`, borderRadius: 6, padding: "6px 12px" }}>
                    ⚠️ VALUE TRAP RISK
                  </div>
                )}
              </div>

              {profile.valueTrapRisk?.atRisk && (
                <div style={{ fontFamily: SANS, fontSize: 15, color: C.red, lineHeight: 1.5 }}>{profile.valueTrapRisk.reason}</div>
              )}

              <FiveQuestionRow label="WHY UNDERVALUED?" text={profile.why} C={C} MONO={MONO} SANS={SANS} />
              <FiveQuestionRow label="WHY IS THE MARKET WRONG?" text={`Market thinks: ${profile.whyMarketWrong.marketThinks} Our evidence: ${profile.whyMarketWrong.evidence}`} C={C} MONO={MONO} SANS={SANS} />
              <FiveQuestionRow label="WHAT CHANGES THE STORY?" text={profile.whatChanges.catalyst} sub={Number.isFinite(profile.whatChanges.catalystQuality) ? `Catalyst quality: ${profile.whatChanges.catalystQuality}/100` : null} C={C} MONO={MONO} SANS={SANS} />
              <FiveQuestionRow label="WHAT INVALIDATES THE THESIS?" list={profile.whatInvalidates} C={C} MONO={MONO} SANS={SANS} />

              {profile.divergence.evidence?.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>REAL QUARTERLY EVIDENCE</div>
                  {profile.divergence.evidence.map((e, i) => (
                    <div key={i} style={{ fontFamily: SANS, fontSize: 14, color: C.textSec, marginBottom: 3 }}>{e}</div>
                  ))}
                </div>
              )}

              {profile.mispricing.unavailable?.length > 0 && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>
                  Not included (no real data source): {profile.mispricing.unavailable.join(", ")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FiveQuestionRow({ label, text, sub, list, C, MONO, SANS }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
      {text && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.5 }}>{text}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, marginTop: 2 }}>{sub}</div>}
      {list && list.map((item, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.5 }}>• {item}</div>)}
    </div>
  );
}
