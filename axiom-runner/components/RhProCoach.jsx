import { useState } from "react";
import { rhLoadJournal, rhSaveJournal } from "./rhpro-journal.jsx";

// ── Recurring Mistakes + Weekly Report — the charter's Journal spec asks
// for both; per-trade AI grading already existed but nothing ever
// aggregated across trades. Deliberately rule-based (keyword matching over
// the trader's own real, verbatim `mistakes`/`emotion` text), not an AI
// summarization pass: this fires unprompted over the whole journal, so a
// deterministic category match that can only ever count real logged notes
// is safer than trusting a model's own count of how many trades exhibit a
// theme. A trade with no mistake/emotion note logged is excluded, not
// silently counted as "clean" — it just wasn't analyzed.
const MISTAKE_CATEGORIES = [
  { id: "fomo", label: "FOMO / chased entry", kws: ["fomo", "chased", "chasing", "jumped in", "late entry"] },
  { id: "revenge", label: "Revenge trading", kws: ["revenge"] },
  { id: "oversized", label: "Oversized position", kws: ["too big", "oversized", "over-sized", "too much size", "overleveraged", "over leveraged"] },
  { id: "stop", label: "Stop discipline", kws: ["no stop", "moved stop", "widened stop", "removed stop", "didn't honor stop", "ignored stop", "no sl"] },
  { id: "plan", label: "Ignored the plan / no confirmation", kws: ["didn't wait", "no confirmation", "ignored plan", "broke my rule", "no plan", "impatient", "impulsive"] },
  { id: "held", label: "Held too long / didn't cut loss", kws: ["held too long", "didn't cut", "hoping", "hope it", "froze", "frozen"] },
  { id: "early", label: "Exited too early", kws: ["too early", "cut winner", "sold too soon", "panicked out", "panic sold"] },
];

function categorizeTrade(t) {
  const text = `${t.mistakes || ""} ${t.emotion || ""}`.toLowerCase();
  if (!text.trim()) return null;
  const matched = MISTAKE_CATEGORIES.filter(c => c.kws.some(k => text.includes(k)));
  return matched.length ? matched.map(c => c.id) : ["other"];
}

function analyzeMistakes(trades) {
  const buckets = {};
  for (const t of trades) {
    const cats = categorizeTrade(t);
    if (!cats) continue;
    for (const catId of cats) {
      const meta = MISTAKE_CATEGORIES.find(c => c.id === catId) || { id: "other", label: "Other / uncategorized note" };
      if (!buckets[catId]) buckets[catId] = { id: catId, label: meta.label, count: 0, pnlSum: 0, trades: [] };
      buckets[catId].count++;
      buckets[catId].pnlSum += Number(t.pnl) || 0;
      buckets[catId].trades.push({ symbol: t.symbol, date: t.date, pnl: Number(t.pnl) || 0 });
    }
  }
  return Object.values(buckets).sort((a, b) => b.count - a.count);
}

// Shared with the per-trade GPA math below — one source of truth for the
// letter->GPA mapping instead of two copies that could drift apart.
const GPA_MAP = { "A+": 4.3, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7, "C+": 2.3, "C": 2, "C-": 1.7, "D": 1, "F": 0 };

function weeklyReport(trades) {
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  const weekTrades = trades.filter(t => {
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    return Number.isFinite(ts) && ts >= weekAgo;
  });
  const wins = weekTrades.filter(t => Number(t.pnl) > 0).length;
  const pnlSum = weekTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const graded = weekTrades.filter(t => t.grade && t.grade in GPA_MAP);
  const gpa = graded.length ? graded.reduce((s, t) => s + GPA_MAP[t.grade], 0) / graded.length : null;
  const mistakes = analyzeMistakes(weekTrades);
  return { count: weekTrades.length, wins, winRate: weekTrades.length ? Math.round((wins / weekTrades.length) * 100) : null, pnlSum, gpa, topMistake: mistakes[0] || null };
}

