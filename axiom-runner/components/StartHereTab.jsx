export default function StartHereTab({ C, MONO, SANS, setActiveTab }) {
  const go = tab => () => setActiveTab(tab);
  const Card = ({ children, accent }) => (
    <div style={{ background: C.card, border: `1px solid ${accent || C.border}`, borderRadius: 12, padding: "16px 18px" }}>{children}</div>
  );
  const Jump = ({ to, children }) => (
    <button onClick={go(to)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
      border: `1px solid ${C.accent}55`, background: `${C.accent}14`, color: C.accent }}>{children} →</button>
  );

  // The 5 jobs of a trader's tool stack, each mapped to a tab in THIS platform.
  const stack = [
    { icon: "🔍", job: "FIND ideas", what: "A scanner filters thousands of stocks down to the few that fit your rules — so you're not guessing.", real: "Pros use Finviz, Trade Ideas, TC2000.", to: "smartscan", btn: "Open Smart Scan" },
    { icon: "📈", job: "READ the chart", what: "Charts show price, trend, and key levels so you can time an entry and place a stop.", real: "Everyone uses TradingView (its engine is built into this app).", to: "multitf", btn: "Open Chart" },
    { icon: "📰", job: "KNOW why it moves", what: "News, earnings, and Fed events explain the move and warn you before surprises.", real: "Pros use Benzinga Pro, X/Twitter, earnings calendars.", to: "news", btn: "Open News" },
    { icon: "🏆", job: "GRADE the setup", what: "A checklist (the Trend Template) scores a stock's quality so you only take A-grade setups.", real: "Based on Mark Minervini's pro methodology.", to: "trendtemplate", btn: "Open Trend Template" },
    { icon: "📋", job: "TRACK & review", what: "A journal records every trade and shows your win rate, expectancy, and whether you have a real edge.", real: "Pros journal religiously — it's how you improve.", to: "mytrades", btn: "Open My Trades" },
  ];

  // What a real trader does each session, in order.
  const flow = [
    ["☀️", "Check the weather", "Is the overall market up or down today? Don't fight the tide.", "morning-routine"],
    ["🔍", "Scan for candidates", "Let the scanner surface the few stocks worth a look.", "smartscan"],
    ["📈", "Inspect the chart", "Does the setup actually look good? Where's your entry and stop?", "multitf"],
    ["📝", "Write the plan", "Entry, stop-loss, target — decided BEFORE you click buy.", "mytrades"],
    ["🤖", "Place it (on paper)", "Buy with a stop attached. Let the autopilot or do it yourself.", "mytrades"],
    ["📋", "Review", "After it closes, log what worked and what didn't.", "mytrades"],
  ];

  const rules = [
    ["🛡️", "Risk ≤ 1% per trade", "Never let one trade lose more than ~1% of your account. This alone keeps you alive."],
    ["📝", "Plan before you click", "Know your entry, stop, and target in advance — no improvising."],
    ["🧠", "Master your mind", "Don't chase, don't revenge-trade. The Coach tab trains exactly this."],
    ["📓", "Journal everything", "You can't improve what you don't measure. My Trades does it for you."],
  ];

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "8px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <Card accent={C.accent}>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6 }}>🚀 Start Here</div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
          You don't need to be a genius to trade — you need a <strong style={{ color: C.text }}>process</strong> and <strong style={{ color: C.text }}>discipline</strong>.
          This platform already gives you everything a real trader uses. Below is what each part is for, and exactly what to do each day.
        </div>
        <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 13, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.55 }}>
          ⚠️ <strong>The one rule that matters most:</strong> stay on <strong>paper money</strong> (practice mode) until your <em>My Trades</em> Performance panel shows a real edge over <strong>20+ trades</strong>. Only then think about real money. This isn't me being cautious — it's what every pro tells beginners.
        </div>
      </Card>

      {/* The 5 tools */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, margin: "4px 2px 10px", letterSpacing: "0.04em" }}>🧰 THE 5 TOOLS EVERY TRADER USES (and where they live here)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {stack.map(s => (
            <Card key={s.job}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, marginBottom: 6 }}>{s.icon} {s.job}</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5, marginBottom: 8 }}>{s.what}</div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic", marginBottom: 10 }}>{s.real}</div>
              <Jump to={s.to}>{s.btn}</Jump>
            </Card>
          ))}
        </div>
      </div>

      {/* Daily workflow */}
      <Card>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, marginBottom: 12, letterSpacing: "0.04em" }}>📅 YOUR DAILY WORKFLOW (do these in order)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {flow.map(([icon, title, desc, to], i) => (
            <div key={title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < flow.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, width: 22, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.text }}>{title}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.45 }}>{desc}</div>
              </div>
              <button onClick={go(to)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, flexShrink: 0 }}>open</button>
            </div>
          ))}
        </div>
      </Card>

      {/* Golden rules */}
      <Card accent={C.green}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.green, marginBottom: 4, letterSpacing: "0.04em" }}>⭐ THE 80% NOBODY TELLS YOU</div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5, marginBottom: 12 }}>Tools are only ~20% of trading. These four habits are the other 80% — they decide who survives.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {rules.map(([icon, t, d]) => (
            <div key={t} style={{ display: "flex", gap: 10 }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{t}</div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Next steps */}
      <Card>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, marginBottom: 10, letterSpacing: "0.04em" }}>👉 GO DEEPER</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Jump to="propath">Follow the Pro Path</Jump>
          <Jump to="courses">Take the Academy course</Jump>
          <Jump to="coach">Train your mindset (Coach)</Jump>
          <Jump to="options-edu">Learn Options 101</Jump>
        </div>
      </Card>

      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, textAlign: "center", padding: "4px 0 12px" }}>
        Educational content — not financial advice. Practice on paper until your numbers prove you have an edge.
      </div>
    </div>
  );
}
