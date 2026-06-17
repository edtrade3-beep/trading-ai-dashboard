const { useMemo, useState, useEffect, useRef, useCallback } = React;

// App password is validated server-side via POST /api/auth/check (never stored in source)
const PDF_SLOTS = 3;
const TABS = ["Overview", "Vehicle", "Deal Finder", "Price Beater", "Finance", "Facebook", "Showroom", "Inventory", "Leads"];

const THEMES = {
  dark: {
    bg: "#07101d",
    surface: "#0f1b31",
    soft: "#14233e",
    border: "rgba(148,163,184,0.18)",
    text: "#e7eefc",
    muted: "#9eb0d0",
    primary: "#4f8cff",
    secondary: "#8b5cf6",
    success: "#22c55e",
    warning: "#f59e0b",
  },
  light: {
    bg: "#f1f5f9",
    surface: "#ffffff",
    soft: "#f8fafc",
    border: "rgba(100,116,139,0.15)",
    text: "#0f172a",
    muted: "#64748b",
    primary: "#2563eb",
    secondary: "#7c3aed",
    success: "#16a34a",
    warning: "#d97706",
  },
};

const FINANCE_LINE = `🟢 Fast & Easy Financing – All Credit Accepted
🟢 ITIN Accepted – Low Down Payment Options
🟢 Trade-Ins Welcome.`;

const SAMPLE_INVENTORY = [
  { vin: "1HGCM82633A123456", year: 2019, make: "Toyota", model: "Camry", trim: "SE", mileage: 74210, price: 17995, condition: "Good" },
  { vin: "2T3WFREV1JW123456", year: 2018, make: "Honda", model: "CR-V", trim: "EX", mileage: 88120, price: 18995, condition: "Very Good" },
  { vin: "1GNSKBKC2JR123456", year: 2017, make: "Chevrolet", model: "Tahoe", trim: "LT", mileage: 109450, price: 24995, condition: "Good" },
  { vin: "5FRYD4H43GB014474", year: 2016, make: "Acura", model: "MDX", trim: "Tech", mileage: 112400, price: 15995, condition: "Good" },
];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}


function estimatePrice(vehicle) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - Number(vehicle.year || currentYear), 0);
  const mileage = Number(vehicle.mileage || 0);
  const price = Number(vehicle.price || 0);
  const make = String(vehicle.make || "").toLowerCase();
  const model = String(vehicle.model || "").toLowerCase();
  const condition = vehicle.condition || "Good";

  let base = 31000 - age * 2100;
  if (["toyota", "honda", "lexus", "acura"].includes(make)) base *= 1.08;
  if (["chevrolet", "ford", "gmc"].includes(make)) base *= 1.03;
  if (model.includes("tahoe") || model.includes("truck")) base *= 1.1;
  base -= Math.max(mileage - 60000, 0) * 0.05;
  base *= ({ Excellent: 1.08, "Very Good": 1.04, Good: 1, Fair: 0.92, Rough: 0.84 }[condition] || 1);
  if (price > 0) base = base * 0.72 + price * 0.28;

  const suggested = Math.max(Math.round(base / 100) * 100, 4000);
  const low = Math.round(suggested * 0.95);
  const high = Math.round(suggested * 1.1);
  const cleanTrade = Math.round(suggested * 0.87);
  const roughTrade = Math.round(suggested * 0.78);
  const recon = Math.round(Math.max(500, suggested * 0.03));
  const pack = 995;
  const totalCost = cleanTrade + recon + pack;
  const frontEnd = Math.max(high - totalCost, 0);
  const ratio = cleanTrade > 0 ? totalCost / cleanTrade : 0;

  return { suggested, low, high, cleanTrade, roughTrade, recon, pack, totalCost, frontEnd, ratio };
}

function monthlyPayment(amount, apr, months, downPayment) {
  const principal = Math.max(Number(amount || 0) - Number(downPayment || 0), 0);
  const rate = Number(apr || 0) / 100 / 12;
  const term = Math.max(Number(months || 72), 1);
  if (!principal) return 0;
  if (!rate) return Math.round(principal / term);
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -term)));
}

