import CommandSearchPanel from "./CommandSearchPanel.jsx";

// SearchTab — standalone sidebar destination (2026-09-09, explicit user
// request: "i want it as a tab underneath dealership"). Thin wrapper
// around CommandSearchPanel.jsx (Trade Desk's own real search + tiered
// Opportunity Inbox), which is already self-contained — it fetches its
// own /api/market/opportunities + /api/market/lightbox reads and only
// needs a place to send a selected symbol. Reuses openInTradeDesk (the
// same real handoff LightBoxTab/TradeNavigatorTab already use: sets
// mterminal_load_sym + lightbox_handoff_opportunity in localStorage, then
// switches to Trade Desk) rather than inventing a second handoff path.
export default function SearchTab({ C, MONO, SANS, openInTradeDesk }) {
  return (
    <div style={{ padding: "8px 4px", maxWidth: 640 }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>🔎 SEARCH</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 14 }}>
        Find a ticker or jump into today's ranked opportunities — picking one opens it in Trade Desk.
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, minHeight: 480 }}>
        <CommandSearchPanel symbol={null} onSelectSymbol={openInTradeDesk} onOpenDaytrade={openInTradeDesk} C={C} MONO={MONO} SANS={SANS} />
      </div>
    </div>
  );
}
