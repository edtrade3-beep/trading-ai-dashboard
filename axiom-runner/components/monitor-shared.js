// Shared helpers for the MONITOR dashboard widget cluster — risk-light
// alert sound/vibration/speech, used by both RiskTrafficLight and
// FedInterpreter.
export function riskBuzz(light) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq, start, dur, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(vol || 0.25, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
    };
    if (light === "GREEN") {            // RISK ON  → cheerful rising two-tone "ding-ding ↑"
      beep(660, 0, 0.18, "sine", 0.28); beep(990, 0.18, 0.30, "sine", 0.28);
    } else if (light === "YELLOW") {    // CAUTION  → two flat equal mid beeps "beep–beep"
      beep(740, 0, 0.16, "triangle", 0.24); beep(740, 0.24, 0.16, "triangle", 0.24);
    } else {                            // RISK OFF → urgent alarm, alternating high/low x5
      for (let i = 0; i < 5; i++) beep(i % 2 ? 500 : 940, i * 0.16, 0.13, "square", 0.30);
    }
  } catch {}
}
export function riskVibrate(light) {
  if (!navigator.vibrate) return;
  navigator.vibrate(light === "GREEN" ? 100 : light === "YELLOW" ? [100, 100, 100] : [300, 200, 300, 200, 500]);
}
// Speak the market mode out loud using the browser's built-in voice.
export function speakRisk(phrase) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = 0.95; u.pitch = 1; u.volume = 1; u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}
export const RISK_SPEAK = { GREEN: "Risk on. Buyers in control.", YELLOW: "Caution. Mixed signals, reduce size.", RED: "Risk off. Protect capital." };
