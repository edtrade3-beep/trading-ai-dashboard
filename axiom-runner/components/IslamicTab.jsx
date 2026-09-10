import { useState } from "react";
import QuranTab from "./QuranTab.jsx";
import ZakatCalculator from "./ZakatCalculator.jsx";

// IslamicTab.jsx — unified Islamic hub (2026-09-10, explicit user request:
// "make the ZAKAT CALCULATOR the most complete and useful feature inside
// the Islamic tab, while keeping the same clean green/white style"). No
// screen recording came through with the request, so this green/white,
// rounded-card, mobile-first look is designed fresh from the written spec
// rather than matched pixel-for-pixel — confirmed with the user up front.
//
// Reuses the app's REAL prayer-time state (athan*, already fetched
// elsewhere in axiom-live.jsx for the existing standalone Prayer Times/
// Quran tabs) for the Daily/Hijri/Gregorian views and header countdown —
// no second fetch pipeline. Quran mounts the existing QuranTab.jsx
// unchanged (explicit scope: "preserve the existing Islamic tools").
// Qibla/Tasbeeh/Tracker are honestly disclosed as a later phase rather
// than stubbed with fake data — this phase's agreed scope is the hub
// navigation + a fully real Zakat Calculator (ZakatCalculator.jsx).

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CREAM = "#faf8f2";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const NAV = [
  { id: "daily", label: "Daily", icon: "🕌" },
  { id: "quran", label: "Quran", icon: "📖" },
  { id: "hijri", label: "Hijri", icon: "🌙" },
  { id: "gregorian", label: "Gregorian", icon: "📅" },
  { id: "qibla", label: "Qibla", icon: "🧭" },
  { id: "zakat", label: "Zakat", icon: "💚", prominent: true },
  { id: "tasbeeh", label: "Tasbeeh", icon: "📿" },
  { id: "tracker", label: "Tracker", icon: "✅" },
];

function ComingSoon({ title }) {
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32 }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🌙</div>
      <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 6 }}>{title} is coming soon</div>
      <div style={{ fontFamily: SANS, fontSize: 14, color: TEXT_DIM }}>This section hasn't been built yet — it's a later phase of the Islamic tab redesign.</div>
    </div>
  );
}

function HijriView({ athanHijri }) {
  return (
    <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.05em", marginBottom: 10 }}>HIJRI DATE</div>
      {athanHijri ? (
        <>
          <div style={{ fontFamily: SANS, fontSize: 36, fontWeight: 900, color: GREEN }}>{athanHijri.day} {athanHijri.month?.en || athanHijri.month?.ar}</div>
          <div style={{ fontFamily: SANS, fontSize: 18, color: TEXT, marginTop: 4 }}>{athanHijri.year} AH</div>
          <div dir="rtl" style={{ fontFamily: "Georgia, serif", fontSize: 16, color: TEXT_DIM, marginTop: 10 }}>{athanHijri.day} {athanHijri.month?.ar} {athanHijri.year} هـ</div>
        </>
      ) : <div style={{ fontFamily: SANS, color: TEXT_DIM }}>Loading — open Daily first to fetch today's date.</div>}
    </div>
  );
}

function GregorianView({ athanNow }) {
  return (
    <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.05em", marginBottom: 10 }}>GREGORIAN DATE</div>
      <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 900, color: GREEN }}>{athanNow.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      <div style={{ fontFamily: SANS, fontSize: 18, color: TEXT, marginTop: 4 }}>{athanNow.getFullYear()}</div>
    </div>
  );
}

