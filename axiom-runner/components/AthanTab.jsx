export default function AthanTab({
  C, MONO,
  athanNow, athanTimes, athanHijri, athanLoading, athanError, setAthanError,
  athanCity, setAthanCity, athanCountry, setAthanCountry, athanMethod, setAthanMethod,
  athanSoundOn, setAthanSoundOn, athanReminder, setAthanReminder,
  fetchPrayerTimes, playAthan, stopAthan,
}) {
        const gold = "#c9a84c";
        const PRAYER_NAMES = ["الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"];
        const PRAYER_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
        const METHODS = [
          { id: 1, label: "University of Islamic Sciences, Karachi" },
          { id: 2, label: "Islamic Society of North America (ISNA)" },
          { id: 3, label: "Muslim World League" },
          { id: 4, label: "Umm Al-Qura University, Makkah" },
          { id: 5, label: "Egyptian General Authority" },
          { id: 9, label: "Kuwait" },
          { id: 11, label: "Qatar" },
          { id: 14, label: "Turkey" },
          { id: 15, label: "Singapore" },
        ];

        const loadByGeo = () => {
          if (!navigator.geolocation) { setAthanError("المتصفح لا يدعم تحديد الموقع"); return; }
          navigator.geolocation.getCurrentPosition(
            pos => { fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude, null, null); },
            () => { setAthanError("رُفض إذن الموقع — أدخل المدينة يدوياً"); }
          );
        };

        // Parse "HH:MM" string to today's Date
        const parseTime = (str) => {
          if (!str) return null;
          const [h, m] = str.split(":").map(Number);
          const d = new Date(athanNow);
          d.setHours(h, m, 0, 0);
          return d;
        };

        const prayerTimes = PRAYER_KEYS.map((k, i) => ({
          key: k, name: PRAYER_NAMES[i],
          time: athanTimes ? parseTime(athanTimes[k]) : null,
          timeStr: athanTimes?.[k] || "—",
        }));

        const now = athanNow;
        const nextPrayer = prayerTimes.filter(p => p.key !== "Sunrise" && p.time && p.time > now).sort((a, b) => a.time - b.time)[0];
        const countdown = nextPrayer?.time ? Math.max(0, Math.floor((nextPrayer.time - now) / 1000)) : null;
        const cdH = countdown != null ? Math.floor(countdown / 3600) : 0;
        const cdM = countdown != null ? Math.floor((countdown % 3600) / 60) : 0;
        const cdS = countdown != null ? countdown % 60 : 0;

        return (
          <div dir="rtl" style={{ maxWidth: 780, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: gold }}>أوقات الصلاة</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, direction: "ltr", marginTop: 4 }}>PRAYER TIMES</div>
            </div>

            {/* Date display */}
            <div style={{ background: C.card, border: `1px solid ${gold}44`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{now.toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
                {athanHijri && <div style={{ fontSize: 12, color: gold, marginTop: 2 }}>{athanHijri.day} {athanHijri.month?.ar} {athanHijri.year} هـ</div>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 18, color: C.text, fontWeight: 700, direction: "ltr" }}>
                {now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>

            {/* Next prayer countdown */}
            {nextPrayer && countdown != null && (
              <div style={{ background: `${gold}12`, border: `1px solid ${gold}66`, borderRadius: 12, padding: "16px 20px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: gold, marginBottom: 4 }}>الوقت المتبقي على {nextPrayer.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: gold, direction: "ltr" }}>
                  {String(cdH).padStart(2, "0")}:{String(cdM).padStart(2, "0")}:{String(cdS).padStart(2, "0")}
                </div>
              </div>
            )}

            {/* Prayer cards */}
            {athanTimes && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
                {prayerTimes.map(p => {
                  const isNext = nextPrayer?.key === p.key;
                  const isPast = p.time && p.time < now;
                  return (
                    <div key={p.key} style={{ background: isNext ? `${gold}18` : C.card, border: `1px solid ${isNext ? gold : C.border}`, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: isNext ? gold : C.text, fontFamily: "Arial, sans-serif", marginBottom: 6 }}>{p.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: isPast ? C.textDim : C.text, direction: "ltr" }}>{p.timeStr}</div>
                      {isNext && <div style={{ fontSize: 12, color: gold, fontFamily: MONO, marginTop: 4 }}>التالية</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {athanLoading && <div style={{ textAlign: "center", color: C.textDim, fontFamily: MONO, fontSize: 12, marginBottom: 14 }}>جاري تحميل أوقات Ø§Ù„ØµÙ„Ø§Ø©…</div>}
            {athanError && <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", color: C.red, fontSize: 13, marginBottom: 14 }}>{athanError}</div>}

            {/* Location + Settings */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 10 }}>الإعدادات</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input value={athanCity} onChange={e => setAthanCity(e.target.value)} placeholder="المدينة (مثل: مكة)" dir="rtl"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, fontFamily: "Arial, sans-serif" }}
                  onBlur={() => localStorage.setItem("athan_city", athanCity)} />
                <input value={athanCountry} onChange={e => setAthanCountry(e.target.value)} placeholder="الدولة (مثل: SA)" dir="rtl"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, fontFamily: "Arial, sans-serif" }}
                  onBlur={() => localStorage.setItem("athan_country", athanCountry)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 10 }}>
                <select value={athanMethod} onChange={e => { setAthanMethod(Number(e.target.value)); localStorage.setItem("athan_method", e.target.value); }}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 12, fontFamily: "Arial, sans-serif" }} dir="rtl">
                  {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <button onClick={loadByGeo}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                  📍 موقعي
                </button>
                <button onClick={() => { if (athanCity && athanCountry) fetchPrayerTimes(null, null, athanCity, athanCountry); else loadByGeo(); }}
                  style={{ background: `${gold}18`, border: `1px solid ${gold}55`, color: gold, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                  تحديث
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSec, cursor: "pointer" }}>
                  <input type="checkbox" checked={athanSoundOn} onChange={e => { setAthanSoundOn(e.target.checked); localStorage.setItem("athan_sound", e.target.checked ? "on" : "off"); }}
                    style={{ accentColor: gold }} />
                  تشغيل صوت الأذان
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.textSec }}>تنبيه قبل الصلاة:</span>
                  <select value={athanReminder} onChange={e => { setAthanReminder(Number(e.target.value)); localStorage.setItem("athan_reminder", e.target.value); }}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "4px 8px", borderRadius: 6, fontSize: 12, fontFamily: "Arial, sans-serif" }}>
                    <option value={5}>5 دقائق</option>
                    <option value={10}>10 دقائق</option>
                    <option value={15}>15 دقيقة</option>
                  </select>
                </div>
              </div>
              {/* Test athan button */}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={playAthan}
                  style={{ flex: 1, background: `${gold}22`, border: `1px solid ${gold}66`, color: gold, borderRadius: 8, padding: "10px", fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ▶ تجربة صوت الأذان
                </button>
                <button onClick={stopAthan}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 8, padding: "10px 16px", fontFamily: "Arial, sans-serif", fontSize: 14, cursor: "pointer" }}>
                  ⏹ إيقاف
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, textAlign: "center", fontFamily: "Arial, sans-serif" }}>
                اضغط "تجربة" مرة واحدة للسماح للمتصفح بتشغيل الصوت تلقائياً عند وقت الصلاة
              </div>
            </div>
            {!athanTimes && !athanLoading && (
              <div style={{ textAlign: "center" }}>
                <button onClick={loadByGeo}
                  style={{ background: `${gold}18`, border: `1px solid ${gold}66`, color: gold, borderRadius: 10, padding: "14px 28px", fontFamily: "Arial, sans-serif", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>
                  📍 اعرض أوقات الصلاة لموقعي
                </button>
              </div>
            )}
          </div>
        );
}
