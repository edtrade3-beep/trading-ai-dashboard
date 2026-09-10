import { useState, useMemo, useEffect } from "react";
import ZakatEducation from "./ZakatEducation.jsx";

// ZakatCalculator.jsx — Phase 1 of the Islamic tab redesign (2026-09-10,
// explicit user request: "make the ZAKAT CALCULATOR the most complete and
// useful feature... TurboTax for Zakat, not a spreadsheet"). Scope agreed
// with the user up front (37-section spec, phased): this phase covers
// Guide Me vs Enter Everything Myself, Nisab + Haul education, Cash/Gold/
// Silver/Investments/short-term Liabilities, a live summary, the final
// Zakat amount, and an "Explain My Zakat" breakdown. Business-asset/crypto
// line-item detail, multi-profile, PDF export, calculation history, and
// scenario comparison are explicitly later phases — not stubbed here with
// fake data, just left out of the nav until they're real.
//
// No live gold/silver price feed exists in this app (macroData tracks
// GLD/SLV ETF *share* prices, not $/gram — not a valid substitute without
// a real conversion this app doesn't have). Per the spec's own fallback
// rule ("if a live price source is connected, retrieve it automatically")
// these are honest manual entries, never a hard-coded guess.

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CREAM = "#faf8f2";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const GOLD = "#b9902f";
const RED = "#b3392b";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const KARAT_PURITY = { "24": 1, "22": 22 / 24, "21": 21 / 24, "18": 18 / 24, "14": 14 / 24 };

function num(v) { const n = Number(String(v || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; }
function fmt(n) { return `$${Math.round(n).toLocaleString()}`; }

// Real local history — spec §29 "Calculation History." One entry per
// calendar year (the latest calculation that year wins, so re-running
// the numbers doesn't spam duplicate rows) — no account, no server
// round-trip, matches the calculator's own "your entries are private"
// promise (spec §30).
const HISTORY_KEY = "zakat_calc_history";
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } }
function saveHistoryEntry(year, zakat, netWealth) {
  try {
    const h = loadHistory().filter((e) => e.year !== year);
    h.unshift({ year, zakat: Math.round(zakat), netWealth: Math.round(netWealth), ts: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)));
  } catch {}
}
function deleteHistory() { try { localStorage.removeItem(HISTORY_KEY); } catch {} }

