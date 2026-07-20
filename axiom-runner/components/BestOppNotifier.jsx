import { useEffect, useRef } from "react";
import { computeRegime, computeAPlusScore } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";

// Background watcher for "new GO setup" browser notifications — mounted
// unconditionally at the app's top level (same pattern as AutoPilotEngine)
// so it keeps checking every 5 minutes no matter which tab is open.
// Previously this notification lived entirely inside the BestOpportunities
// component itself, so it silently stopped firing the instant the user
// left the Best Opportunities tab — same "mount-scoped alert system" bug
// class already fixed for athan (2026-07-20, user request: "check other
// tabs for similar issues"). BestOpportunities keeps its own local scan
// for rendering the visible list + the "NEW" badge highlight; this owns
// only the actual notification, so there's one alert, not two.
export default function BestOppNotifier({ macroData }) {
  const seenGo = useRef(new Set());
  const regimeRef = useRef(computeRegime(macroData));
  useEffect(() => { regimeRef.current = computeRegime(macroData); }, [macroData]);

  useEffect(() => {
    const isGo = (r) => r.verdict === "GO" || (r.atBuyPoint && r.volConfirmed);
    const check = () => {
      if (localStorage.getItem("bestopp_notify") !== "on") return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
        .then(r => r.json())
        .then(j => {
          const res = (j.results || []).filter(r =>
            !r.error && Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70);
          const top = res.map(r => ({ ...r, _aplus: computeAPlusScore(r, regimeRef.current) }))
            .sort((a, b) => b._aplus.score - a._aplus.score).slice(0, 5);
          const newGo = [];
          top.forEach(r => { if (isGo(r) && !seenGo.current.has(r.symbol)) { seenGo.current.add(r.symbol); newGo.push(r.symbol); } });
          if (newGo.length) {
            try { new Notification("🎯 New buy-point: " + newGo.join(", "), { body: "A new GO setup just appeared in Best Opportunities." }); } catch {}
          }
        })
        .catch(() => {});
    };
    const kick = setTimeout(check, 4000);
    const t = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []);

  return null;
}
