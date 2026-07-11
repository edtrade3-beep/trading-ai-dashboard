import { riskBuzz, riskVibrate, speakRisk, RISK_SPEAK } from "./monitor-shared.js";

const RISK_SYMS = ["SPY", "QQQ", "VIXY", "TLT", "UUP", "HYG"];
export default function RiskTrafficLight({ C, MONO, SANS, macroData }) {
  const [soundOn, setSoundOn] = React.useState(() => localStorage.getItem("axiom_risklight_sound") === "on");
  // ── Fast self-poll (every 15s) straight off our own quote engine — no TradingView needed ──
  const [fast, setFast] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/market/quote?symbols=${RISK_SYMS.join(",")}`)
      .then(r => r.json()).then(arr => { if (alive && Array.isArray(arr) && arr.length) setFast(arr); }).catch(() => {});
    load();
    const t = setInterval(load, 15000); // 15s — fast panic detection
    return () => { alive = false; clearInterval(t); };
  }, []);
  const src = (fast && fast.length) ? fast : (macroData || []);
  const v = sym => Number(src.find(m => m.symbol === sym)?.changesPercentage || 0);
  const has = src.some(m => m.symbol === "SPY");
  const spy = v("SPY"), qqq = v("QQQ"), vixy = v("VIXY"), tlt = v("TLT"), uup = v("UUP"), hyg = v("HYG");
  let score = 50 + spy * 8 + qqq * 6 - vixy * 3 + tlt * 2 - uup * 3 + hyg * 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  // Hysteresis: the light is "sticky" — it needs a clear 5-point cross to flip, so a score
  // wobbling around a threshold (e.g. 64↔65) doesn't flap the light and spam alerts.
  const prevLight = localStorage.getItem("axiom_risklight") || "YELLOW";
  let light;
  if (!has) light = "—";
  else if (score >= 65 || (prevLight === "GREEN" && score >= 60)) light = "GREEN";
  else if (score < 40 || (prevLight === "RED" && score < 45)) light = "RED";
  else light = "YELLOW";
  const cfg = { GREEN: { c: "#16a34a", icon: "🟢", title: "RISK ON", msg: "Fed supportive, liquidity improving, buyers in control", act: "Look for growth, AI, semis, small caps" },
    YELLOW: { c: "#e0982f", icon: "🟡", title: "CAUTION", msg: "Mixed signals — reduce size, wait for confirmation", act: "Protect profits · avoid chasing" },
    RED: { c: "#dc2626", icon: "🔴", title: "RISK OFF", msg: "Capital protection mode", act: "Reduce exposure · defensive · cash/hedges" },
    "—": { c: C.textDim, icon: "⚪", title: "LOADING", msg: "Waiting for market data…", act: "" } }[light];

  React.useEffect(() => {
    if (light === "—") return;
    const prev = localStorage.getItem("axiom_risklight");
    if (prev && prev !== light) {
      // Cooldown: at most one regime alert per 20 min, so a borderline market can't spam Telegram.
      const lastTg = Number(localStorage.getItem("axiom_risklight_tg_ts") || 0);
      if (Date.now() - lastTg > 20 * 60 * 1000) {
        localStorage.setItem("axiom_risklight_tg_ts", String(Date.now()));
        if (soundOn) { riskBuzz(light); speakRisk(RISK_SPEAK[light] || cfg.title); }  // distinct buzz + spoken
        const leaders = light === "GREEN" ? "NVDA · AMD · AVGO" : light === "RED" ? "defensive / cash" : "wait for confirmation";
        const tg = [`${cfg.icon} ${cfg.title}`, ``, cfg.msg, ``, `Risk Score: ${score}/100`,
          `SPY ${spy >= 0 ? "+" : ""}${spy.toFixed(2)}% · QQQ ${qqq >= 0 ? "+" : ""}${qqq.toFixed(2)}%`,
          `VIX ${vixy >= 0 ? "rising" : "falling"} · Dollar ${uup >= 0 ? "up" : "down"}`, ``, `Focus: ${leaders}`].join("\n");
        fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: tg }) }).catch(() => {});
      }
    }
    localStorage.setItem("axiom_risklight", light);
  }, [light]);

  // ── 🧠 PANIC DETECTOR — sudden VIX spike or SPY plunge fires an urgent alert (debounced 45m) ──
  React.useEffect(() => {
    if (!has) return;
    const panic = vixy > 8 || spy < -1.8;
    const last = Number(localStorage.getItem("axiom_panic_ts") || 0);
    if (panic && Date.now() - last > 45 * 60 * 1000) {
      localStorage.setItem("axiom_panic_ts", String(Date.now()));
      if (localStorage.getItem("axiom_risklight_sound") === "on") { riskBuzz("RED"); speakRisk("Panic. Risk shock. Protect capital now."); }
      riskVibrate("RED");
      const what = [vixy > 8 ? `VIX spiking +${vixy.toFixed(1)}%` : "", spy < -1.8 ? `SPY plunging ${spy.toFixed(2)}%` : ""].filter(Boolean).join(" · ");
      const msg = `🚨 *PANIC — RISK SHOCK*\n\n${what}\nDollar ${uup >= 0 ? "↑" : "↓"} · QQQ ${qqq >= 0 ? "+" : ""}${qqq.toFixed(2)}%\n\nProtect capital — reduce exposure, no fresh longs.`;
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
    }
  }, [spy, vixy, qqq, uup]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 12, padding: "14px 18px", borderRadius: 12,
      background: `${cfg.c}12`, border: `2px solid ${cfg.c}`, flexWrap: "wrap" }}>
      <div style={{ fontSize: 44, lineHeight: 1 }}>{cfg.icon}</div>
      <div style={{ minWidth: 150 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.1em" }}>MARKET MODE</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: cfg.c }}>{cfg.title}</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>{cfg.msg}</div>
      </div>
      <div style={{ flex: 1, minWidth: 160, alignSelf: "center" }}>
        {cfg.act && (<>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.1em" }}>PLAYBOOK</div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: cfg.c, marginTop: 2 }}>{cfg.act}</div>
        </>)}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[["RISK SCORE", `${light === "—" ? "—" : score}/100`, cfg.c], ["SPY", `${spy >= 0 ? "+" : ""}${spy.toFixed(2)}%`, spy >= 0 ? C.green : C.red],
          ["QQQ", `${qqq >= 0 ? "+" : ""}${qqq.toFixed(2)}%`, qqq >= 0 ? C.green : C.red], ["VIX", vixy >= 0 ? "↑ rising" : "↓ falling", vixy <= 0 ? C.green : C.red],
          ["DOLLAR", uup >= 0 ? "↑" : "↓", uup <= 0 ? C.green : C.red]].map(([l, val, col]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{l}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
        <div style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => { const nv = !soundOn; setSoundOn(nv); localStorage.setItem("axiom_risklight_sound", nv ? "on" : "off"); if (nv) { riskBuzz(light); speakRisk(RISK_SPEAK[light] || ""); } }}
            title="Play a distinct sound (+ spoken words) when the market mode flips. Telegram fires regardless."
            style={{ background: soundOn ? cfg.c : C.surface, color: soundOn ? "#fff" : C.textSec, border: `1px solid ${soundOn ? cfg.c : C.border}`, borderRadius: 7, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            {soundOn ? "🔊 SOUND ON" : "🔇 SOUND"}
          </button>
          {/* Preview each distinct sound */}
          {[["🟢", "GREEN"], ["🟡", "YELLOW"], ["🔴", "RED"]].map(([ico, lt]) => (
            <button key={lt} onClick={() => riskBuzz(lt)} title={`Preview the ${lt === "GREEN" ? "RISK ON" : lt === "YELLOW" ? "CAUTION" : "RISK OFF"} sound`}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, padding: "5px 7px", cursor: "pointer", lineHeight: 1 }}>
              {ico}▶
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
