import { useEffect, useState } from "react";
import { Badge } from "./ui-atoms.jsx";

// ── Integrations — "AM Trading — Final Trading Logic Redesign" spec
// (explicit user request, 2026-08-19): "Settings → Integrations... Then
// they quietly feed information into the platform." Real status only —
// Broker (Alpaca) and AI Provider (Anthropic) report their actual real
// configured state; GoCharting (order-flow confirmation) and TakeProfit
// (alert bridge) are honestly reported not-connected, since neither has
// any real API key, webhook, or account access anywhere in this app yet
// (confirmed via repo search before building this). No fake "Connected"
// badge, no config input that would silently do nothing — connecting
// those two for real is a later step once real credentials exist.
function Row({ C, MONO, SANS, name, connected, note }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{name}</div>
        {note && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 3, maxWidth: 480 }}>{note}</div>}
      </div>
      <Badge color={connected ? C.green : C.textDim}>{connected ? "CONNECTED" : "NOT CONNECTED"}</Badge>
    </div>
  );
}

export default function IntegrationsTab({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/integrations").then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (!j.ok) { setState("error"); return; }
      setData(j);
      setState("ok");
    }).catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ padding: "8px 4px", maxWidth: 700, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4 }}>Integrations</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 14 }}>
        AM Trading stays the one place you operate — these connect quietly in the background. Real status only, nothing here is simulated.
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load integration status.</div>}
      {state === "ok" && data && (
        <>
          <Row C={C} MONO={MONO} SANS={SANS} name={`Broker — ${data.broker.name}`} connected={data.broker.connected}
            note={data.broker.connected ? "Real paper-trading execution is live." : "Set ALPACA_KEY_ID / ALPACA_SECRET_KEY on the server to connect."} />
          <Row C={C} MONO={MONO} SANS={SANS} name={`AI Provider — ${data.aiProvider.name}`} connected={data.aiProvider.connected}
            note={data.aiProvider.connected ? "Real AI features (Cortex, Coach, research) are live." : "Set ANTHROPIC_API_KEY on the server to connect."} />
          <Row C={C} MONO={MONO} SANS={SANS} name="GoCharting" connected={data.goCharting.connected} note={data.goCharting.note} />
          <Row C={C} MONO={MONO} SANS={SANS} name="TakeProfit" connected={data.takeProfit.connected} note={data.takeProfit.note} />
        </>
      )}
    </div>
  );
}
