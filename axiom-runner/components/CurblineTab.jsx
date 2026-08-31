// CurblineTab.jsx — Curbline AI concept preview, explicit user request
// (2026-08-31: "Project making money from home using ai" -> chose "a new
// AI-powered side business" -> "TAB INSIDE MY PLATFORM"). This is a static
// concept/pitch page for a productized version of Car Business's Facebook
// Ad Maker, sold to other independent dealers. The pitch content itself is
// not wired to any backend — there is no multi-tenant auth/billing built
// yet — and the CTA is an honest mailto: link, never a fake signup form.
//
// The Curbline Intel section below IS live: a daily 8:30 AM ET deep-scan
// of the actual dealer-marketing-SaaS market (explicit follow-up request,
// same day: "I WANT LIKE IDEAS BUISNESS SIDE UPDATE 8:30 EVERY MORNING
// DEEP SCAN DEEP ANALYSIS", scope narrowed via AskUserQuestion to
// "Curbline's market specifically"). Same real GET/POST-refresh shape as
// MarketWrapTab.jsx's LiveWrap — src/curbline-intel-ai.js is the one real
// AI chokepoint, this only renders what it returns.

import { useState, useEffect, useCallback } from "react";

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

function CompetitorRow({ C, MONO, SANS, c }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", minWidth: 0, overflow: "hidden" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: C.text, lineHeight: 1.4, overflowWrap: "break-word" }}>{c.name}</div>
      {c.pricingNote && <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 3, lineHeight: 1.5, overflowWrap: "break-word" }}>{c.pricingNote}</div>}
      {c.whatTheyDo && <div style={{ fontSize: 11.5, color: C.textSec, marginTop: 6, lineHeight: 1.5, overflowWrap: "break-word" }}>{c.whatTheyDo}</div>}
      {(c.strength || c.weakness) && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {c.strength && <div style={{ fontSize: 11, color: C.green, lineHeight: 1.5, overflowWrap: "break-word" }}>+ {c.strength}</div>}
          {c.weakness && <div style={{ fontSize: 11, color: C.red, lineHeight: 1.5, overflowWrap: "break-word" }}>− {c.weakness}</div>}
        </div>
      )}
    </div>
  );
}

function IdeaRow({ C, SANS, label, reason, tone }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${tone}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, color: C.text }}>{label}</div>
      {reason && <div style={{ fontSize: 11.5, color: C.textSec, marginTop: 4, lineHeight: 1.5 }}>{reason}</div>}
    </div>
  );
}

function LiveIntel({ C, MONO, SANS }) {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/curbline-intel").then((r) => r.json())
      .then((d) => { if (d.ok) setIntel(d.intel); else setError(d.error || "Failed to load Curbline Intel."); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = () => {
    setRefreshing(true); setError(null);
    fetch("/api/curbline-intel/refresh", { method: "POST" }).then((r) => r.json())
      .then((d) => { if (d.ok) setIntel(d.intel); else setError(d.error || "Refresh failed."); })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  return (
    <Section C={C} SANS={SANS} title="Curbline Intel" tag="Daily · 8:30 AM ET market scan">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={refresh} disabled={refreshing} style={{
          fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: "7px 13px", borderRadius: 7,
          border: `1px solid ${C.accent}`, background: refreshing ? C.card : C.accent, color: refreshing ? C.accent : "#fff",
          cursor: refreshing ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{refreshing ? "Scanning…" : "↻ Refresh"}</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: C.textDim }}>Loading Curbline Intel…</div>}
      {!loading && error && <div style={{ fontSize: 13, color: C.red, background: `${C.red}18`, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!loading && !error && !intel && (
        <div style={{ fontSize: 13, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          No scan generated yet. This runs automatically once a day (8:30 AM ET), or click "Refresh" to generate one now.
          {" "}Requires <code>ANTHROPIC_API_KEY</code> to be configured.
        </div>
      )}

      {!loading && intel && (
        <>
          {intel.marketSummary && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              {intel.marketSummary}
            </div>
          )}

          {intel.competitors?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Real competitors found</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {intel.competitors.map((c, i) => <CompetitorRow key={i} C={C} MONO={MONO} SANS={SANS} c={c} />)}
              </div>
            </div>
          )}

          {(intel.dealerAdSpend?.note || intel.pricingRecommendation?.note) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginBottom: 16 }}>
              {intel.dealerAdSpend?.note && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 6 }}>Real dealer ad spend</div>
                  {intel.dealerAdSpend.typicalMonthlyRange && <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 5 }}>{intel.dealerAdSpend.typicalMonthlyRange}</div>}
                  <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.55 }}>{intel.dealerAdSpend.note}</div>
                </div>
              )}
              {intel.pricingRecommendation?.note && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 6 }}>$99/mo positioning</div>
                  {intel.pricingRecommendation.suggestedPrice && <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.accent, marginBottom: 5 }}>{intel.pricingRecommendation.suggestedPrice}</div>}
                  <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.55 }}>{intel.pricingRecommendation.note}</div>
                </div>
              )}
            </div>
          )}

          {(intel.opportunities?.length > 0 || intel.risks?.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
              {intel.opportunities?.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: 0.5, marginBottom: 8 }}>OPPORTUNITIES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {intel.opportunities.map((o, i) => <IdeaRow key={i} C={C} SANS={SANS} label={o.idea} reason={o.reason} tone={C.green} />)}
                  </div>
                </div>
              )}
              {intel.risks?.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, letterSpacing: 0.5, marginBottom: 8 }}>RISKS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {intel.risks.map((r, i) => <IdeaRow key={i} C={C} SANS={SANS} label={r.risk} reason={r.reason} tone={C.red} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {intel.watchFor?.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 6 }}>Watch for next scan</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {intel.watchFor.map((w, i) => <li key={i} style={{ fontSize: 11.5, color: C.textSec, marginBottom: 3 }}>{w}</li>)}
              </ul>
            </div>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 4 }}>
            {intel.generatedAt ? `Generated ${new Date(intel.generatedAt).toLocaleString()}` : ""}
          </div>
        </>
      )}
    </Section>
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

      <LiveIntel C={C} MONO={MONO} SANS={SANS} />

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
