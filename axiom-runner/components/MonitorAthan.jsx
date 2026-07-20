// ─── Prayer times widget (Monitor) — thin display over the app-wide athan
// state (axiom-live.jsx: athanTimes/athanSoundOn/playAthan). Previously this
// component ran its own separate GPS fetch + its own auto-play timer, off
// by default and scoped to this component's mount — meaning athan only
// ever fired while the user happened to be sitting on the Quran tab with
// auto-play manually turned on. The real auto-play effect already lives at
// the top of the app (tab-independent, sound on by default) but had
// nothing to check against unless the user separately visited the hidden
// Athan tab. Fixed at the source (axiom-live.jsx auto-loads athanTimes on
// mount now) — this widget just shows/controls that one shared state so
// there's a single athan clock, not two competing ones (2026-07-20).
export default function MonitorAthan({ C, MONO, SANS, times, athanCity, soundOn, setSoundOn, playAthan }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const PRAYERS = [
    { key: "Fajr",    ar: "الفجر",   color: "#3b82f6" },
    { key: "Sunrise", ar: "الشروق",  color: "#f59e0b" },
    { key: "Dhuhr",   ar: "الظهر",   color: "#eab308" },
    { key: "Asr",     ar: "العصر",   color: "#14b8a6" },
    { key: "Maghrib", ar: "المغرب",  color: "#a855f7" },
    { key: "Isha",    ar: "العشاء",  color: "#6366f1" },
  ];

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
        {athanCity && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>📍 {athanCity}</span>}
        {nextPrayer && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            التالية: <span style={{ color: "#14b8a6", fontWeight: 700 }}>{PRAYERS.find(p=>p.key===nextPrayer)?.ar}</span> خلال {countdown}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setSoundOn(v => { const nv = !v; localStorage.setItem("athan_sound", nv ? "on" : "off"); if (nv) playAthan(); return nv; })}
            title="تشغيل الأذان تلقائياً عند دخول الوقت — يعمل في كل التبويبات"
            style={{ background: soundOn ? "#14b8a6" : C.surface, color: soundOn ? "#fff" : C.textSec,
              border: `1px solid ${soundOn ? "#14b8a6" : C.border}`, borderRadius: 6,
              fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>
            {soundOn ? "🔔 تلقائي ON" : "🔕 تلقائي"}
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
