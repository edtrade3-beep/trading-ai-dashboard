// patch_frontend2.js — uses only single/double quotes inside the JSX string
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// ─── 1. State variables ───────────────────────────────────────────────────────
const stateAnchor = '  const [ailabSection,  setAilabSection]  = useState("pattern");';
if (!c.includes(stateAnchor)) { console.error("State anchor not found"); process.exit(1); }
c = c.replace(stateAnchor,
  '  const [ailabSection,  setAilabSection]  = useState("pattern");\n' +
  '  // Fear & Greed\n' +
  '  const [fearGreedData,    setFearGreedData]    = useState(null);\n' +
  '  const [fearGreedLoading, setFearGreedLoading] = useState(false);\n' +
  '  // Market Breadth\n' +
  '  const [breadthData,    setBreadthData]    = useState(null);\n' +
  '  const [breadthLoading, setBreadthLoading] = useState(false);\n' +
  '  // Seasonality\n' +
  '  const [seasonTicker,  setSeasonTicker]  = useState("SPY");\n' +
  '  const [seasonInput,   setSeasonInput]   = useState("SPY");\n' +
  '  const [seasonData,    setSeasonData]    = useState(null);\n' +
  '  const [seasonLoading, setSeasonLoading] = useState(false);'
);

// ─── 2. Fetch functions ───────────────────────────────────────────────────────
const fnAnchor = '  const loadPriceAlertList = useCallback(async () => {';
if (!c.includes(fnAnchor)) { console.error("Function anchor not found"); process.exit(1); }
const newFns =
  '\n  // -- Fear & Greed Meter\n' +
  '  async function fetchFearGreed() {\n' +
  '    setFearGreedLoading(true); setFearGreedData(null);\n' +
  '    try {\n' +
  '      const res  = await fetch("/api/market/feargreed");\n' +
  '      const data = res.ok ? await res.json() : { error: "Failed" };\n' +
  '      setFearGreedData(data);\n' +
  '    } catch(e) { setFearGreedData({ error: e.message }); }\n' +
  '    setFearGreedLoading(false);\n' +
  '  }\n\n' +
  '  // -- Market Breadth\n' +
  '  async function fetchBreadth() {\n' +
  '    setBreadthLoading(true); setBreadthData(null);\n' +
  '    try {\n' +
  '      const res  = await fetch("/api/market/breadth");\n' +
  '      const data = res.ok ? await res.json() : { error: "Failed" };\n' +
  '      setBreadthData(data);\n' +
  '    } catch(e) { setBreadthData({ error: e.message }); }\n' +
  '    setBreadthLoading(false);\n' +
  '  }\n\n' +
  '  // -- Seasonality\n' +
  '  async function fetchSeasonality(ticker) {\n' +
  '    const sym = (ticker || seasonTicker || "SPY").toUpperCase();\n' +
  '    setSeasonLoading(true); setSeasonData(null); setSeasonTicker(sym);\n' +
  '    try {\n' +
  '      const res  = await fetch("/api/market/seasonality?ticker=" + encodeURIComponent(sym));\n' +
  '      const data = res.ok ? await res.json() : { error: "Failed" };\n' +
  '      setSeasonData(data);\n' +
  '    } catch(e) { setSeasonData({ error: e.message }); }\n' +
  '    setSeasonLoading(false);\n' +
  '  }\n\n' +
  '  const loadPriceAlertList = useCallback(async () => {';
c = c.replace(fnAnchor, newFns);

// ─── 3. NAV_GROUPS ────────────────────────────────────────────────────────────
const navOld = '{ id: "markets",   label: "MARKETS",   tabs: ["news", "earnings", "macro", "sectors", "rotation", "calendar", "analyst", "ipo"] },';
const navNew = '{ id: "markets",   label: "MARKETS",   tabs: ["news", "earnings", "macro", "sectors", "rotation", "calendar", "analyst", "ipo", "feargreed", "breadth", "seasonality"] },';
if (!c.includes(navOld)) { console.error("NAV anchor not found"); process.exit(1); }
c = c.replace(navOld, navNew);

fs.writeFileSync(filePath, c);
console.log('Phase 1 done (state, functions, nav), size:', c.length);
