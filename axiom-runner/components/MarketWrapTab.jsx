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

export default function MarketWrapTab({ C, MONO, SANS }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <LiveWrap C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}
