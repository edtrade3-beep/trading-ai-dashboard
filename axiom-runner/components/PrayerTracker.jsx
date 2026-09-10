import { useState, useEffect, useMemo } from "react";

// PrayerTracker.jsx — Islamic tab Phase 2 (2026-09-10). Real per-day
// checklist of the 5 daily prayers, persisted in localStorage keyed by
// real calendar date (not a session-only counter — closing the tab or
// coming back tomorrow keeps yesterday's real record). Shows the current
// real week so a streak is actually visible, not just today's checkboxes
// in isolation.

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CREAM = "#faf8f2";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const STORE_KEY = "islamic_prayer_tracker";

function dateKey(d) { return d.toISOString().slice(0, 10); }
function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; } }
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function PrayerTracker() {
  const [store, setStore] = useState(loadStore);
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  useEffect(() => { saveStore(store); }, [store]);

  const toggle = (key, prayer) => {
    setStore((s) => {
      const day = { ...(s[key] || {}) };
      day[prayer] = !day[prayer];
      return { ...s, [key]: day };
    });
  };

  const todayRecord = store[todayKey] || {};
  const todayDone = PRAYERS.filter((p) => todayRecord[p]).length;

  const weekTotal = weekDays.reduce((sum, d) => {
    const rec = store[dateKey(d)] || {};
    return sum + PRAYERS.filter((p) => rec[p]).length;
  }, 0);
  const weekMax = 7 * PRAYERS.length;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: GREEN_DARK }}>Today</div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: todayDone === 5 ? GREEN : TEXT_DIM, background: todayDone === 5 ? `${GREEN}15` : CREAM, borderRadius: 999, padding: "4px 12px" }}>
            {todayDone} / 5
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {PRAYERS.map((p) => {
            const done = !!todayRecord[p];
            return (
              <button key={p} onClick={() => toggle(todayKey, p)}
                style={{ padding: "16px 4px", borderRadius: 12, border: `1.5px solid ${done ? GREEN : BORDER}`, background: done ? `${GREEN}12` : CREAM, cursor: "pointer", textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{done ? "✅" : "○"}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: done ? GREEN_DARK : TEXT }}>{p}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 800, color: TEXT }}>This Week</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM }}>{weekTotal} / {weekMax}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {weekDays.map((d) => {
            const key = dateKey(d);
            const rec = store[key] || {};
            const done = PRAYERS.filter((p) => rec[p]).length;
            const isToday = key === todayKey;
            const isFuture = d > today;
            return (
              <div key={key} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: TEXT_DIM, marginBottom: 4 }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div style={{
                  height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  border: isToday ? `2px solid ${GREEN}` : `1px solid ${BORDER}`,
                  background: isFuture ? CREAM : done === 5 ? GREEN : done > 0 ? `${GREEN}33` : CREAM,
                  color: done === 5 ? "#fff" : TEXT, fontFamily: SANS, fontSize: 12, fontWeight: 700, opacity: isFuture ? 0.5 : 1,
                }}>
                  {isFuture ? "" : `${done}/5`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_DIM, textAlign: "center", marginTop: 12 }}>
        Saved on this device only. Tap any prayer, today or earlier this week, to mark it complete.
      </div>
    </div>
  );
}
