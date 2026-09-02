import { useEffect, useRef, useState } from "react";
import LightBoxCard from "./LightBoxCard.jsx";
import PremarketPanel from "./PremarketPanel.jsx";
import AutopilotPanel from "./AutopilotPanel.jsx";
import { LIGHTBOX_DEFAULTS, STATE_COLOR_KEY } from "./lightbox-config.js";
import { riskBuzz } from "./monitor-shared.js";

const STATE_PRIORITY = { BUY: 0, WAIT: 1, SELL: 2 };
const STATE_TO_SIGNAL = { BUY: "GREEN", WAIT: "YELLOW", SELL: "RED" };
// Real 8-stage Horse Hunter lifecycle icons (src/horse-stage.js), matched
// order/vocabulary — no separate/renamed labels invented here.
const STAGE_ICON = {
  UNKNOWN: "⚪", INTERESTING: "🔵", EMERGING: "🟢", INFLECTION: "🟡",
  EARLY_LEADER: "🟠", INSTITUTIONAL_RECOGNITION: "🟣", MARKET_LEADER: "🏆", MATURE: "⚫",
};
// Real one-click Horse filters (Horse Hunter upgrade B4, 2026-08-26) —
// "Do not make me construct complicated filters manually." Only real,
// already-fetched fields: the actual 8-stage lifecycle + the real
// Best-of-Both-Worlds crossover flag. No fabricated "ACCELERATING" filter
// here — that needs a real journal-delta field this endpoint doesn't
// return yet, so it's honestly left out rather than faked.
const HORSE_FILTERS = [
  { id: "ALL", label: "ALL" },
  { id: "EMERGING", label: "EMERGING" },
  { id: "INFLECTION", label: "INFLECTION" },
  { id: "EARLY_LEADER", label: "EARLY LEADER" },
  { id: "BEST_OF_BOTH", label: "⭐ BEST OF BOTH" },
  { id: "UNDER_20", label: "UNDER $20" },
];
const SECONDARY_SORTS = [
  { id: "score", label: "A+ Score" },
  { id: "attention", label: "Attention Score" },
  { id: "volume", label: "Volume (RVOL)" },
  { id: "move", label: "% Move" },
  { id: "alpha", label: "Alphabetical" },
];

// Shallow field compare — deciding whether to keep the previous row's
// object reference is what actually makes LightBoxCard's React.memo cheap;
// without this, a naive "always build a fresh row object" merge would
// re-render every card on every poll regardless of memoization.
function rowChanged(a, b) {
  if (!a) return true;
  return a.state !== b.state || a.price !== b.price || a.chg !== b.chg || a.quality !== b.quality
    || a.vwap !== b.vwap || a.rvol !== b.rvol || a.stop !== b.stop || a.target !== b.target
    || a.bestEntry !== b.bestEntry || a.updatedAt !== b.updatedAt;
}

function sortRows(rows, secondarySort) {
  return [...rows].sort((a, b) => {
    const p = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
    if (p !== 0) return p;
    if (secondarySort === "attention") return (b.attentionScore || 0) - (a.attentionScore || 0);
    if (secondarySort === "volume") return (b.rvol || 0) - (a.rvol || 0);
    if (secondarySort === "move") return Math.abs(b.chg || 0) - Math.abs(a.chg || 0);
    if (secondarySort === "alpha") return a.symbol.localeCompare(b.symbol);
    return (b.quality || 0) - (a.quality || 0); // "score" (default)
  });
}

