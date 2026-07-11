export default function ChallengeTab({ C, MONO, SANS, fetchTradeSetup: _ft }) {

        const HABITS = [
          { id: "regime",    label: "✅ Checked market regime before trading" },
          { id: "events",    label: "📅 Checked news events / FOMC calendar" },
          { id: "stops",     label: "🛑 Set stop loss on EVERY trade" },
          { id: "sizing",    label: "💰 Followed 1% position sizing rule" },
          { id: "journal",   label: "📓 Journaled every trade I took" },
          { id: "norevenge", label: "🧠 No revenge trades after a loss" },
          { id: "maxloss",   label: "⛔ Stopped when daily max loss hit" },
          { id: "review",    label: "🔍 Reviewed my trades at end of day" },
        ];

        const today = new Date().toISOString().slice(0, 10);

        // Load/save challenge data from localStorage
        const [challengeData, setChallengeData] = React.useState(() => {
          try { return JSON.parse(localStorage.getItem("trading_challenge_v2") || "{}"); } catch { return {}; }
        });
        const [startDate, setStartDate] = React.useState(() => {
          try { return localStorage.getItem("challenge_start") || null; } catch { return null; }
        });
        const [weekReview, setWeekReview] = React.useState("");
        const [reviewLoading, setReviewLoading] = React.useState(false);
        const [showForm, setShowForm] = React.useState(false);
        const [todayForm, setTodayForm] = React.useState(() => challengeData[today] || { habits: {}, trades: "", pnl: "", confidence: 5, good: "", wrong: "", focus: "", done: false });

        const save = (data, sd) => {
          const d = { ...challengeData, ...data };
          setChallengeData(d);
          try { localStorage.setItem("trading_challenge_v2", JSON.stringify(d)); } catch {}
          if (sd) { setStartDate(sd); try { localStorage.setItem("challenge_start", sd); } catch {} }
        };

        const startChallenge = () => { save({}, today); setStartDate(today); setShowForm(true); };

        // Stats
        const days = startDate
          ? Object.keys(challengeData).filter(d => d >= startDate).sort()
          : [];
        const dayNum = startDate ? Math.min(30, days.length + 1) : 0;
        const completedDays = days.filter(d => challengeData[d]?.done);
        const streak = (() => {
          let s = 0;
          const sorted = completedDays.sort().reverse();
          for (let i = 0; i < sorted.length; i++) {
            const expected = new Date(today);
            expected.setDate(expected.getDate() - i);
            if (sorted[i] === expected.toISOString().slice(0, 10)) s++;
            else break;
          }
          return s;
        })();
        const habitScores = completedDays.map(d => {
          const h = challengeData[d]?.habits || {};
          return Object.values(h).filter(Boolean).length / HABITS.length * 100;
        });
        const avgHabit = habitScores.length ? Math.round(habitScores.reduce((a, b) => a + b, 0) / habitScores.length) : 0;
        const todayDone = challengeData[today]?.done;
        const totalPnl = days.reduce((s, d) => s + (Number(challengeData[d]?.pnl) || 0), 0);

        // 30-day calendar grid
        const calDays = [];
        if (startDate) {
          for (let i = 0; i < 30; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const ds = d.toISOString().slice(0, 10);
            const entry = challengeData[ds];
            calDays.push({ date: ds, isToday: ds === today, isPast: ds < today, entry });
          }
        }

        const submitToday = () => {
          save({ [today]: { ...todayForm, done: true, savedAt: Date.now() } });
          setTodayForm(p => ({ ...p, done: true }));
          setShowForm(false);
        };

        const genWeekReview = async () => {
          setReviewLoading(true);
          try {
            const weekDays = days.slice(-7).map(d => challengeData[d]).filter(Boolean);
            const summary = weekDays.map((d, i) => `Day ${i+1}: PnL $${d.pnl||0}, Habits ${Object.values(d.habits||{}).filter(Boolean).length}/${HABITS.length}, Trades ${d.trades||0}, Wrong: ${d.wrong||"—"}`).join("\n");
            const prompt = `You are a trading coach reviewing a trader's 7-day journal. Here is their week:\n${summary}\n\nWrite a concise coaching review (5-8 sentences): 1) Key stats, 2) What they did well, 3) Their biggest pattern of mistakes, 4) One specific thing to focus on next week. Be direct and honest.`;
            const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
            const d = await r.json();
            if (d.output) setWeekReview(d.output);
          } catch { setWeekReview("Could not generate review — check AI agent connection."); }
          setReviewLoading(false);
        };

        const inputStyle = { width: "100%", padding: "8px 10px", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: SANS, fontSize: 13, borderRadius: 7, boxSizing: "border-box" };
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, ...extra });

        if (!startDate) return (
          <div style={{ maxWidth: 560, margin: "0 auto", padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🏆</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 8 }}>30-Day Trading Challenge</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: C.textDim, lineHeight: 1.8, marginBottom: 28 }}>
              30 days of discipline = 1 year of improvement.<br/>
              Check in every day. Follow the rules. Review every week.<br/>
              This is how you go from losing to winning.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
              {["Journal every trade — no exceptions","1% risk max per trade — no exceptions","Check market regime before every trade","No revenge trades — tilt detector is your guard","Review your trades at end of day"].map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 10, fontFamily: SANS, fontSize: 13, color: C.text }}>
                  <span style={{ color: C.green, flexShrink: 0 }}>✓</span>{r}
                </div>
              ))}
            </div>
            <button onClick={startChallenge}
              style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, padding: "14px 36px", borderRadius: 10, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}>
              🚀 START DAY 1 — {today}
            </button>
          </div>
        );

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Header stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
              {[
                { label: "DAY", value: `${dayNum}/30`, color: C.accent, sub: startDate },
                { label: "STREAK", value: `${streak}🔥`, color: streak >= 7 ? C.green : streak >= 3 ? C.amber : C.textDim, sub: "consecutive days" },
                { label: "HABIT SCORE", value: `${avgHabit}%`, color: avgHabit >= 80 ? C.green : avgHabit >= 60 ? C.amber : C.red, sub: "avg daily habits" },
                { label: "TOTAL P&L", value: `${totalPnl >= 0 ? "+" : ""}$${Math.round(totalPnl)}`, color: totalPnl >= 0 ? C.green : C.red, sub: `${completedDays.length} logged days` },
                { label: "COMPLETED", value: `${completedDays.length}/30`, color: completedDays.length >= 20 ? C.green : C.amber, sub: "days checked in" },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ ...card(), textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color }}>{value}</div>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Today's check-in */}
            <div style={{ ...card(), border: `1px solid ${todayDone ? C.green + "55" : C.amber + "55"}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>
                    {todayDone ? "✅ Day " + dayNum + " Complete" : "📋 Today's Check-in — Day " + dayNum}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>{today}</div>
                </div>
                {!todayDone && (
                  <button onClick={() => setShowForm(f => !f)}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 18px", borderRadius: 8, border: "none", background: C.amber, color: "#fff", cursor: "pointer" }}>
                    {showForm ? "↑ Collapse" : "Check In Now →"}
                  </button>
                )}
                {todayDone && (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.green, background: `${C.green}18`, borderRadius: 6, padding: "4px 12px" }}>
                    ✅ Done — see you tomorrow
                  </span>
                )}
              </div>

              {showForm && !todayDone && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Habits */}
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 8, fontWeight: 800, letterSpacing: "0.08em" }}>HABITS — check everything you did today</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {HABITS.map(h => (
                        <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 10px", borderRadius: 8,
                          background: todayForm.habits[h.id] ? `${C.green}12` : C.surface, border: `1px solid ${todayForm.habits[h.id] ? C.green + "55" : C.border}` }}>
                          <input type="checkbox" checked={!!todayForm.habits[h.id]}
                            onChange={e => setTodayForm(p => ({ ...p, habits: { ...p.habits, [h.id]: e.target.checked } }))}
                            style={{ accentColor: C.green, width: 16, height: 16, flexShrink: 0 }} />
                          <span style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{h.label}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.green, marginTop: 6 }}>
                      {Object.values(todayForm.habits).filter(Boolean).length}/{HABITS.length} habits ·
                      {Object.values(todayForm.habits).filter(Boolean).length === HABITS.length ? " 🔥 PERFECT DAY!" : " keep going"}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>TRADES TAKEN</div>
                      <input type="number" min="0" max="20" value={todayForm.trades} onChange={e => setTodayForm(p => ({ ...p, trades: e.target.value }))} style={inputStyle} placeholder="0" />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>TODAY'S P&L ($)</div>
                      <input type="number" value={todayForm.pnl} onChange={e => setTodayForm(p => ({ ...p, pnl: e.target.value }))} style={inputStyle} placeholder="0" />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>CONFIDENCE (1-10)</div>
                      <input type="range" min="1" max="10" value={todayForm.confidence} onChange={e => setTodayForm(p => ({ ...p, confidence: Number(e.target.value) }))} style={{ width: "100%", accentColor: C.accent }} />
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.accent, textAlign: "center" }}>{todayForm.confidence}/10</div>
                    </div>
                  </div>

                  {/* Reflection */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT I DID WELL</div>
                      <textarea value={todayForm.good} onChange={e => setTodayForm(p => ({ ...p, good: e.target.value }))} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder="e.g. Waited for clean entry, followed my stop..." />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT I DID WRONG</div>
                      <textarea value={todayForm.wrong} onChange={e => setTodayForm(p => ({ ...p, wrong: e.target.value }))} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder="e.g. Chased entry, moved stop, overtrade..." />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>TOMORROW'S FOCUS</div>
                    <input value={todayForm.focus} onChange={e => setTodayForm(p => ({ ...p, focus: e.target.value }))} style={inputStyle} placeholder="One specific thing to improve tomorrow..." />
                  </div>

                  <button onClick={submitToday}
                    style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, padding: "12px", borderRadius: 9, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}>
                    ✅ Complete Day {dayNum}
                  </button>
                </div>
              )}

              {/* Show today's completed data */}
              {todayDone && challengeData[today] && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
                  {[
                    ["Habits", `${Object.values(challengeData[today].habits||{}).filter(Boolean).length}/${HABITS.length}`, Object.values(challengeData[today].habits||{}).filter(Boolean).length === HABITS.length ? C.green : C.amber],
                    ["Trades", challengeData[today].trades || "0", C.text],
                    ["P&L", `${(Number(challengeData[today].pnl)||0) >= 0 ? "+" : ""}$${challengeData[today].pnl||0}`, (Number(challengeData[today].pnl)||0) >= 0 ? C.green : C.red],
                    ["Confidence", `${challengeData[today].confidence||5}/10`, C.accent],
                  ].map(([l, v, col]) => (
                    <div key={l} style={{ textAlign: "center", padding: 8, background: C.surface, borderRadius: 7 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{l}</div>
                      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 30-day calendar */}
            {calDays.length > 0 && (
              <div style={card()}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>30-DAY CALENDAR</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6 }}>
                  {calDays.map(({ date, isToday, isPast, entry }) => {
                    const done = entry?.done;
                    const habitPct = done ? Object.values(entry.habits||{}).filter(Boolean).length / HABITS.length : 0;
                    const pnl = Number(entry?.pnl || 0);
                    const bg = !isPast && !isToday ? C.surface :
                      done ? (habitPct === 1 ? `${C.green}30` : `${C.green}18`) : isPast ? `${C.red}15` : `${C.amber}15`;
                    const border = isToday ? `2px solid ${C.accent}` : done ? `1px solid ${C.green}44` : `1px solid ${C.border}`;
                    return (
                      <div key={date} title={`${date}${done ? ` · PnL $${pnl} · Habits ${Math.round(habitPct*100)}%` : ""}`}
                        style={{ background: bg, border, borderRadius: 6, padding: "6px 4px", textAlign: "center", cursor: "default" }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: isToday ? C.accent : C.textDim, fontWeight: isToday ? 900 : 400 }}>
                          {new Date(date + "T12:00:00").getDate()}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                          {done ? (habitPct === 1 ? "🔥" : "✅") : isPast ? "❌" : isToday ? "📋" : "⬜"}
                        </div>
                        {done && pnl !== 0 && (
                          <div style={{ fontFamily: MONO, fontSize: 8, color: pnl >= 0 ? C.green : C.red, marginTop: 1 }}>
                            {pnl >= 0 ? "+" : ""}{pnl}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontFamily: SANS, fontSize: 11, color: C.textDim }}>
                  <span>🔥 = Perfect (all 8 habits)</span>
                  <span>✅ = Done</span>
                  <span>❌ = Missed</span>
                  <span>📋 = Today</span>
                </div>
              </div>
            )}

            {/* Weekly AI Review */}
            {completedDays.length >= 5 && (
              <div style={card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>🤖 WEEKLY AI COACHING REVIEW</div>
                  <button onClick={genWeekReview} disabled={reviewLoading}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 16px", borderRadius: 7, border: "none",
                      background: reviewLoading ? C.surface : C.purple, color: reviewLoading ? C.textDim : "#fff", cursor: reviewLoading ? "default" : "pointer" }}>
                    {reviewLoading ? "⏳ Analyzing…" : "Generate Review"}
                  </button>
                </div>
                {weekReview ? (
                  <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.8, padding: "12px 14px",
                    background: `${C.purple}10`, borderRadius: 8, border: `1px solid ${C.purple}33`, whiteSpace: "pre-wrap" }}>
                    {weekReview}
                  </div>
                ) : (
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>
                    Based on your last 7 check-ins — generates a personal coaching review with what's working, what to fix, and one focus for next week.
                  </div>
                )}
              </div>
            )}

            {/* Reset */}
            <div style={{ textAlign: "right" }}>
              <button onClick={() => { if (window.confirm("Reset 30-day challenge? All data will be lost.")) { localStorage.removeItem("trading_challenge_v2"); localStorage.removeItem("challenge_start"); setChallengeData({}); setStartDate(null); } }}
                style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
                Reset Challenge
              </button>
            </div>
          </div>
        );
      
}