export default function RhProCoach({ C, MONO, SANS }) {
  const [trades, setTrades] = useState(rhLoadJournal);
  const [busy, setBusy] = useState(null);   // trade id being graded
  const gradeCol = g => /^A/.test(g) ? C.green : /^B/.test(g) ? "#5ab552" : /^C/.test(g) ? C.amber : g && g !== "?" ? C.red : C.textDim;
  const grade = async (t) => {
    setBusy(t.id);
    try {
      const r = await fetch("/api/market/ai-grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trade: t }) });
      const d = await r.json();
      const all = rhLoadJournal().map(x => x.id === t.id ? { ...x, grade: d.ok ? d.grade : "?", feedback: d.ok ? d.feedback : `⚠ ${d.error || "error"}` } : x);
      rhSaveJournal(all); setTrades(all);
    } catch (e) {
      const all = rhLoadJournal().map(x => x.id === t.id ? { ...x, feedback: "⚠ " + e.message } : x);
      rhSaveJournal(all); setTrades(all);
    } finally { setBusy(null); }
  };
  // "?" means grading failed (no API key, request error) — a fake grade, not a real one.
  // Must not count toward "X graded" or silently pollute the GPA average with a made-up 2.0.
  const graded = trades.filter(t => t.grade && t.grade in GPA_MAP);
  const gpa = graded.length ? (graded.reduce((s, t) => s + GPA_MAP[t.grade], 0) / graded.length) : null;
  const mistakeStats = analyzeMistakes(trades);
  const weekly = weeklyReport(trades);

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎓 AI TRADING COACH</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{graded.length}/{trades.length} graded{gpa != null ? ` · avg GPA ${gpa.toFixed(2)}` : ""}</div>
      </div>
      {!trades.length && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 20, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>No trades yet — log some in the 📓 Journal, then come back to get each one graded.</div>}

      {/* This Week — real math over real logged trades, no AI call.
          Win rate / P&L / GPA all null (not 0) when nothing's logged yet
          this week, so an empty week never misreads as a bad week. */}
      {trades.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>📅 THIS WEEK</div>
          {weekly.count > 0 ? (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{weekly.count} trade{weekly.count === 1 ? "" : "s"}</span>
              {weekly.winRate != null && <span style={{ fontFamily: MONO, fontSize: 13, color: weekly.winRate >= 50 ? C.green : C.red }}>{weekly.winRate}% win</span>}
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: weekly.pnlSum >= 0 ? C.green : C.red }}>{weekly.pnlSum >= 0 ? "+" : ""}${Math.round(weekly.pnlSum).toLocaleString()}</span>
              {weekly.gpa != null && <span style={{ fontFamily: MONO, fontSize: 13, color: C.textDim }}>GPA {weekly.gpa.toFixed(2)}</span>}
              {weekly.topMistake && <span style={{ fontFamily: SANS, fontSize: 12, color: C.amber }}>Most common this week: {weekly.topMistake.label} ({weekly.topMistake.count}x)</span>}
            </div>
          ) : (
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Nothing logged in the last 7 days.</div>
          )}
        </div>
      )}

      {/* Recurring Mistakes — a deterministic keyword match over the
          trader's own verbatim mistakes/emotion notes across ALL logged
          trades, not an AI's summary of them. Real $ cost per pattern
          (sum of that pattern's real trade P&Ls) ties each habit to an
          actual dollar number, not just a count. */}
      {mistakeStats.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>🔁 RECURRING MISTAKES (ALL-TIME)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mistakeStats.slice(0, 6).map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}33` }}>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.text }}>{m.label}</span>
                <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{m.count}x</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: m.pnlSum >= 0 ? C.green : C.red }}>{m.pnlSum >= 0 ? "+" : ""}${Math.round(m.pnlSum).toLocaleString()}</span>
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Matched from your own Mistakes/Emotion notes on each trade — log honestly, this only sees what you actually wrote.</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {trades.map(t => (
          <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${gradeCol(t.grade)}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 900, color: gradeCol(t.grade), minWidth: 56, textAlign: "center" }}>{t.grade || "–"}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{t.symbol} <span style={{ color: t.side === "short" ? C.red : C.green, fontSize: 12 }}>{t.side}</span></div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${t.entry} → ${t.exit} · {t.shares} sh · P&amp;L <span style={{ color: Number(t.pnl) >= 0 ? C.green : C.red }}>${Number(t.pnl).toLocaleString()}</span></div>
              </div>
              <button onClick={() => grade(t)} disabled={busy === t.id} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>{busy === t.id ? "⏳ grading…" : t.grade ? "↻ re-grade" : "🎓 grade"}</button>
            </div>
            {t.feedback && <div style={{ marginTop: 10, padding: "10px 12px", background: C.surface, borderRadius: 8, fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{t.feedback}</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>The coach rewards process over outcome — a small planned loss can grade higher than a lucky oversized win. Uses your Claude key.</div>
    </div>
  );
}
