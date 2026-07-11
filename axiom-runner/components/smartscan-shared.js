// Map a Smart Scan signal to a BUY / WATCH / SELL zone.
export const smartScanZoneOf = (signal) =>
  (signal === "STRONG BUY" || signal === "BUY") ? "BUY" : signal === "WATCH" ? "WATCH" : signal === "AVOID" ? "SELL" : null;

// PDF for a Smart Scan zone (uses scanResults rows: ticker, quote, score, signal).
export function exportSmartScanZonePDF(rows, zone) {
  try {
    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) { alert("PDF engine still loading — try again in a second."); return; }
    const doc = new JsPDF();
    const now = new Date();
    const zc = zone === "BUY" ? [22, 163, 74] : zone === "SELL" ? [220, 38, 38] : [217, 119, 6];
    doc.setFontSize(17); doc.setTextColor(zc[0], zc[1], zc[2]);
    doc.text(`Smart Scan — ${zone} ZONE`, 14, 18);
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(`${rows.length} symbol${rows.length !== 1 ? "s" : ""} · generated ${now.toLocaleString()}`, 14, 25);
    let y = 36;
    const cols = [["Symbol", 14], ["Price", 40], ["Chg%", 64], ["Score", 90], ["Entry", 112], ["Stop", 138], ["Target", 164]];
    doc.setFontSize(9); doc.setTextColor(0, 0, 0); doc.setFont(undefined, "bold");
    cols.forEach(([h, x]) => doc.text(h, x, y));
    doc.setFont(undefined, "normal"); doc.setDrawColor(200, 200, 200); doc.line(14, y + 2, 196, y + 2);
    y += 8;
    if (!rows.length) { doc.setTextColor(120, 120, 120); doc.text("No symbols in this zone right now.", 14, y); }
    const money = (v) => (v > 0 ? "$" + Number(v).toFixed(2) : "-");
    rows.forEach((r) => {
      if (y > 282) { doc.addPage(); y = 20; }
      const px = Number(r.quote?.price || 0), chg = Number(r.quote?.changePercent || 0), ref = r.ref || {};
      doc.setTextColor(0, 0, 0); doc.text(String(r.ticker || ""), 14, y);
      doc.text(money(px), 40, y);
      doc.setTextColor(chg >= 0 ? 22 : 220, chg >= 0 ? 163 : 38, chg >= 0 ? 74 : 38);
      doc.text((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", 64, y);
      doc.setTextColor(0, 0, 0);
      doc.text(String(Math.round(r.score || 0)), 90, y);
      doc.setTextColor(37, 99, 235); doc.text(money(ref.e1), 112, y);
      doc.setTextColor(220, 38, 38); doc.text(money(ref.stop), 138, y);
      doc.setTextColor(22, 163, 74); doc.text(money(ref.trigger), 164, y);
      y += 6.5;
    });
    doc.save(`smartscan-${zone.toLowerCase()}-zone-${now.toISOString().slice(0, 10)}.pdf`);
  } catch (e) { alert("PDF export failed: " + e.message); }
}