// Daily — restyled green/white version of the existing prayer-time data
// (same athan* state AthanTab.jsx already uses; not a second fetch).
function DailyView(props) {
  const { athanNow, athanTimes, athanHijri, athanLoading, athanError, athanCity, setAthanCity, athanCountry, setAthanCountry, fetchPrayerTimes } = props;
  const PRAYER_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const parseTime = (str) => {
    if (!str) return null;
    const [h, m] = str.split(":").map(Number);
    const d = new Date(athanNow); d.setHours(h, m, 0, 0); return d;
  };
  const prayerTimes = PRAYER_KEYS.map((k) => ({ key: k, time: athanTimes ? parseTime(athanTimes[k]) : null, timeStr: athanTimes?.[k] || "—" }));
  const nextPrayer = prayerTimes.filter((p) => p.key !== "Sunrise" && p.time && p.time > athanNow).sort((a, b) => a.time - b.time)[0];
  const countdown = nextPrayer?.time ? Math.max(0, Math.floor((nextPrayer.time - athanNow) / 1000)) : null;
  const cdH = countdown != null ? Math.floor(countdown / 3600) : 0;
  const cdM = countdown != null ? Math.floor((countdown % 3600) / 60) : 0;
  const cdS = countdown != null ? countdown % 60 : 0;

  const loadByGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude, null, null));
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {nextPrayer && countdown != null && (
        <div style={{ background: GREEN, borderRadius: 16, padding: "20px 24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontFamily: SANS, fontSize: 13, color: "#e3f5ec", marginBottom: 6 }}>Time until {nextPrayer.key}</div>
          <div style={{ fontFamily: "monospace", fontSize: 34, fontWeight: 900, color: "#fff" }}>
            {String(cdH).padStart(2, "0")}:{String(cdM).padStart(2, "0")}:{String(cdS).padStart(2, "0")}
          </div>
        </div>
      )}
      {athanTimes && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 16 }}>
          {prayerTimes.map((p) => {
            const isNext = nextPrayer?.key === p.key;
            const isPast = p.time && p.time < athanNow;
            return (
              <div key={p.key} style={{ background: isNext ? `${GREEN}15` : CARD, border: `1.5px solid ${isNext ? GREEN : BORDER}`, borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: isNext ? GREEN_DARK : TEXT }}>{p.key}</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: isPast ? TEXT_DIM : TEXT, marginTop: 4 }}>{p.timeStr}</div>
              </div>
            );
          })}
        </div>
      )}
      {athanLoading && <div style={{ textAlign: "center", color: TEXT_DIM, fontFamily: SANS, marginBottom: 14 }}>Loading prayer times…</div>}
      {athanError && <div style={{ background: "#fbeae7", border: "1px solid #e2a99c", borderRadius: 10, padding: "10px 14px", color: "#a13c2a", fontFamily: SANS, fontSize: 13, marginBottom: 14 }}>{athanError}</div>}
      {!athanTimes && !athanLoading && (
        <div style={{ textAlign: "center" }}>
          <button onClick={loadByGeo} style={{ background: GREEN, border: "none", color: "#fff", borderRadius: 12, padding: "14px 28px", fontFamily: SANS, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            📍 Show prayer times for my location
          </button>
        </div>
      )}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginTop: 6 }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: TEXT_DIM, marginBottom: 10, letterSpacing: "0.04em" }}>LOCATION</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
          <input value={athanCity} onChange={(e) => setAthanCity(e.target.value)} placeholder="City" style={{ border: `1px solid ${BORDER}`, background: CREAM, borderRadius: 8, padding: "9px 10px", fontFamily: SANS, fontSize: 13, color: TEXT }} />
          <input value={athanCountry} onChange={(e) => setAthanCountry(e.target.value)} placeholder="Country code" style={{ border: `1px solid ${BORDER}`, background: CREAM, borderRadius: 8, padding: "9px 10px", fontFamily: SANS, fontSize: 13, color: TEXT }} />
          <button onClick={() => (athanCity && athanCountry ? fetchPrayerTimes(null, null, athanCity, athanCountry) : loadByGeo())} style={{ background: GREEN, border: "none", color: "#fff", borderRadius: 8, padding: "9px 16px", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Update</button>
        </div>
      </div>
    </div>
  );
}

export default function IslamicTab(props) {
  const { athanNow, athanHijri } = props;
  const [section, setSection] = useState("daily");

  const nextInfo = (() => {
    if (!props.athanTimes) return null;
    const keys = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    for (const k of keys) {
      const [h, m] = (props.athanTimes[k] || "").split(":").map(Number);
      if (!Number.isFinite(h)) continue;
      const d = new Date(athanNow); d.setHours(h, m, 0, 0);
      if (d > athanNow) return { name: k, time: d };
    }
    return null;
  })();

  return (
    <div style={{ background: CREAM, margin: "-16px", padding: "16px 16px 40px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 20px" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 900, color: GREEN_DARK }}>🕌 Islamic</div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginTop: 2 }}>
              {athanHijri ? `${athanHijri.day} ${athanHijri.month?.en || athanHijri.month?.ar} ${athanHijri.year} AH · ` : ""}
              {athanNow.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          {nextInfo && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: SANS, fontSize: 11, color: TEXT_DIM }}>Next: {nextInfo.name}</div>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: GREEN }}>{nextInfo.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto 20px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {NAV.map((n) => {
          const isActive = section === n.id;
          const isZakat = n.prominent;
          return (
            <button
              key={n.id} onClick={() => setSection(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: isZakat ? "12px 22px" : "10px 16px",
                borderRadius: 999, cursor: "pointer",
                fontFamily: SANS, fontWeight: isZakat ? 900 : 700, fontSize: isZakat ? 15 : 13.5,
                border: isActive ? `2px solid ${GREEN}` : isZakat ? `2px solid ${GREEN}` : `1.5px solid ${BORDER}`,
                background: isActive ? GREEN : isZakat ? `${GREEN}12` : CARD,
                color: isActive ? "#fff" : isZakat ? GREEN_DARK : TEXT,
                boxShadow: isZakat && !isActive ? `0 2px 8px ${GREEN}22` : "none",
              }}
            >
              <span>{n.icon}</span>{n.label}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {section === "daily" && <DailyView {...props} />}
        {section === "quran" && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
            <QuranTab {...props.quranProps} />
          </div>
        )}
        {section === "hijri" && <HijriView athanHijri={athanHijri} />}
        {section === "gregorian" && <GregorianView athanNow={athanNow} />}
        {section === "qibla" && <ComingSoon title="Qibla direction" />}
        {section === "zakat" && <ZakatCalculator />}
        {section === "tasbeeh" && <ComingSoon title="Tasbeeh counter" />}
        {section === "tracker" && <ComingSoon title="Prayer tracker" />}
      </div>
    </div>
  );
}
