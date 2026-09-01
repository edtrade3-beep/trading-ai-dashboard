// lead-reply-ai.js — CarGurus Lead Responder: parse a lead email + draft
// the dealer reply. Extracted from routes/market.js (2026-09-01 audit fix
// #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

async function draftLeadReply(email, dealer, key) {
  const system = `You are the sales assistant for ${dealer.name}, a used-car dealership. You receive a CarGurus lead email. Extract the customer's FIRST name, their email, their phone, and the vehicle they're asking about (year make model trim) plus the LISTED price (use "Listed Price", not the market value). Then write a short, warm reply email.
Reply template (follow it closely):
Subject: <Year Make Model Trim> – Still Available
Body:
Hi <FirstName>,

Thank you for your interest in our <Year Make Model Trim>.

The vehicle is still available at the listed price of $<ListedPrice>. What day and time would you like to come in and take a look at it?

Please let me know the best way to reach you, or feel free to call us at ${dealer.phone}.

${dealer.name}
${dealer.address}

Return ONLY valid JSON, no markdown: {"firstName":"","customerEmail":"","customerPhone":"","vehicle":"","price":"","subject":"","body":""}. The body must be the full email text with real line breaks as \\n.`;

  const raw = await callAnthropicApi(`Lead email:\n${email}`, key, { model: MODELS.haiku, maxTokens: 600, system, cache: true });
  try {
    return JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    return { body: raw, subject: "Vehicle – Still Available" };
  }
}

module.exports = { draftLeadReply };
