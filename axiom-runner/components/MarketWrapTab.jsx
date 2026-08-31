// MarketWrapTab.jsx — daily 4:30 PM ET Market Wrap (explicit user
// request, 2026-08-31: "i also want to do research about stock markets
// update daily at 4:30 pm i want deep scan deep analysis what stocks
// moving up or down what big news what big events how healthy is spy
// and qqq and other ETF and also sectors what next move"). Same real
// live-feed shape as ResearchTab.jsx's LiveIntel section: GET/POST
// /api/market-wrap[/refresh], auto-generated daily (server.js ~4:33 PM
// ET), manual Refresh button here for on-demand runs. Every number shown
// (movers' price/%, sector %/status, SPY/QQQ health) is real, straight
// from src/market-wrap-ai.js's already-sanitized, real-grounded output —
// this component only renders it.
//
// SeasonalityChart (below LiveWrap) is a second, independent real-data
// section — see its own header comment further down for the full story.

import { useState, useEffect, useCallback } from "react";

function Section({ C, MONO, SANS, title, subtitle, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, margin: "0 0 4px", color: C.text }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>{subtitle}</div>}
      {!subtitle && <div style={{ marginBottom: 4 }} />}
      {children}
    </section>
  );
}

function StatTile({ C, MONO, label, value, detail, tone }) {
  const color = tone === "bad" ? C.red : tone === "warn" ? C.amber : tone === "good" ? C.green : C.text;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {detail && <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3 }}>{detail}</div>}
    </div>
  );
}

const HEALTH_TONE = { STRONG: "good", HEALTHY: "good", NEUTRAL: null, WEAK: "warn", AT_RISK: "bad" };
function HealthTile({ C, MONO, label, health }) {
  const tone = HEALTH_TONE[health?.verdict] ?? null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: tone === "bad" ? C.red : tone === "warn" ? C.amber : tone === "good" ? C.green : C.text }}>
        {health?.verdict || "—"}
      </div>
      {health?.reason && <div style={{ fontSize: 11.5, color: C.textSec, marginTop: 5, lineHeight: 1.5 }}>{health.reason}</div>}
    </div>
  );
}

function MoverRow({ C, MONO, SANS, m, positive }) {
  const color = positive ? C.green : C.red;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{m.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color }}>
          {m.changePct != null ? `${m.changePct >= 0 ? "+" : ""}${m.changePct}%` : "—"}
          {m.price != null && <span style={{ color: C.textDim, fontWeight: 400, marginLeft: 6 }}>${m.price}</span>}
        </span>
      </div>
      {m.reason && <div style={{ fontSize: 11.5, color: C.textSec, marginTop: 4, lineHeight: 1.5 }}>{m.reason}</div>}
    </div>
  );
}

const IMPACT_STYLE = (C) => ({ HIGH: C.red, MEDIUM: C.amber, LOW: C.textDim });
function NewsRow({ C, MONO, SANS, n }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{n.headline}</div>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: IMPACT_STYLE(C)[n.impact] || C.textDim, whiteSpace: "nowrap" }}>{n.impact}</span>
      </div>
      {n.summary && <div style={{ fontSize: 11.5, color: C.textSec, marginTop: 4, lineHeight: 1.5 }}>{n.summary}</div>}
    </div>
  );
}

