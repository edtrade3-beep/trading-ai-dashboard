import { useState } from "react";

// ZakatEducation.jsx — Islamic tab Phase 2 (2026-09-10, spec §26 "LEARN
// ABOUT ZAKAT"). 14 short, plain-language topic cards — no Islamic
// finance background assumed, matching the calculator's own "never make
// the user look up a term" rule. Each explanation is deliberately a few
// sentences, not a full fatwa — this is orientation, not scholarship; the
// calculator's own disclaimer already points people to a qualified
// scholar for anything genuinely disputed.

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const TOPICS = [
  { t: "What is Zakat?", body: "Zakat is one of the Five Pillars of Islam — a mandatory act of worship where eligible Muslims give a fixed share (usually 2.5%) of their qualifying wealth each year to those in need." },
  { t: "Who must pay Zakat?", body: "An adult Muslim of sound mind whose net qualifying wealth has reached the Nisab threshold and stayed there for about one lunar year (Haul)." },
  { t: "What is Nisab?", body: "The minimum amount of wealth you must have before Zakat becomes obligatory — measured as the value of 85 grams of gold or 595 grams of silver. Below this, no Zakat is due." },
  { t: "What is Haul?", body: "The requirement that your qualifying wealth stays at or above Nisab for roughly one full lunar year (about 354 days) before Zakat is due on it." },
  { t: "Gold & Silver", body: "Gold and silver you own — coins, bars, or jewelry depending on the scholarly view you follow — are directly Zakatable at their current market value." },
  { t: "Cash", body: "Money in checking and savings accounts, cash on hand, and digital wallet balances all count toward your Zakatable wealth at their full value." },
  { t: "Stocks", body: "Shares are commonly treated based on intent: shares held for trading are usually Zakatable at full market value, while long-term holdings may be assessed differently depending on the methodology you follow." },
  { t: "Cryptocurrency", body: "Most contemporary scholars treat cryptocurrency similarly to cash or tradable commodities — Zakatable at its current market value — though this is a newer area with evolving scholarly opinion." },
  { t: "Business Inventory", body: "Goods a business holds for resale are Zakatable at their current value. Buildings, equipment, and vehicles the business uses to operate — rather than sell — are generally not." },
  { t: "Real Estate", body: "Your own home is not Zakatable. Property held purely as an investment for resale, or the rental income it produces, generally is — the tax treatment depends heavily on your intent for the property." },
  { t: "Debt", body: "Short-term debts and bills currently due can typically be deducted from your Zakatable wealth. Long-term debt (like a mortgage) is more disputed — some approaches deduct only what's due this year, not the full balance." },
  { t: "Retirement Accounts", body: "401(k)s, IRAs, and pensions raise real questions about ownership and access before retirement age. Scholarly approaches differ meaningfully here — many calculators (including this one) leave the choice to you." },
  { t: "Zakat vs Sadaqah", body: "Zakat is an obligatory, calculated amount due under specific conditions. Sadaqah is voluntary charity — any amount, given any time, for any good reason — with no minimum or formula." },
  { t: "Who can receive Zakat?", body: "The Quran (9:60) names eight eligible categories, including the poor, the needy, those in debt, and travelers in need — traditionally interpreted by scholars ever since to guide real-world distribution." },
];

export default function ZakatEducation() {
  const [open, setOpen] = useState(null);
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 900, color: GREEN_DARK, marginBottom: 4 }}>Learn About Zakat</div>
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: TEXT_DIM, marginBottom: 14 }}>Plain-language answers — no Islamic finance background needed.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {TOPICS.map((topic, i) => {
          const isOpen = open === i;
          return (
            <div key={topic.t} onClick={() => setOpen(isOpen ? null : i)}
              style={{ background: CARD, border: `1px solid ${isOpen ? GREEN : BORDER}`, borderRadius: 12, padding: 14, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: TEXT }}>{topic.t}</div>
                <span style={{ color: GREEN, fontSize: 13 }}>{isOpen ? "▲" : "▾"}</span>
              </div>
              {isOpen && <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, lineHeight: 1.55, marginTop: 8 }}>{topic.body}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
