import { useState, useEffect } from "react";

// Daily Target Calculator — pure math, no AI, no recommendation engine.
// Answers one honest question: given a real account size and a real (or
// assumed) win rate / win:loss ratio, how many trades per day would a
// stated profit target actually require? Auto-fills from the same real
// /api/alpaca/account + /api/alpaca/closed-trades data PerformanceCard
// (terminal-panels.jsx) already computes win rate / profit factor from —
// not a second data source, just reused for a different question. All
// inputs stay editable so the user can stress-test "what if my edge were
// X" scenarios too. Deliberately shows the honest, sometimes unflattering
// answer (e.g. "you'd need 40 trades/day") rather than a feel-good number.
export default function DailyTargetCalculator({ C, MONO, SANS }) {
  const [equity, setEquity] = useState(null);
  const [realStats, setRealStats] = useState(null); // { n, winRate, avgWin, avgLoss }
  const [loadState, setLoadState] = useState("loading"); // loading | ok | nokey | error

  const [targetDaily, setTargetDaily] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);
  const [winRate, setWinRate] = useState(50);
  const [winLossRatio, setWinLossRatio] = useState(2);

  useEffect(() => {
    Promise.all([
      fetch("/api/alpaca/account").then(r => r.json()).catch(() => null),
      fetch("/api/alpaca/closed-trades").then(r => r.json()).catch(() => null),
    ]).then(([acctRes, tradesRes]) => {
      if (acctRes?.reason === "no-alpaca-key") { setLoadState("nokey"); return; }
      if (acctRes?.ok && acctRes.account) { setEquity(Number(acctRes.account.equity) || 0); }
      const trades = Array.isArray(tradesRes?.trades) ? tradesRes.trades : [];
      const n = trades.length;
      if (n >= 5) {
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const rWinRate = Math.round((wins.length / n) * 100);
        const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
        setRealStats({ n, winRate: rWinRate, avgWin, avgLoss });
        setWinRate(rWinRate);
        if (avgLoss > 0) setWinLossRatio(Math.round((avgWin / avgLoss) * 100) / 100);
      }
      setLoadState("ok");
    }).catch(() => setLoadState("error"));
  }, []);

  const eq = equity != null ? equity : 25000; // honest fallback if no live account — clearly labeled as an assumption below
  const dollarRisk = eq * (riskPct / 100);
  const wr = Math.min(99, Math.max(1, winRate)) / 100;
  const expectancyR = wr * winLossRatio - (1 - wr) * 1;
  const dollarExpectancy = expectancyR * dollarRisk;
  const tradesPerDay = dollarExpectancy > 0 ? targetDaily / dollarExpectancy : null;
  const targetPctOfAccount = eq > 0 ? (targetDaily / eq) * 100 : 0;

  const pctFlag = targetPctOfAccount < 1
    ? { label: "Plausible for a skilled trader", color: C.green }
    : targetPctOfAccount < 3
    ? { label: "Very aggressive — high variance", color: C.amber }
    : { label: "Unsustainable long-term — gambling-territory risk", color: C.red };

  const field = (label, value, onChange, opts = {}) => (
    <div style={{ flex: "1 1 130px" }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {opts.prefix && <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{opts.prefix}</span>}
        <input type="number" value={value} min={opts.min} max={opts.max} step={opts.step || 1}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: "100%", fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.text }} />
        {opts.suffix && <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{opts.suffix}</span>}
      </div>
    </div>
  );

  if (loadState === "loading") {
    return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>Loading…</div>;
  }

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>
        🎯 DAILY TARGET CALCULATOR
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.5, marginBottom: 12 }}>
        Pure math, no AI — back-calculates how many trades/day a profit target actually requires, given your real (or assumed) win rate and win:loss ratio.
      </div>

      {loadState === "nokey" && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.amber, marginBottom: 10 }}>
          No brokerage connected — using a placeholder $25,000 account. Connect Alpaca for your real equity.
        </div>
      )}
      {realStats ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 10 }}>
          Win rate / win:loss ratio pre-filled from your real {realStats.n} closed trades — edit either to test other scenarios.
        </div>
      ) : loadState === "ok" && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.amber, marginBottom: 10 }}>
          Not enough closed-trade history yet (need 5+) — win rate/ratio below are placeholder assumptions, not real stats. Edit them to match your real trading if you know it.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {field("TARGET / DAY", targetDaily, setTargetDaily, { prefix: "$", min: 0, step: 50 })}
        {field("RISK / TRADE", riskPct, setRiskPct, { suffix: "%", min: 0.1, max: 10, step: 0.1 })}
        {field("WIN RATE", winRate, setWinRate, { suffix: "%", min: 1, max: 99, step: 1 })}
        {field("WIN:LOSS RATIO", winLossRatio, setWinLossRatio, { suffix: "R", min: 0.1, max: 10, step: 0.1 })}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Account (real{equity == null ? ", or assumed" : ""})</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>${eq.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>$ risked per trade</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>${dollarRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Expectancy per trade</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: dollarExpectancy >= 0 ? C.green : C.red }}>
            {expectancyR >= 0 ? "+" : ""}{expectancyR.toFixed(2)}R (${dollarExpectancy >= 0 ? "+" : ""}{dollarExpectancy.toFixed(0)})
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, paddingTop: 6, borderTop: `1px solid ${C.border}55` }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>Trades/day needed</span>
          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: tradesPerDay == null ? C.red : tradesPerDay <= 5 ? C.green : tradesPerDay <= 15 ? C.amber : C.red }}>
            {tradesPerDay == null ? "Never — negative edge" : tradesPerDay.toFixed(1)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Target as % of account/day</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pctFlag.color }}>{targetPctOfAccount.toFixed(2)}%</span>
        </div>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 11.5, color: pctFlag.color, fontWeight: 700, marginBottom: 4 }}>
        {pctFlag.label}
      </div>
      {dollarExpectancy < 0 && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.red, lineHeight: 1.5 }}>
          At this win rate and win:loss ratio, every trade loses money on average — no number of trades/day gets you to the target. Fix the edge (higher win rate or bigger win:loss ratio) before scaling size or frequency.
        </div>
      )}
      {dollarExpectancy >= 0 && tradesPerDay != null && tradesPerDay > 15 && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          {tradesPerDay.toFixed(0)} trades/day is overtrading territory for most discretionary approaches — raising risk/trade or improving the edge gets there with fewer, better trades.
        </div>
      )}
    </div>
  );
}
