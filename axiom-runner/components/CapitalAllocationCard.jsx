import { useState, useEffect } from "react";
import DonutChart from "./DonutChart.jsx";

// ── Capital Allocation — real cash vs. deployed split from the same
// /api/alpaca/account endpoint PortfolioSnapshotCard already calls (a
// second independent fetch of the same cheap endpoint, same pattern
// ActivePositionsCard already uses for /api/alpaca/positions). Deliberately
// NOT a recommendation engine ("deploy X% more") — that would require
// fabricating a target allocation this app has no real basis for. This
// shows what's actually allocated right now, honestly.
export default function CapitalAllocationCard({ C, MONO, SANS }) {
  const [acct, setAcct] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/account").then(r => r.json()).then(d => {
        if (d?.reason === "no-alpaca-key") { setState("nokey"); return; }
        if (!d?.ok) { setState("error"); return; }
        setAcct(d.account); setState("ok");
      }).catch(() => setState("error"));
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (state === "nokey") return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>No brokerage connected.</div>;
  if (state === "loading") return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>Connecting…</div>;
  if (state === "error" || !acct) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, textAlign: "center", padding: 20 }}>Couldn't load account.</div>;

  const equity = Number(acct.equity) || 0;
  const cash = Math.max(0, Number(acct.cash) || 0);
  const deployed = Math.max(0, equity - cash);
  const deployedPct = equity > 0 ? (deployed / equity) * 100 : 0;

  return (
    <div style={{ textAlign: "center" }}>
      <DonutChart C={C} MONO={MONO}
        centerLabel="DEPLOYED" centerValue={`${deployedPct.toFixed(0)}%`}
        segments={[{ label: "Deployed", value: deployed, color: C.gold }, { label: "Cash", value: cash, color: C.accent }]}
        size={150} />
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 6 }}>
        ${deployed.toLocaleString(undefined, { maximumFractionDigits: 0 })} deployed · ${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })} cash
      </div>
    </div>
  );
}
