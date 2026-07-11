// ─── Prayer times widget (Monitor) — GPS auto times + Makkah/Medinah athan ───
const ATHAN_SOUNDS = {
  Makkah: "https://www.islamcan.com/audio/adhan/azan2.mp3",   // Makkah-style full athan
  Medina: "https://www.islamcan.com/audio/adhan/azan1.mp3",   // Medina-style athan
};
export default function MonitorAthan({ C, MONO, SANS }) {
  const [athanSrc, setAthanSrc] = React.useState(() => localStorage.getItem("monitor_athan_sound") || "Makkah");
  const [autoOn, setAutoOn] = React.useState(() => localStorage.getItem("monitor_athan_auto") === "on");
  const [times, setTimes] = React.useState(null);
  const [locName, setLocName] = React.useState("");
  const [now, setNow] = React.useState(new Date());
  const audioRef = React.useRef(null);

  const PRAYERS = [
    { key: "Fajr",    ar: "الفجر",   color: "#3b82f6" },
    { key: "Sunrise", ar: "الشروق",  color: "#f59e0b" },
    { key: "Dhuhr",   ar: "الظهر",   color: "#eab308" },
    { key: "Asr",     ar: "العصر",   color: "#14b8a6" },
    { key: "Maghrib", ar: "المغرب",  color: "#a855f7" },
    { key: "Isha",    ar: "العشاء",  color: "#6366f1" },
  ];

  // Fetch prayer times for given coords
  const loadByCoords = React.useCallback((lat, lng, name) => {
    fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=2`)
      .then(r => r.json()).then(d => { if (d.data) { setTimes(d.data.timings); if (name) setLocName(name); } }).catch(() => {});
  }, []);

  // Auto: try GPS, fall back to Makkah
  React.useEffect(() => {
    let done = false;
    const fallback = () => { if (!done) { done = true; setLocName("Makkah (default)"); loadByCoords(21.4225, 39.8262, "Makkah"); } };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          done = true;
          const { latitude, longitude } = pos.coords;
          // Reverse geocode for city name (best-effort)
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
            .then(r => r.json()).then(g => loadByCoords(latitude, longitude, g.city || g.locality || "Your location"))
            .catch(() => loadByCoords(latitude, longitude, "Your location"));
        },
        fallback,
        { timeout: 8000, maximumAge: 3600000 }
      );
      setTimeout(fallback, 9000); // safety
    } else fallback();
  }, [loadByCoords]);

  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const playAthan = () => {
    try {
      audioRef.current = new Audio(ATHAN_SOUNDS[athanSrc] || ATHAN_SOUNDS.Makkah);
      audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {});
    } catch {}
  };

  // ── AUTO-PLAY athan when a prayer time arrives ──
  const athanFiredRef = React.useRef(new Set());
  React.useEffect(() => {
    if (!times || !autoOn) return;
    const check = () => {
      const n = new Date();
      const today = n.toISOString().slice(0, 10);
      const nowMin = n.getHours() * 60 + n.getMinutes();
      ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].forEach(p => {
        const [hh, mm] = (times[p] || "0:0").split(":").map(Number);
        const pMin = hh * 60 + mm;
        // fire within the first minute of the prayer time
        if (nowMin === pMin) {
          const key = `${today}:${p}`;
          if (!athanFiredRef.current.has(key)) {
            athanFiredRef.current.add(key);
            playAthan();
          }
        }
      });
    };
    check();
    const t = setInterval(check, 20000); // check every 20s
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times, athanSrc, autoOn]);

  // Find next prayer + countdown
  let nextPrayer = null, countdown = "";
  if (times) {
    const mins = h => { const [hh, mm] = (times[h] || "0:0").split(":").map(Number); return hh * 60 + mm; };
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const order = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
    for (const p of order) { if (mins(p) > nowMin) { nextPrayer = p; const diff = mins(p) - nowMin; countdown = `${Math.floor(diff/60)}h ${diff%60}m`; break; } }
    if (!nextPrayer) { nextPrayer = "Fajr"; countdown = "tomorrow"; }
  }

  return (
    <div style={{ marginBottom: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#14b8a6", letterSpacing: "0.06em" }}>🕌 أوقات الصلاة</span>
        {locName && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>📍 {locName}</span>}
        {nextPrayer && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            التالية: <span style={{ color: "#14b8a6", fontWeight: 700 }}>{PRAYERS.find(p=>p.key===nextPrayer)?.ar}</span> خلال {countdown}
          </span>
        )}
        {/* Athan sound source */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>أذان:</span>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
            {["Makkah", "Medina"].map(c => (
              <button key={c} onClick={() => { setAthanSrc(c); localStorage.setItem("monitor_athan_sound", c); }}
                style={{ background: athanSrc === c ? "#14b8a6" : C.surface, color: athanSrc === c ? "#fff" : C.textSec, border: "none",
                  fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 9px", cursor: "pointer" }}>
                {c === "Makkah" ? "🕋 مكة" : "🕌 المدينة"}
              </button>
            ))}
          </div>
          <button onClick={() => { setAutoOn(v => { const nv = !v; localStorage.setItem("monitor_athan_auto", nv ? "on" : "off"); if (nv) playAthan(); return nv; }); }}
            title="تشغيل الأذان تلقائياً عند دخول الوقت"
            style={{ background: autoOn ? "#14b8a6" : C.surface, color: autoOn ? "#fff" : C.textSec,
              border: `1px solid ${autoOn ? "#14b8a6" : C.border}`, borderRadius: 6,
              fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>
            {autoOn ? "🔔 تلقائي ON" : "🔕 تلقائي"}
          </button>
          <button onClick={playAthan} title="تشغيل الأذان الآن"
            style={{ background: `#14b8a618`, border: `1px solid #14b8a644`, color: "#14b8a6", borderRadius: 6,
              fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>▶ أذان</button>
        </div>
      </div>
      {!times && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>…</div>}
      {times && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {PRAYERS.map(p => {
            const isNext = p.key === nextPrayer;
            return (
              <div key={p.key} style={{ background: isNext ? `${p.color}22` : `${p.color}0d`,
                border: `1px solid ${isNext ? p.color : p.color + "33"}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: p.color, direction: "rtl" }}>{p.ar}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text, marginTop: 2 }}>{times[p.key]}</div>
                {isNext && <div style={{ fontFamily: SANS, fontSize: 9, color: p.color, marginTop: 1 }}>التالية</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