// ── Live Trade Light Box (2026-08-16, explicit user request) ────────────
// Self-fetching tab (own polling loop, independent of the app's central
// fetchAll cycle), same precedent as RhProScanner.jsx. Reuses the real
// day-trade signal engine end to end via /api/market/lightbox — this
// component does zero signal math of its own, it only renders what the
// server already confirmed. See src/lightbox-engine.js/lightbox-state-
// store.js for why confirmation has to live server-side.
export default function LightBoxTab({ C, MONO, SANS, lightboxSettings, setLightboxSettings, onOpenSymbol, onOpenHorse }) {
  const [bySymbol, setBySymbol] = useState({});
  const [transitions, setTransitions] = useState([]);
  const [topOpportunities, setTopOpportunities] = useState([]);
  const [horses, setHorses] = useState([]);
  const [horseFilter, setHorseFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [confirmBarsInput, setConfirmBarsInput] = useState(String(lightboxSettings.confirmBars || 2));
  const lastSeenTsRef = useRef(null);
  const firstLoadRef = useRef(true);
  // Real mobile fix (2026-08-25, explicit user request: "fix light box its
  // mess" — a live phone screenshot showed the State Changes log visually
  // overlapping the signal-card grid). Root cause: the grid+log row below
  // was a fixed flex ROW (grid flex:1, log width:260, no wrap) — on a
  // ~390px phone, 260px for the log alone leaves the grid almost nothing,
  // so the two panels compressed into each other instead of the desktop
  // side-by-side layout they were actually designed for. No isMobile prop
  // exists on this component (it's mounted both standalone and, as of
  // 2026-08-25, inside Trade Desk's dock) — same local resize-listener
  // pattern already used elsewhere in this app rather than threading a
  // new prop through both call sites.
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 820);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 820);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (lightboxSettings.universe === "full") params.set("universe", "full");
        params.set("confirmBars", String(lightboxSettings.confirmBars || 2));
        const r = await fetch(`/api/market/lightbox?${params.toString()}`);
        const j = await r.json();
        if (!alive || !j.ok) return;
        setBySymbol((prev) => {
          const next = {};
          for (const row of j.rows) {
            const prevRow = prev[row.symbol];
            next[row.symbol] = rowChanged(prevRow, row) ? row : prevRow;
          }
          return next;
        });
        setTransitions(j.transitions || []);
        setTopOpportunities(j.topOpportunities || []);
        setLoading(false);
      } catch {}
    };
    poll();
    const t = setInterval(poll, LIGHTBOX_DEFAULTS.pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [lightboxSettings.universe, lightboxSettings.confirmBars]);

  // Horse Hunter upgrade (2026-08-26) — real Horse scores refresh at most
  // once/real-trading-day server-side (Future Wallet's daily job), so this
  // polls far slower than the 15m day-trade grid above; still a real
  // independent poll rather than a one-time fetch, so a Horse Journal
  // transition/alert that lands mid-session shows up without a manual
  // page reload.
  useEffect(() => {
    let alive = true;
    const pollHorses = async () => {
      try {
        const r = await fetch("/api/future-wallet/horses?limit=20&withDecision=1");
        const j = await r.json();
        if (!alive || !j.ok) return;
        setHorses(j.rows || []);
      } catch {}
    };
    pollHorses();
    const t = setInterval(pollHorses, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Sound/notification on genuinely new transitions only — never on the
  // batch of pre-existing history the log already had when the tab mounted.
  useEffect(() => {
    if (!transitions.length) return;
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      lastSeenTsRef.current = transitions[0].ts;
      return;
    }
    const fresh = lastSeenTsRef.current ? transitions.filter((t) => t.ts > lastSeenTsRef.current) : [];
    lastSeenTsRef.current = transitions[0].ts;
    if (!fresh.length) return;
    fresh.forEach((t) => {
      if (lightboxSettings.soundOn) { try { riskBuzz(STATE_TO_SIGNAL[t.to] || "YELLOW"); } catch {} }
      if (lightboxSettings.notifyOn && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(`🚦 ${t.symbol}: ${t.from} → ${t.to}`, { body: `A+ Score ${t.quality}/100` }); } catch {}
      }
    });
  }, [transitions]); // eslint-disable-line

  const toggleNotify = () => {
    if (lightboxSettings.notifyOn) { setLightboxSettings((s) => ({ ...s, notifyOn: false })); return; }
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") { setLightboxSettings((s) => ({ ...s, notifyOn: true })); return; }
    Notification.requestPermission().then((p) => { if (p === "granted") setLightboxSettings((s) => ({ ...s, notifyOn: true })); });
  };

  const commitConfirmBars = () => {
    const n = Math.max(1, Math.min(10, Math.round(Number(confirmBarsInput)) || 2));
    setConfirmBarsInput(String(n));
    setLightboxSettings((s) => ({ ...s, confirmBars: n }));
  };

  const rows = sortRows(Object.values(bySymbol), lightboxSettings.secondarySort || "score");
  const counts = rows.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {});

  const btn = (active) => ({
    fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${active ? C.accent : C.border}`, background: active ? `${C.accent}18` : C.card,
    color: active ? C.accent : C.textSec,
  });

  return (
    <div style={{ padding: "8px 4px" }}>
      <style>{`
        @keyframes lightboxPulse { 0% { filter: brightness(1); } 30% { filter: brightness(1.4); } 100% { filter: brightness(1); } }
      `}</style>

      {/* Header — state legend + controls. "Look at the screen for one
          second" is the whole point, so the legend stays a plain, always-
          visible key rather than a tooltip. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🚦 Light Box</div>
          <div style={{ display: "flex", gap: 10, fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
            <span style={{ color: C.green }}>● BUY {counts.BUY || 0}</span>
            <span style={{ color: C.amber }}>● WAIT {counts.WAIT || 0}</span>
            <span style={{ color: C.red }}>● SELL {counts.SELL || 0}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(lightboxSettings.universe !== "full")} onClick={() => setLightboxSettings((s) => ({ ...s, universe: "watchlist" }))}>Watchlist</button>
          <button style={btn(lightboxSettings.universe === "full")} onClick={() => setLightboxSettings((s) => ({ ...s, universe: "full" }))}>Full Scan</button>
          <select value={lightboxSettings.secondarySort || "score"} onChange={(e) => setLightboxSettings((s) => ({ ...s, secondarySort: e.target.value }))}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
            {SECONDARY_SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
          </select>
          <button style={btn(lightboxSettings.showDetails)} onClick={() => setLightboxSettings((s) => ({ ...s, showDetails: !s.showDetails }))}>Details</button>
          <button style={btn(lightboxSettings.soundOn)} onClick={() => setLightboxSettings((s) => ({ ...s, soundOn: !s.soundOn }))}>{lightboxSettings.soundOn ? "🔊" : "🔇"} Sound</button>
          <button style={btn(lightboxSettings.notifyOn)} onClick={toggleNotify}>{lightboxSettings.notifyOn ? "🔔" : "🔕"} Notify</button>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
            Confirm
            <input type="number" min={1} max={10} value={confirmBarsInput}
              onChange={(e) => setConfirmBarsInput(e.target.value)}
              onBlur={commitConfirmBars}
              onKeyDown={(e) => { if (e.key === "Enter") commitConfirmBars(); }}
              style={{ width: 40, fontFamily: MONO, fontSize: 11, padding: "5px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, textAlign: "center" }} />
            ticks
          </div>
        </div>
      </div>

      {/* TOP OPPORTUNITIES NOW (Market Opportunity Intelligence Engine
          upgrade, 2026-08-26, spec's explicit "WHAT DESERVES MY ATTENTION
          RIGHT NOW?" ask) — real, disclosed attentionScore ranking
          straight off the same /api/market/lightbox response the grid
          below reads, never a second ranking pass. Honestly absent (not
          padded) when nothing real currently qualifies (every row is
          INVALIDATED or attentionScore itself isn't available yet). */}
      {topOpportunities.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", background: `${C.accent}0c`, border: `1px solid ${C.accent}33`, borderRadius: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, alignSelf: "center" }}>🔥 TOP NOW</span>
          {topOpportunities.map((sym, i) => {
            const row = bySymbol[sym];
            if (!row) return null;
            return (
              <button key={sym} onClick={() => onOpenSymbol && onOpenSymbol(row)}
                title={row.signalReason || row.reason || ""}
                style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 999, cursor: onOpenSymbol ? "pointer" : "default",
                  border: `1px solid ${C[STATE_COLOR_KEY[row.state]] || C.border}`, background: C.card, color: C.text,
                }}>
                {i + 1}. {sym} {Number.isFinite(row.attentionScore) ? `(${row.attentionScore})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* 🐎 TOP HORSES + ⭐ BEST OF BOTH WORLDS (Horse Hunter upgrade,
          2026-08-26) — real long-term Horse Score ranking from Future
          Wallet 100's real CIO synthesis (src/future-wallet-synthesis.js),
          refreshed at most once/real-trading-day server-side
          (src/future-wallet-daily-job.js), never recomputed client-side.
          Honestly absent when nothing has been scored yet. Cards deep-link
          into the EXISTING Future Wallet tab (onOpenHorse), never a second
          long-term-analysis view built inside Light Box. */}
      {horses.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {HORSE_FILTERS.map((f) => (
              <button key={f.id} onClick={() => setHorseFilter(f.id)}
                style={{
                  fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 7, cursor: "pointer",
                  border: `1px solid ${horseFilter === f.id ? "#a855f7" : C.border}`,
                  background: horseFilter === f.id ? "#a855f718" : "transparent",
                  color: horseFilter === f.id ? "#a855f7" : C.textDim,
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: "#a855f70c", border: "1px solid #a855f733", borderRadius: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#a855f7", alignSelf: "center" }}>🐎 TOP HORSES</span>
            {(() => {
              const filtered = horses.filter((h) => horseFilter === "ALL" ? true
                : horseFilter === "BEST_OF_BOTH" ? h.bestOfBoth
                : horseFilter === "UNDER_20" ? (h.price != null && h.price <= 20)
                : h.stage === horseFilter);
              if (!filtered.length) return <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, alignSelf: "center" }}>No real Horses match this filter right now.</span>;
              return filtered.slice(0, 12).map((h) => (
                <button key={h.symbol} onClick={() => onOpenHorse && onOpenHorse(h.symbol)}
                  title={h.assetDecision?.reasons?.[0] || h.verdict || ""}
                  style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 999, cursor: onOpenHorse ? "pointer" : "default",
                    border: "1px solid #a855f755", background: C.card, color: C.text,
                  }}>
                  {STAGE_ICON[h.stage] || "⚪"} {h.symbol} ({h.horseScore}){h.currentEntryVerdict ? ` · ${h.currentEntryVerdict}` : ""}
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {horses.some((h) => h.bestOfBoth) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", background: "#f59e0b0c", border: "1px solid #f59e0b33", borderRadius: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#f59e0b", alignSelf: "center" }}>⭐ BEST OF BOTH WORLDS</span>
          {horses.filter((h) => h.bestOfBoth).map((h) => (
            <button key={h.symbol} onClick={() => onOpenHorse && onOpenHorse(h.symbol)}
              title="A real strong long-term Horse that's ALSO a real current Light Box opportunity"
              style={{
                fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 999, cursor: onOpenHorse ? "pointer" : "default",
                border: "1px solid #f59e0b55", background: C.card, color: C.text,
              }}>
              {h.symbol} (Horse {h.horseScore})
            </button>
          ))}
        </div>
      )}

      <AutopilotPanel C={C} MONO={MONO} SANS={SANS} />

      <PremarketPanel C={C} MONO={MONO} SANS={SANS} />

      <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14, alignItems: isNarrow ? "stretch" : "flex-start" }}>
        {/* Grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && !rows.length ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 20, textAlign: "center" }}>Loading…</div>
          ) : !rows.length ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 20, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              No signals yet. Day Trade Mode (VWAP / opening-range / RVOL / 9-21 EMA) is intraday-only — this fills in once the regular session is live, or add symbols to your Watchlist.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${lightboxSettings.showDetails ? 190 : 150}px,1fr))`, gap: 10 }}>
              {rows.map((r) => <LightBoxCard key={r.symbol} C={C} MONO={MONO} SANS={SANS} data={r} showSecondary={!!lightboxSettings.showDetails} onOpenSymbol={onOpenSymbol} />)}
            </div>
          )}
        </div>

        {/* State-change log */}
        <div style={{ width: isNarrow ? "100%" : 260, flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, maxHeight: 560, overflowY: "auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>State Changes</div>
          {!transitions.length ? (
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No transitions yet this session.</div>
          ) : transitions.map((t, i) => {
            const col = C[STATE_COLOR_KEY[t.to]] || C.textDim;
            const time = t.ts ? new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
            return (
              <div key={`${t.symbol}-${t.ts}-${i}`} style={{ padding: "6px 0", borderBottom: i < transitions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{time}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{t.symbol} <span style={{ color: C.textDim, fontWeight: 500 }}>{t.from} →</span> <span style={{ color: col }}>{t.to}</span></div>
                {t.quality != null && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>A+ Score: {t.quality}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
