const { useMemo, useState } = React;

const PASSWORD = "@Dixie123";
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
    bg: "#eef4fb",
    surface: "#ffffff",
    soft: "#f5f8fd",
    border: "rgba(100,116,139,0.18)",
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

function decodeDemo(vin) {
  const clean = normalizeVin(vin);
  const map = {
    "1HG": { year: 2019, make: "Honda", model: "Accord", trim: "Sport", body: "Sedan", engine: "2.4L 4 Cyl", drive: "FWD" },
    "2T3": { year: 2018, make: "Toyota", model: "RAV4", trim: "XLE", body: "SUV", engine: "2.5L 4 Cyl", drive: "AWD" },
    "1GN": { year: 2017, make: "Chevrolet", model: "Tahoe", trim: "LT", body: "SUV", engine: "5.3L V8", drive: "4WD" },
    "5FR": { year: 2016, make: "Acura", model: "MDX", trim: "Tech", body: "SUV", engine: "3.5L V6", drive: "AWD" },
  };

  const item = map[clean.slice(0, 3)] || { year: 2019, make: "Toyota", model: "Camry", trim: "SE", body: "Sedan", engine: "2.5L 4 Cyl", drive: "FWD" };

  return {
    vin: clean,
    year: item.year,
    make: item.make,
    model: item.model,
    trim: item.trim,
    body: item.body,
    engine: item.engine,
    drive: item.drive,
    fuel: "Gasoline",
    transmission: "Automatic",
    mileage: 85000,
    condition: "Good",
    price: 18995,
  };
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
  const [themeMode, setThemeMode] = useState("dark");
  const theme = THEMES[themeMode];
  const styles = createStyles(theme);

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [vin, setVin] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [inventory, setInventory] = useState(SAMPLE_INVENTORY);
  const [finance, setFinance] = useState({ apr: 9.9, downPayment: 3000, termMonths: 72 });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [siteStatus, setSiteStatus] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState(Array(PDF_SLOTS).fill(null));
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [adStyle, setAdStyle] = useState("standard");
  const [notes, setNotes] = useState("");

  const rankedInventory = useMemo(() => {
    return inventory
      .map((item) => {
        const pricing = estimatePrice(item);
        return { ...item, pricing, score: scoreDeal(item, pricing) };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.pricing.frontEnd !== a.pricing.frontEnd) return b.pricing.frontEnd - a.pricing.frontEnd;
        return a.pricing.ratio - b.pricing.ratio;
      });
  }, [inventory]);

  const pricing = useMemo(() => (vehicle ? estimatePrice(vehicle) : null), [vehicle]);
  const payment = useMemo(() => (pricing ? monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment) : 0), [pricing, finance]);
  const adText = useMemo(() => (vehicle && pricing ? buildFacebookAd(vehicle, pricing, finance, adStyle, notes) : ""), [vehicle, pricing, finance, adStyle, notes]);

  function login() {
    if (password === PASSWORD) setUnlocked(true);
    else alert("Wrong password");
  }

  function decodeVin() {
    const clean = normalizeVin(vin);
    if (clean.length !== 17) {
      alert("Enter a valid 17-digit VIN");
      return;
    }
    const decoded = decodeDemo(clean);
    setVehicle(decoded);
    setVin(clean);
    setTab("Vehicle");
  }

  function chooseVehicle(item) {
    setVehicle(item);
    setVin(item.vin);
    setTab("Vehicle");
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
      alert("Enter website URL first");
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
      alert("Choose at least one PDF file first");
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
                <div style={styles.loginTitle}>Dealer Portal v2</div>
                <div style={styles.loginSub}>Clean rewrite. Enter password to open dashboard.</div>
              </div>
              <ThemeToggle mode={themeMode} setMode={setThemeMode} styles={styles} />
            </div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ ...styles.input, marginTop: 16 }} />
            <button onClick={login} style={{ ...styles.buttonPrimary, width: "100%", marginTop: 12 }}>Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.app}>
        <header style={styles.header}>
          <div style={styles.row}>
            <div style={styles.brand}>Dixie Motors</div>
            <div>
              <div style={styles.headerTitle}>Dealer Command Center v2</div>
              <div style={styles.headerSub}>Clean rewrite with multi-PDF upload, dark/light modes, and stronger ranking.</div>
            </div>
          </div>
          <div style={styles.row}>
            <ThemeToggle mode={themeMode} setMode={setThemeMode} styles={styles} />
            <Pill text="Protected" color={theme.success} />
            <Pill text="Finance Ready" color={theme.primary} />
            <Pill text="Best Deals First" color={theme.warning} />
          </div>
        </header>

        <section style={styles.hero}>
          <div>
            <div style={styles.heroTitle}>Dealer Website View v2</div>
            <div style={styles.heroSub}>This rewrite should make it obvious the new file is loading. Multi-PDF boxes, sorted inventory, clean trade value, total cost, and ratio are all included.</div>
          </div>
          <div style={styles.heroStats}>
            <StatCard label="Inventory" value={String(rankedInventory.length)} styles={styles} />
            <StatCard label="Payment" value={pricing ? `${money(payment)}/mo` : "-"} styles={styles} />
            <StatCard label="Market Value" value={pricing ? money(pricing.suggested) : "-"} styles={styles} />
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
                  <input value={vin} onChange={(e) => setVin(normalizeVin(e.target.value))} placeholder="Enter 17-digit VIN" style={styles.input} />
                </Field>
                <Field label="System" styles={styles}>
                  <div style={styles.infoBox}>Live demo mode</div>
                </Field>
                <div style={styles.bottomAlign}>
                  <button onClick={decodeVin} style={{ ...styles.buttonPrimary, width: "100%" }}>Run Decode</button>
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
                    <MetricCard label="Inventory" value={String(rankedInventory.length)} styles={styles} />
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
                  <div style={{ display: "grid", gap: 10 }}>
                    {rankedInventory.slice(0, 3).map((item) => (
                      <button key={item.vin} onClick={() => chooseVehicle(item)} style={styles.listButton}>
                        <div style={{ fontWeight: 900 }}>{`${item.year} ${item.make} ${item.model} ${item.trim}`}</div>
                        <div style={{ marginTop: 4, color: theme.muted }}>
                          Score {item.score} · Total Cost {money(item.pricing.totalCost)} · Clean Trade {money(item.pricing.cleanTrade)} · Ratio {item.pricing.ratio.toFixed(2)}
                        </div>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {tab === "Vehicle" && (
              <Panel title="Vehicle Workspace" badge="Decoded" styles={styles}>
                {vehicle ? (
                  <div style={styles.detailsGrid}>
                    <div>
                      <InfoRow label="VIN" value={vehicle.vin} styles={styles} />
                      <InfoRow label="Year" value={vehicle.year} styles={styles} />
                      <InfoRow label="Make" value={vehicle.make} styles={styles} />
                      <InfoRow label="Model" value={vehicle.model} styles={styles} />
                      <InfoRow label="Trim" value={vehicle.trim} styles={styles} />
                      <InfoRow label="Mileage" value={String(vehicle.mileage || "-")} styles={styles} />
                    </div>
                    <div>
                      <InfoRow label="Body" value={vehicle.body} styles={styles} />
                      <InfoRow label="Engine" value={vehicle.engine} styles={styles} />
                      <InfoRow label="Drive" value={vehicle.drive} styles={styles} />
                      <InfoRow label="Fuel" value={vehicle.fuel} styles={styles} />
                      <InfoRow label="Transmission" value={vehicle.transmission} styles={styles} />
                      <InfoRow label="Condition" value={vehicle.condition} styles={styles} />
                    </div>
                  </div>
                ) : (
                  <EmptyState text="Enter a VIN and click Run Decode." styles={styles} />
                )}
              </Panel>
            )}

            {tab === "Finance" && (
              <div style={styles.twoCol}>
                <Panel title="Finance Controls" badge="Editable" styles={styles}>
                  <div style={styles.threeCol}>
                    <Field label="APR %" styles={styles}><input value={finance.apr} onChange={(e) => setFinance((s) => ({ ...s, apr: e.target.value }))} style={styles.input} /></Field>
                    <Field label="Down Payment" styles={styles}><input value={finance.downPayment} onChange={(e) => setFinance((s) => ({ ...s, downPayment: e.target.value.replace(/[^0-9]/g, "") }))} style={styles.input} /></Field>
                    <Field label="Term Months" styles={styles}><input value={finance.termMonths} onChange={(e) => setFinance((s) => ({ ...s, termMonths: e.target.value.replace(/[^0-9]/g, "") }))} style={styles.input} /></Field>
                  </div>
                  <div style={styles.card}>
                    <InfoRow label="Estimated Payment" value={pricing ? `${money(payment)}/mo` : "-"} strong styles={styles} />
                    <InfoRow label="Disclosure" value={`after ${money(finance.downPayment)} down (W.A.C.)`} styles={styles} />
                  </div>
                </Panel>

                <Panel title="Finance Preview" badge="Ready" styles={styles}>
                  <div style={{ color: theme.muted, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                    {pricing ? `Estimated payment ${money(payment)}/mo after ${money(finance.downPayment)} down (W.A.C.)

${FINANCE_LINE}` : "Decode a vehicle first to generate finance wording."}
                  </div>
                </Panel>
              </div>
            )}

            {tab === "Facebook" && (
              <div style={styles.twoColWide}>
                <Panel title="Facebook Ad Builder" badge="Copy Ready" styles={styles}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    <button onClick={() => setAdStyle("standard")} style={adStyle === "standard" ? styles.buttonPrimary : styles.buttonGhost}>Standard</button>
                    <button onClick={() => setAdStyle("hot")} style={adStyle === "hot" ? styles.buttonWarn : styles.buttonGhost}>Hot Deal</button>
                    <button onClick={() => setAdStyle("cash")} style={adStyle === "cash" ? styles.buttonSuccess : styles.buttonGhost}>Cash Buyer</button>
                  </div>
                  <Field label="Extra Notes" styles={styles}>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.textarea} placeholder="Add custom notes for the ad..." />
                  </Field>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Ad Text" styles={styles}>
                      <textarea value={adText} readOnly style={styles.textarea} />
                    </Field>
                  </div>
                </Panel>

                <Panel title="Ad Summary" badge="Finance Included" styles={styles}>
                  <InfoRow label="Style" value={adStyle} styles={styles} />
                  <InfoRow label="Price" value={pricing ? money(pricing.suggested) : "-"} styles={styles} />
                  <InfoRow label="Payment" value={pricing ? `${money(payment)}/mo` : "-"} styles={styles} />
                  <InfoRow label="W.A.C." value={`after ${money(finance.downPayment)} down`} styles={styles} />
                </Panel>
              </div>
            )}

            {tab === "Inventory" && (
              <Panel title="Inventory Ranking" badge="Best Deal First" styles={styles}>
                <div style={{ display: "grid", gap: 10 }}>
                  {rankedInventory.map((item) => (
                    <button key={item.vin} onClick={() => chooseVehicle(item)} style={styles.listButton}>
                      <div style={styles.inventoryRow}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{`${item.year} ${item.make} ${item.model} ${item.trim}`}</div>
                          <div style={{ color: theme.muted, marginTop: 4 }}>{item.vin}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div>{money(item.pricing.totalCost)} total</div>
                          <div style={{ color: theme.muted, marginTop: 4 }}>{money(item.pricing.cleanTrade)} clean trade</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: theme.success, fontWeight: 800 }}>Score {item.score}</div>
                          <div style={{ color: theme.muted, marginTop: 4 }}>Ratio {item.pricing.ratio.toFixed(2)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
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
      background: `radial-gradient(circle at top left, rgba(79,140,255,0.10), transparent 18%), radial-gradient(circle at bottom right, rgba(124,58,237,0.10), transparent 22%), ${theme.bg}`,
    },
    app: { minHeight: "100%", width: "100%", boxSizing: "border-box" },
    centerWrap: { minHeight: "100%", display: "grid", placeItems: "center", padding: 24 },
    loginCard: { width: "100%", maxWidth: 480, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 28, padding: 24, boxShadow: "0 20px 60px rgba(2,6,23,0.22)", boxSizing: "border-box" },
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
    sidebar: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18, minHeight: "calc(100vh - 250px)", boxShadow: "0 16px 44px rgba(2,6,23,0.18)", boxSizing: "border-box" },
    sidebarLabel: { fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: theme.muted, marginBottom: 12 },
    navButton: { textAlign: "left", padding: "14px 16px", borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.soft, color: theme.text, fontWeight: 800, cursor: "pointer" },
    navActive: { textAlign: "left", padding: "14px 16px", borderRadius: 14, border: `1px solid ${theme.primary}`, background: `${theme.primary}18`, color: theme.text, fontWeight: 800, cursor: "pointer" },
    main: { display: "grid", gap: 18, minWidth: 0 },
    panel: { width: "100%", background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18, boxShadow: "0 16px 44px rgba(2,6,23,0.18)", boxSizing: "border-box", minWidth: 0 },
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