function SectorRow({ C, MONO, s }) {
  const color = (s.changePct ?? 0) >= 0 ? C.green : C.red;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${C.border}`, gap: 12 }}>
      <div style={{ minWidth: 90 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{s.sector}</span>
        {s.name && <span style={{ fontSize: 10.5, color: C.textDim, marginLeft: 6 }}>{s.name}</span>}
      </div>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color, minWidth: 55, textAlign: "right" }}>
        {s.changePct != null ? `${s.changePct >= 0 ? "+" : ""}${s.changePct}%` : "—"}
      </span>
      <span style={{ fontSize: 11.5, color: C.textSec, flex: 1, lineHeight: 1.5 }}>{s.note}</span>
    </div>
  );
}

function LiveWrap({ C, MONO, SANS }) {
  const [wrap, setWrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/market-wrap").then((r) => r.json())
      .then((d) => { if (d.ok) setWrap(d.wrap); else setError(d.error || "Failed to load market wrap."); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = () => {
    setRefreshing(true); setError(null);
    fetch("/api/market-wrap/refresh", { method: "POST" }).then((r) => r.json())
      .then((d) => { if (d.ok) setWrap(d.wrap); else setError(d.error || "Refresh failed."); })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, fontWeight: 700, marginBottom: 6 }}>Daily · 4:30 PM ET Close Recap</div>
          <h2 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, margin: 0, color: C.text }}>What moved today, and why</h2>
        </div>
        <button onClick={refresh} disabled={refreshing} style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${C.accent}`, background: refreshing ? C.card : C.accent, color: refreshing ? C.accent : "#fff",
          cursor: refreshing ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{refreshing ? "Scanning…" : "↻ Refresh Market Wrap"}</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: C.textDim }}>Loading market wrap…</div>}
      {!loading && error && <div style={{ fontSize: 13, color: C.red, background: C.redBg, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!loading && !error && !wrap && (
        <div style={{ fontSize: 13, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          No market wrap generated yet. This runs automatically once a day (4:33 PM ET, after close), or click "Refresh Market Wrap" to generate one now.
          {" "}Requires <code>ANTHROPIC_API_KEY</code> to be configured.
        </div>
      )}

      {!loading && wrap && (
        <>
          {wrap.marketPulse && (
            <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.accent }}>Today's session:</b> {wrap.marketPulse}
            </div>
          )}

          <Section C={C} MONO={MONO} SANS={SANS} title="Index &amp; Regime Health">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <HealthTile C={C} MONO={MONO} label="SPY" health={wrap.spyHealth} />
              <HealthTile C={C} MONO={MONO} label="QQQ" health={wrap.qqqHealth} />
              {wrap.regime && (
                <StatTile C={C} MONO={MONO} label="Market Regime" value={wrap.regime.label || "—"} detail={wrap.regime.tradingEnvironment ? `Environment: ${wrap.regime.tradingEnvironment}` : null} />
              )}
            </div>
          </Section>

          {(wrap.topGainers?.length > 0 || wrap.topLosers?.length > 0) && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Real Movers Today" subtitle="Real prices/% from this platform's own scan universe — reasons are real search-grounded color, not the source of the number.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: 0.5, marginBottom: 8 }}>TOP GAINERS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(wrap.topGainers || []).map((m, i) => <MoverRow key={i} C={C} MONO={MONO} SANS={SANS} m={m} positive />)}
                    {!wrap.topGainers?.length && <div style={{ fontSize: 12, color: C.textDim }}>No real gainer data this run.</div>}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, letterSpacing: 0.5, marginBottom: 8 }}>TOP LOSERS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(wrap.topLosers || []).map((m, i) => <MoverRow key={i} C={C} MONO={MONO} SANS={SANS} m={m} />)}
                    {!wrap.topLosers?.length && <div style={{ fontSize: 12, color: C.textDim }}>No real loser data this run.</div>}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {wrap.sectorHealth?.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Sector Health">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "4px 14px" }}>
                {wrap.sectorHealth.map((s, i) => <SectorRow key={i} C={C} MONO={MONO} s={s} />)}
              </div>
            </Section>
          )}

          {wrap.bigNews?.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Big News &amp; Events Today">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
                {wrap.bigNews.map((n, i) => <NewsRow key={i} C={C} MONO={MONO} SANS={SANS} n={n} />)}
              </div>
            </Section>
          )}

          {wrap.outlook?.note && (
            <Section C={C} MONO={MONO} SANS={SANS} title="What's the Next Move?" subtitle="A real, honest read grounded in today's data — not a guaranteed prediction.">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: wrap.outlook.watchFor?.length ? 10 : 0 }}>{wrap.outlook.note}</div>
                {wrap.outlook.watchFor?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {wrap.outlook.watchFor.map((w, i) => <li key={i} style={{ fontSize: 12, color: C.textSec, marginBottom: 4 }}>{w}</li>)}
                  </ul>
                )}
              </div>
            </Section>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 4 }}>
            {wrap.generatedAt ? `Generated ${new Date(wrap.generatedAt).toLocaleString()}` : ""}
          </div>
        </>
      )}
    </section>
  );
}

