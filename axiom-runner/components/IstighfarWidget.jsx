import { useState, useEffect, useRef } from "react";
import { MONO } from "./theme.js";

// Permanent spiritual-reminder bar, pinned above the main Top Bar so it is
// never hidden by tab/layout changes. Renders first, before every other
// dashboard component (see its call site in axiom-live.jsx).
const AR_PRIMARY = "أستغفر الله العظيم الذي لا إله إلا هو الحي القيوم وأتوب إليه";
const EN_SECONDARY = "Seek forgiveness often.";
const GOLD = "#D4AF37";
export const ISTIGHFAR_BAR_H = 40; // shared with the Top Bar's own sticky offset

const todayStr = () => new Date().toISOString().slice(0, 10);

// Compact "next prayer" readout for the left edge of this bar — a small,
// read-only subset of MonitorAthan.jsx's GPS+timings fetch (same
// api.aladhan.com source), deliberately NOT importing MonitorAthan itself:
// that component owns auto-athan playback + user sound/auto settings, and
// this bar is mounted globally on every page, so reusing it here would run
// a second copy of that playback logic everywhere instead of only where
// the user actually opened the full Prayer Times panel (Dashboard → More).
function CompactPrayerNext({ dim }) {
  const [times, setTimes] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let done = false;
    const loadByCoords = (lat, lng) => {
      fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=2`)
        .then(r => r.json()).then(d => { if (d.data) setTimes(d.data.timings); }).catch(() => {});
    };
    const fallback = () => { if (!done) { done = true; loadByCoords(21.4225, 39.8262); } }; // Makkah
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { done = true; loadByCoords(pos.coords.latitude, pos.coords.longitude); },
        fallback, { timeout: 8000, maximumAge: 3600000 }
      );
      setTimeout(fallback, 9000);
    } else fallback();
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  if (!times) return null;
  const PRAYER_AR = { Fajr: "الفجر", Sunrise: "الشروق", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };
  const mins = h => { const [hh, mm] = (times[h] || "0:0").split(":").map(Number); return hh * 60 + mm; };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const order = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  let nextPrayer = null, countdown = "";
  for (const p of order) { if (mins(p) > nowMin) { nextPrayer = p; const diff = mins(p) - nowMin; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`; break; } }
  if (!nextPrayer) { nextPrayer = "Fajr"; countdown = "tomorrow"; }

  return (
    <span title="Next prayer" style={{ fontFamily: MONO, fontSize: 11, color: dim, whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
      🕌 <span dir="rtl" style={{ color: "#14b8a6", fontWeight: 700 }}>{PRAYER_AR[nextPrayer]}</span> {countdown}
    </span>
  );
}

export default function IstighfarWidget({ C, themeMode, isMobile }) {
  const [todayCount, setTodayCount] = useState(() => {
    try {
      if (localStorage.getItem("istighfar_date") !== todayStr()) return 0;
      return Number(localStorage.getItem("istighfar_today") || 0);
    } catch { return 0; }
  });
  const [lifetimeCount, setLifetimeCount] = useState(() => {
    try { return Number(localStorage.getItem("istighfar_lifetime") || 0); } catch { return 0; }
  });
  const [settings, setSettings] = useState(() => {
    try { return { sound: false, compact: true, autoHide: false, ...JSON.parse(localStorage.getItem("istighfar_settings") || "{}") }; }
    catch { return { sound: false, compact: true, autoHide: false }; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [glow, setGlow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const idleTimer = useRef(null);

  // Roll the daily counter over at midnight even if the app stays open across it.
  useEffect(() => {
    const check = () => {
      if (localStorage.getItem("istighfar_date") !== todayStr()) {
        setTodayCount(0);
        localStorage.setItem("istighfar_today", "0");
        localStorage.setItem("istighfar_date", todayStr());
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);

  // Gentle glow reminder every 5 minutes — box-shadow only, never a popup.
  useEffect(() => {
    const t = setInterval(() => { setGlow(true); setTimeout(() => setGlow(false), 2400); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const arm = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setCollapsed(false);
    if (settings.autoHide) idleTimer.current = setTimeout(() => setCollapsed(true), 8000);
  };
  useEffect(() => { arm(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [settings.autoHide]); // eslint-disable-line

  const bump = () => {
    localStorage.setItem("istighfar_date", todayStr());
    const nt = todayCount + 1, nl = lifetimeCount + 1;
    setTodayCount(nt); setLifetimeCount(nl);
    localStorage.setItem("istighfar_today", String(nt));
    localStorage.setItem("istighfar_lifetime", String(nl));
    setPulse(true); setTimeout(() => setPulse(false), 220);
    if (settings.sound) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 660;
        g.gain.setValueAtTime(0.06, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.18);
      } catch {}
    }
    arm();
  };

  const saveSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem("istighfar_settings", JSON.stringify(next));
  };

  const bg = themeMode === "dark" ? "#0d1422" : C.surface;
  const dim = themeMode === "dark" ? "#9aa7bd" : C.textDim;

  // Fixed (not sticky) so this stays pinned to the true viewport top even in
  // layout contexts where CSS `zoom` on an ancestor defeats `position: sticky`
  // (the app's outer wrapper applies a zoom factor for its UI-scale setting).
  // A same-height spacer is rendered right after this at the call site so
  // fixed positioning never covers the content underneath it.
  if (collapsed) {
    return (
      <div onMouseEnter={() => setCollapsed(false)}
        style={{ position: "fixed", top: 0, left: 0, right: 0, width: "100%", zIndex: 250, height: ISTIGHFAR_BAR_H, display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "0 10px", pointerEvents: "none" }}>
        <button onClick={() => setCollapsed(false)} title="أستغفر الله العظيم"
          style={{ pointerEvents: "auto", width: 28, height: 28, borderRadius: "50%", border: `1px solid ${GOLD}88`, background: bg, color: GOLD, fontSize: 14, cursor: "pointer", boxShadow: glow ? `0 0 14px ${GOLD}aa` : `0 0 6px ${GOLD}44`, transition: "box-shadow 1.2s ease" }}>
          ☪
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, width: "100%", zIndex: 250, height: ISTIGHFAR_BAR_H,
        display: "flex", alignItems: "center", gap: isMobile ? 6 : 10,
        padding: isMobile ? "0 8px" : "0 14px", background: bg,
        borderBottom: `1px solid ${GOLD}55`,
        boxShadow: glow ? `0 0 18px ${GOLD}55` : "0 1px 6px rgba(0,0,0,0.35)",
        transition: "box-shadow 1.2s ease", overflow: "hidden",
      }}
    >
      {!isMobile && <CompactPrayerNext dim={dim} />}
      <span style={{ fontSize: 14, color: GOLD, flexShrink: 0 }}>☪</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden" }} dir="rtl">
        <span title={AR_PRIMARY}
          style={{ fontFamily: "Georgia, 'Traditional Arabic', serif", fontSize: isMobile ? 11.5 : (settings.compact ? 13 : 15), fontWeight: 700, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {AR_PRIMARY}
        </span>
        {!settings.compact && !isMobile && (
          <span dir="ltr" style={{ fontFamily: MONO, fontSize: 11, color: dim, whiteSpace: "nowrap", flexShrink: 0 }}>
            {EN_SECONDARY}
          </span>
        )}
      </div>
      <div dir="ltr" style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 11, color: dim }}>
          <span>{isMobile ? "" : "Today "}<b style={{ color: GOLD }}>{todayCount}</b></span>
          {!settings.compact && !isMobile && <span>Lifetime <b style={{ color: GOLD }}>{lifetimeCount}</b></span>}
        </div>
        <button onClick={bump} title="أستغفر الله — tap to count"
          style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${GOLD}`, background: pulse ? GOLD : `${GOLD}22`, color: pulse ? "#0d1422" : GOLD, fontWeight: 900, fontSize: 13, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
          +
        </button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setSettingsOpen(v => !v)} title="Settings"
            style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: dim, fontSize: 10, cursor: "pointer" }}>
            ⚙
          </button>
          {settingsOpen && (
            <div onMouseLeave={() => setSettingsOpen(false)}
              style={{ position: "absolute", top: 26, right: 0, width: 190, background: bg, border: `1px solid ${GOLD}44`, borderRadius: 8, padding: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.5)", zIndex: 260 }}>
              {[["compact", "Compact mode"], ["sound", "Click sound"], ["autoHide", "Auto-hide"]].map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", fontFamily: MONO, fontSize: 11, color: C.text, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!settings[key]} onChange={(e) => saveSettings({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
