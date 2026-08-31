// CurblineTab.jsx — Curbline AI concept preview, explicit user request
// (2026-08-31: "Project making money from home using ai" -> chose "a new
// AI-powered side business" -> "TAB INSIDE MY PLATFORM"). This is a static
// concept/pitch page for a productized version of Car Business's Facebook
// Ad Maker, sold to other independent dealers. Not wired to any backend —
// there is no multi-tenant auth/billing built yet, so nothing here calls an
// API. The CTA is an honest mailto: link, never a fake signup form.

function Section({ C, SANS, title, tag, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, margin: 0, color: C.text }}>{title}</h2>
        {tag && <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 0.6, color: C.textDim, textTransform: "uppercase" }}>{tag}</span>}
      </div>
      {children}
    </section>
  );
}

function ComparePanel({ C, MONO, SANS, label, time, timeTone, title, body, good }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: good ? `3px solid ${C.accent}` : `3px solid ${C.border}`,
      borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 240,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5, color: good ? C.accent : C.textDim }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 7px", borderRadius: 4, color: timeTone, background: `${timeTone}18` }}>{time}</span>
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: C.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: good ? C.textSec : C.textDim, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function SpecRow({ C, MONO, SANS, label, title, body }) {
  return (
    <div style={{ display: "flex", borderTop: `1px solid ${C.border}`, minHeight: 0 }}>
      <div style={{
        width: 150, flexShrink: 0, fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase",
        color: C.accent, background: C.surface || C.bg, padding: "14px 14px", borderRight: `1px solid ${C.border}`,
      }}>{label}</div>
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: C.text, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}

export default function CurblineTab({ C, MONO, SANS }) {
  const mailBody = encodeURIComponent("Dealership name:\nState/city:\nApprox. inventory size:");
  const mailHref = `mailto:ed.dixiemotors@gmail.com?subject=${encodeURIComponent("Curbline AI — early access")}&body=${mailBody}`;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>
        Concept preview — not a live product yet
      </div>
      <h1 style={{ fontFamily: SANS, fontWeight: 900, fontSize: 30, letterSpacing: -0.5, margin: "0 0 12px", color: C.text }}>
        📣 Curbline <span style={{ color: C.accent }}>AI</span>
      </h1>
      <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, maxWidth: 640, marginBottom: 24 }}>
        Paste a CarFax, get a ready-to-post Facebook ad in under a minute — grounded in a real dealership's
        info, not a fill-in-the-blank template. A productized version of Car Business's Facebook Ad Maker,
        built out of Dixie Motors' own internal tools, for other independent dealers to use on their own lots.
      </p>

      <Section C={C} SANS={SANS} title="A real example" tag="Same tool used on Car Business's Ad Maker">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ComparePanel
            C={C} MONO={MONO} SANS={SANS}
            label="Written the old way" time="~20 min" timeTone={C.red}
            title="2021 Toyota Tacoma for sale"
            body={`Nice truck for sale! 2021 Toyota Tacoma SR5 4x4. Low miles, clean, must see! Priced to sell fast. Call or message for more info. Won't last long!!`}
          />
          <ComparePanel
            C={C} MONO={MONO} SANS={SANS}
            label="Written by Curbline" time="~30 sec" timeTone={C.green} good
            title="2021 Toyota Tacoma SR5 4×4 — one owner, still under factory warranty"
            body={`38,500 miles, clean CarFax, one owner from new. Leather seats, sunroof, tow package, new tires. $29,900. Financing available, trades welcome. Text "TACOMA" to book a test drive.`}
          />
        </div>
      </Section>

      <Section C={C} SANS={SANS} title="Built on a real lot, not a pitch deck">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 8, fontStyle: "italic" }}>
            "I built this to write my own inventory's Facebook ads faster — CarFax in, ready-to-post ad out.
            Before opening it up to other dealers, I'm running it on my own lot first."
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>— Ed, owner, Dixie Motors</div>
        </div>
      </Section>

      <Section C={C} SANS={SANS} title="Standard equipment" tag="What's in every plan">
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <SpecRow C={C} MONO={MONO} SANS={SANS} label="Ad Maker" title="CarFax in, finished ad out"
            body="Paste a CarFax report or fill in year/make/model/trim/mileage/price by hand. Get a complete, ready-to-post Facebook ad built from the actual vehicle, not a generic template." />
          <SpecRow C={C} MONO={MONO} SANS={SANS} label="Lead Strategy" title="A real posting playbook, not just one-off ads"
            body="What to post, and when, to keep leads coming in between vehicle ads — grounded in research on what's actually working for lead generation right now." />
          <SpecRow C={C} MONO={MONO} SANS={SANS} label="Dealer Info" title="Every output grounded in your real dealership"
            body="Contact details, financing terms, and content rules set once and used everywhere — nothing generated ever reads like a template with your name stapled on." />
        </div>
      </Section>

      <Section C={C} SANS={SANS} title="Pricing" tag="One plan, no tiers to decode">
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>
              Curbline / monthly
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 17, marginBottom: 8, color: C.text }}>Full Lot Access</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12.5, color: C.textSec, lineHeight: 2 }}>
              <li>— Unlimited Ad Maker generations</li>
              <li>— Weekly Lead Strategy playbook</li>
              <li>— One Dealer Info profile, unlimited edits</li>
            </ul>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, color: C.accent, fontVariantNumeric: "tabular-nums" }}>$99</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>/ month, per dealership</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, maxWidth: 180 }}>A single agency-written ad often costs more than this per month</div>
          </div>
        </div>
      </Section>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 22px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ maxWidth: 480 }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.red,
            border: `1px solid ${C.red}66`, background: `${C.red}18`, padding: "3px 8px", borderRadius: 4, display: "inline-block", marginBottom: 10,
          }}>● Not live yet</span>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, color: C.text, marginBottom: 6 }}>This page is a concept preview.</div>
          <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.6 }}>
            Curbline is running internally on one real dealership's inventory right now. If you run an
            independent lot and want early access when it opens up to outside dealers, say so — this doesn't
            sign you up for anything or store anything anywhere.
          </div>
        </div>
        <div>
          <a href={mailHref} style={{
            fontFamily: SANS, fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 6,
            background: C.accent, color: "#fff", textDecoration: "none", display: "inline-block",
          }}>Email for early access</a>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 8, maxWidth: 180 }}>
            Opens your email client — nothing is submitted from this page.
          </div>
        </div>
      </div>
    </div>
  );
}
