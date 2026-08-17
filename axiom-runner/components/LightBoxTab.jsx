import { useEffect, useRef, useState } from "react";
import LightBoxCard from "./LightBoxCard.jsx";
import { LIGHTBOX_DEFAULTS, STATE_COLOR_KEY } from "./lightbox-config.js";
import { riskBuzz } from "./monitor-shared.js";

const STATE_PRIORITY = { BUY: 0, WAIT: 1, SELL: 2 };
const STATE_TO_SIGNAL = { BUY: "GREEN", WAIT: "YELLOW", SELL: "RED" };
const SECONDARY_SORTS = [
  { id: "score", label: "A+ Score" },
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
export default function LightBoxTab({ C, MONO, SANS, lightboxSettings, setLightboxSettings }) {
  const [bySymbol, setBySymbol] = useState({});
  const [transitions, setTransitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmBarsInput, setConfirmBarsInput] = useState(String(lightboxSettings.confirmBars || 3));
  const lastSeenTsRef = useRef(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (lightboxSettings.universe === "full") params.set("universe", "full");
        params.set("confirmBars", String(lightboxSettings.confirmBars || 3));
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
        setLoading(false);
      } catch {}
    };
    poll();
    const t = setInterval(poll, LIGHTBOX_DEFAULTS.pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [lightboxSettings.universe, lightboxSettings.confirmBars]);

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
    const n = Math.max(1, Math.min(10, Math.round(Number(confirmBarsInput)) || 3));
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

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
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
              {rows.map((r) => <LightBoxCard key={r.symbol} C={C} MONO={MONO} SANS={SANS} data={r} showSecondary={!!lightboxSettings.showDetails} />)}
            </div>
          )}
        </div>

        {/* State-change log */}
        <div style={{ width: 260, flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, maxHeight: 560, overflowY: "auto" }}>
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