// SPY Seasonality (2026-08-31, explicit user request — shared two
// NDR-style S&P 500 Cycle Composite reference charts: "ADD HISTORICAL
// CHART IN MARKET WRAP EXPECTATION PREDICTION SPY HISTORY IN THE CURRENT
// MONT WHAT MIGHT HAPPEND FOR EXAMPLE IN SEP MARKET SELL OFF IN SEPT IN
// ELECTION YEAR"). Deliberately NOT a fabricated composite curve like the
// reference — GET /api/market/seasonality returns a real, directly-
// computed read (src/spy-seasonality-engine.js) of what SPY actually
// returned in each real year on file for the current month, bucketed by
// the real 4-year US presidential cycle. This component only renders
// what that real endpoint returns; no AI involved anywhere in this chart.
const CYCLE_LABEL = {
  PRESIDENTIAL: "Presidential Election Year", POST_ELECTION: "Post-Election Year",
  MIDTERM: "Midterm Election Year", PRE_ELECTION: "Pre-Election Year",
};
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function SeasonalityBar({ C, MONO, y, maxAbs, halfH, highlight }) {
  const color = y.returnPct >= 0 ? C.green : C.red;
  const barH = maxAbs > 0 ? Math.max(2, (Math.abs(y.returnPct) / maxAbs) * halfH) : 2;
  const barStyle = { width: 18, background: color, opacity: highlight ? 1 : 0.55, boxShadow: highlight ? `0 0 0 2px ${color}` : "none" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 30 }}>
      <div style={{ height: halfH, display: "flex", alignItems: "flex-end", justifyContent: "center", width: "100%" }}>
        {y.returnPct >= 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color, fontWeight: 700, marginBottom: 2 }}>+{y.returnPct}%</div>
            <div style={{ ...barStyle, height: barH, borderRadius: "3px 3px 0 0" }} />
          </div>
        )}
      </div>
      <div style={{ width: "100%", height: 1, background: C.border, flexShrink: 0 }} />
      <div style={{ height: halfH, display: "flex", alignItems: "flex-start", justifyContent: "center", width: "100%" }}>
        {y.returnPct < 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...barStyle, height: barH, borderRadius: "0 0 3px 3px" }} />
            <div style={{ fontFamily: MONO, fontSize: 9, color, fontWeight: 700, marginTop: 2 }}>{y.returnPct}%</div>
          </div>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: highlight ? C.text : C.textDim, fontWeight: highlight ? 800 : 500, marginTop: 4 }}>{y.year}</div>
    </div>
  );
}

function SeasonalityChart({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market/seasonality?symbol=SPY").then((r) => r.json())
      .then((d) => { if (d.ok) setData(d); else setError(d.error || "Failed to load seasonality."); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const maxAbs = data?.years?.length ? Math.max(1, ...data.years.map((y) => Math.abs(y.returnPct))) : 1;
  const halfH = 70;
  const currentTypeStats = data ? data.stats.byCycleType[data.currentYearCycleType] : null;
  const cycleLabel = data ? CYCLE_LABEL[data.currentYearCycleType] : "";

  return (
    <Section C={C} MONO={MONO} SANS={SANS} title="SPY Seasonality"
      subtitle={data ? `Real historical ${MONTH_NAMES[data.month]} returns, ${data.years[0]?.year || ""}–${data.years[data.years.length - 1]?.year || ""} — not a guaranteed prediction, a real read of what actually happened in years on file.` : undefined}>
      {loading && <div style={{ fontSize: 13, color: C.textDim }}>Loading real historical seasonality…</div>}
      {!loading && error && <div style={{ fontSize: 13, color: C.red, background: C.redBg, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!loading && data && data.years.length === 0 && (
        <div style={{ fontSize: 13, color: C.textDim }}>No real historical data available for this month yet.</div>
      )}
      {!loading && data && data.years.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            <StatTile C={C} MONO={MONO} label={`Avg ${MONTH_NAMES[data.month]} return (${data.stats.count}yr)`}
              value={data.stats.avg != null ? `${data.stats.avg >= 0 ? "+" : ""}${data.stats.avg}%` : "—"}
              tone={data.stats.avg == null ? null : data.stats.avg >= 0 ? "good" : "bad"} />
            <StatTile C={C} MONO={MONO} label="Win rate" value={data.stats.winRate != null ? `${data.stats.winRate}%` : "—"} />
            <StatTile C={C} MONO={MONO} label={`${data.currentYear} is a ${cycleLabel}`}
              value={currentTypeStats?.avg != null ? `${currentTypeStats.avg >= 0 ? "+" : ""}${currentTypeStats.avg}% avg` : "n/a"}
              detail={currentTypeStats?.count ? `${currentTypeStats.count} real prior ${cycleLabel.toLowerCase()}${currentTypeStats.count === 1 ? "" : "s"} on file` : "no real prior years of this type on file"}
              tone={currentTypeStats?.avg == null ? null : currentTypeStats.avg >= 0 ? "good" : "bad"} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 14px 10px", overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, minWidth: data.years.length * 40 }}>
              {data.years.map((y) => (
                <SeasonalityBar key={y.year} C={C} MONO={MONO} y={y} maxAbs={maxAbs} halfH={halfH} highlight={y.cycleType === data.currentYearCycleType} />
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 10, textAlign: "center" }}>
              Highlighted bars = real {cycleLabel.toLowerCase()}s — same real cycle position as {data.currentYear}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

export default function MarketWrapTab({ C, MONO, SANS }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <LiveWrap C={C} MONO={MONO} SANS={SANS} />
      <SeasonalityChart C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}
