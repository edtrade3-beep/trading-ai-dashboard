import { useState } from "react";
import { computeRegime, SECTOR_ETFS } from "./market-helpers.js";
import { RH_UNIVERSE, rhScore, rhScreen, rhMarkdown } from "./rhpro-shared.jsx";

export default function RhProApex({ C, MONO, SANS, macroData, sectorData }) {
  const [report, setReport] = useState(""); const [loading, setLoading] = useState(false); const [err, setErr] = useState(""); const [ranAt, setRanAt] = useState(null); const [phase, setPhase] = useState("");
  const generate = async () => {
    setLoading(true); setErr(""); setReport(""); setPhase("Scanning the market…");
    try {
      const results = await rhScreen(RH_UNIVERSE);
      const ranked = results.map(x => ({ ...x, score: rhScore(x) })).sort((a, b) => b.score - a.score).slice(0, 16);
      const syms = ranked.map(x => x.symbol);
      setPhase("Pulling live quotes + news…");
      const [quotes, news] = await Promise.all([
        fetch(`/api/market/quote?symbols=${syms.join(",")}`).then(r => r.json()).catch(() => []),
        fetch(`/api/market/news?tickers=${syms.slice(0, 6).join(",")}&limit=16`).then(r => r.json()).catch(() => []),
      ]);
      const qm = new Map((Array.isArray(quotes) ? quotes : []).map(q => [String(q.symbol || "").toUpperCase(), q]));
      const stocks = ranked.map(x => { const q = qm.get(x.symbol.toUpperCase()); return { symbol: x.symbol, price: x.price, chgPct: Number(q?.changesPercentage || 0), rvol: Number(x.volRatio || 0), score: x.score, passCount: x.passCount, rsRating: x.rsRating, stage: (x.stage || "").replace(/ —.*/, ""), atBuyPoint: !!x.atBuyPoint, entry: x.entry, stop: x.stop, target2: x.target2 }; });
      const newsArr = (Array.isArray(news) ? news : (news.news || news.articles || news.items || [])).map(n => ({ ticker: n.ticker || n.symbol || "", title: String(n.title || n.headline || "") })).filter(n => n.title).slice(0, 20);
      const regime = computeRegime(macroData);
      const sectors = SECTOR_ETFS.map(se => { const sd = (sectorData || []).find(x => (x.symbol || "").toUpperCase() === se.symbol); return { name: se.name, chg: Number(sd?.changesPercentage || 0) }; }).sort((a, b) => b.chg - a.chg);
      let fg = null; try { fg = await fetch("/api/market/feargreed").then(r => r.json()); } catch {}
      setPhase("APEX AI is analyzing (~25s)…");
      const r = await fetch("/api/market/apex-cio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regime: { score: regime.score, label: regime.label, factors: regime.factors, vixVal: regime.vixVal }, stocks, sectors, news: newsArr, fearGreed: fg ? (fg.value ?? fg.score ?? "") + " " + (fg.label || fg.rating || "") : "n/a" }) });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) { setErr("Server was busy generating (this briefing is heavy). Wait a few seconds and press generate again."); return; }
      const d = await r.json();
      if (d.ok) { setReport(d.report); setRanAt(new Date()); } else setErr(d.error || "error");
    } catch (e) { setErr(e.message); } finally { setLoading(false); setPhase(""); }
  };
  return (
    <div style={{ padding: "8px 4px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🧠 TRADE PRO AI</div>
        {ranAt && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>briefing {ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 14, lineHeight: 1.6 }}>An institutional CIO briefing over your live data — ranked longs/shorts, best trade of the day, sector rotation, risks, and a capital-first verdict. Honest by design: it flags the data it doesn't have (options/dark-pool/insider) and lowers confidence accordingly.</div>
      <button onClick={generate} disabled={loading} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "12px 26px", borderRadius: 10, border: "none", color: "#fff", background: loading ? C.textDim : "#a855f7", cursor: loading ? "default" : "pointer", marginBottom: 16 }}>{loading ? `⏳ ${phase}` : "🧠 GENERATE BRIEFING"}</button>
      {err && <div style={{ fontFamily: SANS, fontSize: 13, color: C.red, marginBottom: 10 }}>⚠ {err === "invalid x-api-key" ? "AI key rejected — update ANTHROPIC_API_KEY in Render." : err}</div>}
      {report && <div>{rhMarkdown(report, C, MONO, SANS)}</div>}
      <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Educational analysis only — no orders placed. Uses Fable (premium) — ~15¢ per briefing. Verify every level on a live chart before trading manually.</div>
    </div>
  );
}