function Info({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More information"
        style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${GREEN}`, background: "transparent", color: GREEN, fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: "16px", padding: 0 }}
      >i</button>
      {open && (
        <span style={{ position: "absolute", zIndex: 20, top: 22, left: 0, width: 240, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", fontFamily: SANS, fontSize: 13, color: TEXT, fontWeight: 400, lineHeight: 1.4 }}>
          {text}
        </span>
      )}
    </span>
  );
}

function Card({ title, subtitle, color = GREEN, children, right }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: subtitle ? 4 : 12 }}>
        <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color }}>{title}</div>
        {right}
      </div>
      {subtitle && <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, info, placeholder = "0" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "flex", alignItems: "center", fontFamily: SANS, fontSize: 14, color: TEXT, fontWeight: 600, marginBottom: 5 }}>
        {label}{info && <Info text={info} />}
      </label>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px" }}>
        <span style={{ color: TEXT_DIM, fontFamily: SANS, marginRight: 4 }}>$</span>
        <input
          type="text" inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontFamily: SANS, fontSize: 16, color: TEXT, fontWeight: 600 }}
        />
      </div>
    </div>
  );
}

function YesNo({ value, onChange, unsure }) {
  const opts = unsure ? [["yes", "Yes"], ["no", "No"], ["unsure", "I'm Not Sure"]] : [["yes", "Yes"], ["no", "No"]];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {opts.map(([k, label]) => (
        <button
          key={k} onClick={() => onChange(k)}
          style={{
            padding: "9px 18px", borderRadius: 999, fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
            border: `1.5px solid ${value === k ? GREEN : BORDER}`,
            background: value === k ? `${GREEN}15` : "transparent",
            color: value === k ? GREEN_DARK : TEXT,
          }}
        >{label}</button>
      ))}
    </div>
  );
}

function Collapsible({ title, done, total, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 16, fontWeight: 700, color: TEXT }}>
          {done ? <span style={{ color: GREEN }}>✓</span> : <span style={{ color: TEXT_DIM }}>○</span>} {title}
          {total > 0 && <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: GREEN }}>{fmt(total)}</span>}
        </span>
        <span style={{ color: TEXT_DIM, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}

// Guide Me — a short linear wizard, ONE question per screen, aggregate
// (not itemized) amounts per spec's own "dramatically easier" example.
const GUIDE_STEPS = ["cash", "gold", "silver", "investments", "debts", "haul", "nisab"];

function GuideMe({ answers, setAnswers, onFinish }) {
  const [step, setStep] = useState(0);
  const key = GUIDE_STEPS[step];
  const next = () => setStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  const progress = Math.round(((step + 1) / GUIDE_STEPS.length) * 100);

  return (
    <Card title="Guide Me" subtitle={`Question ${step + 1} of ${GUIDE_STEPS.length}`}>
      <div style={{ height: 6, borderRadius: 3, background: CREAM, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: GREEN, transition: "width .2s" }} />
      </div>

      {key === "cash" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Do you have money in bank accounts or cash on hand?</div>
          <YesNo value={answers.hasCash} onChange={(v) => set("hasCash", v)} />
          {answers.hasCash === "yes" && <div style={{ marginTop: 14 }}><NumField label="About how much in total?" value={answers.cashTotal} onChange={(v) => set("cashTotal", v)} info="Add up your checking, savings, cash on hand, and digital wallet balances." /></div>}
        </div>
      )}
      {key === "gold" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Do you own gold?</div>
          <YesNo value={answers.hasGold} onChange={(v) => set("hasGold", v)} />
          {answers.hasGold === "yes" && <div style={{ marginTop: 14 }}><NumField label="About what is it worth today?" value={answers.goldTotal} onChange={(v) => set("goldTotal", v)} info="A rough current market value is fine — you can refine this later in Enter Everything Myself." /></div>}
        </div>
      )}
      {key === "silver" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Do you own silver?</div>
          <YesNo value={answers.hasSilver} onChange={(v) => set("hasSilver", v)} />
          {answers.hasSilver === "yes" && <div style={{ marginTop: 14 }}><NumField label="About what is it worth today?" value={answers.silverTotal} onChange={(v) => set("silverTotal", v)} /></div>}
        </div>
      )}
      {key === "investments" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Do you own stocks, funds, or crypto?</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>Zakat treatment of investments can differ by scholarly methodology and intent (trading vs. long-term). This estimate uses their current market value.</div>
          <YesNo value={answers.hasInvestments} onChange={(v) => set("hasInvestments", v)} />
          {answers.hasInvestments === "yes" && <div style={{ marginTop: 14 }}><NumField label="About what is their current total value?" value={answers.investmentsTotal} onChange={(v) => set("investmentsTotal", v)} /></div>}
        </div>
      )}
      {key === "debts" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Do you have bills or short-term debts currently due?</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>Only what's due now — not your full mortgage or a long-term loan balance.</div>
          <YesNo value={answers.hasDebts} onChange={(v) => set("hasDebts", v)} />
          {answers.hasDebts === "yes" && <div style={{ marginTop: 14 }}><NumField label="About how much is due now?" value={answers.debtsTotal} onChange={(v) => set("debtsTotal", v)} /></div>}
        </div>
      )}
      {key === "haul" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Has this wealth stayed at or above Nisab for about one lunar year (Haul)?</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>If you're not sure, that's fine — we'll still estimate your Zakat.</div>
          <YesNo value={answers.haul} onChange={(v) => set("haul", v)} unsure />
        </div>
      )}
      {key === "nisab" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Which Nisab threshold should we compare your wealth against?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => set("nisabMethod", "silver")} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1.5px solid ${answers.nisabMethod !== "gold" ? GREEN : BORDER}`, background: answers.nisabMethod !== "gold" ? `${GREEN}12` : "transparent", fontFamily: SANS, fontWeight: 700, color: TEXT, cursor: "pointer" }}>Silver (595g)</button>
            <button onClick={() => set("nisabMethod", "gold")} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1.5px solid ${answers.nisabMethod === "gold" ? GOLD : BORDER}`, background: answers.nisabMethod === "gold" ? `${GOLD}15` : "transparent", fontFamily: SANS, fontWeight: 700, color: TEXT, cursor: "pointer" }}>Gold (85g)</button>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>The Silver Nisab is lower in dollar terms, so more people qualify to pay Zakat under it — many scholars recommend it for that reason. Gold Nisab is also a valid, widely-used approach. If unsure, ask a trusted local scholar.</div>
          <NumField label="Current gold price, per gram" value={answers.goldPrice} onChange={(v) => set("goldPrice", v)} placeholder="e.g. 75" />
          <NumField label="Current silver price, per gram" value={answers.silverPrice} onChange={(v) => set("silverPrice", v)} placeholder="e.g. 0.95" />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <button onClick={back} disabled={step === 0} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "transparent", color: step === 0 ? TEXT_DIM : TEXT, fontFamily: SANS, fontWeight: 700, cursor: step === 0 ? "default" : "pointer", opacity: step === 0 ? 0.4 : 1 }}>Back</button>
        {step < GUIDE_STEPS.length - 1
          ? <button onClick={next} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontWeight: 800, cursor: "pointer" }}>Next</button>
          : <button onClick={onFinish} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontWeight: 800, cursor: "pointer" }}>See My Zakat →</button>}
      </div>
    </Card>
  );
}

export default function ZakatCalculator() {
  const [phase, setPhase] = useState("intro"); // intro | guide | manual | result
  const [guideAnswers, setGuideAnswers] = useState({ nisabMethod: "silver" });

  // Manual ("Enter Everything Myself") state
  const [nisabMethod, setNisabMethod] = useState("silver");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [haul, setHaul] = useState(null);
  const [cash, setCash] = useState({ checking: "", savings: "", physical: "", digital: "", foreign: "", other: "" });
  const [goldOwns, setGoldOwns] = useState(null);
  const [goldEntryMode, setGoldEntryMode] = useState("value");
  const [goldGrams, setGoldGrams] = useState("");
  const [goldKarat, setGoldKarat] = useState("24");
  const [goldValue, setGoldValue] = useState("");
  const [silverOwns, setSilverOwns] = useState(null);
  const [silverGrams, setSilverGrams] = useState("");
  const [silverValueManual, setSilverValueManual] = useState("");
  const [investmentsValue, setInvestmentsValue] = useState("");
  const [business, setBusiness] = useState({ cash: "", inventory: "", receivables: "", other: "" });
  const [crypto, setCrypto] = useState({ btcQty: "", btcPrice: "", ethQty: "", ethPrice: "", stablecoins: "", other: "" });
  const [liab, setLiab] = useState({ billsDue: "", creditCard: "", rentDue: "", taxesDue: "", loanDue: "", other: "" });
  const [showExplain, setShowExplain] = useState(false);
  const [lastZakat, setLastZakat] = useState(null);
  const [history, setHistory] = useState(loadHistory);

  // ---- Derived totals (manual mode) ----
  const totalCash = useMemo(() => Object.values(cash).reduce((a, v) => a + num(v), 0), [cash]);
  const goldMarketValue = useMemo(() => {
    if (goldOwns !== "yes") return 0;
    if (goldEntryMode === "value") return num(goldValue);
    return num(goldGrams) * (KARAT_PURITY[goldKarat] || 1) * num(goldPrice);
  }, [goldOwns, goldEntryMode, goldValue, goldGrams, goldKarat, goldPrice]);
  const silverMarketValue = useMemo(() => {
    if (silverOwns !== "yes") return 0;
    return silverValueManual ? num(silverValueManual) : num(silverGrams) * num(silverPrice);
  }, [silverOwns, silverValueManual, silverGrams, silverPrice]);
  const businessTotal = useMemo(() => Object.values(business).reduce((a, v) => a + num(v), 0), [business]);
  const cryptoTotal = useMemo(() => {
    const btc = num(crypto.btcQty) * num(crypto.btcPrice);
    const eth = num(crypto.ethQty) * num(crypto.ethPrice);
    return btc + eth + num(crypto.stablecoins) + num(crypto.other);
  }, [crypto]);
  const totalLiabilities = useMemo(() => Object.values(liab).reduce((a, v) => a + num(v), 0), [liab]);
  const manualTotals = useMemo(() => {
    const totalAssets = totalCash + goldMarketValue + silverMarketValue + num(investmentsValue) + businessTotal + cryptoTotal;
    const netWealth = Math.max(0, totalAssets - totalLiabilities);
    return { totalAssets, netWealth };
  }, [totalCash, goldMarketValue, silverMarketValue, investmentsValue, businessTotal, cryptoTotal, totalLiabilities]);

  // ---- Derived totals (guide mode) ----
  const guideTotals = useMemo(() => {
    const a = guideAnswers;
    const totalAssets = (a.hasCash === "yes" ? num(a.cashTotal) : 0)
      + (a.hasGold === "yes" ? num(a.goldTotal) : 0)
      + (a.hasSilver === "yes" ? num(a.silverTotal) : 0)
      + (a.hasInvestments === "yes" ? num(a.investmentsTotal) : 0);
    const liabilities = a.hasDebts === "yes" ? num(a.debtsTotal) : 0;
    const netWealth = Math.max(0, totalAssets - liabilities);
    return { totalAssets, liabilities, netWealth };
  }, [guideAnswers]);

  const active = phase === "guide" || (phase === "result" && guideAnswers.__source === "guide");
  const isGuideResult = guideAnswers.__source === "guide";

  const gp = isGuideResult ? num(guideAnswers.goldPrice) : num(goldPrice);
  const sp = isGuideResult ? num(guideAnswers.silverPrice) : num(silverPrice);
  const method = isGuideResult ? guideAnswers.nisabMethod : nisabMethod;
  const nisabValue = method === "gold" ? 85 * gp : 595 * sp;
  const netWealth = isGuideResult ? guideTotals.netWealth : manualTotals.netWealth;
  const totalAssets = isGuideResult ? guideTotals.totalAssets : manualTotals.totalAssets;
  const liabilitiesTotal = isGuideResult ? guideTotals.liabilities : totalLiabilities;
  const havePrice = nisabValue > 0;
  const aboveNisab = havePrice && netWealth >= nisabValue;
  const zakatDue = aboveNisab ? netWealth * 0.025 : 0;

  useEffect(() => {
    if (phase === "result") {
      setLastZakat(zakatDue);
      saveHistoryEntry(new Date().getFullYear(), zakatDue, netWealth);
      setHistory(loadHistory());
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGuide = () => { setGuideAnswers({ nisabMethod: "silver" }); setPhase("guide"); };
  const startManual = () => setPhase("manual");
  const finishGuide = () => { setGuideAnswers((a) => ({ ...a, __source: "guide" })); setPhase("result"); };

  const manualDone = () => { setPhase("result"); };

  // ---------------- INTRO ----------------
  if (phase === "intro") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Card title="Estimate Your Zakat" subtitle="حاسبة الزكاة" color={GREEN_DARK}>
          <div style={{ fontFamily: SANS, fontSize: 15, color: TEXT, lineHeight: 1.6, marginBottom: 16 }}>
            Zakat is generally <b>2.5%</b> of qualifying wealth that has reached the <b>Nisab</b> threshold and, where applicable, has been held for one lunar year (<b>Haul</b>).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
            {[
              ["1", "Calculate your qualifying assets"],
              ["2", "Subtract eligible short-term liabilities"],
              ["3", "Compare net Zakatable wealth with Nisab"],
            ].map(([n, t]) => (
              <div key={n} style={{ background: CREAM, borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: GREEN, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontFamily: SANS, fontWeight: 800, fontSize: 13 }}>{n}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT }}>{t}</div>
              </div>
            ))}
          </div>
          <div style={{ background: `${GREEN}0d`, border: `1px solid ${GREEN}40`, borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 14, color: GREEN_DARK, fontWeight: 700, textAlign: "center", marginBottom: 20 }}>
            Zakat = Net Zakatable Wealth × 2.5%
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={startGuide} style={{ flex: 1, minWidth: 200, padding: "16px", borderRadius: 14, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              🧭 Guide Me
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9, marginTop: 2 }}>Simple questions, one at a time</div>
            </button>
            <button onClick={startManual} style={{ flex: 1, minWidth: 200, padding: "16px", borderRadius: 14, border: `1.5px solid ${GREEN}`, background: "transparent", color: GREEN_DARK, fontFamily: SANS, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              📋 Enter Everything Myself
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>Full detailed categories</div>
            </button>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: TEXT_DIM, textAlign: "center", marginTop: 12 }}>
            🔒 Your financial entries are private — everything is calculated on your own device and never sent anywhere.
          </div>
        </Card>

        <Card title="What is Nisab?" color={GOLD}>
          <div style={{ fontFamily: SANS, fontSize: 14, color: TEXT, lineHeight: 1.6, marginBottom: 10 }}>
            Nisab is the minimum amount of qualifying wealth a person must possess before Zakat becomes obligatory. It's measured against gold or silver.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: CREAM, borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, color: TEXT, fontSize: 13 }}>Gold Nisab</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM }}>≈ 85 grams of gold</div>
            </div>
            <div style={{ background: CREAM, borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, color: TEXT, fontSize: 13 }}>Silver Nisab</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM }}>≈ 595 grams of silver</div>
            </div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginTop: 10 }}>Scholarly approaches differ on which benchmark to use — we never choose this for you.</div>
        </Card>

        <Card title="What is Haul?" color={GREEN}>
          <div style={{ fontFamily: SANS, fontSize: 14, color: TEXT, lineHeight: 1.6 }}>
            Haul refers to possessing qualifying wealth at or above Nisab for one full lunar year. If you're not sure whether this applies to you, the calculator will still estimate your Zakat — it won't block you.
          </div>
        </Card>

        {history.length > 0 && (
          <Card title="Calculation History" color={TEXT} right={
            <button onClick={() => { deleteHistory(); setHistory([]); }} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: TEXT_DIM, borderRadius: 8, padding: "4px 10px", fontFamily: SANS, fontSize: 12, cursor: "pointer" }}>Clear</button>
          }>
            {history.map((h, i) => {
              const prev = history[i + 1];
              const diff = prev ? h.zakat - prev.zakat : null;
              return (
                <div key={h.year} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < history.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span style={{ fontFamily: SANS, fontSize: 14, color: TEXT, fontWeight: 600 }}>{h.year} Zakat</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {diff != null && diff !== 0 && (
                      <span style={{ fontFamily: SANS, fontSize: 12, color: diff > 0 ? GREEN : RED }}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>
                    )}
                    <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: GREEN_DARK }}>{fmt(h.zakat)}</span>
                  </span>
                </div>
              );
            })}
          </Card>
        )}

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 20px" }}>
          <ZakatEducation />
        </div>
      </div>
    );
  }

  // ---------------- GUIDE MODE ----------------
  if (phase === "guide") {
    return <div style={{ maxWidth: 720, margin: "0 auto" }}><GuideMe answers={guideAnswers} setAnswers={setGuideAnswers} onFinish={finishGuide} /></div>;
  }

  // ---------------- MANUAL MODE ----------------
  if (phase === "manual") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Card title="Nisab & Haul" color={GOLD}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Which Nisab threshold?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setNisabMethod("silver")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${nisabMethod === "silver" ? GREEN : BORDER}`, background: nisabMethod === "silver" ? `${GREEN}12` : "transparent", fontFamily: SANS, fontWeight: 700, color: TEXT, cursor: "pointer" }}>○ Silver (595g)</button>
                <button onClick={() => setNisabMethod("gold")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${nisabMethod === "gold" ? GOLD : BORDER}`, background: nisabMethod === "gold" ? `${GOLD}15` : "transparent", fontFamily: SANS, fontWeight: 700, color: TEXT, cursor: "pointer" }}>○ Gold (85g)</button>
                <Info text="Scholarly approaches differ regarding which benchmark should be used. Silver Nisab is lower in dollar terms, so it includes more people; Gold Nisab is also a widely-used, valid approach." />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <NumField label="Gold price / gram" value={goldPrice} onChange={setGoldPrice} placeholder="e.g. 75" />
              <NumField label="Silver price / gram" value={silverPrice} onChange={setSilverPrice} placeholder="e.g. 0.95" />
            </div>
            <div style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontFamily: SANS }}>
              <div style={{ fontSize: 11, color: TEXT_DIM, fontWeight: 700, letterSpacing: "0.05em" }}>NISAB THRESHOLD ({method.toUpperCase()})</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: GOLD }}>{havePrice ? fmt(nisabValue) : "Enter a price above"}</div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              Has your qualifying wealth been at or above Nisab for about one lunar year?
            </div>
            <YesNo value={haul} onChange={setHaul} unsure />
            {haul === "unsure" && <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, background: CREAM, borderRadius: 8, padding: 10 }}>That's fine — we'll still calculate an estimate using today's snapshot of your wealth.</div>}
          </Card>

          <Collapsible title="Cash & Bank Accounts" done={totalCash > 0} total={totalCash} defaultOpen>
            <NumField label="Checking accounts" value={cash.checking} onChange={(v) => setCash((c) => ({ ...c, checking: v }))} info="Money currently available in your personal checking accounts." />
            <NumField label="Savings accounts" value={cash.savings} onChange={(v) => setCash((c) => ({ ...c, savings: v }))} />
            <NumField label="Cash physically held" value={cash.physical} onChange={(v) => setCash((c) => ({ ...c, physical: v }))} />
            <NumField label="Digital wallets" value={cash.digital} onChange={(v) => setCash((c) => ({ ...c, digital: v }))} />
            <NumField label="Foreign currency" value={cash.foreign} onChange={(v) => setCash((c) => ({ ...c, foreign: v }))} />
            <NumField label="Other accessible cash" value={cash.other} onChange={(v) => setCash((c) => ({ ...c, other: v }))} />
          </Collapsible>

          <Collapsible title="Gold" done={goldOwns != null} total={goldMarketValue}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Do you own gold?</div>
            <YesNo value={goldOwns} onChange={setGoldOwns} />
            {goldOwns === "yes" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setGoldEntryMode("grams")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${goldEntryMode === "grams" ? GREEN : BORDER}`, background: goldEntryMode === "grams" ? `${GREEN}12` : "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>○ Enter grams</button>
                  <button onClick={() => setGoldEntryMode("value")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${goldEntryMode === "value" ? GREEN : BORDER}`, background: goldEntryMode === "value" ? `${GREEN}12` : "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>○ Enter dollar value</button>
                </div>
                {goldEntryMode === "grams" ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: TEXT, display: "block", marginBottom: 5 }}>Gold weight (grams)</label>
                      <input type="text" inputMode="decimal" value={goldGrams} onChange={(e) => setGoldGrams(e.target.value)} placeholder="e.g. 20"
                        style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px", fontFamily: SANS, fontSize: 16, fontWeight: 600, color: TEXT, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: TEXT, display: "block", marginBottom: 5 }}>Purity / Karat</label>
                      <select value={goldKarat} onChange={(e) => setGoldKarat(e.target.value)} style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px", fontFamily: SANS, fontSize: 15, fontWeight: 600, color: TEXT }}>
                        <option value="24">24K</option><option value="22">22K</option><option value="21">21K</option><option value="18">18K</option><option value="14">14K</option>
                      </select>
                    </div>
                    <div style={{ background: `${GREEN}0d`, borderRadius: 8, padding: "8px 12px", fontFamily: SANS, fontSize: 13, color: GREEN_DARK, fontWeight: 700, marginBottom: 10 }}>Gold Market Value: {fmt(goldMarketValue)}</div>
                  </>
                ) : <NumField label="Gold market value" value={goldValue} onChange={setGoldValue} />}
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 6 }}>Scholarly opinions may differ regarding personal-use jewelry.</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Include personal-use jewelry", "Exclude personal-use jewelry", "I'm unsure"].map((t) => (
                    <span key={t} style={{ fontFamily: SANS, fontSize: 12, padding: "5px 10px", borderRadius: 999, border: `1px solid ${BORDER}`, color: TEXT_DIM }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </Collapsible>

          <Collapsible title="Silver" done={silverOwns != null} total={silverMarketValue}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Do you own silver?</div>
            <YesNo value={silverOwns} onChange={setSilverOwns} />
            {silverOwns === "yes" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: TEXT, display: "block", marginBottom: 5 }}>Silver weight (grams) — optional if entering value below</label>
                  <input type="text" inputMode="decimal" value={silverGrams} onChange={(e) => setSilverGrams(e.target.value)} placeholder="e.g. 200"
                    style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px", fontFamily: SANS, fontSize: 16, fontWeight: 600, color: TEXT, boxSizing: "border-box" }} />
                </div>
                <NumField label="Or enter current value directly" value={silverValueManual} onChange={setSilverValueManual} />
              </div>
            )}
          </Collapsible>

          <Collapsible title="Stocks & Investments" done={num(investmentsValue) > 0} total={num(investmentsValue)}>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 10 }}>
              Zakat treatment of investments can differ depending on ownership structure, investment intention, and scholarly methodology. This is a simple estimate using current market value.
            </div>
            <NumField label="Stocks, ETFs, funds, brokerage cash — total" value={investmentsValue} onChange={setInvestmentsValue} />
          </Collapsible>

          <Collapsible title="Crypto Assets" done={cryptoTotal > 0} total={cryptoTotal}>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 10 }}>
              Treatment may vary depending on the nature and use of the asset. This calculator provides an estimate using current market value.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
              <div>
                <label style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT, display: "block", marginBottom: 5 }}>Bitcoin — quantity</label>
                <input type="text" inputMode="decimal" value={crypto.btcQty} onChange={(e) => setCrypto((c) => ({ ...c, btcQty: e.target.value }))} placeholder="0"
                  style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px", fontFamily: SANS, fontSize: 15, color: TEXT, boxSizing: "border-box" }} />
              </div>
              <NumField label="Bitcoin — price / coin" value={crypto.btcPrice} onChange={(v) => setCrypto((c) => ({ ...c, btcPrice: v }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
              <div>
                <label style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT, display: "block", marginBottom: 5 }}>Ethereum — quantity</label>
                <input type="text" inputMode="decimal" value={crypto.ethQty} onChange={(e) => setCrypto((c) => ({ ...c, ethQty: e.target.value }))} placeholder="0"
                  style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, background: CREAM, padding: "10px 12px", fontFamily: SANS, fontSize: 15, color: TEXT, boxSizing: "border-box" }} />
              </div>
              <NumField label="Ethereum — price / coin" value={crypto.ethPrice} onChange={(v) => setCrypto((c) => ({ ...c, ethPrice: v }))} />
            </div>
            <NumField label="Stablecoins — total value" value={crypto.stablecoins} onChange={(v) => setCrypto((c) => ({ ...c, stablecoins: v }))} />
            <NumField label="Other cryptocurrencies — total value" value={crypto.other} onChange={(v) => setCrypto((c) => ({ ...c, other: v }))} />
          </Collapsible>

          <Collapsible title="Business Assets" done={businessTotal > 0} total={businessTotal}>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 10 }}>
              <b style={{ color: TEXT }}>Not included automatically:</b> buildings, machinery, office furniture, vehicles used to operate the business, or other long-term operating equipment — unless that specific asset is itself held for resale.
            </div>
            <NumField label="Cash owned by the business" value={business.cash} onChange={(v) => setBusiness((b) => ({ ...b, cash: v }))} />
            <NumField label="Inventory intended for sale" value={business.inventory} onChange={(v) => setBusiness((b) => ({ ...b, inventory: v }))} info="Enter inventory held for resale at its current appropriate valuation under the method you follow." />
            <NumField label="Accounts receivable expected to be collected" value={business.receivables} onChange={(v) => setBusiness((b) => ({ ...b, receivables: v }))} />
            <NumField label="Other liquid business assets" value={business.other} onChange={(v) => setBusiness((b) => ({ ...b, other: v }))} />
          </Collapsible>

          <Collapsible title="Deductible Liabilities" done={totalLiabilities > 0} total={totalLiabilities}>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 10 }}>Only bills and debts currently due — not your full mortgage or a long-term loan balance.</div>
            <NumField label="Bills currently due" value={liab.billsDue} onChange={(v) => setLiab((l) => ({ ...l, billsDue: v }))} />
            <NumField label="Credit card balance due" value={liab.creditCard} onChange={(v) => setLiab((l) => ({ ...l, creditCard: v }))} />
            <NumField label="Rent currently due" value={liab.rentDue} onChange={(v) => setLiab((l) => ({ ...l, rentDue: v }))} />
            <NumField label="Taxes currently due" value={liab.taxesDue} onChange={(v) => setLiab((l) => ({ ...l, taxesDue: v }))} />
            <NumField label="Loan payment currently due" value={liab.loanDue} onChange={(v) => setLiab((l) => ({ ...l, loanDue: v }))} />
            <NumField label="Other immediate obligations" value={liab.other} onChange={(v) => setLiab((l) => ({ ...l, other: v }))} />
          </Collapsible>

          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, marginBottom: 16 }}>
            <b style={{ color: TEXT }}>Not automatically included:</b> retirement accounts (401k/IRA/pension), primary residence, personal vehicle, and real estate. These need their own scholarly treatment — add a value to Investments above only if you've decided they apply to you.
          </div>

          <button onClick={manualDone} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontSize: 17, fontWeight: 800, cursor: "pointer" }}>
            Calculate My Zakat →
          </button>
        </div>

        <StickySummary
          totalAssets={totalAssets} liabilities={liabilitiesTotal} netWealth={netWealth}
          nisabValue={nisabValue} havePrice={havePrice} aboveNisab={aboveNisab} zakatDue={zakatDue}
        />
      </div>
    );
  }

  // ---------------- RESULT ----------------
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {!aboveNisab ? (
        <Card title="Below Nisab" color={TEXT_DIM}>
          <div style={{ fontFamily: SANS, fontSize: 15, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>
            Based on the information entered, your qualifying wealth is below the selected Nisab threshold.
          </div>
          <div style={{ fontFamily: SANS, fontSize: 42, fontWeight: 900, color: TEXT_DIM, textAlign: "center", margin: "10px 0" }}>$0</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, textAlign: "center" }}>Estimated Zakat Due</div>
        </Card>
      ) : (
        <Card title="Your Estimated Zakat" color={GREEN_DARK}>
          <div style={{ fontFamily: SANS, fontSize: 56, fontWeight: 900, color: GREEN, textAlign: "center", margin: "10px 0" }}>{fmt(zakatDue)}</div>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: TEXT_DIM, textAlign: "center", marginBottom: 16 }}>
            {fmt(netWealth)} × 2.5% = {fmt(zakatDue)}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <span style={{ background: `${GREEN}15`, color: GREEN_DARK, borderRadius: 999, padding: "6px 16px", fontFamily: SANS, fontSize: 13, fontWeight: 700 }}>✓ ABOVE NISAB</span>
          </div>
        </Card>
      )}

      <Card title="Zakat Summary">
        <Row label="Cash" value={isGuideResult ? (guideAnswers.hasCash === "yes" ? num(guideAnswers.cashTotal) : 0) : totalCash} />
        <Row label="Gold" value={isGuideResult ? (guideAnswers.hasGold === "yes" ? num(guideAnswers.goldTotal) : 0) : goldMarketValue} />
        <Row label="Silver" value={isGuideResult ? (guideAnswers.hasSilver === "yes" ? num(guideAnswers.silverTotal) : 0) : silverMarketValue} />
        <Row label="Investments" value={isGuideResult ? (guideAnswers.hasInvestments === "yes" ? num(guideAnswers.investmentsTotal) : 0) : num(investmentsValue)} />
        {!isGuideResult && <Row label="Crypto" value={cryptoTotal} />}
        {!isGuideResult && <Row label="Business Assets" value={businessTotal} />}
        <div style={{ borderTop: `1px dashed ${BORDER}`, margin: "8px 0" }} />
        <Row label="Total Zakatable Assets" value={totalAssets} bold />
        <Row label="Eligible Liabilities" value={-liabilitiesTotal} color={RED} />
        <div style={{ borderTop: `2px solid ${TEXT}`, margin: "8px 0" }} />
        <Row label="Net Zakatable Wealth" value={netWealth} bold big />
        <Row label={`Nisab Threshold (${method})`} value={nisabValue} color={GOLD} />
      </Card>

      <button onClick={() => setShowExplain((s) => !s)} style={{ width: "100%", padding: "14px", borderRadius: 12, border: `1.5px solid ${GREEN}`, background: showExplain ? `${GREEN}12` : "transparent", color: GREEN_DARK, fontFamily: SANS, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>
        {showExplain ? "Hide" : "Explain My Zakat"}
      </button>

      {showExplain && (
        <Card title="How we calculated your Zakat" color={GREEN}>
          <div style={{ fontFamily: SANS, fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
            You entered <b>{fmt(totalAssets)}</b> of potentially Zakatable assets.<br />
            We deducted <b>{fmt(liabilitiesTotal)}</b> of liabilities you marked as immediately due.<br />
            Your net Zakatable wealth is therefore <b>{fmt(netWealth)}</b>.<br />
            Your selected Nisab threshold ({method}) is <b>{havePrice ? fmt(nisabValue) : "not set — enter a gold/silver price"}</b>.<br />
            {aboveNisab
              ? <>Because {fmt(netWealth)} is above the Nisab threshold, we applied the standard Zakat rate of 2.5%.<br /><span style={{ fontFamily: "monospace" }}>{fmt(netWealth)} × 0.025 = {fmt(zakatDue)}</span><br /><b>Estimated Zakat Due: {fmt(zakatDue)}</b></>
              : <>Because {fmt(netWealth)} is below the Nisab threshold, no Zakat is due this year based on what you entered.</>}
          </div>
        </Card>
      )}

      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.6, marginTop: 10 }}>
        This calculator is an educational estimation tool. Zakat rulings can vary according to personal circumstances and scholarly methodology. For complex situations, consult a qualified scholar or trusted local Islamic authority.
      </div>

      <button onClick={() => { setPhase("intro"); }} style={{ width: "100%", padding: "12px", marginTop: 14, borderRadius: 10, border: `1px solid ${BORDER}`, background: "transparent", color: TEXT_DIM, fontFamily: SANS, fontWeight: 700, cursor: "pointer" }}>
        Start Over
      </button>
    </div>
  );
}

function Row({ label, value, bold, big, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontFamily: SANS }}>
      <span style={{ fontSize: big ? 16 : 14, fontWeight: bold ? 800 : 500, color: TEXT }}>{label}</span>
      <span style={{ fontSize: big ? 20 : 14, fontWeight: bold ? 800 : 700, color: color || (value < 0 ? RED : TEXT) }}>{value < 0 ? `-${fmt(Math.abs(value))}` : fmt(value)}</span>
    </div>
  );
}

function StickySummary({ totalAssets, liabilities, netWealth, nisabValue, havePrice, aboveNisab, zakatDue }) {
  return (
    <div style={{ position: "sticky", top: 20, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: TEXT_DIM, letterSpacing: "0.05em", marginBottom: 12 }}>ZAKAT SUMMARY</div>
      <Row label="Assets" value={totalAssets} />
      <Row label="Liabilities" value={-liabilities} color={RED} />
      <div style={{ borderTop: `1px solid ${BORDER}`, margin: "8px 0" }} />
      <Row label="Net Wealth" value={netWealth} bold />
      <Row label="Nisab" value={havePrice ? nisabValue : 0} color={GOLD} />
      <div style={{ marginTop: 10, marginBottom: 14 }}>
        {havePrice ? (
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: aboveNisab ? GREEN_DARK : TEXT_DIM, background: aboveNisab ? `${GREEN}15` : CREAM, borderRadius: 999, padding: "4px 10px" }}>
            {aboveNisab ? "✓ ABOVE NISAB" : "BELOW NISAB"}
          </span>
        ) : <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT_DIM }}>Enter a gold/silver price to see Nisab</span>}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_DIM, marginBottom: 2 }}>ZAKAT DUE</div>
      <div style={{ fontFamily: SANS, fontSize: 32, fontWeight: 900, color: GREEN }}>{fmt(zakatDue)}</div>
    </div>
  );
}