function dealGrade(score) {
  if (score >= 72) return { grade: "A", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
  if (score >= 55) return { grade: "B", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" };
  if (score >= 38) return { grade: "C", color: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  return { grade: "D", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
}

function scoreDeal(vehicle, pricing) {
  let score = 0;
  const mileage = Number(vehicle.mileage || 0);
  const make = String(vehicle.make || "").toLowerCase();
  score += Math.min(pricing.frontEnd / 150, 40);
  score += Math.min((pricing.high - pricing.cleanTrade) / 200, 25);
  score += mileage <= 80000 ? 15 : mileage <= 120000 ? 10 : 5;
  if (["toyota", "honda", "lexus", "acura"].includes(make)) score += 10;
  if (["chevrolet", "ford", "gmc"].includes(make)) score += 7;
  if (pricing.ratio <= 0.82) score += 12;
  else if (pricing.ratio <= 0.9) score += 8;
  else if (pricing.ratio <= 1) score += 4;
  return Math.round(score);
}

function buildCustomerReply(vehicle, pricing, finance, style) {
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`.trim();
  const payment = monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment);
  const payLine = `${money(payment)}/mo after ${money(finance.downPayment)} down (W.A.C.)`;

  if (style === "firm") {
    return `Hi! Yes the ${title} is still available.\n\nAsking ${money(pricing.suggested)} — price is firm.\n\nEstimated payment around ${payLine}.\n\nITIN accepted. When would you like to come see it?`;
  }
  if (style === "flex") {
    return `Hi! Yes the ${title} is still available.\n\nListed at ${money(pricing.suggested)} — I can work with serious buyers.\n\nEstimated payment around ${payLine}.\n\nITIN accepted, all credit welcome. Come take a look — you won't be disappointed!`;
  }
  if (style === "finance") {
    return `Hi! Yes the ${title} is still available.\n\n🟢 We finance everyone — good credit, bad credit, no credit.\n🟢 ITIN accepted.\n🟢 Low down payment options available.\n\nEstimated payment around ${payLine}.\n\nJust bring your ID and proof of income. When can you stop by?`;
  }
  if (style === "whatsapp") {
    return `Hi 👋 Yes the *${title}* is still available!\n\n💰 Price: *${money(pricing.suggested)}*\n💸 Est. payment: *${payLine}*\n\n✅ ITIN accepted\n✅ All credit welcome\n✅ Low down options\n\nWhen can you come see it? 🚗`;
  }
  if (style === "lowball") {
    return `Hi! Thanks for reaching out on the ${title}.\n\nI appreciate the offer but we're firm at ${money(pricing.suggested)}. This one is priced right for the market — clean title, ${vehicle.condition ? vehicle.condition.toLowerCase() + " condition" : "nice condition"}.\n\nIf financing helps, estimated payment is around ${payLine} with no major credit requirements.\n\nHappy to let you come see it and make a decision in person. What day works for you?`;
  }
  if (style === "appointment") {
    return `Great, looking forward to seeing you!\n\nJust to confirm — you're coming to see the ${title}.\n\nWhen you arrive just ask for us by name. Bring your ID. If you're planning to buy, we can get you in and out quickly.\n\nSee you then! 👍`;
  }
  if (style === "followup") {
    return `Hi! Just following up on the ${title} you were interested in.\n\nStill available at ${money(pricing.suggested)}. Estimated payment ${payLine}.\n\nWanted to check in before it's gone — had some interest this week. Let me know if you have any questions or want to set up a time to look at it!`;
  }
  if (style === "spanish") {
    return `¡Hola! Sí, el ${title} sigue disponible.\n\n💰 Precio: ${money(pricing.suggested)}\n💸 Pago estimado: ${payLine}\n\n✅ Aceptamos ITIN\n✅ Todos los créditos bienvenidos\n✅ Enganche bajo disponible\n\n¿Cuándo puede venir a verlo? Estamos aquí 7 días a la semana. 🚗`;
  }
  // default: info
  return `Hi! Yes the ${title} is still available.\n\nPrice: ${money(pricing.suggested)}\nEstimated payment: ${payLine}\n\nCome by anytime — we're here 7 days a week. Feel free to bring a mechanic!`;
}

function buildFacebookAd(vehicle, pricing, finance, style, notes) {
  const payment = monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment);
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.trim();
  const paymentLine = `💸 Estimated payment: ${money(payment)}/mo after ${money(finance.downPayment)} down (W.A.C.)`;
  const extra = notes ? `

${notes}` : "";

  if (style === "cash") {
    return `${title}

✅ Clean title
✅ Nice condition
✅ Ready to drive

💰 Price: ${money(pricing.suggested)}

Trade-ins welcome.
📩 Message us now.${extra}`;
  }

  if (style === "hot") {
    return `${title} 🔥 HOT DEAL 🔥

✅ ${vehicle.engine}
✅ ${vehicle.drive}
✅ ${vehicle.condition} condition

💰 Price: ${money(pricing.suggested)}
${paymentLine}

${FINANCE_LINE}

📩 Message now before it is gone.${extra}`;
  }

  if (style === "craigslist") {
    return `${title}

Price: ${money(pricing.suggested)}

Mileage: ${vehicle.mileage ? vehicle.mileage.toLocaleString() + " miles" : "See listing"}
Condition: ${vehicle.condition}
Engine: ${vehicle.engine || "—"}
Transmission: ${vehicle.transmission || "—"}
Drive: ${vehicle.drive || "—"}
Fuel: ${vehicle.fuel || "—"}
VIN: ${vehicle.vin || "available on request"}

Financing available — all credit welcome. ITIN accepted.
${paymentLine}

Serious buyers only. No trades unless offer is firm.
${notes ? "\n" + notes : ""}`;
  }

  if (style === "offerup") {
    return `${title}

${money(pricing.suggested)} — ${vehicle.condition} condition
${vehicle.mileage ? vehicle.mileage.toLocaleString() + " miles" : ""}

${vehicle.engine || ""} ${vehicle.drive || ""} ${vehicle.fuel || ""}

We finance! ITIN welcome. Low down payment options.
Estimated payment: ${paymentLine}

Serious buyers only. Price is negotiable for cash.${notes ? "\n\n" + notes : ""}`;
  }

  if (style === "spanish") {
    return `${title}

💰 Precio: ${money(pricing.suggested)}
🚗 ${vehicle.mileage ? vehicle.mileage.toLocaleString() + " millas" : ""}
📋 Condición: ${vehicle.condition}

${paymentLine.replace("Estimated payment:", "Pago estimado:")}

✅ Aceptamos ITIN
✅ Todos los créditos bienvenidos
✅ Enganche bajo disponible
✅ Título limpio

${FINANCE_LINE.replace("We finance everyone","Financiamos a todos").replace("ITIN accepted","ITIN aceptado")}

📩 Mándenos un mensaje — estamos aquí 7 días a la semana.${notes ? "\n\n" + notes : ""}`;
  }

  return `${title}

✅ Clean title
✅ ${vehicle.condition} condition
✅ Ready to drive

💰 Price: ${money(pricing.suggested)}
${paymentLine}

${FINANCE_LINE}

📩 Message us now.${extra}`;
}

function App() {
  const [themeMode, setThemeMode] = useState("light");
  const theme = THEMES[themeMode];
  const styles = createStyles(theme);

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(true);   // password lock removed
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [vin, setVin] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [vinHistory, setVinHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("dixie_vin_history") || "[]"); } catch { return []; } });
  const [inventory, setInventory] = useState(SAMPLE_INVENTORY);
  const inventoryInitialized = useRef(false);

  // Load persisted inventory from server on first mount
  useEffect(() => {
    fetch("/api/inventory")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.items) && data.items.length) {
          setInventory(data.items);
        }
      })
      .catch(() => {})
      .finally(() => { inventoryInitialized.current = true; });
  }, []);

  // Auto-save inventory to server whenever it changes (after first load)
  useEffect(() => {
    if (!inventoryInitialized.current) return;
    fetch("/api/inventory/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: inventory }),
    }).catch(() => {});
  }, [inventory]);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinSource, setVinSource] = useState("");
  // ── Deal Finder (no-key: free decode + free market estimate + client-side scoring) ──
  const [dfVin, setDfVin] = useState("");
  const [dfMileage, setDfMileage] = useState("");
  const [dfLoading, setDfLoading] = useState(false);
  const [dfError, setDfError] = useState("");
  const [dfVehicle, setDfVehicle] = useState(null);   // decoded vehicle + market range
  const [dfMarket, setDfMarket] = useState(null);      // { low, average, high }
  const [dfPaste, setDfPaste] = useState("");
  const [dfResult, setDfResult] = useState(null);

  // ── Price Beater ("Am I cheapest?" across my inventory, AI live search) ──
  const [pbResults, setPbResults] = useState(() => { try { return JSON.parse(localStorage.getItem("dixie_pb_results") || "{}"); } catch { return {}; } });
  const [pbScanning, setPbScanning] = useState(false);
  const [pbStatus, setPbStatus] = useState("");
  const [pbRadius, setPbRadius] = useState(200);
  const savePbResults = (next) => { setPbResults(next); try { localStorage.setItem("dixie_pb_results", JSON.stringify(next)); } catch {} };
  const scanOnePB = async (v) => {
    try {
      const r = await fetch("/api/dealer/price-beat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: v.year, make: v.make, model: v.model, trim: v.trim || "", zip: "45014", radius: pbRadius, myPrice: v.price || 0 }),
      });
      const d = await r.json();
      if (!r.ok) return { status: "error", error: d.error || "scan failed", scanned: false };
      if (!d.found) return { status: "no_comps", scanned: true };
      return { status: d.status, scanned: true, compPrice: d.cheapestPrice, gap: d.gap, source: d.source, dealer: d.dealer, compMiles: d.compMiles, suggested: d.suggested, link: d.link };
    } catch (e) { return { status: "error", error: e.message, scanned: false }; }
  };
  const pbScanVehicle = async (v) => {
    const cur = { ...pbResults, [v.vin]: { status: "scanning" } };
    savePbResults(cur);
    const res = await scanOnePB(v);
    savePbResults({ ...cur, [v.vin]: res });
  };
  const pbScanAll = async () => {
    if (pbScanning) return;
    const list = inventory.filter(v => v.vin && !pbResults[v.vin]?.scanned);
    if (!list.length) { showToast("All inventory already scanned", "success"); return; }
    setPbScanning(true);
    let acc = { ...pbResults };
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      setPbStatus(`Scanning ${i + 1}/${list.length}: ${v.year} ${v.make} ${v.model}`);
      acc = { ...acc, [v.vin]: { status: "scanning" } }; savePbResults(acc);
      const res = await scanOnePB(v);
      if (res.status === "error" && /not configured/i.test(res.error || "")) {
        setPbStatus("⚠️ Anthropic API key not set on the server — add ANTHROPIC_API_KEY in Render.");
        setPbScanning(false); return;
      }
      acc = { ...acc, [v.vin]: res }; savePbResults(acc);
      await new Promise(r => setTimeout(r, 800));
    }
    setPbStatus(`✓ Done — scanned ${list.length} vehicles`);
    setPbScanning(false);
    showToast(`Scanned ${list.length} vehicles`, "success");
  };

  // Step 1: decode VIN + pull a free market-value estimate (no API key needed)
  const dfDecodeAndValue = async () => {
    const cleanVin = dfVin.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    if (cleanVin.length !== 17) { setDfError("Enter a valid 17-character VIN."); return; }
    setDfLoading(true); setDfError(""); setDfResult(null); setDfVehicle(null); setDfMarket(null);
    try {
      const dec = await fetch(`/api/dealer/vin-decode?vin=${cleanVin}`).then(r => r.json());
      if (dec.error) throw new Error(dec.error);
      const miles = Number(dfMileage) || 0;
      const comps = await fetch(`/api/dealer/comps?year=${dec.year}&make=${encodeURIComponent(dec.make)}&model=${encodeURIComponent(dec.model)}&trim=${encodeURIComponent(dec.trim || "")}&mileage=${miles}&condition=Good`).then(r => r.json());
      setDfVehicle({ ...dec, mileage: miles });
      if (comps && comps.marketValue) {
        setDfMarket({ low: comps.priceRange?.low || Math.round(comps.marketValue * 0.9), average: comps.marketValue, high: comps.priceRange?.high || Math.round(comps.marketValue * 1.1), cleanTrade: comps.cleanTrade });
      }
    } catch (e) { setDfError(e.message || "Decode failed"); }
    setDfLoading(false);
  };

  // Step 2: parse pasted listings and score each 0–100 (pure client-side, no AI)
  const dfScoreDeals = () => {
    setDfError("");
    const expectedMiles = dfVehicle?.year ? Math.max((new Date().getFullYear() - dfVehicle.year) * 12000, 6000) : 100000;
    const avg = dfMarket?.average || 0;
    // Each line: price, miles, title, location, link  (commas; title/location/link optional)
    const rows = dfPaste.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(",").map(p => p.trim());
      const price = Number((parts[0] || "").replace(/[^0-9.]/g, "")) || 0;
      const mileage = Number((parts[1] || "").replace(/[^0-9.]/g, "")) || 0;
      const titleRaw = (parts[2] || "").toLowerCase();
      const location = parts[3] || "";
      const source = parts[4] || "";
      return { price, mileage, titleRaw, location, source, title: `$${price.toLocaleString()} · ${mileage.toLocaleString()}mi` };
    }).filter(r => r.price > 0);
    if (!rows.length) { setDfError("Paste at least one listing line: price, miles, title, location, link"); return; }

    const marketAvg = avg || Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length);
    const scored = rows.map(r => {
      // Risk from title text
      let risk = "GREEN", riskScore = 100;
      if (/salvage|flood|structural|junk/.test(r.titleRaw)) { risk = "BLACKLIST"; riskScore = 0; }
      else if (/rebuilt|reconstructed|lemon/.test(r.titleRaw)) { risk = "RED"; riskScore = 35; }
      else if (/accident|damage|branded|gap|unknown/.test(r.titleRaw)) { risk = "YELLOW"; riskScore = 65; }
      else if (/clean|none|no accident/.test(r.titleRaw) || !r.titleRaw) { risk = r.titleRaw ? "GREEN" : "YELLOW"; riskScore = r.titleRaw ? 100 : 75; }
      // Price vs market (35%)
      const priceRatio = marketAvg ? r.price / marketAvg : 1;
      const priceScore = Math.max(0, Math.min(100, Math.round(50 + (1 - priceRatio) * 220)));
      // Mileage vs expected (25%)
      const mileRatio = r.mileage && expectedMiles ? r.mileage / expectedMiles : 1;
      const mileScore = Math.max(0, Math.min(100, Math.round(50 + (1 - mileRatio) * 120)));
      // Condition placeholder (15%)
      const condScore = 70;
      const score = Math.round(priceScore * 0.35 + mileScore * 0.25 + riskScore * 0.25 + condScore * 0.15);
      const pricePosition = priceRatio < 0.9 ? "Cheap" : priceRatio <= 1.02 ? "Fair" : priceRatio <= 1.12 ? "High" : "Overpriced";
      const profit = marketAvg ? Math.round(marketAvg - r.price) : 0;
      return { ...r, risk, riskScore, score, pricePosition, profit };
    }).sort((a, b) => b.score - a.score);

    const safe = scored.filter(s => s.risk === "GREEN" || s.risk === "YELLOW");
    const cheapest = [...scored].sort((a, b) => a.price - b.price)[0];
    const bestProfit = [...scored].filter(s => s.risk !== "BLACKLIST" && s.risk !== "RED").sort((a, b) => b.profit - a.profit)[0];
    const lows = scored.map(s => s.price);
    setDfResult({
      vehicle: dfVehicle,
      market: { low: Math.min(...lows), average: marketAvg, high: Math.max(...lows), listingsFound: scored.length, estimate: !!avg },
      listings: scored,
      picks: { topDeal: scored[0]?.title, cheapest: cheapest?.title, bestSafeDeal: safe[0]?.title, bestProfit: bestProfit?.title },
      riskAlerts: scored.filter(s => s.risk === "RED" || s.risk === "BLACKLIST").map(s => `${s.title} — ${s.risk} (${s.titleRaw || "title concern"})`),
      priceCeiling: Math.round((dfMarket?.cleanTrade || marketAvg * 0.88)),
      resaleRange: { low: Math.round(marketAvg * 0.95), high: Math.round(marketAvg * 1.08) },
    });
  };
  const [finance, setFinance] = useState({ apr: 9.9, downPayment: 3000, termMonths: 72 });
  const [deal, setDeal] = useState({ salePrice: "", tradeValue: "", tradeOwed: "", salesTaxPct: "6.25", docFee: "299", titleFee: "75", tagFee: "50" });
  const [leads, setLeads] = useState(() => { try { return JSON.parse(localStorage.getItem("dixie_leads") || "[]"); } catch { return []; } });
  const [leadForm, setLeadForm] = useState({ name: "", phone: "", email: "", source: "Walk-In", vin: "", status: "New", notes: "" });
  const [leadSearch, setLeadSearch] = useState("");
  useEffect(() => { try { localStorage.setItem("dixie_leads", JSON.stringify(leads)); } catch {} }, [leads]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [siteStatus, setSiteStatus] = useState("");
  const [siteResult, setSiteResult] = useState(null);
  const [sitePreview, setSitePreview] = useState([]);
  const [siteLoading, setSiteLoading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState(Array(PDF_SLOTS).fill(null));
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfResults, setPdfResults] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [clearInvConfirm, setClearInvConfirm] = useState(false);
  const [adStyle, setAdStyle] = useState("standard");
  const [replyStyle, setReplyStyle] = useState("info");
  const [notes, setNotes] = useState("");
  const [comps, setComps] = useState(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [aiDesc, setAiDesc] = useState("");
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiDescStyle, setAiDescStyle] = useState("facebook");
  const [showAddForm, setShowAddForm] = useState(false);
  const EMPTY_VEHICLE_FORM = { year: "", make: "", model: "", trim: "", mileage: "", price: "", condition: "Good", vin: "", photoUrl: "" };
  const [addForm, setAddForm] = useState(EMPTY_VEHICLE_FORM);
  const [soldFilter, setSoldFilter] = useState("active"); // "active" | "sold" | "all"
  const [soldFormVin, setSoldFormVin] = useState(null);
  const [soldFormPrice, setSoldFormPrice] = useState("");
  const [notesFormVin, setNotesFormVin] = useState(null);
  const [notesFormText, setNotesFormText] = useState("");
  const [editVin, setEditVin] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirmVin, setDeleteConfirmVin] = useState(null);
  const [toast, setToast] = useState(null);

  // ── Facebook Hub state ────────────────────────────────────────────────────
  const [fbSubTab, setFbSubTab]         = useState("inbox");      // inbox | autorules | appointments
  const [fbMessages, setFbMessages]     = useState([]);
  const [fbAppts, setFbAppts]           = useState([]);
  const [fbRules, setFbRules]           = useState([]);
  const [fbStatus, setFbStatus]         = useState(null);
  const [fbLoading, setFbLoading]       = useState(false);
  const [fbActiveThread, setFbActiveThread] = useState(null);  // threadId
  const [fbReplyText, setFbReplyText]   = useState("");
  const [fbReplySending, setFbReplySending] = useState(false);
  const [fbNewRule, setFbNewRule]       = useState({ keyword: "", reply: "", enabled: true });
  const [fbApptForm, setFbApptForm]     = useState({ name: "", phone: "", vehicle: "", date: "", time: "", notes: "" });
  const [fbApptSaving, setFbApptSaving] = useState(false);

  // Load FB data when switching to the Facebook tab
  useEffect(() => {
    if (tab !== "Facebook") return;
    setFbLoading(true);
    Promise.all([
      fetch("/api/dealer/fb/status").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/dealer/fb/messages").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/dealer/fb/appointments").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/dealer/fb/auto-rules").then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([status, msgs, appts, rules]) => {
      setFbStatus(status);
      setFbMessages(Array.isArray(msgs) ? msgs : []);
      setFbAppts(Array.isArray(appts) ? appts : []);
      setFbRules(Array.isArray(rules) ? rules : []);
    }).finally(() => setFbLoading(false));
  }, [tab]);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const rankedInventory = useMemo(() => {
    const now = Date.now();
    return inventory
      .map((item) => {
        const pricing = estimatePrice(item);
        const daysOnLot = item.addedAt
          ? Math.floor((now - new Date(item.addedAt).getTime()) / 86400000)
          : null;
        return { ...item, pricing, score: scoreDeal(item, pricing), daysOnLot };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.pricing.frontEnd !== a.pricing.frontEnd) return b.pricing.frontEnd - a.pricing.frontEnd;
        return a.pricing.ratio - b.pricing.ratio;
      });
  }, [inventory]);

  const lotStats = useMemo(() => {
    if (!rankedInventory.length) return null;
    const active = rankedInventory.filter(v => !v.soldPrice);
    const totalValue = active.reduce((s, v) => s + v.pricing.suggested, 0);
    const totalFrontEnd = active.reduce((s, v) => s + v.pricing.frontEnd, 0);
    const avgPrice = active.length ? Math.round(totalValue / active.length) : 0;
    const grades = { A: 0, B: 0, C: 0, D: 0 };
    active.forEach(v => { const g = dealGrade(v.score).grade; grades[g] = (grades[g] || 0) + 1; });
    const withAge = active.filter(v => v.daysOnLot != null);
    const avgDaysOnLot = withAge.length ? Math.round(withAge.reduce((s, v) => s + v.daysOnLot, 0) / withAge.length) : null;
    const oldestUnit = withAge.length ? withAge.reduce((a, b) => b.daysOnLot > a.daysOnLot ? b : a, withAge[0]) : null;
    const aged30 = withAge.filter(v => v.daysOnLot >= 30).length;
    const aged45 = withAge.filter(v => v.daysOnLot >= 45).length;
    return { totalValue, totalFrontEnd, avgPrice, grades, activeCount: active.length, avgDaysOnLot, oldestUnit, aged30, aged45 };
  }, [rankedInventory]);

  const [inventorySearch, setInventorySearch] = useState("");

  const soldStats = useMemo(() => {
    const sold = rankedInventory.filter(v => v.soldPrice > 0);
    if (!sold.length) return null;
    const totalGross = sold.reduce((s, v) => s + (v.soldPrice - v.pricing.totalCost), 0);
    const avgGross = Math.round(totalGross / sold.length);
    return { count: sold.length, totalGross, avgGross };
  }, [rankedInventory]);

  const monthlyGross = useMemo(() => {
    const sold = rankedInventory.filter(v => v.soldPrice > 0 && v.soldAt);
    if (sold.length < 2) return null;
    const byMonth = {};
    sold.forEach(v => {
      const d = new Date(v.soldAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) byMonth[key] = { gross: 0, units: 0 };
      byMonth[key].gross += v.soldPrice - v.pricing.totalCost;
      byMonth[key].units++;
    });
    const months = Object.keys(byMonth).sort().slice(-6);
    if (months.length < 2) return null;
    const rows = months.map(k => ({ key: k, ...byMonth[k] }));
    const maxGross = Math.max(...rows.map(r => Math.abs(r.gross)), 1);
    return { rows, maxGross };
  }, [rankedInventory]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    let base = soldFilter === "sold"
      ? rankedInventory.filter(v => v.soldPrice > 0)
      : soldFilter === "active"
        ? rankedInventory.filter(v => !v.soldPrice)
        : rankedInventory;
    if (!q) return base;
    return base.filter(v =>
      `${v.year} ${v.make} ${v.model} ${v.trim} ${v.vin}`.toLowerCase().includes(q)
    );
  }, [rankedInventory, inventorySearch, soldFilter]);

  const pricing = useMemo(() => (vehicle ? estimatePrice(vehicle) : null), [vehicle]);
  const payment = useMemo(() => (pricing ? monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment) : 0), [pricing, finance]);

  const financeDetail = useMemo(() => {
    if (!pricing) return null;
    const principal = Math.max(pricing.suggested - Number(finance.downPayment || 0), 0);
    const apr = Number(finance.apr || 0);
    const months = Math.max(Number(finance.termMonths || 72), 1);
    const pmt = monthlyPayment(pricing.suggested, apr, months, finance.downPayment);
    const totalPaid = pmt * months + Number(finance.downPayment || 0);
    const totalInterest = Math.max(totalPaid - pricing.suggested, 0);
    const terms = [36, 48, 60, 72, 84].map((t) => ({
      months: t,
      payment: monthlyPayment(pricing.suggested, apr, t, finance.downPayment),
      totalInterest: Math.max(monthlyPayment(pricing.suggested, apr, t, finance.downPayment) * t + Number(finance.downPayment || 0) - pricing.suggested, 0),
    }));
    const aprs = [apr - 2, apr - 1, apr, apr + 1, apr + 2].filter((a) => a > 0).map((a) => ({
      apr: a,
      payment: monthlyPayment(pricing.suggested, a, months, finance.downPayment),
    }));
    return { principal, totalPaid, totalInterest, pmt, terms, aprs };
  }, [pricing, finance]);
  const adText = useMemo(() => (vehicle && pricing ? buildFacebookAd(vehicle, pricing, finance, adStyle, notes) : ""), [vehicle, pricing, finance, adStyle, notes]);
  const replyText = useMemo(() => (vehicle && pricing ? buildCustomerReply(vehicle, pricing, finance, replyStyle) : ""), [vehicle, pricing, finance, replyStyle]);

  function login() {
    if (loginLoading) return;
    setLoginLoading(true);
    fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setUnlocked(true);
          try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() })); } catch {}
        } else {
          showToast("Wrong password", "error");
        }
      })
      .catch(() => showToast("Connection error — try again", "error"))
      .finally(() => setLoginLoading(false));
  }

  async function decodeVin() {
    const clean = normalizeVin(vin);
    if (clean.length !== 17) {
      showToast("Enter a valid 17-digit VIN", "error");
      return;
    }
    setVinLoading(true);
    setVinSource("");
    try {
      const res = await fetch(`/api/dealer/vin-decode?vin=${clean}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "VIN decode failed");
      setVehicle({ ...data, mileage: data.mileage || 0, condition: data.condition || "Good", price: data.price || 0 });
      setVinSource(data.source || "");
      setVin(clean);
      setTab("Vehicle");
      setVinHistory((prev) => {
        const entry = { vin: clean, label: `${data.year} ${data.make} ${data.model}`, at: Date.now() };
        const next = [entry, ...prev.filter((h) => h.vin !== clean)].slice(0, 8);
        try { localStorage.setItem("dixie_vin_history", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (err) {
      showToast(err.message || "VIN decode failed — check the VIN and try again", "error");
    } finally {
      setVinLoading(false);
    }
  }

  async function fetchComps() {
    if (!vehicle) return;
    setCompsLoading(true);
    setComps(null);
    try {
      const params = new URLSearchParams({
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim || "",
        mileage: vehicle.mileage || 0,
        condition: vehicle.condition || "Good",
      });
      const res = await fetch(`/api/dealer/comps?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comps failed");
      setComps(data);
    } catch (err) {
      showToast(err.message || "Failed to fetch comps", "error");
    } finally {
      setCompsLoading(false);
    }
  }

  async function generateDescription() {
    if (!vehicle) return;
    setAiDescLoading(true);
    setAiDesc("");
    try {
      const res = await fetch("/api/dealer/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim,
          mileage: vehicle.mileage, condition: vehicle.condition, price: vehicle.price,
          engine: vehicle.engine, drive: vehicle.drive, fuel: vehicle.fuel,
          transmission: vehicle.transmission, notes: notes,
          style: aiDescStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI description failed");
      setAiDesc(data.description || "");
    } catch (err) {
      showToast(err.message || "AI description failed", "error");
    } finally {
      setAiDescLoading(false);
    }
  }

  function chooseVehicle(item) {
    setVehicle(item);
    setVin(item.vin);
    setComps(null);
    setAiDesc("");
    setTab("Vehicle");
  }

  function addVehicle() {
    const year = Number(addForm.year);
    if (!year || year < 1990 || year > new Date().getFullYear() + 2) { showToast("Enter a valid year (1990–present)", "error"); return; }
    if (!addForm.make.trim()) { showToast("Make is required", "error"); return; }
    if (!addForm.model.trim()) { showToast("Model is required", "error"); return; }
    const newItem = {
      vin: addForm.vin.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17) || `MAN-${Date.now()}`,
      year,
      make: addForm.make.trim(),
      model: addForm.model.trim(),
      trim: addForm.trim.trim(),
      mileage: Number(addForm.mileage) || 0,
      price: Number(addForm.price) || 0,
      condition: addForm.condition || "Good",
      photoUrl: addForm.photoUrl.trim() || "",
      addedAt: new Date().toISOString(),
    };
    setInventory(prev => [newItem, ...prev]);
    setAddForm(EMPTY_VEHICLE_FORM);
    setShowAddForm(false);
  }

  function deleteVehicle(vin) {
    setInventory(prev => prev.filter(v => v.vin !== vin));
    setDeleteConfirmVin(null);
  }

  function openSoldForm(vin) {
    setSoldFormVin(vin);
    setSoldFormPrice("");
  }

  function confirmSold(vin) {
    const soldPrice = Number(String(soldFormPrice).replace(/[^0-9.]/g, "")) || 0;
    if (!soldPrice) return;
    setInventory(prev => prev.map(v => v.vin === vin ? { ...v, soldPrice, soldAt: new Date().toISOString() } : v));
    setSoldFormVin(null);
    setSoldFormPrice("");
  }

  function markUnsold(vin) {
    setInventory(prev => prev.map(v => v.vin === vin ? { ...v, soldPrice: undefined, soldAt: undefined } : v));
  }

  function printVehicleSheet() {
    if (!vehicle || !pricing) return;
    const pay = monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment);
    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`;
    const w = window.open("", "_blank", "width=800,height=900");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#fff;color:#0f172a;padding:32px;max-width:680px;margin:0 auto}
  h1{font-size:28px;font-weight:900;margin-bottom:4px}
  .sub{font-size:14px;color:#64748b;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px}
  .cell{padding:10px 14px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
  .cell:nth-child(even){border-right:none}
  .cell:nth-last-child(-n+2){border-bottom:none}
  .cell label{display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
  .cell span{font-size:15px;font-weight:700}
  .price-box{background:#0f172a;color:#fff;border-radius:8px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
  .price-box .big{font-size:36px;font-weight:900}
  .price-box .right{text-align:right}
  .price-box .mo{font-size:22px;font-weight:900;color:#4ade80}
  .price-box .disc{font-size:11px;color:#94a3b8;margin-top:2px}
  .finance-line{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#15803d;line-height:1.8}
  .vin{font-size:11px;color:#94a3b8;margin-bottom:20px}
  .links{display:flex;gap:12px;font-size:12px;margin-bottom:20px}
  .links a{color:#2563eb}
  .footer{font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:4px}
  @media print{body{padding:16px}.price-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<h1>${title}</h1>
<div class="sub">${vehicle.mileage ? vehicle.mileage.toLocaleString() + " miles · " : ""}${vehicle.condition} Condition · ${vehicle.body || ""}${vehicle.body ? " · " : ""}${vehicle.fuel || "Gasoline"}</div>
<div class="price-box">
  <div>
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Asking Price</div>
    <div class="big">${pricing.suggested.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</div>
  </div>
  <div class="right">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Est. Payment</div>
    <div class="mo">${pay.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/mo</div>
    <div class="disc">after $${Number(finance.downPayment).toLocaleString()} down (W.A.C.)</div>
  </div>
</div>
<div class="finance-line">✅ Fast & Easy Financing — All Credit Accepted&nbsp;&nbsp;&nbsp;✅ ITIN Accepted — Low Down Payment Options&nbsp;&nbsp;&nbsp;✅ Trade-Ins Welcome</div>
<div class="grid">
  <div class="cell"><label>Engine</label><span>${vehicle.engine || "—"}</span></div>
  <div class="cell"><label>Transmission</label><span>${vehicle.transmission || "—"}</span></div>
  <div class="cell"><label>Drive Type</label><span>${vehicle.drive || "—"}</span></div>
  <div class="cell"><label>Fuel Type</label><span>${vehicle.fuel || "—"}</span></div>
  <div class="cell"><label>Body Style</label><span>${vehicle.body || "—"}</span></div>
  <div class="cell"><label>Condition</label><span>${vehicle.condition || "Good"}</span></div>
</div>
<div class="vin">VIN: ${vehicle.vin}</div>
<div class="links">
  <a href="https://www.carfax.com/VehicleHistory/ar20/p/Report.cfx?vin=${vehicle.vin}" target="_blank">CARFAX Report</a>
  <a href="https://www.autocheck.com/vehiclehistory/autocheck/en/vehiclehistory?vin=${vehicle.vin}" target="_blank">AutoCheck Report</a>
  <a href="https://www.nhtsa.gov/vehicle/${vehicle.vin}/complaints" target="_blank">NHTSA Complaints</a>
</div>
<div class="footer">Price does not include applicable taxes, title, license fees. Financing subject to credit approval. Payment estimates are for illustration only.</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  function setPdfSlot(index, file) {
    setPdfFiles((current) => {
      const next = [...current];
      next[index] = file || null;
      return next;
    });
  }

  async function importWebsite() {
    if (!websiteUrl.trim()) {
      showToast("Enter website URL first", "error");
      return;
    }

    setSiteLoading(true);
    setSiteStatus("Connecting to website…");
    setSiteResult(null);
    setSitePreview([]);

    const statusTimer = setTimeout(() => setSiteStatus("Still working — some sites are slow (up to 15s)…"), 5000);
    try {
      const response = await fetch("/api/inventory/import-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Website import failed");

      const items = Array.isArray(data.items) ? data.items : [];
      setInventory(items);
      setSitePreview(items.slice(0, 3));
      setSiteResult({ count: items.length, method: data.method || "", error: null });
      setSiteStatus("");
      if (items.length) setTab("Inventory");
    } catch (error) {
      setSiteResult({ count: 0, method: "", error: error.message || "Website import failed." });
      setSiteStatus("");
    } finally {
      clearTimeout(statusTimer);
      setSiteLoading(false);
    }
  }

  async function importPdfs() {
    const selected = pdfFiles.filter(Boolean);
    if (!selected.length) {
      showToast("Choose at least one PDF file first", "error");
      return;
    }

    setPdfLoading(true);
    setPdfStatus(`Processing ${selected.length} file${selected.length > 1 ? "s" : ""}...`);
    setPdfResults([]);

    const fileResults = [];
    const allItems = [];
    for (let fi = 0; fi < selected.length; fi++) {
      const file = selected[fi];
      setPdfStatus(`Processing ${file.name} (${fi + 1}/${selected.length})…`);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetch("/api/inventory/import-pdf", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed`);
        const items = Array.isArray(data.items) ? data.items : [];
        allItems.push(...items);
        fileResults.push({ name: file.name, count: items.length, error: null });
      } catch (err) {
        fileResults.push({ name: file.name, count: 0, error: err.message || "Failed" });
      }
    }

    setPdfResults(fileResults);
    setPdfStatus("");
    if (allItems.length) {
      setInventory(allItems);
      setTab("Inventory");
    }
    setPdfLoading(false);
  }

  if (!unlocked) {
    return (
      <div style={styles.shell}>
        <div style={styles.centerWrap}>
          <div style={styles.loginCard}>
            <div style={styles.rowBetween}>
              <div>
                <div style={styles.loginTitle}>Dixie Motors</div>
                <div style={styles.loginSub}>Enter your password to open the Dealer Portal.</div>
              </div>
              <ThemeToggle mode={themeMode} setMode={setThemeMode} styles={styles} />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="Password"
              style={{ ...styles.input, marginTop: 16 }}
              disabled={loginLoading}
            />
            <button
              onClick={login}
              disabled={loginLoading}
              style={{ ...styles.buttonPrimary, width: "100%", marginTop: 12 }}
            >
              {loginLoading ? "Checking…" : "Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 18px", borderRadius: 10, maxWidth: 340,
          fontWeight: 700, fontSize: 13,
          background: toast.type === "error" ? "#fef2f2" : toast.type === "success" ? "#f0fdf4" : "#eff6ff",
          border: `1px solid ${toast.type === "error" ? "#fecaca" : toast.type === "success" ? "#bbf7d0" : "#bfdbfe"}`,
          color: toast.type === "error" ? "#dc2626" : toast.type === "success" ? "#16a34a" : "#2563eb",
          boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
        }}>
          {toast.msg}
        </div>
      )}
      <div style={styles.app}>
        <header style={styles.header}>
          <div style={styles.row}>
            <div style={styles.brand}>Dixie Motors</div>
            <div>
              <div style={styles.headerTitle}>Dealer Portal</div>
              <div style={styles.headerSub}>VIN decode · Trade pricing · Finance calculator · Facebook ads · Inventory</div>
            </div>
          </div>
          <div style={styles.row}>
            <ThemeToggle mode={themeMode} setMode={setThemeMode} styles={styles} />
            <Pill text="Protected" color={theme.success} />
            <Pill text="Finance Ready" color={theme.primary} />
            <Pill text="Best Deals First" color={theme.warning} />
            <a href="/" target="_blank" rel="noopener" style={{ fontSize: 11, fontWeight: 700, color: theme.primary, textDecoration: "none", border: `1px solid ${theme.primary}44`, borderRadius: 6, padding: "4px 10px" }}>TRADING ↗</a>
          </div>
        </header>

        <section style={styles.hero}>
          <div>
            <div style={styles.heroTitle}>Dixie Motors Command Center</div>
            <div style={styles.heroSub}>Decode any VIN, price trades, calculate payments, build Facebook ads, and manage your full inventory — all in one place.</div>
          </div>
          <div style={styles.heroStats}>
            <StatCard label="Active" value={String(rankedInventory.filter(v => !v.soldPrice).length)} styles={styles} />
            <StatCard label="Sold" value={soldStats ? String(soldStats.count) : "0"} styles={styles} />
            <StatCard label="Total Gross" value={soldStats ? money(soldStats.totalGross) : "$0"} styles={styles} />
            <StatCard label="Payment" value={pricing ? `${money(payment)}/mo` : "-"} styles={styles} />
          </div>
        </section>

        <div style={styles.layout}>
          <aside style={styles.sidebar}>
            <div style={styles.sidebarLabel}>Navigation</div>
            <div style={{ ...styles.card, marginBottom: 12 }}>
              <div style={styles.smallLabel}>Import & Access</div>
              <div style={{ color: theme.muted, lineHeight: 1.6, marginTop: 8 }}>
                Use website import or upload up to {PDF_SLOTS} PDF files at once. To open in any browser, deploy the app or use a public tunnel instead of localhost.
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {TABS.map((item) => (
                <button key={item} onClick={() => setTab(item)} style={tab === item ? styles.navActive : styles.navButton}>{item}</button>
              ))}
            </div>
          </aside>

          <main style={styles.main}>
            <section style={styles.panel}>
              <div style={styles.toolbarGrid}>
                <Field label={vinHistory.length > 0 ? `VIN (${vinHistory.length} recent)` : "VIN"} styles={styles}>
                  <input
                    value={vin}
                    onChange={(e) => setVin(normalizeVin(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && decodeVin()}
                    placeholder="Enter 17-digit VIN"
                    style={styles.input}
                    disabled={vinLoading}
                    list="vin-history-list"
                    autoComplete="off"
                  />
                  {vinHistory.length > 0 && (
                    <datalist id="vin-history-list">
                      {vinHistory.map((h) => <option key={h.vin} value={h.vin}>{h.label}</option>)}
                    </datalist>
                  )}
                </Field>
                <Field label="Source" styles={styles}>
                  <div style={styles.infoBox}>
                    {vinLoading ? "Looking up NHTSA…" : vinSource === "nhtsa" ? "NHTSA — Live" : vinSource === "stub" ? "Fallback — No data" : "Ready"}
                  </div>
                </Field>
                <div style={styles.bottomAlign}>
                  <button onClick={decodeVin} disabled={vinLoading} style={{ ...styles.buttonPrimary, width: "100%", opacity: vinLoading ? 0.6 : 1 }}>
                    {vinLoading ? "Decoding…" : "Run Decode"}
                  </button>
                </div>
              </div>

              {(() => {
                const urlTrimmed = websiteUrl.trim();
                const urlOk = /^https?:\/\/.{4,}/i.test(urlTrimmed);
                const urlBad = urlTrimmed.length > 4 && !urlOk;
                return (
                  <div style={{ ...styles.toolbarGrid, marginTop: 12, gridTemplateColumns: "minmax(0, 2fr) 220px" }}>
                    <Field label="Website URL" styles={styles}>
                      <div style={{ position: "relative" }}>
                        <input
                          value={websiteUrl}
                          onChange={(e) => { setWebsiteUrl(e.target.value); setSiteResult(null); setSitePreview([]); }}
                          onKeyDown={(e) => e.key === "Enter" && urlOk && !siteLoading && importWebsite()}
                          placeholder="https://yourdealerwebsite.com/inventory"
                          style={{ ...styles.input, paddingRight: 36, borderColor: urlBad ? theme.warning : urlOk ? theme.success : undefined }}
                        />
                        {urlOk && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: theme.success, fontSize: 16, pointerEvents: "none" }}>✓</span>}
                        {urlBad && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: theme.warning, fontSize: 16, pointerEvents: "none" }}>✗</span>}
                      </div>
                      {urlBad && <div style={{ fontSize: 11, color: theme.warning, marginTop: 3 }}>URL must start with https:// or http://</div>}
                    </Field>
                    <div style={styles.bottomAlign}>
                      <button onClick={importWebsite} disabled={siteLoading || !urlOk} style={{ ...styles.buttonSuccess, width: "100%", opacity: (!urlOk || siteLoading) ? 0.55 : 1 }}>
                        {siteLoading ? "Importing…" : "Pull Cars"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div style={{ ...styles.pdfGrid, marginTop: 12 }}>
                {Array.from({ length: PDF_SLOTS }).map((_, index) => (
                  <Field key={index} label={`Inventory PDF ${index + 1}`} styles={styles}>
                    <input type="file" accept="application/pdf" onChange={(e) => setPdfSlot(index, e.target.files?.[0] || null)} style={{ ...styles.input, paddingTop: 12 }} />
                  </Field>
                ))}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={importPdfs} style={{ ...styles.buttonWarn, minWidth: 220 }}>{pdfLoading ? "Uploading..." : "Import All PDFs"}</button>
                <button onClick={() => setPdfFiles(Array(PDF_SLOTS).fill(null))} style={styles.buttonGhost}>Clear PDF Boxes</button>
              </div>

              {siteLoading && siteStatus && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, border: `2px solid ${theme.primary}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                  <span style={{ fontSize: 13, color: theme.muted }}>{siteStatus}</span>
                </div>
              )}
              {!siteLoading && siteResult && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${siteResult.error ? theme.warning + "66" : theme.success + "66"}`, background: siteResult.error ? theme.warning + "11" : theme.success + "11", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{siteResult.error ? "⚠️" : siteResult.count === 0 ? "🔍" : "✅"}</span>
                    <div style={{ flex: 1 }}>
                      {siteResult.error
                        ? <>
                            <div style={{ fontSize: 13, color: theme.warning, fontWeight: 600 }}>{siteResult.error}</div>
                            <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
                              Try the direct inventory page URL (e.g. <code>/inventory</code> or <code>/used-cars</code>). Dealer sites with login walls or heavy JS may not be parseable.
                            </div>
                          </>
                        : siteResult.count === 0
                          ? <>
                              <div style={{ fontSize: 13, color: theme.muted, fontWeight: 600 }}>No vehicles detected on that page.</div>
                              <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
                                Try a more specific URL like <code>/used-inventory</code>, <code>/vehicles/used</code>, or export the lot as a PDF and use the PDF import instead.
                              </div>
                            </>
                          : <>
                              <div style={{ fontSize: 13, color: theme.success, fontWeight: 600 }}>
                                {siteResult.count} vehicle{siteResult.count !== 1 ? "s" : ""} imported
                                {siteResult.method && <span style={{ fontWeight: 400, color: theme.muted, fontSize: 11 }}> via {siteResult.method}</span>}
                              </div>
                              <button onClick={() => setTab("Inventory")} style={{ marginTop: 5, background: "transparent", border: "none", padding: 0, color: theme.primary, fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                                View in Inventory tab →
                              </button>
                            </>
                      }
                    </div>
                  </div>
                  {sitePreview.length > 0 && (
                    <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface }}>
                      <div style={{ fontSize: 10, color: theme.muted, fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em" }}>PREVIEW — FIRST {sitePreview.length} VEHICLES</div>
                      {sitePreview.map((v, i) => (
                        <div key={i} style={{ fontSize: 12, color: theme.text, padding: "3px 0", borderTop: i > 0 ? `1px solid ${theme.border}` : "none" }}>
                          {v.year} {v.make} {v.model}{v.trim ? " " + v.trim : ""} · {v.mileage ? v.mileage.toLocaleString() + " mi" : "—"} · {v.price ? "$" + v.price.toLocaleString() : "no price"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {pdfLoading && pdfStatus && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, border: `2px solid ${theme.warning}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                  <span style={{ fontSize: 13, color: theme.muted }}>{pdfStatus}</span>
                </div>
              )}
              {!pdfLoading && pdfResults.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {pdfResults.map((r, i) => {
                    const isWarn = r.error || r.count === 0;
                    return (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${isWarn ? theme.warning + "66" : theme.success + "66"}`, background: isWarn ? theme.warning + "11" : theme.success + "11", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>{isWarn ? "⚠️" : "✅"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: theme.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                          {r.error
                            ? <div style={{ fontSize: 11, color: theme.warning }}>{r.error}</div>
                            : r.count === 0
                              ? <>
                                  <div style={{ fontSize: 11, color: theme.warning }}>No vehicles found — PDF may be a scanned image</div>
                                  <div style={{ fontSize: 10, color: theme.muted, marginTop: 2 }}>Only text-based PDFs work. Try exporting from your DMS as a text PDF, or copy-paste the lot list into a .txt file.</div>
                                </>
                              : <div style={{ fontSize: 11, color: theme.success }}>{r.count} vehicle{r.count !== 1 ? "s" : ""} imported</div>
                          }
                        </div>
                      </div>
                    );
                  })}
                  {pdfResults.length > 1 && (() => {
                    const total = pdfResults.reduce((s, r) => s + r.count, 0);
                    return total > 0 ? (
                      <div style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.primary}44`, background: `${theme.primary}0d`, fontSize: 12, fontWeight: 700, color: theme.primary }}>
                        Total: {total} vehicle{total !== 1 ? "s" : ""} imported from {pdfResults.length} files — switched to Inventory tab
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </section>

            {tab === "Overview" && (
              <React.Fragment>
              <div style={styles.twoCol}>
                <Panel title="Business Snapshot" badge="Overview" styles={styles}>
                  <div style={styles.metricGrid}>
                    <MetricCard label="Vehicle" value={vehicle ? `${vehicle.year} ${vehicle.make}` : "Waiting"} styles={styles} />
                    <MetricCard label="Market Value" value={pricing ? money(pricing.suggested) : "-"} styles={styles} />
                    <MetricCard label="Payment" value={pricing ? `${money(payment)}/mo` : "-"} styles={styles} />
                    <MetricCard label="Active Inventory" value={String(rankedInventory.filter(v => !v.soldPrice).length)} styles={styles} />
                    <MetricCard label="Gross Profit" value={soldStats ? money(soldStats.totalGross) : "$0"} styles={styles} />
                  </div>

                  <div style={styles.card}>
                    <div style={styles.rowBetween}>
                      <div>
                        <div style={styles.smallLabel}>Appearance</div>
                        <div style={{ color: theme.muted, marginTop: 6 }}>Switch the app colors inside the app.</div>
                      </div>
                      <div style={styles.row}>
                        <button onClick={() => setThemeMode("dark")} style={themeMode === "dark" ? styles.buttonPrimary : styles.buttonGhost}>Dark</button>
                        <button onClick={() => setThemeMode("light")} style={themeMode === "light" ? styles.buttonPrimary : styles.buttonGhost}>Light</button>
                      </div>
                    </div>
                  </div>

                  {pricing ? (
                    <div style={styles.card}>
                      <InfoRow label="Trade Range" value={`${money(pricing.roughTrade)} - ${money(pricing.cleanTrade)}`} styles={styles} />
                      <InfoRow label="Total Cost" value={money(pricing.totalCost)} styles={styles} />
                      <InfoRow label="Clean Trade Value" value={money(pricing.cleanTrade)} styles={styles} />
                      <InfoRow label="Cost / Clean Trade Ratio" value={pricing.ratio.toFixed(2)} styles={styles} />
                      <InfoRow label="Potential Front-End" value={money(pricing.frontEnd)} strong styles={styles} />
                    </div>
                  ) : (
                    <EmptyState text="Decode a VIN to populate the dashboard." styles={styles} />
                  )}
                </Panel>

                <Panel title="Best Trade Targets" badge="Ranked" styles={styles}>
                  {lotStats && (
                    <>
                      <div style={styles.card}>
                        <InfoRow label="Active Units" value={String(lotStats.activeCount)} strong styles={styles} />
                        <InfoRow label="Lot Total Value" value={money(lotStats.totalValue)} styles={styles} />
                        <InfoRow label="Avg Market Price" value={money(lotStats.avgPrice)} styles={styles} />
                        <InfoRow label="Total Front-End Potential" value={money(lotStats.totalFrontEnd)} styles={styles} />
                        {lotStats.avgDaysOnLot != null && <InfoRow label="Avg Days on Lot" value={`${lotStats.avgDaysOnLot} days`} styles={styles} />}
                        {lotStats.aged30 > 0 && <InfoRow label="Units 30+ Days" value={String(lotStats.aged30)} styles={styles} />}
                        {lotStats.aged45 > 0 && <InfoRow label="Units 45+ Days (Age Risk)" value={String(lotStats.aged45)} strong styles={styles} />}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
                        {["A", "B", "C", "D"].map((g) => {
                          const colors = { A: ["#16a34a", "#f0fdf4", "#bbf7d0"], B: ["#2563eb", "#eff6ff", "#bfdbfe"], C: ["#d97706", "#fffbeb", "#fde68a"], D: ["#dc2626", "#fef2f2", "#fecaca"] };
                          const [clr, bg, border] = colors[g];
                          return (
                            <div key={g} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontWeight: 900, fontSize: 18, color: clr }}>{g}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: theme.text }}>{lotStats.grades[g] || 0}</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {rankedInventory.slice(0, 3).map((item) => {
                      const g = dealGrade(item.score);
                      return (
                      <button key={item.vin} onClick={() => chooseVehicle(item)} style={{ ...styles.listButton, display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: g.bg, border: `1.5px solid ${g.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 14, color: g.color, marginTop: 2 }}>{g.grade}</div>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 900 }}>{`${item.year} ${item.make} ${item.model} ${item.trim}`}</div>
                          <div style={{ marginTop: 4, color: theme.muted }}>
                            Score {item.score} · Cost {money(item.pricing.totalCost)} · Clean Trade {money(item.pricing.cleanTrade)} · Ratio {item.pricing.ratio.toFixed(2)}
                          </div>
                        </div>
                      </button>
                      );
                    })}
                  </div>
                </Panel>
              </div>

              {/* Aged Inventory Alert */}
              {(() => {
                const aged = rankedInventory.filter(v => !v.soldPrice && v.daysOnLot >= 30).sort((a, b) => b.daysOnLot - a.daysOnLot);
                if (!aged.length) return null;
                return (
                  <div style={{ ...styles.card, marginTop: 14, borderColor: aged.some(v => v.daysOnLot >= 45) ? "#f59e0b" : styles.card.borderColor }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#d97706", letterSpacing: "0.06em" }}>⚠️ AGED INVENTORY — {aged.length} UNIT{aged.length !== 1 ? "S" : ""} 30+ DAYS</div>
                      <div style={{ fontSize: 11, color: theme.muted }}>{aged.filter(v => v.daysOnLot >= 45).length} at 45+ days</div>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {aged.slice(0, 6).map(v => {
                        const urgency = v.daysOnLot >= 60 ? "#dc2626" : v.daysOnLot >= 45 ? "#d97706" : theme.muted;
                        const dropPct = v.daysOnLot >= 60 ? 8 : v.daysOnLot >= 45 ? 5 : 3;
                        const suggested = Math.round(v.pricing.suggested * (1 - dropPct / 100) / 100) * 100;
                        return (
                          <div key={v.vin} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: theme.soft, borderRadius: 6, padding: "8px 10px", border: `1px solid ${urgency}33` }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{v.year} {v.make} {v.model} {v.trim}</div>
                              <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>{v.mileage?.toLocaleString()} mi · Current ask {money(v.pricing.suggested)}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: urgency }}>{v.daysOnLot}d</div>
                              <div style={{ fontSize: 11, color: theme.muted }}>→ {money(suggested)} <span style={{ color: "#dc2626" }}>(-{dropPct}%)</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              </React.Fragment>
            )}

            {tab === "Vehicle" && (
              <Panel title="Vehicle Workspace" badge={vinSource === "nhtsa" ? "NHTSA Live" : vinSource === "stub" ? "Fallback Data" : "Decoded"} styles={styles}>
                {vehicle ? (
                  <>
                    <div style={styles.detailsGrid}>
                      <div>
                        <InfoRow label="VIN" value={vehicle.vin} styles={styles} />
                        <InfoRow label="Year" value={vehicle.year} styles={styles} />
                        <InfoRow label="Make" value={vehicle.make} styles={styles} />
                        <InfoRow label="Model" value={vehicle.model} styles={styles} />
                        <InfoRow label="Trim" value={vehicle.trim || "—"} styles={styles} />
                        <InfoRow label="Mileage" value={vehicle.mileage ? String(vehicle.mileage) : "Enter below"} styles={styles} />
                      </div>
                      <div>
                        <InfoRow label="Body" value={vehicle.body || "—"} styles={styles} />
                        <InfoRow label="Engine" value={vehicle.engine || "—"} styles={styles} />
                        <InfoRow label="Drive" value={vehicle.drive || "—"} styles={styles} />
                        <InfoRow label="Fuel" value={vehicle.fuel || "—"} styles={styles} />
                        <InfoRow label="Transmission" value={vehicle.transmission || "—"} styles={styles} />
                        <InfoRow label="Condition" value={vehicle.condition} styles={styles} />
                      </div>
                    </div>
                    <div style={{ ...styles.threeCol, marginTop: 14 }}>
                      <Field label="Mileage" styles={styles}>
                        <input value={vehicle.mileage || ""} onChange={(e) => setVehicle(v => ({ ...v, mileage: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} placeholder="e.g. 85000" style={styles.input} />
                      </Field>
                      <Field label="Asking Price ($)" styles={styles}>
                        <input value={vehicle.price || ""} onChange={(e) => setVehicle(v => ({ ...v, price: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} placeholder="e.g. 18995" style={styles.input} />
                      </Field>
                      <Field label="Condition" styles={styles}>
                        <select value={vehicle.condition || "Good"} onChange={(e) => setVehicle(v => ({ ...v, condition: e.target.value }))} style={styles.input}>
                          {["Excellent", "Very Good", "Good", "Fair", "Rough"].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button
                        onClick={() => {
                          const already = inventory.some(v => v.vin === vehicle.vin);
                          if (already) { showToast("This VIN is already in inventory", "error"); return; }
                          setInventory(prev => [{ vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim || "", mileage: vehicle.mileage || 0, price: vehicle.price || 0, condition: vehicle.condition || "Good", addedAt: new Date().toISOString() }, ...prev]);
                          showToast(`${vehicle.year} ${vehicle.make} ${vehicle.model} added to inventory`, "success");
                        }}
                        style={styles.buttonSuccess}
                      >+ Add to Inventory</button>
                      <button onClick={() => setTab("Finance")} style={styles.buttonGhost}>View Finance</button>
                      <button onClick={() => setTab("Facebook")} style={styles.buttonGhost}>Build Ad</button>
                      <button onClick={fetchComps} style={styles.buttonGhost} disabled={compsLoading}>
                        {compsLoading ? "Loading…" : "Market Comps"}
                      </button>
                      <button onClick={printVehicleSheet} style={styles.buttonGhost}>Print Sheet</button>
                    </div>

                    {/* AI Description Generator */}
                    <div style={{ ...styles.card, marginTop: 14 }}>
                      <div style={styles.rowBetween}>
                        <div style={styles.smallLabel}>AI Description Generator</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["facebook", "website", "craigslist", "summary"].map(s => (
                            <button key={s} onClick={() => { setAiDescStyle(s); setAiDesc(""); }} style={aiDescStyle === s ? styles.buttonPrimary : styles.buttonGhost}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={generateDescription} disabled={aiDescLoading} style={{ ...styles.buttonPrimary, flexShrink: 0 }}>
                          {aiDescLoading ? "Generating…" : "Generate"}
                        </button>
                        {aiDesc && (
                          <button onClick={() => navigator.clipboard.writeText(aiDesc).catch(() => {})} style={{ ...styles.buttonSuccess, flexShrink: 0 }}>
                            Copy
                          </button>
                        )}
                      </div>
                      {aiDesc ? (
                        <textarea
                          value={aiDesc}
                          onChange={e => setAiDesc(e.target.value)}
                          style={{ ...styles.textarea, marginTop: 10, minHeight: 160, fontSize: 13 }}
                        />
                      ) : (
                        <div style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>
                          Pick a platform style and click Generate to create a ready-to-post listing description.
                        </div>
                      )}
                    </div>
                    <div style={{ ...styles.card, marginTop: 14 }}>
                      <div style={styles.smallLabel}>Vehicle History</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <a
                          href={`https://www.carfax.com/VehicleHistory/ar20/p/Report.cfx?vin=${vehicle.vin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...styles.buttonGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", height: 46, padding: "0 16px", borderRadius: 12 }}
                        >CARFAX Report</a>
                        <a
                          href={`https://www.autocheck.com/vehiclehistory/autocheck/en/vehiclehistory?vin=${vehicle.vin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...styles.buttonGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", height: 46, padding: "0 16px", borderRadius: 12 }}
                        >AutoCheck Report</a>
                        <a
                          href={`https://www.nhtsa.gov/vehicle/${vehicle.vin}/complaints`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...styles.buttonGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", height: 46, padding: "0 16px", borderRadius: 12 }}
                        >NHTSA Complaints</a>
                      </div>
                    </div>
                    {comps && (
                      <div style={{ ...styles.card, marginTop: 14 }}>
                        <div style={styles.rowBetween}>
                          <div style={styles.smallLabel}>Market Comps</div>
                          <div style={{ color: theme.muted, fontSize: 11 }}>{comps.note}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: theme.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Market Value</div>
                            <div style={{ fontWeight: 900, fontSize: 20, color: theme.accent }}>{money(comps.marketValue)}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: theme.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Price Range</div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{money(comps.priceRange.low)} – {money(comps.priceRange.high)}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: theme.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Avg DOM</div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{comps.avgDaysOnMarket} days</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                          <InfoRow label="Clean Trade Est." value={money(comps.cleanTrade)} styles={styles} />
                          <InfoRow label="Rough Trade Est." value={money(comps.roughTrade)} styles={styles} />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Similar Listings</div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {comps.comps.map((c, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: theme.soft, borderRadius: 8, fontSize: 12 }}>
                                <div>
                                  <span style={{ fontWeight: 700 }}>{c.year} {c.make} {c.model}</span>
                                  <span style={{ color: theme.muted, marginLeft: 8 }}>{c.mileage.toLocaleString()} mi · {c.condition} · {c.source}</span>
                                </div>
                                <div style={{ fontWeight: 800 }}>{money(c.price)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState text="Enter a VIN and click Run Decode." styles={styles} />
                )}
              </Panel>
            )}

            {tab === "Deal Finder" && (
              <Panel title="Deal Finder" badge="No API key needed" styles={styles}>
                <div style={{ fontSize: 13, color: styles.smallLabel.color, marginBottom: 12 }}>
                  <b>Step 1:</b> decode a VIN to get a free market-value estimate. <b>Step 2:</b> paste the listings you found, and it scores each 0–100, grades risk, and ranks the best deals. No keys, no cost.
                </div>

                {/* Step 1 */}
                <div style={{ ...styles.threeCol }}>
                  <Field label="VIN (17 chars)" styles={styles}>
                    <input value={dfVin} onChange={(e) => setDfVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))} placeholder={vehicle?.vin || "1HGCM82633A004352"} style={styles.input} />
                  </Field>
                  <Field label="Subject Mileage" styles={styles}>
                    <input value={dfMileage} onChange={(e) => setDfMileage(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 85000" style={styles.input} />
                  </Field>
                  <Field label=" " styles={styles}>
                    <button onClick={dfDecodeAndValue} disabled={dfLoading} style={styles.buttonPrimary}>{dfLoading ? "Decoding…" : "1 · Decode & Value"}</button>
                  </Field>
                </div>
                {vehicle?.vin && <button onClick={() => { setDfVin(vehicle.vin); setDfMileage(String(vehicle.mileage || "")); }} style={{ ...styles.buttonGhost, marginTop: 4 }}>Use decoded VIN from Vehicle tab</button>}
                {dfError && <div style={{ ...styles.card, marginTop: 12, borderColor: "#dc2626", color: "#dc2626" }}>{dfError}</div>}

                {dfVehicle && (
                  <div style={{ ...styles.card, marginTop: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{dfVehicle.year} {dfVehicle.make} {dfVehicle.model}{dfVehicle.trim ? " " + dfVehicle.trim : ""}</div>
                    <div style={{ fontSize: 12, color: styles.smallLabel.color }}>{dfVehicle.engine} · {dfVehicle.drive} · {dfVehicle.transmission} · {dfVehicle.mileage ? dfVehicle.mileage.toLocaleString() + " mi" : "—"}</div>
                    {dfMarket && <div style={{ marginTop: 8, fontSize: 14 }}>Est. market: <b>{money(dfMarket.low)}</b> low · <b>{money(dfMarket.average)}</b> avg · <b>{money(dfMarket.high)}</b> high <span style={{ fontSize: 11, color: styles.smallLabel.color }}>(heuristic estimate)</span></div>}
                  </div>
                )}

                {/* Step 2 */}
                {dfVehicle && (
                  <div style={{ marginTop: 14 }}>
                    <Field label="Paste listings — one per line:  price, miles, title, location, link" styles={styles}>
                      <textarea value={dfPaste} onChange={(e) => setDfPaste(e.target.value)} rows={6}
                        placeholder={"18995, 82000, clean, Cincinnati OH, https://...\n17500, 110000, rebuilt, Dayton OH\n19900, 65000, clean accident-reported, Columbus OH"}
                        style={{ ...styles.input, fontFamily: "monospace", resize: "vertical" }} />
                    </Field>
                    <button onClick={dfScoreDeals} style={{ ...styles.buttonPrimary, marginTop: 8 }}>2 · Score & Rank Deals</button>
                    <div style={{ fontSize: 11, color: styles.smallLabel.color, marginTop: 4 }}>Title keywords: <b>clean</b> = green · <b>accident/branded</b> = yellow · <b>rebuilt</b> = red · <b>salvage/flood</b> = blacklist. Only price is required per line.</div>
                  </div>
                )}

                {dfResult && (() => {
                  const a = dfResult;
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ ...styles.threeCol }}>
                        {[["Market Low", a.market.low], ["Market Avg", a.market.average], ["Market High", a.market.high]].map(([l, val]) => (
                          <div key={l} style={{ ...styles.card, textAlign: "center" }}><div style={styles.smallLabel}>{l}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{val ? money(val) : "—"}</div></div>
                        ))}
                      </div>

                      <div style={{ ...styles.card, marginTop: 12 }}>
                        <div style={styles.smallLabel}>TOP PICKS</div>
                        {[["🥇 Top Deal", a.picks.topDeal], ["💰 Cheapest", a.picks.cheapest], ["🛡 Best Safe Deal", a.picks.bestSafeDeal], ["📈 Best Resale Profit", a.picks.bestProfit]].map(([l, val]) => val && (
                          <div key={l} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 13 }}><span style={{ fontWeight: 700, minWidth: 150 }}>{l}</span><span>{val}</span></div>
                        ))}
                      </div>

                      <div style={{ ...styles.card, marginTop: 12, overflowX: "auto" }}>
                        <div style={styles.smallLabel}>RANKED LISTINGS ({a.listings.length})</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
                          <thead><tr style={{ textAlign: "left", color: styles.smallLabel.color }}>
                            {["Score", "Price", "Miles", "Risk", "Position", "Est. Margin", "Location"].map(h => <th key={h} style={{ padding: "4px 6px" }}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {a.listings.map((li, i) => {
                              const rc = { GREEN: "#16a34a", YELLOW: "#d97706", RED: "#dc2626", BLACKLIST: "#000" }[li.risk] || "#666";
                              const sc = li.score >= 75 ? "#16a34a" : li.score >= 55 ? "#d97706" : "#dc2626";
                              return (
                                <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                                  <td style={{ padding: "5px 6px", fontWeight: 800, color: sc }}>{li.score}</td>
                                  <td style={{ padding: "5px 6px" }}>{li.source ? <a href={li.source} target="_blank" rel="noopener" style={{ color: styles.buttonPrimary.background }}>{money(li.price)}</a> : money(li.price)}</td>
                                  <td style={{ padding: "5px 6px" }}>{li.mileage ? li.mileage.toLocaleString() : "—"}</td>
                                  <td style={{ padding: "5px 6px", fontWeight: 700, color: rc }}>{li.risk}</td>
                                  <td style={{ padding: "5px 6px" }}>{li.pricePosition}</td>
                                  <td style={{ padding: "5px 6px", color: li.profit >= 0 ? "#16a34a" : "#dc2626" }}>{li.profit >= 0 ? "+" : ""}{money(li.profit)}</td>
                                  <td style={{ padding: "5px 6px" }}>{li.location || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {a.riskAlerts.length > 0 && (
                        <div style={{ ...styles.card, marginTop: 12, borderColor: "#dc2626" }}>
                          <div style={{ ...styles.smallLabel, color: "#dc2626" }}>⚠️ RISK ALERTS</div>
                          {a.riskAlerts.map((r, i) => <div key={i} style={{ fontSize: 13, padding: "2px 0" }}>• {r}</div>)}
                        </div>
                      )}

                      <div style={{ ...styles.threeCol, marginTop: 12 }}>
                        <div style={{ ...styles.card, textAlign: "center" }}><div style={styles.smallLabel}>Est. Resale Range</div><div style={{ fontSize: 16, fontWeight: 800 }}>{money(a.resaleRange.low)}–{money(a.resaleRange.high)}</div></div>
                        <div style={{ ...styles.card, textAlign: "center" }}><div style={styles.smallLabel}>Suggested Max Buy</div><div style={{ fontSize: 20, fontWeight: 800, color: styles.buttonPrimary.background }}>{money(a.priceCeiling)}</div></div>
                      </div>
                    </div>
                  );
                })()}
              </Panel>
            )}

            {tab === "Price Beater" && (() => {
              const counts = { cheapest: 0, not_cheapest: 0, close: 0, no_comps: 0, unscanned: 0 };
              inventory.forEach(v => {
                const r = pbResults[v.vin];
                if (!r || !r.scanned) counts.unscanned++;
                else if (r.status === "cheapest") counts.cheapest++;
                else if (r.status === "not_cheapest") counts.not_cheapest++;
                else if (r.status === "close") counts.close++;
                else if (r.status === "no_comps") counts.no_comps++;
              });
              const dot = (s) => ({ cheapest: "#16a34a", not_cheapest: "#dc2626", close: "#d97706", no_comps: "#9ca3af", scanning: "#1a56db" }[s] || "#9ca3af");
              const badge = (r) => {
                if (!r || !r.scanned) {
                  if (r?.status === "scanning") return <span style={{ color: "#1a56db" }}>scanning…</span>;
                  if (r?.status === "error") return <span title={r.error} style={{ color: "#dc2626" }}>error</span>;
                  return <span style={{ color: "#9ca3af" }}>—</span>;
                }
                const map = { cheapest: ["✓ Cheapest", "#16a34a"], not_cheapest: ["✕ Reprice", "#dc2626"], close: ["⚠ Close", "#d97706"], no_comps: ["No comps", "#6b7280"] };
                const [t, c] = map[r.status] || ["—", "#6b7280"];
                return <span style={{ color: c, fontWeight: 600 }}>{t}</span>;
              };
              return (
                <Panel title="Price Beater — Am I Cheapest?" badge="AI Live Search" styles={styles}>
                  <div style={{ fontSize: 13, color: styles.smallLabel.color, marginBottom: 12 }}>
                    For every car in your inventory, AI searches CarGurus / Cars.com / AutoTrader within range of 45014 and tells you if you're the <b>cheapest</b> — or by how much you need to <b>reprice to win</b>. Your own listings are excluded.
                  </div>
                  <div style={{ ...styles.threeCol, gridTemplateColumns: "repeat(5,1fr)" }}>
                    {[["✓ Cheapest", counts.cheapest, "#16a34a"], ["✕ Reprice", counts.not_cheapest, "#dc2626"], ["⚠ Close", counts.close, "#d97706"], ["No comps", counts.no_comps, "#6b7280"], ["Not scanned", counts.unscanned, "#9ca3af"]].map(([l, n, c]) => (
                      <div key={l} style={{ ...styles.card, textAlign: "center" }}><div style={styles.smallLabel}>{l}</div><div style={{ fontSize: 20, fontWeight: 800, color: c }}>{n}</div></div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={pbScanAll} disabled={pbScanning} style={styles.buttonPrimary}>{pbScanning ? "Scanning…" : "▶ Scan All Inventory"}</button>
                    <Field label="" styles={styles}>
                      <select value={pbRadius} onChange={(e) => setPbRadius(Number(e.target.value))} style={styles.input}>
                        {[50, 100, 200, 300].map(r => <option key={r} value={r}>{r} mi</option>)}
                      </select>
                    </Field>
                    {Object.keys(pbResults).length > 0 && <button onClick={() => savePbResults({})} style={styles.buttonGhost}>Reset scans</button>}
                  </div>
                  {pbStatus && <div style={{ ...styles.card, marginTop: 10, fontSize: 12 }}>{pbStatus}</div>}
                  {!inventory.length && <div style={{ ...styles.card, marginTop: 12 }}>No inventory yet — add vehicles in the Inventory tab first.</div>}

                  {inventory.length > 0 && (
                    <div style={{ ...styles.card, marginTop: 12, overflowX: "auto", padding: 0 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr style={{ textAlign: "left", color: styles.smallLabel.color }}>
                          {["", "Status", "My Price", "Vehicle", "Miles", "Cheapest Comp", "Gap", "Reprice", ""].map((h, i) => <th key={i} style={{ padding: "8px 10px" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {[...inventory].sort((a, b) => (a.price || 0) - (b.price || 0)).map(v => {
                            const r = pbResults[v.vin] || {};
                            return (
                              <tr key={v.vin} style={{ borderTop: "1px solid #eee" }}>
                                <td style={{ padding: "8px 10px" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: dot(r.status), display: "inline-block" }} /></td>
                                <td style={{ padding: "8px 10px" }}>{badge(r)}</td>
                                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{money(v.price || 0)}</td>
                                <td style={{ padding: "8px 10px" }}>{v.year} {v.make} {v.model} <span style={{ color: styles.smallLabel.color }}>{v.trim}</span></td>
                                <td style={{ padding: "8px 10px" }}>{v.mileage ? v.mileage.toLocaleString() : "—"}</td>
                                <td style={{ padding: "8px 10px" }}>{r.compPrice ? <>{r.link ? <a href={r.link} target="_blank" rel="noopener" style={{ color: styles.buttonPrimary.background }}>{money(r.compPrice)}</a> : money(r.compPrice)}<div style={{ fontSize: 10, color: styles.smallLabel.color }}>{r.source}{r.dealer ? " · " + r.dealer : ""}</div></> : "—"}</td>
                                <td style={{ padding: "8px 10px", fontWeight: 700, color: r.gap == null ? "#6b7280" : r.gap >= 0 ? "#16a34a" : "#dc2626" }}>{r.gap == null ? "—" : (r.gap >= 0 ? "+" : "") + money(r.gap)}</td>
                                <td style={{ padding: "8px 10px", color: "#dc2626" }}>{r.suggested ? money(r.suggested) : "—"}</td>
                                <td style={{ padding: "8px 10px" }}><button onClick={() => pbScanVehicle(v)} disabled={r.status === "scanning" || pbScanning} style={{ ...styles.buttonGhost, height: 26, padding: "0 8px", fontSize: 11 }}>{r.status === "scanning" ? "…" : "🤖 Scan"}</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              );
            })()}

            {tab === "Finance" && (
              <div style={{ display: "grid", gap: 18 }}>
                <div style={styles.twoCol}>
                  <Panel title="Finance Controls" badge="Editable" styles={styles}>
                    <div style={styles.threeCol}>
                      <Field label="APR %" styles={styles}><input value={finance.apr} onChange={(e) => setFinance((s) => ({ ...s, apr: e.target.value }))} style={styles.input} /></Field>
                      <Field label="Down Payment" styles={styles}><input value={finance.downPayment} onChange={(e) => setFinance((s) => ({ ...s, downPayment: e.target.value.replace(/[^0-9]/g, "") }))} style={styles.input} /></Field>
                      <Field label="Term Months" styles={styles}><input value={finance.termMonths} onChange={(e) => setFinance((s) => ({ ...s, termMonths: e.target.value.replace(/[^0-9]/g, "") }))} style={styles.input} /></Field>
                    </div>
                    {financeDetail ? (
                      <div style={styles.card}>
                        <InfoRow label="Amount Financed" value={money(financeDetail.principal)} styles={styles} />
                        <InfoRow label="Monthly Payment" value={`${money(financeDetail.pmt)}/mo`} strong styles={styles} />
                        <InfoRow label="Total Interest Paid" value={money(financeDetail.totalInterest)} styles={styles} />
                        <InfoRow label="Total Cost of Loan" value={money(financeDetail.totalPaid)} styles={styles} />
                        <InfoRow label="Disclosure" value={`after ${money(finance.downPayment)} down (W.A.C.)`} styles={styles} />
                      </div>
                    ) : (
                      <div style={styles.card}><span style={{ color: theme.muted, fontSize: 13 }}>Decode a vehicle first.</span></div>
                    )}
                  </Panel>

                  <Panel title="Finance Preview" badge="Copy Ready" styles={styles}>
                    <div style={{ color: theme.muted, whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: 13 }}>
                      {pricing ? `Estimated payment ${money(payment)}/mo after ${money(finance.downPayment)} down (W.A.C.)

${FINANCE_LINE}` : "Decode a vehicle first to generate finance wording."}
                    </div>
                    {pricing && (
                      <button
                        onClick={() => navigator.clipboard.writeText(`Estimated payment ${money(payment)}/mo after ${money(finance.downPayment)} down (W.A.C.)\n\n${FINANCE_LINE}`).catch(() => {})}
                        style={{ ...styles.buttonSuccess, marginTop: 12, width: "100%" }}
                      >Copy Finance Text</button>
                    )}
                  </Panel>
                </div>

                {financeDetail && (
                  <div style={styles.twoCol}>
                    <Panel title="Term Comparison" badge={`${finance.apr}% APR`} styles={styles}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: theme.soft }}>
                            <th style={{ padding: "8px 10px", textAlign: "left", color: theme.muted, fontWeight: 600, fontSize: 11 }}>Term</th>
                            <th style={{ padding: "8px 10px", textAlign: "right", color: theme.muted, fontWeight: 600, fontSize: 11 }}>Payment/mo</th>
                            <th style={{ padding: "8px 10px", textAlign: "right", color: theme.muted, fontWeight: 600, fontSize: 11 }}>Total Interest</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financeDetail.terms.map((t) => (
                            <tr key={t.months} style={{ background: t.months === Number(finance.termMonths) ? theme.soft : "transparent" }}>
                              <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, fontWeight: t.months === Number(finance.termMonths) ? 700 : 400, color: theme.text }}>
                                {t.months} mo{t.months === Number(finance.termMonths) ? " ★" : ""}
                              </td>
                              <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, textAlign: "right", fontWeight: t.months === Number(finance.termMonths) ? 700 : 400, color: theme.primary }}>{money(t.payment)}/mo</td>
                              <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, textAlign: "right", color: theme.muted }}>{money(t.totalInterest)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Panel>

                    <Panel title="APR Comparison" badge={`${finance.termMonths} months`} styles={styles}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: theme.soft }}>
                            <th style={{ padding: "8px 10px", textAlign: "left", color: theme.muted, fontWeight: 600, fontSize: 11 }}>APR</th>
                            <th style={{ padding: "8px 10px", textAlign: "right", color: theme.muted, fontWeight: 600, fontSize: 11 }}>Payment/mo</th>
                            <th style={{ padding: "8px 10px", textAlign: "right", color: theme.muted, fontWeight: 600, fontSize: 11 }}>vs Current</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financeDetail.aprs.map((a) => {
                            const diff = a.payment - financeDetail.pmt;
                            const isCurrent = Math.abs(a.apr - Number(finance.apr)) < 0.01;
                            return (
                              <tr key={a.apr} style={{ background: isCurrent ? theme.soft : "transparent" }}>
                                <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, fontWeight: isCurrent ? 700 : 400, color: theme.text }}>
                                  {a.apr.toFixed(1)}%{isCurrent ? " ★" : ""}
                                </td>
                                <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, textAlign: "right", fontWeight: isCurrent ? 700 : 400, color: theme.primary }}>{money(a.payment)}/mo</td>
                                <td style={{ padding: "8px 10px", borderTop: `1px solid ${theme.border}`, textAlign: "right", color: diff < 0 ? theme.success : diff > 0 ? "#dc2626" : theme.muted }}>
                                  {isCurrent ? "—" : `${diff >= 0 ? "+" : ""}${money(diff)}/mo`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Panel>
                  </div>
                )}

                {/* Deal Worksheet */}
                {(() => {
                  const salePrice = Number(deal.salePrice) || (pricing ? pricing.suggested : 0);
                  const tradeValue = Number(deal.tradeValue) || 0;
                  const tradeOwed = Number(deal.tradeOwed) || 0;
                  const taxPct = Number(deal.salesTaxPct) || 0;
                  const docFee = Number(deal.docFee) || 0;
                  const titleFee = Number(deal.titleFee) || 0;
                  const tagFee = Number(deal.tagFee) || 0;
                  const netTrade = tradeValue - tradeOwed;
                  const taxableAmount = Math.max(0, salePrice - Math.max(0, netTrade));
                  const salesTaxAmt = taxableAmount * taxPct / 100;
                  const totalFees = docFee + titleFee + tagFee;
                  const cashDown = Number(finance.downPayment) || 0;
                  const amtFinanced = Math.max(0, salePrice + salesTaxAmt + totalFees - Math.max(0, netTrade) - cashDown);
                  const pmt = monthlyPayment(amtFinanced, finance.apr, finance.termMonths, 0);

                  function printDealSheet() {
                    const title = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle";
                    const w = window.open("", "_blank", "width=720,height=860");
                    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Deal Worksheet – ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;color:#0f172a;padding:28px;max-width:620px;margin:0 auto;font-size:13px}
h2{font-size:20px;font-weight:900;margin-bottom:2px}
.sub{color:#64748b;font-size:12px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
td{padding:7px 10px;border-bottom:1px solid #e2e8f0}
td:last-child{text-align:right;font-weight:600}
.section{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;padding:10px 10px 4px;border-bottom:2px solid #0f172a}
.total td{font-weight:900;font-size:15px;background:#f8fafc;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a}
.payment-box{background:#0f172a;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;margin-top:16px}
.payment-box .big{font-size:32px;font-weight:900}
.payment-box .label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.disc{font-size:11px;color:#94a3b8;margin-top:4px}
footer{margin-top:16px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
@media print{.payment-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<h2>Deal Worksheet</h2>
<div class="sub">${title}${vehicle ? ` · VIN: ${vehicle.vin}` : ""} · ${new Date().toLocaleDateString()}</div>
<table>
<tr><td class="section" colspan="2">Vehicle</td></tr>
<tr><td>Sale Price</td><td>${money(salePrice)}</td></tr>
${tradeValue > 0 ? `<tr><td>Trade-In Value</td><td>${money(tradeValue)}</td></tr>` : ""}
${tradeOwed > 0 ? `<tr><td>Payoff Balance</td><td>(${money(tradeOwed)})</td></tr>` : ""}
${tradeValue > 0 ? `<tr><td>Net Trade</td><td>${netTrade >= 0 ? money(netTrade) : "("+money(Math.abs(netTrade))+")"}</td></tr>` : ""}
<tr><td class="section" colspan="2">Fees & Tax</td></tr>
<tr><td>Sales Tax (${taxPct}%)</td><td>${money(salesTaxAmt)}</td></tr>
<tr><td>Doc Fee</td><td>${money(docFee)}</td></tr>
<tr><td>Title Fee</td><td>${money(titleFee)}</td></tr>
<tr><td>Tags & Registration</td><td>${money(tagFee)}</td></tr>
<tr><td class="section" colspan="2">Financing</td></tr>
<tr><td>Cash / Down Payment</td><td>(${money(cashDown)})</td></tr>
<tr class="total"><td>Amount Financed</td><td>${money(amtFinanced)}</td></tr>
</table>
<div class="payment-box">
<div>
<div class="label">Monthly Payment</div>
<div class="big">${money(pmt)}/mo</div>
<div class="disc">${finance.termMonths} months @ ${finance.apr}% APR (W.A.C.)</div>
</div>
<div style="text-align:right">
<div class="label">Total Drive-Out</div>
<div style="font-size:20px;font-weight:900">${money(salePrice + salesTaxAmt + totalFees)}</div>
</div>
</div>
<footer>Price, fees, and payment are estimates. Taxes, title, and registration fees may vary. Financing subject to credit approval. This is not a binding contract.</footer>
</body></html>`);
                    w.document.close();
                    w.focus();
                    setTimeout(() => w.print(), 400);
                  }

                  return (
                    <div style={styles.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Deal Worksheet</span>
                        <button onClick={printDealSheet} style={styles.buttonGhost}>Print Deal Sheet</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { label: "Sale Price ($)", key: "salePrice", placeholder: pricing ? String(pricing.suggested) : "0" },
                          { label: "Trade-In Value ($)", key: "tradeValue", placeholder: "0" },
                          { label: "Trade Payoff ($)", key: "tradeOwed", placeholder: "0" },
                          { label: "Sales Tax %", key: "salesTaxPct", placeholder: "6.25" },
                          { label: "Doc Fee ($)", key: "docFee", placeholder: "299" },
                          { label: "Title Fee ($)", key: "titleFee", placeholder: "75" },
                          { label: "Tags & Reg ($)", key: "tagFee", placeholder: "50" },
                        ].map(({ label, key, placeholder }) => (
                          <Field key={key} label={label} styles={styles}>
                            <input value={deal[key]} onChange={e => setDeal(d => ({ ...d, [key]: e.target.value.replace(/[^\d.]/g, "") }))} placeholder={placeholder} style={styles.input} />
                          </Field>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: `1px solid ${theme.border}`, borderRadius: 6, overflow: "hidden" }}>
                        {[
                          { label: "Net Trade", value: netTrade >= 0 ? money(netTrade) : `(${money(Math.abs(netTrade))})`, color: netTrade >= 0 ? theme.success : "#dc2626" },
                          { label: "Sales Tax", value: money(salesTaxAmt), color: theme.text },
                          { label: "Total Fees", value: money(totalFees), color: theme.text },
                          { label: "Total Drive-Out", value: money(salePrice + salesTaxAmt + totalFees), color: theme.text },
                          { label: "Amount Financed", value: money(amtFinanced), color: theme.primary },
                          { label: "Est. Payment", value: `${money(pmt)}/mo`, color: theme.primary },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, borderRight: `1px solid ${theme.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === "Facebook" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* ── Connection status banner ── */}
                {fbStatus && (
                  <div style={{ padding: "12px 16px", borderRadius: 10,
                    background: fbStatus.connected ? "#f0fdf4" : "#fffbeb",
                    border: `1px solid ${fbStatus.connected ? "#bbf7d0" : "#fde68a"}`,
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18 }}>{fbStatus.connected ? "✅" : "⚠️"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: fbStatus.connected ? "#16a34a" : "#92400e" }}>
                        {fbStatus.connected ? "Facebook Messenger Connected" : "Facebook Not Connected — Set FB_PAGE_ACCESS_TOKEN"}
                      </div>
                      {!fbStatus.connected && (
                        <div style={{ fontSize: 11, color: "#92400e", marginTop: 3 }}>
                          1. Go to <strong>developers.facebook.com</strong> → Your App → Messenger → Settings&nbsp;
                          2. Generate a Page Access Token and add it as <code>FB_PAGE_ACCESS_TOKEN</code> in Render env vars&nbsp;
                          3. Set Webhook URL to: <strong>{fbStatus.webhookUrl}</strong>&nbsp;
                          4. Set Verify Token to: <strong>{fbStatus.verifyToken}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Sub-tab nav ── */}
                <div style={{ display: "flex", gap: 8, borderBottom: `2px solid ${theme.border}`, paddingBottom: 0 }}>
                  {[
                    { key: "inbox",        icon: "📨", label: "Inbox" },
                    { key: "autorules",    icon: "🤖", label: "Auto-Reply Rules" },
                    { key: "appointments", icon: "📅", label: "Appointments" },
                    { key: "adbuilder",    icon: "📢", label: "Ad Builder" },
                  ].map(({ key, icon, label }) => (
                    <button key={key} onClick={() => setFbSubTab(key)} style={{
                      padding: "9px 16px", border: "none", cursor: "pointer", fontWeight: 700,
                      fontSize: 13, borderRadius: "8px 8px 0 0",
                      background: fbSubTab === key ? theme.primary : "transparent",
                      color: fbSubTab === key ? "#fff" : theme.muted,
                      borderBottom: fbSubTab === key ? `2px solid ${theme.primary}` : "none",
                      marginBottom: -2,
                    }}>{icon} {label}</button>
                  ))}
                </div>

                {/* ════════════════════════════════════════════════════════════
                    📨  INBOX
                ══════════════════════════════════════════════════════════════ */}
                {fbSubTab === "inbox" && (
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, minHeight: 480 }}>

                    {/* Thread list */}
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      <div style={{ padding: "10px 14px", background: theme.card, fontWeight: 700, fontSize: 12,
                        color: theme.muted, textTransform: "uppercase", letterSpacing: "0.06em",
                        borderBottom: `1px solid ${theme.border}` }}>
                        Conversations ({fbMessages.length})
                      </div>
                      <div style={{ flex: 1, overflowY: "auto" }}>
                        {fbMessages.length === 0 ? (
                          <div style={{ padding: 20, color: theme.muted, fontSize: 12, textAlign: "center" }}>
                            {fbLoading ? "Loading…" : "No messages yet. Connect Facebook Messenger to receive messages here."}
                          </div>
                        ) : fbMessages.map(thread => (
                          <div key={thread.threadId}
                            onClick={() => {
                              setFbActiveThread(thread.threadId);
                              setFbReplyText("");
                              if (thread.unread > 0) {
                                fetch("/api/dealer/fb/messages/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: thread.threadId }) }).catch(() => {});
                                setFbMessages(prev => prev.map(t => t.threadId === thread.threadId ? { ...t, unread: 0 } : t));
                              }
                            }}
                            style={{ padding: "12px 14px", cursor: "pointer", borderBottom: `1px solid ${theme.border}`,
                              background: fbActiveThread === thread.threadId ? `${theme.primary}18` : "transparent",
                              borderLeft: fbActiveThread === thread.threadId ? `3px solid ${theme.primary}` : "3px solid transparent",
                              display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: theme.primary,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                              {(thread.senderName || "?")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{thread.senderName}</span>
                                {thread.unread > 0 && (
                                  <span style={{ background: theme.primary, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{thread.unread}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: theme.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {thread.preview || (thread.messages?.[thread.messages.length - 1]?.text || "").slice(0, 50)}
                              </div>
                              <div style={{ fontSize: 10, color: theme.muted, marginTop: 2 }}>
                                {thread.lastTs ? new Date(thread.lastTs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Message thread */}
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      {!fbActiveThread ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: 14 }}>
                          Select a conversation
                        </div>
                      ) : (() => {
                        const thread = fbMessages.find(t => t.threadId === fbActiveThread);
                        if (!thread) return null;
                        return (
                          <>
                            {/* Thread header */}
                            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}`, background: theme.card,
                              display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: "50%", background: theme.primary,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#fff", fontWeight: 800, fontSize: 16 }}>
                                {(thread.senderName || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>{thread.senderName}</div>
                                <div style={{ fontSize: 11, color: theme.muted }}>Facebook Messenger · ID {thread.senderId}</div>
                              </div>
                              <button onClick={() => {
                                setFbApptForm(p => ({ ...p, name: thread.senderName }));
                                setFbSubTab("appointments");
                              }} style={{ ...styles.buttonGhost, marginLeft: "auto", fontSize: 12, padding: "6px 14px" }}>
                                📅 Book Appointment
                              </button>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                              {(thread.messages || []).map((msg, mi) => (
                                <div key={mi} style={{ display: "flex", justifyContent: msg.from === "page" ? "flex-end" : "flex-start" }}>
                                  <div style={{ maxWidth: "70%", padding: "9px 13px", borderRadius: msg.from === "page" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                                    background: msg.from === "page" ? theme.primary : theme.card,
                                    color: msg.from === "page" ? "#fff" : theme.text,
                                    border: msg.from === "customer" ? `1px solid ${theme.border}` : "none",
                                    fontSize: 13 }}>
                                    {msg.text}
                                    {msg.auto && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 6 }}>🤖 auto</span>}
                                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>
                                      {new Date(msg.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Reply box */}
                            <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
                              <textarea
                                value={fbReplyText}
                                onChange={e => setFbReplyText(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("fb-send-btn")?.click(); } }}
                                placeholder="Type a reply… (Enter to send)"
                                style={{ ...styles.textarea, flex: 1, minHeight: 48, maxHeight: 120, resize: "vertical" }}
                              />
                              <button id="fb-send-btn"
                                disabled={fbReplySending || !fbReplyText.trim()}
                                onClick={async () => {
                                  if (!fbReplyText.trim()) return;
                                  setFbReplySending(true);
                                  try {
                                    const r = await fetch("/api/dealer/fb/reply", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ senderId: thread.senderId, threadId: thread.threadId, text: fbReplyText }),
                                    });
                                    const d = await r.json();
                                    if (d.error) { showToast(d.error, "error"); return; }
                                    setFbMessages(prev => prev.map(t => t.threadId === thread.threadId
                                      ? { ...t, messages: [...(t.messages || []), { from: "page", text: fbReplyText, ts: Date.now() }] }
                                      : t));
                                    setFbReplyText("");
                                  } catch { showToast("Send failed", "error"); }
                                  finally { setFbReplySending(false); }
                                }}
                                style={{ ...styles.buttonPrimary, height: 48, padding: "0 20px", flexShrink: 0 }}>
                                {fbReplySending ? "…" : "Send"}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════════
                    🤖  AUTO-REPLY RULES
                ══════════════════════════════════════════════════════════════ */}
                {fbSubTab === "autorules" && (
                  <div style={{ display: "grid", gap: 16 }}>
                    <Panel title="Auto-Reply Rules" badge={`${fbRules.filter(r => r.enabled).length} active`} styles={styles}>
                      <div style={{ color: theme.muted, fontSize: 12, marginBottom: 14 }}>
                        When a customer messages a keyword, Messenger automatically replies. Works 24/7 — no manual action needed.
                      </div>

                      {/* Add new rule */}
                      <div style={{ padding: 14, background: theme.card, borderRadius: 10, border: `1px solid ${theme.border}`, marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: theme.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>+ New Rule</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
                          <Field label="Keyword / phrase" styles={styles}>
                            <input value={fbNewRule.keyword} onChange={e => setFbNewRule(p => ({ ...p, keyword: e.target.value }))}
                              placeholder="e.g. price, available, test drive"
                              style={styles.input} />
                          </Field>
                          <Field label="Auto-reply text" styles={styles}>
                            <input value={fbNewRule.reply} onChange={e => setFbNewRule(p => ({ ...p, reply: e.target.value }))}
                              placeholder="e.g. Hi! Thanks for reaching out. The price is $X. Want to book a test drive?"
                              style={styles.input} />
                          </Field>
                          <button onClick={() => {
                            if (!fbNewRule.keyword.trim() || !fbNewRule.reply.trim()) return;
                            const updated = [...fbRules, { ...fbNewRule, id: Date.now().toString(36) }];
                            setFbRules(updated);
                            fetch("/api/dealer/fb/auto-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) }).catch(() => {});
                            setFbNewRule({ keyword: "", reply: "", enabled: true });
                            showToast("Rule added", "success");
                          }} style={{ ...styles.buttonPrimary, height: 42 }}>Add</button>
                        </div>
                      </div>

                      {/* Pre-built templates */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: theme.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick Templates</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {[
                            { keyword: "price",       reply: "Hi! Thanks for your interest. Please share which vehicle you're looking at and I'll get you the price right away!" },
                            { keyword: "available",   reply: "Yes it's still available! When would you like to come see it? We're open Mon-Sat 9AM-7PM." },
                            { keyword: "test drive",  reply: "Absolutely! We'd love to set up a test drive. What day works best for you — weekday or weekend?" },
                            { keyword: "finance",     reply: "We work with multiple lenders to get you the best rate. Bad credit OK! Come in and we'll find a payment that works for you." },
                            { keyword: "trade",       reply: "We accept all trades! Bring your vehicle in for a free appraisal or send photos and mileage for a quick estimate." },
                            { keyword: "hours",       reply: "We're open Monday–Saturday 9AM to 7PM and Sunday 11AM–5PM. Walk-ins welcome!" },
                          ].map(tpl => (
                            <button key={tpl.keyword} onClick={() => setFbNewRule({ keyword: tpl.keyword, reply: tpl.reply, enabled: true })}
                              style={{ ...styles.buttonGhost, fontSize: 11, padding: "5px 12px" }}>
                              + {tpl.keyword}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rules list */}
                      {fbRules.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", color: theme.muted, fontSize: 12 }}>No rules yet — add one above or use a quick template.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {fbRules.map((rule, ri) => (
                            <div key={rule.id || ri} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 12,
                              borderRadius: 8, border: `1px solid ${rule.enabled ? theme.primary + "44" : theme.border}`,
                              background: rule.enabled ? `${theme.primary}08` : theme.card, opacity: rule.enabled ? 1 : 0.6 }}>
                              <button onClick={() => {
                                const updated = fbRules.map((r, i) => i === ri ? { ...r, enabled: !r.enabled } : r);
                                setFbRules(updated);
                                fetch("/api/dealer/fb/auto-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) }).catch(() => {});
                              }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>
                                {rule.enabled ? "🟢" : "⭕"}
                              </button>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 2 }}>
                                  Keyword: <span style={{ color: theme.primary }}>"{rule.keyword}"</span>
                                </div>
                                <div style={{ fontSize: 12, color: theme.muted }}>{rule.reply}</div>
                              </div>
                              <button onClick={() => {
                                const updated = fbRules.filter((_, i) => i !== ri);
                                setFbRules(updated);
                                fetch("/api/dealer/fb/auto-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) }).catch(() => {});
                              }} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: "0 4px" }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════════
                    📅  APPOINTMENTS
                ══════════════════════════════════════════════════════════════ */}
                {fbSubTab === "appointments" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                    {/* Book new */}
                    <Panel title="Book Appointment" badge="New" styles={styles}>
                      {[
                        { key: "name",    label: "Customer Name",   placeholder: "Full name" },
                        { key: "phone",   label: "Phone / Facebook", placeholder: "+1 555-000-0000 or Messenger name" },
                        { key: "vehicle", label: "Vehicle of Interest", placeholder: "e.g. 2021 Toyota Camry" },
                        { key: "date",    label: "Date",            type: "date" },
                        { key: "time",    label: "Time",            type: "time" },
                        { key: "notes",   label: "Notes",           placeholder: "Trade-in, financing, special requests…" },
                      ].map(({ key, label, placeholder, type }) => (
                        <Field key={key} label={label} styles={styles}>
                          <input type={type || "text"} value={fbApptForm[key]} placeholder={placeholder}
                            onChange={e => setFbApptForm(p => ({ ...p, [key]: e.target.value }))}
                            style={styles.input} />
                        </Field>
                      ))}
                      <button
                        disabled={fbApptSaving || !fbApptForm.name.trim() || !fbApptForm.date}
                        onClick={async () => {
                          setFbApptSaving(true);
                          try {
                            const r = await fetch("/api/dealer/fb/appointments", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ...fbApptForm, source: "manual" }),
                            });
                            const newAppt = await r.json();
                            setFbAppts(prev => [newAppt, ...prev]);
                            setFbApptForm({ name: "", phone: "", vehicle: "", date: "", time: "", notes: "" });
                            showToast("Appointment booked!", "success");
                          } catch { showToast("Failed to save", "error"); }
                          finally { setFbApptSaving(false); }
                        }}
                        style={{ ...styles.buttonSuccess, marginTop: 8, width: "100%" }}>
                        {fbApptSaving ? "Saving…" : "📅 Book Appointment"}
                      </button>
                    </Panel>

                    {/* Upcoming appointments */}
                    <Panel title="Upcoming Appointments" badge={`${fbAppts.filter(a => a.status !== "done").length} pending`} styles={styles}>
                      {fbAppts.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", color: theme.muted, fontSize: 12 }}>No appointments yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 520, overflowY: "auto" }}>
                          {fbAppts.map(appt => (
                            <div key={appt.id} style={{ padding: 12, borderRadius: 8,
                              border: `1px solid ${appt.status === "done" ? theme.border : appt.status === "confirmed" ? "#bbf7d0" : "#fde68a"}`,
                              background: appt.status === "done" ? theme.card : appt.status === "confirmed" ? "#f0fdf4" : "#fffbeb",
                              opacity: appt.status === "done" ? 0.6 : 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{appt.name}</div>
                                  {appt.phone && <div style={{ fontSize: 11, color: theme.muted }}>{appt.phone}</div>}
                                  {appt.vehicle && <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginTop: 2 }}>{appt.vehicle}</div>}
                                  <div style={{ fontSize: 12, color: theme.text, marginTop: 4, fontWeight: 700 }}>
                                    {appt.date} {appt.time && `@ ${appt.time}`}
                                  </div>
                                  {appt.notes && <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>{appt.notes}</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                                    background: appt.status === "done" ? "#e2e8f0" : appt.status === "confirmed" ? "#bbf7d0" : "#fde68a",
                                    color: appt.status === "done" ? "#64748b" : appt.status === "confirmed" ? "#15803d" : "#92400e" }}>
                                    {(appt.status || "pending").toUpperCase()}
                                  </span>
                                  <div style={{ display: "flex", gap: 5 }}>
                                    {appt.status !== "confirmed" && appt.status !== "done" && (
                                      <button onClick={() => {
                                        fetch(`/api/dealer/fb/appointments/${appt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }) }).catch(() => {});
                                        setFbAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: "confirmed" } : a));
                                      }} style={{ ...styles.buttonSuccess, fontSize: 10, padding: "3px 9px", height: 26 }}>Confirm</button>
                                    )}
                                    {appt.status !== "done" && (
                                      <button onClick={() => {
                                        fetch(`/api/dealer/fb/appointments/${appt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) }).catch(() => {});
                                        setFbAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: "done" } : a));
                                      }} style={{ ...styles.buttonGhost, fontSize: 10, padding: "3px 9px", height: 26 }}>Done</button>
                                    )}
                                    <button onClick={() => {
                                      fetch(`/api/dealer/fb/appointments/${appt.id}`, { method: "DELETE" }).catch(() => {});
                                      setFbAppts(prev => prev.filter(a => a.id !== appt.id));
                                    }} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 14, padding: "0 3px" }}>✕</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════════
                    📢  AD BUILDER (kept from original)
                ══════════════════════════════════════════════════════════════ */}
                {fbSubTab === "adbuilder" && (
                  <div style={{ display: "grid", gap: 18 }}>
                  <div style={styles.twoColWide}>
                    <Panel title="Facebook Ad Builder" badge="Copy Ready" styles={styles}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                        <button onClick={() => setAdStyle("standard")} style={adStyle === "standard" ? styles.buttonPrimary : styles.buttonGhost}>Facebook</button>
                        <button onClick={() => setAdStyle("hot")} style={adStyle === "hot" ? styles.buttonWarn : styles.buttonGhost}>Hot Deal</button>
                        <button onClick={() => setAdStyle("cash")} style={adStyle === "cash" ? styles.buttonSuccess : styles.buttonGhost}>Cash Buyer</button>
                        <button onClick={() => setAdStyle("craigslist")} style={adStyle === "craigslist" ? styles.buttonPrimary : styles.buttonGhost}>Craigslist</button>
                        <button onClick={() => setAdStyle("offerup")} style={adStyle === "offerup" ? styles.buttonPrimary : styles.buttonGhost}>OfferUp</button>
                        <button onClick={() => setAdStyle("spanish")} style={adStyle === "spanish" ? styles.buttonPrimary : styles.buttonGhost}>Español</button>
                      </div>
                      <Field label="Extra Notes" styles={styles}>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.textarea} placeholder="Add custom notes for the ad..." />
                      </Field>
                      <div style={{ marginTop: 12 }}>
                        <Field label="Ad Text" styles={styles}>
                          <textarea value={adText} readOnly style={styles.textarea} />
                        </Field>
                      </div>
                      {adText ? (
                        <button onClick={() => navigator.clipboard.writeText(adText).catch(() => {})}
                          style={{ ...styles.buttonSuccess, marginTop: 10, width: "100%" }}>Copy Ad</button>
                      ) : null}
                    </Panel>

                    <Panel title="Customer Reply Generator" badge="Inbox Ready" styles={styles}>
                      <div style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>
                        Pick a tone and copy a ready-made reply for any buyer message.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        {[
                          { key: "info", label: "Just Info" }, { key: "firm", label: "Price Firm" },
                          { key: "flex", label: "Some Flexibility" }, { key: "finance", label: "Finance Push" },
                          { key: "whatsapp", label: "WhatsApp" }, { key: "lowball", label: "Counter Lowball" },
                          { key: "appointment", label: "Confirm Appt" }, { key: "followup", label: "Follow Up" },
                          { key: "spanish", label: "Español 🇲🇽" },
                        ].map(({ key, label }) => (
                          <button key={key} onClick={() => setReplyStyle(key)}
                            style={replyStyle === key ? styles.buttonPrimary : styles.buttonGhost}>{label}</button>
                        ))}
                      </div>
                      {vehicle && pricing ? (
                        <div>
                          <Field label="Reply Text" styles={styles}>
                            <textarea value={replyText} readOnly style={{ ...styles.textarea, minHeight: 160 }} />
                          </Field>
                          <button onClick={() => navigator.clipboard.writeText(replyText).catch(() => {})}
                            style={{ ...styles.buttonSuccess, marginTop: 8, width: "100%" }}>Copy Reply</button>
                        </div>
                      ) : (
                        <EmptyState text="Decode a VIN first to generate customer replies." styles={styles} />
                      )}
                    </Panel>
                  </div>
                  </div>
                )}

              </div>
            )}

            {tab === "Showroom" && (() => {
              const ShowroomComposer = () => {
                const [bg, setBg]               = useState(() => { try { return localStorage.getItem("showroom_bg") || null; } catch { return null; } });
                const [bgName, setBgName]       = useState(() => { try { return localStorage.getItem("showroom_bg_name") || ""; } catch { return ""; } });
                const [slots, setSlots]         = useState(Array(6).fill(null));
                const [active, setActive]       = useState(0);
                const [scale, setScale]         = useState(62);
                const [posX, setPosX]           = useState(50);
                const [posY, setPosY]           = useState(72);
                const [shadow, setShadow]       = useState(true);
                const [composites, setComposites] = useState(Array(6).fill(null));
                const canvasRef = useRef(null);
                const fileRef   = useRef(null);
                const bgRef     = useRef(null);

                // Read file as dataURL
                function readFile(file) {
                  return new Promise(resolve => {
                    const r = new FileReader();
                    r.onload = e => resolve(e.target.result);
                    r.readAsDataURL(file);
                  });
                }

                // Composite active slot onto background
                const draw = useCallback(() => {
                  if (!bg || !canvasRef.current) return;
                  const canvas = canvasRef.current;
                  const ctx    = canvas.getContext("2d");
                  const bgImg  = new Image();
                  bgImg.onload = () => {
                    canvas.width  = bgImg.naturalWidth;
                    canvas.height = bgImg.naturalHeight;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(bgImg, 0, 0);

                    const car = slots[active];
                    if (car) {
                      const carImg = new Image();
                      carImg.onload = () => {
                        const carW = canvas.width * (scale / 100);
                        const carH = carImg.naturalHeight * (carW / carImg.naturalWidth);
                        const x    = canvas.width  * (posX / 100) - carW / 2;
                        const y    = canvas.height * (posY / 100) - carH;

                        if (shadow) {
                          ctx.save();
                          ctx.shadowColor = "rgba(0,0,0,0.55)";
                          ctx.shadowBlur  = 40;
                          ctx.shadowOffsetY = 18;
                          ctx.drawImage(carImg, x, y, carW, carH);
                          ctx.restore();
                        } else {
                          ctx.drawImage(carImg, x, y, carW, carH);
                        }

                        const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
                        setComposites(prev => { const a = [...prev]; a[active] = dataUrl; return a; });
                      };
                      carImg.src = car.url;
                    } else {
                      const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
                      setComposites(prev => { const a = [...prev]; a[active] = dataUrl; return a; });
                    }
                  };
                  bgImg.src = bg;
                }, [bg, slots, active, scale, posX, posY, shadow]);

                useEffect(() => { draw(); }, [draw]);

                function download(slotIdx) {
                  const url = composites[slotIdx];
                  if (!url) return;
                  const a  = document.createElement("a");
                  a.href   = url;
                  a.download = `showroom-${slots[slotIdx]?.name || "car"}-${slotIdx + 1}.jpg`;
                  a.click();
                }

                function downloadAll() {
                  composites.forEach((url, i) => { if (url && slots[i]) download(i); });
                }

                const sBtn = { padding: "8px 16px", border: "none", borderRadius: 8,
                  fontWeight: 800, fontSize: 12, cursor: "pointer" };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: theme.font || "system-ui" }}>

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: theme.text }}>
                        🏛 Virtual Showroom Composer
                      </div>
                      <div style={{ fontSize: 13, color: theme.muted }}>
                        Place your vehicles inside the showroom · Adjust position · Download
                      </div>
                    </div>

                    {/* Step 1 — Upload background */}
                    <div style={{ padding: 16, background: theme.card, border: `1px solid ${theme.border}`,
                      borderRadius: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: theme.text }}>
                          Step 1 — Showroom Background
                        </div>
                        {bg && (
                          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20,
                            background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", fontWeight: 700 }}>
                            ✅ Saved — loads automatically
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <input ref={bgRef} type="file" accept="image/*" style={{ display: "none" }}
                          onChange={async e => {
                            if (!e.target.files[0]) return;
                            const url = await readFile(e.target.files[0]);
                            setBg(url);
                            setBgName(e.target.files[0].name);
                            try { localStorage.setItem("showroom_bg", url); localStorage.setItem("showroom_bg_name", e.target.files[0].name); } catch {}
                          }} />
                        <button onClick={() => bgRef.current?.click()}
                          style={{ ...sBtn, background: theme.primary, color: "#fff" }}>
                          {bg ? "🔄 Replace Background" : "📁 Upload Background Image"}
                        </button>
                        {bg && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <img src={bg} alt="bg" style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 6, border: `2px solid #16a34a` }} />
                            <div>
                              <div style={{ fontSize: 12, color: theme.text, fontWeight: 700 }}>{bgName}</div>
                              <div style={{ fontSize: 11, color: theme.muted }}>Upload once — stays forever</div>
                            </div>
                            <button onClick={() => {
                              setBg(null); setBgName("");
                              try { localStorage.removeItem("showroom_bg"); localStorage.removeItem("showroom_bg_name"); } catch {}
                            }} style={{ ...sBtn, background: "transparent", color: "#dc2626",
                              border: "1px solid #fecaca", fontSize: 11, padding: "4px 10px" }}>
                              ✕ Clear
                            </button>
                          </div>
                        )}
                        {!bg && (
                          <span style={{ fontSize: 12, color: theme.muted }}>
                            Upload once — it saves automatically and reloads every time you open this tab
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step 2 — 6 car slots */}
                    <div style={{ padding: 16, background: theme.card, border: `1px solid ${theme.border}`,
                      borderRadius: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: theme.text, marginBottom: 12 }}>
                        Step 2 — Upload Car Photos (up to 6)
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                        {Array(6).fill(null).map((_, i) => (
                          <div key={i} onClick={() => setActive(i)} style={{
                            borderRadius: 10, border: `2px solid ${active === i ? theme.primary : theme.border}`,
                            background: active === i ? `${theme.primary}15` : theme.surface,
                            cursor: "pointer", padding: 8, display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 6, transition: "all 0.15s",
                            boxShadow: active === i ? `0 0 0 3px ${theme.primary}44` : "none",
                          }}>
                            {slots[i] ? (
                              <>
                                <img src={slots[i].url} alt={`Car ${i+1}`}
                                  style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 6 }} />
                                <div style={{ fontSize: 10, color: theme.muted, textAlign: "center",
                                  maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {slots[i].name}
                                </div>
                                {composites[i] && (
                                  <button onClick={e => { e.stopPropagation(); download(i); }}
                                    style={{ ...sBtn, background: "#16a34a", color: "#fff", fontSize: 10, padding: "4px 10px", width: "100%" }}>
                                    ⬇ Download
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <label style={{ cursor: "pointer", display: "flex", flexDirection: "column",
                                  alignItems: "center", gap: 4, width: "100%" }}>
                                  <input type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={async e => {
                                      if (!e.target.files[0]) return;
                                      const url  = await readFile(e.target.files[0]);
                                      const name = e.target.files[0].name.replace(/\.[^.]+$/, "");
                                      setSlots(prev => { const a = [...prev]; a[i] = { url, name }; return a; });
                                      setActive(i);
                                    }} />
                                  <div style={{ fontSize: 24, color: theme.muted }}>📷</div>
                                  <div style={{ fontSize: 10, color: theme.muted, textAlign: "center" }}>
                                    Car {i + 1}
                                  </div>
                                </label>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Main editor */}
                    {bg && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "flex-start" }}>

                        {/* Canvas preview + download bar */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          <div style={{ borderRadius: "12px 12px 0 0", overflow: "hidden", border: `1px solid ${theme.border}`,
                            borderBottom: "none", background: "#000", position: "relative" }}>
                            <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
                            {!slots[active] && (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                                justifyContent: "center", pointerEvents: "none" }}>
                                <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "14px 24px",
                                  color: "#fff", fontWeight: 700, fontSize: 14, textAlign: "center" }}>
                                  ☝ Upload a car photo in Step 2 to see it in the showroom
                                </div>
                              </div>
                            )}
                          </div>

                          {/* ── BIG PROCESS & DOWNLOAD BAR ── */}
                          <div style={{ borderRadius: "0 0 12px 12px", border: `1px solid ${theme.border}`,
                            background: theme.card, padding: "14px 16px",
                            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>

                            {/* Status */}
                            <div style={{ flex: 1, minWidth: 160 }}>
                              {composites[active] && slots[active] ? (
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                                  ✅ Car {active + 1} ready to download
                                </div>
                              ) : slots[active] ? (
                                <div style={{ fontSize: 13, color: theme.muted }}>Adjust position then download</div>
                              ) : (
                                <div style={{ fontSize: 13, color: theme.muted }}>Upload a car photo to get started</div>
                              )}
                            </div>

                            {/* Download THIS car */}
                            <button
                              disabled={!composites[active] || !slots[active]}
                              onClick={() => download(active)}
                              style={{ padding: "12px 24px", borderRadius: 10, border: "none",
                                fontWeight: 900, fontSize: 14, cursor: "pointer",
                                background: composites[active] && slots[active] ? "#16a34a" : "#e2e8f0",
                                color: composites[active] && slots[active] ? "#fff" : "#94a3b8",
                                display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                              ⬇ Download Car {active + 1}
                            </button>

                            {/* Download ALL */}
                            <button
                              disabled={!composites.some((c, i) => c && slots[i])}
                              onClick={downloadAll}
                              style={{ padding: "12px 24px", borderRadius: 10, border: "none",
                                fontWeight: 900, fontSize: 14, cursor: "pointer",
                                background: composites.some((c, i) => c && slots[i]) ? theme.primary : "#e2e8f0",
                                color: composites.some((c, i) => c && slots[i]) ? "#fff" : "#94a3b8",
                                display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                              ⬇ Download All ({composites.filter((c, i) => c && slots[i]).length}/6)
                            </button>
                          </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ padding: 14, background: theme.card, border: `1px solid ${theme.border}`,
                            borderRadius: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: 12, color: theme.muted, marginBottom: 12,
                              textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Editing: Car {active + 1}
                            </div>

                            {[
                              { label: "Size", value: scale, set: setScale, min: 10, max: 100, unit: "%" },
                              { label: "Left / Right", value: posX, set: setPosX, min: 0, max: 100, unit: "%" },
                              { label: "Up / Down", value: posY, set: setPosY, min: 20, max: 95, unit: "%" },
                            ].map(({ label, value, set, min, max, unit }) => (
                              <div key={label} style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, color: theme.muted, fontWeight: 600 }}>{label}</span>
                                  <span style={{ fontSize: 12, color: theme.text, fontWeight: 800 }}>{value}{unit}</span>
                                </div>
                                <input type="range" min={min} max={max} value={value}
                                  onChange={e => set(Number(e.target.value))}
                                  style={{ width: "100%", accentColor: theme.primary }} />
                              </div>
                            ))}

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                              marginBottom: 14 }}>
                              <span style={{ fontSize: 12, color: theme.muted, fontWeight: 600 }}>Drop Shadow</span>
                              <button onClick={() => setShadow(s => !s)}
                                style={{ ...sBtn, padding: "4px 14px",
                                  background: shadow ? theme.primary : theme.surface,
                                  color: shadow ? "#fff" : theme.muted,
                                  border: `1px solid ${theme.border}` }}>
                                {shadow ? "ON" : "OFF"}
                              </button>
                            </div>

                            {/* Quick presets */}
                            <div style={{ fontWeight: 700, fontSize: 11, color: theme.muted, marginBottom: 8,
                              textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick Presets</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {[
                                { label: "🏎 Center Floor",    s: 62, x: 50, y: 75 },
                                { label: "◼ Left Platform",    s: 42, x: 25, y: 72 },
                                { label: "◼ Right Platform",   s: 42, x: 75, y: 72 },
                                { label: "🔭 Wide Shot",        s: 80, x: 50, y: 82 },
                                { label: "🔍 Detail Shot",      s: 40, x: 50, y: 65 },
                              ].map(p => (
                                <button key={p.label}
                                  onClick={() => { setScale(p.s); setPosX(p.x); setPosY(p.y); }}
                                  style={{ ...sBtn, background: theme.surface, color: theme.text,
                                    border: `1px solid ${theme.border}`, textAlign: "left", fontSize: 11 }}>
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Download hint */}
                          <div style={{ padding: "10px 12px", borderRadius: 8,
                            background: `${theme.primary}12`, border: `1px solid ${theme.primary}33`,
                            fontSize: 11, color: theme.muted, textAlign: "center" }}>
                            ☝ Download buttons are below the preview image
                          </div>
                        </div>
                      </div>
                    )}

                    {!bg && (
                      <div style={{ padding: 40, textAlign: "center", color: theme.muted, fontSize: 14,
                        border: `2px dashed ${theme.border}`, borderRadius: 12 }}>
                        ☝ Upload the showroom background image first to get started
                      </div>
                    )}
                  </div>
                );
              };
              return (
                <div style={{ padding: "4px 0" }}>
                  <ShowroomComposer />
                </div>
              );
            })()}

            {tab === "Inventory" && (
              <Panel title="Inventory Ranking" badge="Best Deal First" styles={styles}>
                {/* Toolbar */}
                <div style={{ ...styles.row, marginBottom: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setShowAddForm(v => !v)} style={styles.buttonPrimary}>
                    {showAddForm ? "Cancel" : "+ Add Vehicle"}
                  </button>
                  <a
                    href="/api/inventory/export.csv"
                    download
                    style={{ ...styles.buttonGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", height: 46, padding: "0 16px", borderRadius: 12, fontWeight: 800, fontSize: 13 }}
                  >Export CSV</a>
                  <button onClick={() => setSoldFilter("active")} style={soldFilter === "active" ? styles.buttonPrimary : styles.buttonGhost}>Active</button>
                  <button onClick={() => setSoldFilter("sold")} style={soldFilter === "sold" ? styles.buttonSuccess : styles.buttonGhost}>Sold</button>
                  <button onClick={() => setSoldFilter("all")} style={soldFilter === "all" ? styles.buttonPrimary : styles.buttonGhost}>All</button>
                  <span style={{ color: theme.muted, fontSize: 12 }}>
                    {filteredInventory.length !== rankedInventory.length
                      ? `${filteredInventory.length} of ${rankedInventory.length} vehicles`
                      : `${rankedInventory.length} vehicle${rankedInventory.length !== 1 ? "s" : ""}`}
                  </span>
                  {rankedInventory.length > 0 && (
                    <button
                      onClick={() => { if (clearInvConfirm) { setInventory([]); setClearInvConfirm(false); } else { setClearInvConfirm(true); setTimeout(() => setClearInvConfirm(false), 3000); } }}
                      style={{ ...styles.buttonGhost, color: clearInvConfirm ? "#dc2626" : theme.muted, borderColor: clearInvConfirm ? "#fecaca" : undefined, background: clearInvConfirm ? "#fef2f2" : "transparent", fontSize: 12, height: 34, padding: "0 10px", marginLeft: "auto" }}
                    >{clearInvConfirm ? "Confirm Clear All?" : "Clear All"}</button>
                  )}
                </div>

                {soldStats && soldFilter !== "active" && (
                  <div style={{ ...styles.card, marginBottom: 14 }}>
                    <InfoRow label="Vehicles Sold" value={String(soldStats.count)} styles={styles} />
                    <InfoRow label="Total Gross Profit" value={money(soldStats.totalGross)} strong styles={styles} />
                    <InfoRow label="Avg Gross Per Deal" value={money(soldStats.avgGross)} styles={styles} />
                  </div>
                )}

                {monthlyGross && soldFilter !== "active" && (() => {
                  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  return (
                    <div style={{ ...styles.card, marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.muted, letterSpacing: "0.06em", marginBottom: 12 }}>MONTHLY GROSS PROFIT</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                        {monthlyGross.rows.map(r => {
                          const [yr, mo] = r.key.split("-");
                          const label = MONTH_ABBR[parseInt(mo, 10) - 1] + " '" + yr.slice(2);
                          const pct = Math.abs(r.gross) / monthlyGross.maxGross;
                          const barH = Math.max(Math.round(pct * 64), 4);
                          const color = r.gross >= 0 ? theme.success : "#dc2626";
                          return (
                            <div key={r.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              <div style={{ fontSize: 9, color: theme.muted, fontWeight: 600 }}>{r.gross >= 0 ? "+" : ""}{Math.round(r.gross / 1000)}k</div>
                              <div style={{ width: "100%", height: barH, background: color, borderRadius: "3px 3px 0 0", opacity: 0.85, transition: "height 0.3s" }} title={`${r.units} units · ${money(r.gross)}`} />
                              <div style={{ fontSize: 9, color: theme.muted, whiteSpace: "nowrap" }}>{label}</div>
                              <div style={{ fontSize: 9, color: theme.muted }}>{r.units}u</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <input
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                  placeholder="Search by year, make, model, VIN…"
                  style={{ ...styles.input, marginBottom: 14, width: "100%" }}
                />

                {/* Add vehicle form */}
                {showAddForm && (
                  <div style={{ ...styles.card, marginBottom: 14 }}>
                    <div style={styles.smallLabel}>New Vehicle</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
                      {[
                        { label: "Year", key: "year", placeholder: "2019" },
                        { label: "Make", key: "make", placeholder: "Toyota" },
                        { label: "Model", key: "model", placeholder: "Camry" },
                        { label: "Trim", key: "trim", placeholder: "SE" },
                        { label: "Mileage", key: "mileage", placeholder: "75000" },
                        { label: "Price ($)", key: "price", placeholder: "17995" },
                        { label: "VIN (optional)", key: "vin", placeholder: "17 chars" },
                      ].map(({ label, key, placeholder }) => (
                        <Field key={key} label={label} styles={styles}>
                          <input
                            value={addForm[key]}
                            onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            style={styles.input}
                          />
                        </Field>
                      ))}
                      <Field label="Photo URL (optional)" styles={styles}>
                        <input
                          value={addForm.photoUrl}
                          onChange={e => setAddForm(f => ({ ...f, photoUrl: e.target.value }))}
                          placeholder="https://…"
                          style={styles.input}
                        />
                      </Field>
                      <Field label="Condition" styles={styles}>
                        <select value={addForm.condition} onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))} style={styles.input}>
                          {["Excellent", "Very Good", "Good", "Fair", "Rough"].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                    </div>
                    <button onClick={addVehicle} style={{ ...styles.buttonSuccess, marginTop: 12 }}>Save Vehicle</button>
                  </div>
                )}

                {/* Vehicle list */}
                {rankedInventory.length === 0 ? (
                  <EmptyState text="No inventory yet. Import from a website, upload a PDF, or add vehicles manually." styles={styles} />
                ) : filteredInventory.length === 0 ? (
                  <EmptyState text={`No vehicles match "${inventorySearch}" — clear the search to see all.`} styles={styles} />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {filteredInventory.map((item) => {
                      const g = dealGrade(item.score);
                      return (
                      <div key={item.vin} style={{ ...styles.listButton, cursor: "default", overflow: "hidden", paddingBottom: !item.soldPrice && item.daysOnLot != null ? 0 : undefined }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {item.photoUrl
                            ? <img src={item.photoUrl} alt="" style={{ width: 52, height: 38, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid ${theme.border}` }} />
                            : item.soldPrice
                              ? <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f0fdf4", border: "1.5px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 10, color: "#16a34a" }}>SOLD</div>
                              : <div style={{ width: 36, height: 36, borderRadius: 10, background: g.bg, border: `1.5px solid ${g.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 16, color: g.color }}>{g.grade}</div>
                          }
                          <div onClick={() => chooseVehicle(item)} role="button" tabIndex={0} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                            <div style={{ fontWeight: 900 }}>{`${item.year} ${item.make} ${item.model}${item.trim ? " " + item.trim : ""}`}</div>
                            <div style={{ color: theme.muted, marginTop: 3, fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span>{item.vin} · {item.mileage ? item.mileage.toLocaleString() + " mi" : "—"} · {item.condition}</span>
                              {item.soldPrice ? <span>· Sold {money(item.soldPrice)} · Gross {money(item.soldPrice - item.pricing.totalCost)}</span> : null}
                              {!item.soldPrice && item.daysOnLot != null && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                  background: item.daysOnLot >= 45 ? "#fef2f2" : item.daysOnLot >= 30 ? "#fffbeb" : "#f0fdf4",
                                  color: item.daysOnLot >= 45 ? "#dc2626" : item.daysOnLot >= 30 ? "#d97706" : "#16a34a",
                                  border: `1px solid ${item.daysOnLot >= 45 ? "#fecaca" : item.daysOnLot >= 30 ? "#fde68a" : "#bbf7d0"}`,
                                }}>{item.daysOnLot}d on lot</span>
                              )}
                            </div>
                            {item.dealerNotes ? (
                              <div style={{ marginTop: 4, fontSize: 11, color: theme.warning, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.dealerNotes}
                              </div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontWeight: 800 }}>{item.soldPrice ? money(item.soldPrice) : item.price ? money(item.price) : money(item.pricing.suggested)}</div>
                            <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{item.soldPrice ? `+${money(item.soldPrice - item.pricing.totalCost)} gross` : `Score ${item.score}`}</div>
                          </div>
                          {item.soldPrice ? (
                            <button
                              onClick={() => markUnsold(item.vin)}
                              style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0 }}
                              title="Mark as active again"
                            >Undo</button>
                          ) : (
                            <button
                              onClick={() => soldFormVin === item.vin ? setSoldFormVin(null) : openSoldForm(item.vin)}
                              style={{ ...styles.buttonSuccess, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0 }}
                              title="Mark as sold"
                            >{soldFormVin === item.vin ? "Cancel" : "Sold"}</button>
                          )}
                          <button
                            onClick={() => {
                              if (editVin === item.vin) { setEditVin(null); return; }
                              setEditVin(item.vin);
                              setEditForm({ price: String(item.price || ""), mileage: String(item.mileage || ""), condition: item.condition || "Good", year: String(item.year || ""), make: item.make || "", model: item.model || "", trim: item.trim || "", photoUrl: item.photoUrl || "" });
                            }}
                            style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0, color: editVin === item.vin ? theme.primary : theme.muted }}
                            title="Edit vehicle details"
                          >{editVin === item.vin ? "Cancel" : "Edit"}</button>
                          <button
                            onClick={() => { setNotesFormVin(notesFormVin === item.vin ? null : item.vin); setNotesFormText(item.dealerNotes || ""); }}
                            style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0, color: item.dealerNotes ? theme.warning : theme.muted }}
                            title={item.dealerNotes || "Add dealer notes"}
                          >Notes</button>
                          {item.vin && !item.vin.startsWith("MAN-") && (
                            <a
                              href={`https://www.carfax.com/VehicleHistory/ar20/p/Report.cfx?vin=${item.vin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0, textDecoration: "none", display: "inline-flex", alignItems: "center", color: theme.primary }}
                              title="Open CARFAX report"
                            >CARFAX</a>
                          )}
                          <button
                            onClick={() => deleteConfirmVin === item.vin ? deleteVehicle(item.vin) : setDeleteConfirmVin(item.vin)}
                            onBlur={() => setTimeout(() => setDeleteConfirmVin(null), 200)}
                            style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0, color: "#dc2626", borderColor: deleteConfirmVin === item.vin ? "#dc2626" : "#fecaca", background: deleteConfirmVin === item.vin ? "#fef2f2" : "transparent" }}
                            title={deleteConfirmVin === item.vin ? "Click again to confirm delete" : "Remove from inventory"}
                          >{deleteConfirmVin === item.vin ? "Confirm?" : "✕"}</button>
                        </div>
                        {soldFormVin === item.vin && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
                            <span style={{ fontSize: 12, color: theme.muted, flexShrink: 0 }}>Sold price:</span>
                            <input
                              type="number"
                              value={soldFormPrice}
                              onChange={e => setSoldFormPrice(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && confirmSold(item.vin)}
                              placeholder="e.g. 18500"
                              autoFocus
                              style={{ ...styles.input, width: 140, height: 34, padding: "0 10px", fontSize: 13 }}
                            />
                            <button
                              onClick={() => confirmSold(item.vin)}
                              disabled={!soldFormPrice}
                              style={{ ...styles.buttonSuccess, height: 34, padding: "0 14px", fontSize: 12 }}
                            >Confirm Sold</button>
                          </div>
                        )}
                        {notesFormVin === item.vin && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
                            <textarea
                              value={notesFormText}
                              onChange={e => setNotesFormText(e.target.value)}
                              placeholder="Repair history, title status, known issues…"
                              rows={3}
                              style={{ ...styles.input, width: "100%", resize: "vertical", fontSize: 12 }}
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button
                                onClick={() => { setInventory(prev => prev.map(v => v.vin === item.vin ? { ...v, dealerNotes: notesFormText.trim() } : v)); setNotesFormVin(null); }}
                                style={{ ...styles.buttonPrimary, height: 32, padding: "0 14px", fontSize: 12 }}
                              >Save Notes</button>
                              <button
                                onClick={() => setNotesFormVin(null)}
                                style={{ ...styles.buttonGhost, height: 32, padding: "0 12px", fontSize: 12 }}
                              >Cancel</button>
                            </div>
                          </div>
                        )}
                        {editVin === item.vin && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
                              {[
                                { label: "Year", key: "year" },
                                { label: "Make", key: "make" },
                                { label: "Model", key: "model" },
                                { label: "Trim", key: "trim" },
                                { label: "Mileage", key: "mileage" },
                                { label: "Asking Price ($)", key: "price" },
                              ].map(({ label, key }) => (
                                <div key={key}>
                                  <div style={{ fontSize: 10, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                                  <input value={editForm[key] || ""} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={{ ...styles.input, fontSize: 12, height: 34, padding: "0 8px" }} />
                                </div>
                              ))}
                              <div>
                                <div style={{ fontSize: 10, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>Condition</div>
                                <select value={editForm.condition || "Good"} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))} style={{ ...styles.input, fontSize: 12, height: 34, padding: "0 8px" }}>
                                  {["Excellent", "Very Good", "Good", "Fair", "Rough"].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div style={{ gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: 10, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>Photo URL (optional)</div>
                                <input value={editForm.photoUrl || ""} onChange={e => setEditForm(f => ({ ...f, photoUrl: e.target.value }))} placeholder="https://…" style={{ ...styles.input, fontSize: 12, height: 34, padding: "0 8px", width: "100%" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => {
                                  const updated = {
                                    year: Number(editForm.year) || item.year,
                                    make: editForm.make.trim() || item.make,
                                    model: editForm.model.trim() || item.model,
                                    trim: editForm.trim.trim(),
                                    mileage: Number(String(editForm.mileage).replace(/[^0-9]/g, "")) || item.mileage,
                                    price: Number(String(editForm.price).replace(/[^0-9.]/g, "")) || item.price,
                                    condition: editForm.condition || item.condition,
                                    photoUrl: (editForm.photoUrl || "").trim(),
                                  };
                                  setInventory(prev => prev.map(v => v.vin === item.vin ? { ...v, ...updated } : v));
                                  setEditVin(null);
                                }}
                                style={{ ...styles.buttonPrimary, height: 32, padding: "0 14px", fontSize: 12 }}
                              >Save Changes</button>
                              <button onClick={() => setEditVin(null)} style={{ ...styles.buttonGhost, height: 32, padding: "0 12px", fontSize: 12 }}>Cancel</button>
                            </div>
                          </div>
                        )}
                        {!item.soldPrice && item.daysOnLot != null && (() => {
                          const MAX_DAYS = 60;
                          const pct = Math.min(item.daysOnLot / MAX_DAYS, 1) * 100;
                          const barColor = item.daysOnLot >= 45 ? "#dc2626" : item.daysOnLot >= 30 ? "#d97706" : "#16a34a";
                          const label = item.daysOnLot >= 45 ? `${item.daysOnLot}d — AGING` : item.daysOnLot >= 30 ? `${item.daysOnLot}d — Watch` : `${item.daysOnLot}d on lot`;
                          return (
                            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{label}</span>
                                <span style={{ fontSize: 10, color: theme.muted }}>30d · 45d · 60d</span>
                              </div>
                              <div style={{ height: 5, background: theme.border, borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
                              </div>
                              <div style={{ position: "relative", height: 0 }}>
                                {[30, 45].map(d => (
                                  <div key={d} style={{ position: "absolute", left: `${(d / MAX_DAYS) * 100}%`, top: -5, width: 1, height: 5, background: theme.muted, opacity: 0.5 }} />
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {tab === "Leads" && (() => {
              const STATUS_COLORS = { New: "#3b82f6", Contacted: "#8b5cf6", Hot: "#f59e0b", Closed: "#16a34a", Lost: "#94a3b8" };
              const SOURCES = ["Walk-In", "Phone", "Facebook", "Website", "Referral", "Craigslist", "OfferUp", "Other"];
              const STATUSES = ["New", "Contacted", "Hot", "Closed", "Lost"];
              const filtered = leads.filter(l => {
                if (!leadSearch) return true;
                const s = leadSearch.toLowerCase();
                return (l.name || "").toLowerCase().includes(s) || (l.phone || "").includes(s) || (l.vin || "").toUpperCase().includes(s.toUpperCase());
              });
              const byStatus = STATUSES.map(s => ({ status: s, count: leads.filter(l => l.status === s).length }));

              function addLead() {
                if (!leadForm.name.trim() && !leadForm.phone.trim()) return;
                const newLead = { ...leadForm, id: Date.now().toString(), createdAt: new Date().toISOString() };
                setLeads(prev => [newLead, ...prev]);
                setLeadForm({ name: "", phone: "", email: "", source: "Walk-In", vin: "", status: "New", notes: "" });
              }

              return (
                <Panel title="Lead Tracker" badge={`${leads.filter(l => l.status === "New" || l.status === "Hot").length} Active`} styles={styles}>
                  {/* Summary chips */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    {byStatus.map(({ status, count }) => (
                      <div key={status} style={{ padding: "4px 12px", borderRadius: 999, background: `${STATUS_COLORS[status]}15`, border: `1px solid ${STATUS_COLORS[status]}40`, color: STATUS_COLORS[status], fontSize: 12, fontWeight: 700 }}>
                        {status}: {count}
                      </div>
                    ))}
                  </div>

                  {/* Add lead form */}
                  <div style={{ background: theme.soft, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: theme.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add Lead</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 8 }}>
                      {[
                        { label: "Name *", key: "name", placeholder: "Customer name" },
                        { label: "Phone", key: "phone", placeholder: "(555) 555-5555" },
                        { label: "Email", key: "email", placeholder: "email@example.com" },
                        { label: "VIN Interested In", key: "vin", placeholder: "VIN or vehicle" },
                      ].map(({ label, key, placeholder }) => (
                        <div key={key}>
                          <div style={{ fontSize: 11, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                          <input value={leadForm[key]} onChange={e => setLeadForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                            style={{ ...styles.input, height: 36, padding: "0 10px", fontSize: 12 }} />
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize: 11, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>Source</div>
                        <select value={leadForm.source} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))} style={{ ...styles.input, height: 36, padding: "0 10px", fontSize: 12 }}>
                          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: theme.muted, fontWeight: 600, marginBottom: 3 }}>Status</div>
                        <select value={leadForm.status} onChange={e => setLeadForm(f => ({ ...f, status: e.target.value }))} style={{ ...styles.input, height: 36, padding: "0 10px", fontSize: 12 }}>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <textarea value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes — vehicle preferences, timeline, financing situation…"
                      rows={2} style={{ ...styles.input, width: "100%", height: "auto", padding: "8px 10px", fontSize: 12, resize: "vertical", marginBottom: 8 }} />
                    <button onClick={addLead} style={{ ...styles.buttonPrimary, height: 38, padding: "0 20px", fontSize: 13 }}>+ Add Lead</button>
                  </div>

                  {/* Search */}
                  <div style={{ marginBottom: 12 }}>
                    <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search by name, phone, or VIN…"
                      style={{ ...styles.input, height: 38, fontSize: 13 }} />
                  </div>

                  {/* Lead list */}
                  {filtered.length === 0 ? (
                    <div style={{ color: theme.muted, fontSize: 13, padding: "14px 0" }}>No leads yet. Add your first lead above.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {filtered.map(lead => (
                        <div key={lead.id} style={{ background: theme.soft, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 14 }}>{lead.name || "—"}</div>
                              <div style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
                                {lead.phone && <span style={{ marginRight: 10 }}>📞 {lead.phone}</span>}
                                {lead.email && <span style={{ marginRight: 10 }}>✉️ {lead.email}</span>}
                                {lead.vin && <span>🚗 {lead.vin}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>{lead.source} · {new Date(lead.createdAt).toLocaleDateString()}</div>
                              {lead.notes && <div style={{ fontSize: 12, color: theme.text, marginTop: 6, fontStyle: "italic" }}>{lead.notes}</div>}
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                              <select value={lead.status} onChange={e => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: e.target.value } : l))}
                                style={{ height: 30, borderRadius: 8, border: `1px solid ${STATUS_COLORS[lead.status]}`, background: `${STATUS_COLORS[lead.status]}18`, color: STATUS_COLORS[lead.status], fontWeight: 700, fontSize: 12, padding: "0 8px", cursor: "pointer" }}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {lead.phone && (
                                <button onClick={() => navigator.clipboard.writeText(lead.phone).catch(() => {})}
                                  style={{ height: 30, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.muted, fontSize: 11, padding: "0 8px", cursor: "pointer" }}>COPY #</button>
                              )}
                              <button onClick={() => setLeads(prev => prev.filter(l => l.id !== lead.id))}
                                style={{ height: 30, borderRadius: 8, border: "1px solid #dc262644", background: "#dc262614", color: "#dc2626", fontSize: 11, padding: "0 8px", cursor: "pointer" }}>✕</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })()}
          </main>
        </div>
      </div>
    </div>
  );
}

function createStyles(theme) {
  return {
    shell: {
      position: "fixed",
      inset: 0,
      overflow: "auto",
      fontFamily: "Inter, Arial, sans-serif",
      color: theme.text,
      background: theme.bg,
    },
    app: { minHeight: "100%", width: "100%", boxSizing: "border-box" },
    centerWrap: { minHeight: "100%", display: "grid", placeItems: "center", padding: 24 },
    loginCard: { width: "100%", maxWidth: 480, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 28, padding: 24, boxShadow: "0 4px 24px rgba(15,23,42,0.10)", boxSizing: "border-box" },
    loginTitle: { fontSize: 30, fontWeight: 900 },
    loginSub: { marginTop: 8, color: theme.muted },
    header: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "18px 28px", background: theme.surface, borderBottom: `1px solid ${theme.border}`, boxSizing: "border-box" },
    headerTitle: { fontSize: 24, fontWeight: 900 },
    headerSub: { marginTop: 4, color: theme.muted },
    brand: { padding: "8px 12px", borderRadius: 999, background: `${theme.primary}18`, border: `1px solid ${theme.border}`, color: theme.primary, fontWeight: 800, fontSize: 12 },
    hero: { width: "100%", padding: "32px 28px", display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(360px, 0.6fr)", gap: 20, alignItems: "center", background: `linear-gradient(135deg, ${theme.primary}25, ${theme.secondary}22, ${theme.surface})`, borderBottom: `1px solid ${theme.border}`, boxSizing: "border-box" },
    heroTitle: { fontSize: 48, fontWeight: 900, lineHeight: 1.05 },
    heroSub: { marginTop: 12, color: theme.muted, maxWidth: 900, lineHeight: 1.8, fontSize: 18 },
    heroStats: { display: "grid", gridTemplateColumns: "repeat(3, minmax(150px, 1fr))", gap: 12 },
    layout: { width: "100%", display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 18, padding: 18, boxSizing: "border-box", alignItems: "start" },
    sidebar: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 18, minHeight: "calc(100vh - 250px)", boxShadow: "0 1px 8px rgba(15,23,42,0.07)", boxSizing: "border-box" },
    sidebarLabel: { fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: theme.muted, marginBottom: 12 },
    navButton: { textAlign: "left", padding: "14px 16px", borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, fontWeight: 800, cursor: "pointer" },
    navActive: { textAlign: "left", padding: "14px 16px", borderRadius: 14, border: `1px solid ${theme.primary}`, background: `${theme.primary}18`, color: theme.text, fontWeight: 800, cursor: "pointer" },
    main: { display: "grid", gap: 18, minWidth: 0 },
    panel: { width: "100%", background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, boxShadow: "0 1px 8px rgba(15,23,42,0.07)", boxSizing: "border-box", minWidth: 0 },
    card: { background: theme.soft, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 14, marginTop: 16, boxSizing: "border-box", minWidth: 0 },
    input: { width: "100%", height: 50, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, padding: "0 14px", outline: "none", fontSize: 14, boxSizing: "border-box" },
    textarea: { width: "100%", minHeight: 130, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, padding: 14, outline: "none", fontSize: 14, resize: "vertical", boxSizing: "border-box" },
    infoBox: { width: "100%", height: 50, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box" },
    buttonPrimary: { height: 50, borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: "#fff", fontWeight: 800, padding: "0 16px", cursor: "pointer" },
    buttonGhost: { height: 46, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, fontWeight: 800, padding: "0 16px", cursor: "pointer" },
    buttonWarn: { height: 46, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #b45309, #f59e0b)", color: "#fff", fontWeight: 800, padding: "0 16px", cursor: "pointer" },
    buttonSuccess: { height: 46, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #15803d, #22c55e)", color: "#fff", fontWeight: 800, padding: "0 16px", cursor: "pointer" },
    toolbarGrid: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 1fr) 220px", gap: 12, alignItems: "end" },
    pdfGrid: { display: "grid", gridTemplateColumns: `repeat(${PDF_SLOTS}, minmax(0, 1fr))`, gap: 12 },
    twoCol: { display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)", gap: 18, minWidth: 0 },
    twoColWide: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 18, minWidth: 0 },
    metricGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12 },
    detailsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
    threeCol: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
    inventoryRow: { display: "grid", gridTemplateColumns: "1.5fr auto auto", gap: 12, alignItems: "center" },
    listButton: { textAlign: "left", background: theme.soft, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14, cursor: "pointer", boxSizing: "border-box" },
    smallLabel: { fontSize: 12, fontWeight: 800, opacity: 0.8 },
    statusText: { marginTop: 10, color: theme.muted },
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    rowBetween: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" },
    bottomAlign: { display: "flex", alignItems: "end" },
  };
}

function ThemeToggle({ mode, setMode, styles }) {
  return <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} style={styles.buttonGhost}>{mode === "dark" ? "Light Mode" : "Dark Mode"}</button>;
}

function Pill({ text, color }) {
  return <span style={{ padding: "8px 12px", borderRadius: 999, background: `${color}18`, color, border: `1px solid ${color}22`, fontWeight: 800, fontSize: 12 }}>{text}</span>;
}

function Panel({ title, badge, children, styles }) {
  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
        <Pill text={badge} color="#4f8cff" />
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, styles }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

function MetricCard({ label, value, styles }) {
  return (
    <div style={{ ...styles.card, marginTop: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, styles }) {
  return (
    <div style={{ ...styles.card, marginTop: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, strong = false, styles }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,0.18)" }}>
      <span style={{ opacity: 0.8, fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: strong ? 900 : 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function EmptyState({ text, styles }) {
  return <div style={{ ...styles.card, marginTop: 0 }}>{text}</div>;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
