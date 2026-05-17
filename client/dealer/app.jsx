const { useMemo, useState, useEffect, useRef, useCallback } = React;

// App password is validated server-side via POST /api/auth/check (never stored in source)
const PDF_SLOTS = 3;
const TABS = ["Overview", "Vehicle", "Finance", "Facebook", "Inventory"];

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
  const [unlocked, setUnlocked] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Restore session if within 8-hour window
  const SESSION_KEY = "dixie_dealer_session";
  const SESSION_TTL = 8 * 60 * 60 * 1000;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const { ts } = JSON.parse(raw);
        if (Date.now() - ts < SESSION_TTL) setUnlocked(true);
        else sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {}
  }, []);
  const [tab, setTab] = useState("Overview");
  const [vin, setVin] = useState("");
  const [vehicle, setVehicle] = useState(null);
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
  const [finance, setFinance] = useState({ apr: 9.9, downPayment: 3000, termMonths: 72 });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [siteStatus, setSiteStatus] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState(Array(PDF_SLOTS).fill(null));
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [adStyle, setAdStyle] = useState("standard");
  const [replyStyle, setReplyStyle] = useState("info");
  const [notes, setNotes] = useState("");
  const [comps, setComps] = useState(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [aiDesc, setAiDesc] = useState("");
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiDescStyle, setAiDescStyle] = useState("facebook");
  const [showAddForm, setShowAddForm] = useState(false);
  const EMPTY_VEHICLE_FORM = { year: "", make: "", model: "", trim: "", mileage: "", price: "", condition: "Good", vin: "" };
  const [addForm, setAddForm] = useState(EMPTY_VEHICLE_FORM);
  const [soldFilter, setSoldFilter] = useState("active"); // "active" | "sold" | "all"
  const [soldFormVin, setSoldFormVin] = useState(null);
  const [soldFormPrice, setSoldFormPrice] = useState("");
  const [notesFormVin, setNotesFormVin] = useState(null);
  const [notesFormText, setNotesFormText] = useState("");
  const [deleteConfirmVin, setDeleteConfirmVin] = useState(null);
  const [toast, setToast] = useState(null);
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
    setSiteStatus("Importing from website...");

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
      setSiteStatus(items.length ? `Imported ${items.length} vehicles from website.` : "No vehicles found on that website.");
      if (items.length) setTab("Inventory");
    } catch (error) {
      setSiteStatus(error.message || "Website import failed.");
    } finally {
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
    setPdfStatus("Uploading PDF files...");

    try {
      const allItems = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/inventory/import-pdf", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `PDF import failed for ${file.name}`);
        allItems.push(...(Array.isArray(data.items) ? data.items : []));
      }

      setInventory(allItems);
      setPdfStatus(allItems.length ? `Imported ${allItems.length} vehicles from ${selected.length} PDF file(s).` : "No vehicles found in selected PDFs.");
      if (allItems.length) setTab("Inventory");
    } catch (error) {
      setPdfStatus(error.message || "PDF import failed.");
    } finally {
      setPdfLoading(false);
    }
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
                <Field label="VIN" styles={styles}>
                  <input
                    value={vin}
                    onChange={(e) => setVin(normalizeVin(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && decodeVin()}
                    placeholder="Enter 17-digit VIN"
                    style={styles.input}
                    disabled={vinLoading}
                  />
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

              <div style={{ ...styles.toolbarGrid, marginTop: 12, gridTemplateColumns: "minmax(0, 2fr) 220px" }}>
                <Field label="Website URL" styles={styles}>
                  <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yourdealerwebsite.com/inventory" style={styles.input} />
                </Field>
                <div style={styles.bottomAlign}>
                  <button onClick={importWebsite} style={{ ...styles.buttonSuccess, width: "100%" }}>{siteLoading ? "Importing..." : "Pull Cars"}</button>
                </div>
              </div>

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

              {siteStatus ? <div style={styles.statusText}>{siteStatus}</div> : null}
              {pdfStatus ? <div style={styles.statusText}>{pdfStatus}</div> : null}
            </section>

            {tab === "Overview" && (
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
              </div>
            )}

            {tab === "Facebook" && (
              <div style={{ display: "grid", gap: 18 }}>
              <div style={styles.twoColWide}>
                <Panel title="Facebook Ad Builder" badge="Copy Ready" styles={styles}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    <button onClick={() => setAdStyle("standard")} style={adStyle === "standard" ? styles.buttonPrimary : styles.buttonGhost}>Facebook</button>
                    <button onClick={() => setAdStyle("hot")} style={adStyle === "hot" ? styles.buttonWarn : styles.buttonGhost}>Hot Deal</button>
                    <button onClick={() => setAdStyle("cash")} style={adStyle === "cash" ? styles.buttonSuccess : styles.buttonGhost}>Cash Buyer</button>
                    <button onClick={() => setAdStyle("craigslist")} style={adStyle === "craigslist" ? styles.buttonPrimary : styles.buttonGhost}>Craigslist</button>
                    <button onClick={() => setAdStyle("offerup")} style={adStyle === "offerup" ? styles.buttonPrimary : styles.buttonGhost}>OfferUp</button>
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
                    <button
                      onClick={() => navigator.clipboard.writeText(adText).catch(() => {})}
                      style={{ ...styles.buttonSuccess, marginTop: 10, width: "100%" }}
                    >Copy Ad</button>
                  ) : null}
                </Panel>

                <Panel title="Ad Summary" badge="Finance Included" styles={styles}>
                  <InfoRow label="Platform" value={{ standard: "Facebook", hot: "Facebook", cash: "Facebook", craigslist: "Craigslist", offerup: "OfferUp" }[adStyle] || adStyle} styles={styles} />
                  <InfoRow label="Price" value={pricing ? money(pricing.suggested) : "-"} styles={styles} />
                  <InfoRow label="Payment" value={pricing ? `${money(payment)}/mo` : "-"} styles={styles} />
                  <InfoRow label="W.A.C." value={`after ${money(finance.downPayment)} down`} styles={styles} />
                </Panel>
              </div>

              {/* Customer reply generator */}
              <Panel title="Customer Reply Generator" badge="Inbox Ready" styles={styles}>
                <div style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>
                  Buyer messages you on Facebook Marketplace, WhatsApp, or by text — pick a tone and copy the reply.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  {[
                    { key: "info",      label: "Just Info" },
                    { key: "firm",      label: "Price Firm" },
                    { key: "flex",      label: "Some Flexibility" },
                    { key: "finance",   label: "Finance Push" },
                    { key: "whatsapp",  label: "WhatsApp" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setReplyStyle(key)}
                      style={replyStyle === key ? styles.buttonPrimary : styles.buttonGhost}
                    >{label}</button>
                  ))}
                </div>
                {vehicle && pricing ? (
                  <div style={styles.twoColWide}>
                    <Field label="Reply Text" styles={styles}>
                      <textarea value={replyText} readOnly style={{ ...styles.textarea, minHeight: 160 }} />
                    </Field>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button
                        onClick={() => navigator.clipboard.writeText(replyText).catch(() => {})}
                        style={{ ...styles.buttonSuccess, height: 46 }}
                      >Copy Reply</button>
                      <InfoRow label="Vehicle" value={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} styles={styles} />
                      <InfoRow label="Price" value={money(pricing.suggested)} styles={styles} />
                      <InfoRow label="Payment" value={`${money(payment)}/mo`} styles={styles} />
                    </div>
                  </div>
                ) : (
                  <EmptyState text="Decode a VIN first to generate customer replies." styles={styles} />
                )}
              </Panel>
              </div>
            )}

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
                </div>

                {soldStats && soldFilter !== "active" && (
                  <div style={{ ...styles.card, marginBottom: 14 }}>
                    <InfoRow label="Vehicles Sold" value={String(soldStats.count)} styles={styles} />
                    <InfoRow label="Total Gross Profit" value={money(soldStats.totalGross)} strong styles={styles} />
                    <InfoRow label="Avg Gross Per Deal" value={money(soldStats.avgGross)} styles={styles} />
                  </div>
                )}

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
                      <div key={item.vin} style={{ ...styles.listButton, cursor: "default" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {item.soldPrice
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
                            onClick={() => { setNotesFormVin(notesFormVin === item.vin ? null : item.vin); setNotesFormText(item.dealerNotes || ""); }}
                            style={{ ...styles.buttonGhost, height: 34, padding: "0 10px", fontSize: 12, flexShrink: 0, color: item.dealerNotes ? theme.warning : theme.muted }}
                            title={item.dealerNotes || "Add dealer notes"}
                          >Notes</button>
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
                      </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}
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
