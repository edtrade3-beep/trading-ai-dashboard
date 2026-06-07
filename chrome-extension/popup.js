// Dixie Motors — Messenger Reply Helper
// Manual workflow only: generate → review → copy → you click send yourself.

const DEFAULT_SERVER = "https://trading-ai-dashboard-i6pf.onrender.com";

// Quick templates (one tap to drop into reply box, then edit)
const TEMPLATES = [
  ["👋 Greeting", "Thanks for reaching out to Dixie Motors! How can I help you today?"],
  ["💵 Financing", "We finance with approved credit (W.A.C.). What monthly payment fits your budget?"],
  ["⬇ Down payment", "What down payment were you planning on? That helps me find the right fit."],
  ["🔄 Trade-in", "We take trade-ins! What's the year, make, model, and mileage of your vehicle?"],
  ["📅 Appointment", "I'd love to set up a time. What day and time works best for you to come in?"],
  ["✅ Available", "Yes, it's still available! Want to come take a look?"],
  ["📍 Location", "We're at Dixie Motors in Fairfield, Ohio. When can you stop by?"],
  ["📞 Callback", "What's the best number to reach you? I can have someone call you right away."],
];

// ── Helpers ──
const $ = id => document.getElementById(id);
const store = {
  get: (keys) => new Promise(r => chrome.storage.local.get(keys, r)),
  set: (obj)  => new Promise(r => chrome.storage.local.set(obj, r)),
};

// ── Tabs ──
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("panel-" + t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "leads") renderLeads();
  });
});

// ── Settings ──
async function getSettings() {
  const s = await store.get(["server", "webhook", "telegram"]);
  return { server: s.server || DEFAULT_SERVER, webhook: s.webhook || "", telegram: !!s.telegram };
}
async function loadSettings() {
  const s = await getSettings();
  $("setServer").value = s.server;
  $("setWebhook").value = s.webhook;
  $("setTelegram").checked = s.telegram;
}
$("saveSettingsBtn").addEventListener("click", async () => {
  await store.set({
    server: $("setServer").value.trim().replace(/\/$/, "") || DEFAULT_SERVER,
    webhook: $("setWebhook").value.trim(),
    telegram: $("setTelegram").checked,
  });
  showMsg("setMsg", "✓ Settings saved", "ok");
});

// ── Templates ──
function renderTemplates() {
  const box = $("templates");
  box.innerHTML = "";
  TEMPLATES.forEach(([label, text]) => {
    const b = document.createElement("button");
    b.className = "tmpl";
    b.textContent = label;
    b.addEventListener("click", () => {
      const out = $("replyOut");
      out.value = out.value ? out.value + " " + text : text;
    });
    box.appendChild(b);
  });
}

// ── Use highlighted text from the Facebook tab ──
$("pasteSel").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.text) {
        showMsg("intentBar", "Highlight the customer's message on the page first.", "takeover");
        return;
      }
      $("custMsg").value = resp.text;
    });
  } catch {
    alert("Open a Facebook/Messenger tab and highlight the message first.");
  }
});

// ── Auto-read latest message from the open conversation, then generate ──
$("autoBtn").addEventListener("click", async () => {
  flashIntent("📡 Reading latest message…", "normal");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/facebook\.com|messenger\.com/.test(tab.url || "")) {
      flashIntent("Open the Facebook/Messenger conversation tab first.", "takeover");
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "GET_LATEST_MESSAGE" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.text) {
        flashIntent("Couldn't read it — open the chat, or highlight the message manually.", "takeover");
        return;
      }
      $("custMsg").value = resp.text;
      $("genBtn").click();  // auto-generate the reply
    });
  } catch {
    flashIntent("Open the Facebook/Messenger tab and try again.", "takeover");
  }
});

// ── Generate reply ──
$("genBtn").addEventListener("click", async () => {
  const msg = $("custMsg").value.trim();
  if (!msg) { flashIntent("Paste a customer message first.", "takeover"); return; }
  $("genBtn").textContent = "⏳ Thinking…";
  $("genBtn").disabled = true;
  try {
    const { server } = await getSettings();
    const res = await fetch(server + "/api/dealer/fb/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (data.humanTakeover) {
      flashIntent("⚠️ HUMAN TAKEOVER — legal/refund/title/contract. Handle personally.", "takeover");
      $("replyOut").value = "";
    } else if (data.ok && data.reply) {
      flashIntent(`Intent: ${data.intent} · ${data.language}${data.source === "template" ? " · template" : ""}`, "normal");
      $("replyOut").value = data.reply;
      // ── AUTO-CREATE LEAD: extract details from the message ──
      autoFillLead(msg, data.intent);
    } else {
      flashIntent("Could not generate. Check Server URL in Settings.", "takeover");
    }
  } catch (e) {
    flashIntent("Connection failed — check Server URL in Settings.", "takeover");
  }
  $("genBtn").textContent = "⚡ Generate Reply";
  $("genBtn").disabled = false;
});

function flashIntent(text, kind) {
  const el = $("intentBar");
  el.style.display = "block";
  el.className = "intent " + (kind === "takeover" ? "takeover" : "normal");
  el.textContent = text;
}

// ── Auto-extract lead details from the customer message ──
function autoFillLead(msg, intent) {
  let filled = 0;
  const set = (id, val) => { if (val && !$(id).value) { $(id).value = val; filled++; } };

  // Phone — US formats
  const phone = msg.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phone) set("ldPhone", phone[0].trim());

  // Down payment — "$2000 down", "2k down", "put down 1500"
  const down = msg.match(/(?:put\s*down|down\s*(?:payment)?|deposit)[^\d$]*\$?\s?([\d,]+)k?/i)
            || msg.match(/\$?\s?([\d,]+)k?\s*(?:down|deposit)/i);
  if (down) set("ldDown", "$" + down[1].replace(/,/g, ""));

  // Monthly budget — "$400 a month", "400/mo", "monthly 350"
  const budget = msg.match(/\$?\s?([\d,]+)\s*(?:\/\s*(?:mo|month)|a\s*month|per\s*month|monthly)/i)
              || msg.match(/(?:budget|afford|monthly)[^\d$]*\$?\s?([\d,]+)/i);
  if (budget) set("ldBudget", "$" + budget[1].replace(/,/g, ""));

  // Vehicle — "2018 Honda Accord", "Toyota Camry"
  const makes = "Honda|Toyota|Ford|Chevy|Chevrolet|Nissan|Hyundai|Kia|Jeep|Dodge|GMC|BMW|Mercedes|Audi|Lexus|Mazda|Subaru|Volkswagen|VW|Ram|Tesla|Acura|Infiniti|Buick|Cadillac|Chrysler|Mitsubishi|Volvo";
  const veh = msg.match(new RegExp(`((?:19|20)\\d{2}\\s+)?(${makes})\\s+[A-Za-z0-9-]+`, "i"))
           || msg.match(new RegExp(`(${makes})`, "i"));
  if (veh) set("ldVehicle", veh[0].trim());

  // Appointment hint — day/time
  const appt = msg.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:at\s*)?(\d{1,2})(?::\d{2})?\s*(am|pm)?\b/i)
            || msg.match(/\b(today|tomorrow)\b.*?(\d{1,2})\s*(am|pm)\b/i)
            || msg.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (appt) set("ldAppt", appt[0].trim());

  // Notes — always seed with the original message + intent
  if (!$("ldNotes").value) { $("ldNotes").value = `[${intent}] "${msg.slice(0, 140)}"`; filled++; }

  // Mark hot if buying signals present
  if (/buy|today|cash|ready|approved|come in|test drive|finance/i.test(msg) && !$("ldHot").checked) {
    $("ldHot").checked = true;
  }

  if (filled > 0) {
    // Badge to tell the user a lead was auto-built
    flashIntent($("intentBar").textContent + ` · 📋 Lead auto-filled (${filled} fields) — check Lead tab`, "normal");
  }
}

// ── Copy reply ──
$("copyBtn").addEventListener("click", async () => {
  const txt = $("replyOut").value.trim();
  if (!txt) return;
  await navigator.clipboard.writeText(txt);
  $("copyBtn").textContent = "✓ Copied!";
  setTimeout(() => { $("copyBtn").textContent = "📋 Copy Reply"; }, 1500);
});

$("clearBtn").addEventListener("click", () => {
  $("custMsg").value = ""; $("replyOut").value = ""; $("intentBar").style.display = "none";
});

// ── Lead capture ──
function readLeadForm() {
  return {
    id: Date.now(),
    name: $("ldName").value.trim(),
    phone: $("ldPhone").value.trim(),
    vehicle: $("ldVehicle").value.trim(),
    budget: $("ldBudget").value.trim(),
    down: $("ldDown").value.trim(),
    appt: $("ldAppt").value.trim(),
    notes: $("ldNotes").value.trim(),
    hot: $("ldHot").checked,
    ts: new Date().toISOString(),
  };
}
function clearLeadForm() {
  ["ldName","ldPhone","ldVehicle","ldBudget","ldDown","ldAppt","ldNotes"].forEach(id => $(id).value = "");
  $("ldHot").checked = false;
}
$("newLeadBtn").addEventListener("click", clearLeadForm);

$("saveLeadBtn").addEventListener("click", async () => {
  const lead = readLeadForm();
  if (!lead.name && !lead.phone) { showMsg("leadMsg", "Add at least a name or phone.", "err"); return; }
  const s = await store.get(["leads"]);
  const leads = s.leads || [];
  leads.unshift(lead);
  await store.set({ leads });
  showMsg("leadMsg", "✓ Lead saved", "ok");

  const settings = await getSettings();
  // Push to your CRM (cloud) so it shows in the Dealer Portal CRM dashboard
  fetch(settings.server + "/api/dealer/crm/leads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...lead, stage: "NEW" }),
  }).catch(() => {});
  // Optional: webhook to external CRM
  if (settings.webhook) {
    fetch(settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) }).catch(() => {});
  }
  // Optional: Telegram alert on hot lead
  if (lead.hot && settings.telegram) {
    const text = `🔥 HOT LEAD — ${lead.name || "?"}\n📞 ${lead.phone || "no phone"}\n🚗 ${lead.vehicle || "?"}\n💵 Budget ${lead.budget || "?"} · Down ${lead.down || "?"}\n📅 ${lead.appt || "no appt"}\n📝 ${lead.notes || ""}`;
    fetch(settings.server + "/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => {});
  }
  clearLeadForm();
});

// ── Saved leads list ──
async function renderLeads() {
  const s = await store.get(["leads"]);
  const leads = s.leads || [];
  const list = $("leadsList");
  if (!leads.length) { list.innerHTML = '<div class="empty">No leads saved yet.</div>'; return; }
  list.innerHTML = "";
  leads.forEach(l => {
    const card = document.createElement("div");
    card.className = "lead-card" + (l.hot ? " hot" : "");
    card.innerHTML = `
      <button class="lead-del" data-id="${l.id}">✕</button>
      <div class="lead-name">${l.hot ? "🔥 " : ""}${esc(l.name) || "(no name)"}</div>
      <div class="lead-meta">
        ${l.phone ? "📞 " + esc(l.phone) + "<br>" : ""}
        ${l.vehicle ? "🚗 " + esc(l.vehicle) + "<br>" : ""}
        ${(l.budget || l.down) ? `💵 ${esc(l.budget) || "?"} / down ${esc(l.down) || "?"}<br>` : ""}
        ${l.appt ? "📅 " + esc(l.appt) + "<br>" : ""}
        ${l.notes ? "📝 " + esc(l.notes) : ""}
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll(".lead-del").forEach(b => {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.id);
      const s2 = await store.get(["leads"]);
      await store.set({ leads: (s2.leads || []).filter(x => x.id !== id) });
      renderLeads();
    });
  });
}

// ── Export CSV ──
$("exportBtn").addEventListener("click", async () => {
  const s = await store.get(["leads"]);
  const leads = s.leads || [];
  if (!leads.length) { alert("No leads to export."); return; }
  const headers = ["Name","Phone","Vehicle","Budget","DownPayment","Appointment","Notes","Hot","Date"];
  const rows = leads.map(l => [l.name, l.phone, l.vehicle, l.budget, l.down, l.appt, l.notes, l.hot ? "YES" : "", l.ts]
    .map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
  const csv = headers.join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `dixie-leads-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

$("clearLeadsBtn").addEventListener("click", async () => {
  if (confirm("Delete ALL saved leads? This cannot be undone.")) {
    await store.set({ leads: [] });
    renderLeads();
  }
});

// ── Utils ──
function esc(s) { return String(s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
function showMsg(id, text, kind) {
  const el = $(id); el.textContent = text; el.className = "msg " + kind;
  setTimeout(() => { el.textContent = ""; el.className = "msg"; }, 2500);
}

// ── Init ──
renderTemplates();
loadSettings();
