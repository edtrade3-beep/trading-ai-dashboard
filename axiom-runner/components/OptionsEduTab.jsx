import { useState, useEffect } from "react";
import OptionsPayoffTool from "./OptionsPayoffTool.jsx";

const OPTIONS_LESSONS = [
  { icon:"📘", color:"#3b82f6", title:"1. What an option actually is",
    body:"An option is a CONTRACT — the right (not obligation) to buy or sell 100 shares of a stock at a set price by a set date.\n\n• CALL = right to BUY at the strike. You buy calls when you think the stock goes UP.\n• PUT = right to SELL at the strike. You buy puts when you think the stock goes DOWN.\n\nYou pay a 'premium' for this right. 1 contract = 100 shares. So a $2.00 premium costs $200 (2 × 100).\n\nKey idea: options are LEVERAGE. A small move in the stock = a big move (up OR down) in the option." },
  { icon:"🎯", color:"#22d47e", title:"2. The 4 words you must know",
    body:"STRIKE — the price you have the right to buy/sell at.\nEXPIRATION — the date the contract dies. After this, it's worthless if not 'in the money'.\nPREMIUM — what you pay (per share × 100).\nMONEYNESS:\n  • ITM (in-the-money) — has real value (call strike below price / put strike above)\n  • ATM (at-the-money) — strike ≈ stock price\n  • OTM (out-of-the-money) — only 'hope' value, no intrinsic value\n\nExample: AAPL at $200. A $190 CALL is ITM. A $210 CALL is OTM (a bet it rises above $210)." },
  { icon:"💸", color:"#f59e0b", title:"3. Why options LOSE money (read twice)",
    body:"This is the lesson that just cost you. Options bleed value in ways stocks never do:\n\n⏳ TIME DECAY (theta) — an option loses value EVERY single day, even if the stock does nothing. Like ice melting. The closer to expiration, the faster it melts. A flat stock = a dying option.\n\n📉 IV CRUSH — options get expensive before big events (earnings). After the event, 'implied volatility' collapses and the option drops HARD even if you were right on direction.\n\n🎯 YOU NEED TO BE RIGHT 3 WAYS — direction, size of move, AND timing. With stock you only need direction. That's why most option buyers lose." },
  { icon:"🔢", color:"#a855f7", title:"4. The Greeks (simplified)",
    body:"The 'Greeks' measure how your option reacts:\n\n• DELTA — how much the option moves per $1 stock move. 0.50 delta = option moves $0.50 per $1. ATM ≈ 0.50.\n• THETA — daily time decay. −0.05 theta = you lose $5/day per contract just from time.\n• GAMMA — how fast delta changes. High near expiration = wild swings.\n• VEGA — sensitivity to volatility. High vega = IV crush hurts more.\n\nYou don't need to master these — but THETA (decay) and VEGA (IV crush) are why long options are hard. They work against you every day." },
  { icon:"🛡️", color:"#14b8a6", title:"5. Safer strategies than buying calls/puts",
    body:"Buying naked calls/puts is the HARDEST way to win. Safer approaches:\n\n• COVERED CALL — own 100 shares, sell a call against them. You collect premium (income). Caps upside, but you get paid. Lowest-risk options strategy.\n• CASH-SECURED PUT — sell a put on a stock you'd happily own. You get paid to wait; if it drops you buy the stock at a discount.\n• SPREADS — buy one option, sell another to offset cost & decay. Defined risk.\n\nNotice: the safer strategies SELL premium (collect decay) instead of BUYING it (paying decay). The house edge is in selling." },
  { icon:"⚠️", color:"#ef4444", title:"6. Rules to not blow up",
    body:"• NEVER risk money you can't lose. Options can go to ZERO fast.\n• Position size TINY — options are 5-10x leverage. 1 contract is already a big bet.\n• Buy time — never buy options expiring this week (max decay). 30-60+ days out.\n• AVOID earnings — IV crush destroys long options even when you're right.\n• Have an exit BEFORE you enter — both a stop and a target.\n• Don't average down on a losing option — it's usually dying, not 'cheap'.\n• If you can't explain WHY the option will move before it decays, don't buy it." },
  { icon:"🧠", color:"#0ea5e9", title:"7. The honest truth about options",
    body:"Studies consistently show MOST retail option BUYERS lose money. The leverage that excites you is the same leverage that wiped your puts this week.\n\nThe people who make money with options are usually SELLERS (collecting premium/decay) or hedgers — not buyers chasing 10-baggers.\n\nMy honest advice: learn options to UNDERSTAND the market and to use SAFE income strategies (covered calls on stocks you own) — not to gamble on direction with leverage.\n\nMaster the paper account first. Prove you can make money in SHARES before you ever add the complexity and decay of options. Options reward the patient and disciplined, and punish the rushed — which is exactly the lesson your Coach is teaching you." },

  { icon:"🧩", color:"#6366f1", title:"8. Intrinsic vs Extrinsic value (the real math)",
    body:"Every option premium = INTRINSIC + EXTRINSIC value.\n\nINTRINSIC = real, exercisable value right now.\n  • Call: stock price − strike (if positive, else 0)\n  • Put: strike − stock price (if positive, else 0)\n\nEXTRINSIC = everything else you pay: time + volatility ('hope'). This is the part that DECAYS to zero by expiration.\n\nExample: AAPL $205. The $200 call costs $8.\n  • Intrinsic = $205 − $200 = $5 (real)\n  • Extrinsic = $8 − $5 = $3 (melts away)\n\nAt expiration, extrinsic = $0. The option is worth ONLY intrinsic. When you buy OTM options, you pay 100% extrinsic — you're buying pure melting ice. This is why OTM lottery tickets usually expire worthless." },

  { icon:"🌪️", color:"#eab308", title:"9. Implied Volatility & IV Rank — the hidden price driver",
    body:"IMPLIED VOLATILITY (IV) is the market's expected future move, baked into the price. High IV = expensive options. Low IV = cheap options.\n\nYou can be RIGHT on direction and still LOSE if you bought when IV was high and it dropped ('IV crush').\n\nIV RANK / IV PERCENTILE tells you if IV is high or low vs the stock's own past year (0–100).\n  • IV Rank > 50 → options are EXPENSIVE → favor SELLING premium\n  • IV Rank < 30 → options are CHEAP → if you must BUY, buy here\n\nThe pro rule: SELL options when IV is high (you collect rich premium that deflates), BUY options only when IV is low. Most retail does the opposite — they buy hyped, high-IV options right before earnings and get crushed." },

  { icon:"🔬", color:"#a855f7", title:"10. The Greeks in depth",
    body:"DELTA (0–1 for calls): rate of change per $1 move, AND a rough probability the option finishes ITM. A 0.30 delta call ≈ 30% chance ITM. Sellers love selling ~0.16–0.30 delta (70–84% win odds).\n\nTHETA: daily decay in dollars. It ACCELERATES in the last ~30 days — the decay curve is a ski slope, not a straight line. Sellers harvest theta; buyers fight it.\n\nGAMMA: how fast delta changes. Explodes near expiration and near the strike ('gamma risk') — small moves cause huge P&L swings. This is why 0DTE is a casino.\n\nVEGA: $ change per 1% IV move. Long options are long vega (IV crush hurts). Short options are short vega (crush helps).\n\nRHO: interest-rate sensitivity — minor for short-dated trades.\n\nTakeaway: as a BUYER, theta + vega are usually against you. As a SELLER, they're with you." },

  { icon:"📋", color:"#3b82f6", title:"11. Reading an options chain like a pro",
    body:"BID / ASK — you buy at the ask, sell at the bid. The gap is the SPREAD. Wide spreads (>5–10% of price) = illiquid = you lose on entry AND exit. Only trade tight, liquid chains.\n\nOPEN INTEREST (OI) — total contracts outstanding at that strike. High OI = liquid, easy to exit.\n\nVOLUME — contracts traded today. Unusual volume can signal 'smart money' positioning.\n\nMARK — midpoint of bid/ask; aim to fill near the mid, not the ask.\n\nRULES: trade strikes with OI > 500–1000, spreads under ~5%, on stocks with weekly options and heavy volume (SPY, QQQ, AAPL, NVDA…). Illiquid options are a trap — the market maker eats you." },

  { icon:"📐", color:"#22d47e", title:"12. Vertical spreads — defined-risk trading",
    body:"A spread = buy one option + sell another. It caps risk AND reward, and cuts decay/cost. This is how disciplined traders express direction.\n\nBULL CALL SPREAD (debit): buy a call, sell a higher call. Cheaper than a naked call, lower breakeven, but capped gains. Max loss = what you paid.\n\nBULL PUT SPREAD (credit): sell a put, buy a lower put. You COLLECT premium; profit if the stock stays above your short strike. Max loss = strike width − credit.\n\nWhy spreads win: they reduce the '3 things must go right' problem. You define max loss and max gain up front, and you're less exposed to IV crush and theta than a naked long option.\n\nRule of thumb: risk to make ≈ 1:1 to 1:2, and only risk 1–2% of account per spread." },

  { icon:"🎡", color:"#14b8a6", title:"13. The Wheel — get PAID to buy and sell stock",
    body:"The Wheel is the classic income strategy on stocks you'd happily own:\n\n1) SELL a CASH-SECURED PUT (~0.30 delta, 30–45 DTE) on a quality stock. You collect premium. If it stays above the strike, you keep the cash — repeat.\n2) If it drops and you get ASSIGNED, you now own 100 shares at a discount (strike − premium collected).\n3) SELL a COVERED CALL against those shares (~0.30 delta). Collect more premium. If called away, you sell at a profit — then go back to step 1.\n\nYou get paid at every step: selling puts, selling calls, and on the shares themselves. It's slow, boring, and high-probability — the opposite of buying lottery calls. Only wheel stocks you truly want to own; the risk is the stock falling hard while you hold it." },

  { icon:"🦅", color:"#f59e0b", title:"14. Iron condors & credit spreads — selling premium safely",
    body:"When you think a stock will STAY IN A RANGE, sell premium with defined risk:\n\nIRON CONDOR = a bull put spread + a bear call spread on the same stock. You collect two credits and profit if the stock stays between your short strikes by expiration.\n  • Sell ~0.16 delta strikes (≈70% probability of profit)\n  • Max profit = total credit; max loss = width − credit\n  • Best in HIGH IV (rich premium) and calm, range-bound names\n\nThese win MOST of the time (high POP) but the losses are bigger than the wins — so management matters: take profit at ~50% of max credit, and cut/roll when tested. The edge is in selling overpriced volatility, not predicting direction." },

  { icon:"🎲", color:"#0ea5e9", title:"15. Probability, expected value & why sellers win",
    body:"Options pricing embeds probabilities. Delta ≈ probability of finishing ITM. So a 0.30 delta option ≈ 30% chance ITM, 70% chance it expires worthless.\n\nEXPECTED VALUE (EV) = (win% × avg win) − (loss% × avg loss). A strategy is only worth trading if EV > 0 over many trades.\n\nBuyers: low win rate (~30–40%), big occasional wins. Sellers: high win rate (~70–85%), small steady wins, rare big losses. Both CAN be +EV — but selling suits most temperaments because it wins often and harvests theta + IV.\n\nThe catch for sellers: one undisciplined, unhedged loss can erase many wins. That's why defined-risk (spreads/condors) + position sizing + taking profits early is the whole game. Never sell naked options without the capital and the stomach for it." },

  { icon:"⚖️", color:"#ef4444", title:"16. Assignment, expiration & exercise mechanics",
    body:"AMERICAN options (stocks) can be exercised any time; EUROPEAN (index, e.g. SPX) only at expiration. Most equity options are rarely exercised early EXCEPT around dividends (calls) or deep ITM.\n\nAT EXPIRATION: ITM options auto-exercise (you get/deliver 100 shares); OTM expire worthless.\n\nASSIGNMENT: if you SOLD an option and it's ITM, you may be assigned — forced to buy (short put) or sell (short call) 100 shares. Always know: can I afford assignment?\n\nPIN RISK: if the stock closes right at your strike, you may not know if you're assigned — dangerous. Close positions before expiration to avoid it.\n\nRULE: don't hold short options into expiration day ITM unless you WANT the shares. Close or roll by the Friday before." },

  { icon:"📆", color:"#6366f1", title:"17. LEAPS & the Poor Man's Covered Call",
    body:"LEAPS = options expiring 1+ years out. Because they're mostly intrinsic, theta decay is slow — they behave more like the stock with less capital.\n\nSTOCK REPLACEMENT: buy a deep ITM LEAPS call (~0.70–0.80 delta) instead of 100 shares. You control the stock for a fraction of the cost, with defined max loss.\n\nPOOR MAN'S COVERED CALL (PMCC): own a LEAPS call, then sell short-dated calls against it (like a covered call, but the LEAPS replaces the 100 shares). You collect monthly premium on a fraction of the capital.\n\nRisks: LEAPS still lose value if the stock falls or IV drops, and you give up dividends. Use only on strong, liquid, uptrending names — exactly the kind your Trend Template flags." },

  { icon:"🔄", color:"#eab308", title:"18. Rolling — managing a live position",
    body:"ROLLING = closing your current option and opening a new one, usually further out in time and/or at a different strike, ideally for a net credit.\n\nWHY ROLL:\n  • A short option is being tested → roll OUT (more time) and sometimes DOWN/UP to stay out of the money, collecting more credit.\n  • You want to extend a winning theta trade.\n\nHOW: 'roll for a credit' means the new position pays you more than it costs to close the old one — you never want to pay to make a losing trade bigger.\n\nWHEN NOT TO: don't roll a broken directional bet just to avoid taking the loss ('rolling for hope'). Rolling is for managing PROBABILITY trades (spreads, wheels), not rescuing a dying long call. Know your max pain before you enter." },

  { icon:"💰", color:"#22d47e", title:"19. Position sizing & risk math for options",
    body:"Options are 5–20× leverage — sizing is EVERYTHING. Blowups come from size, not from being wrong once.\n\nRULES:\n  • Risk ≤ 1–2% of account per trade — including options. If your account is $10k, that's $100–200 max loss per position.\n  • For BUYERS: your premium IS your max loss. Size = (account × 1%) ÷ premium per contract.\n  • For SELLERS (defined risk): size = (account × 1–2%) ÷ (spread width − credit).\n  • Never let one trade be more than a small % — a 0DTE or earnings gamble can go to zero overnight.\n  • Keep total options exposure small vs your share portfolio while learning.\n\nThe math that matters: you can be right 40% of the time and still get rich IF winners are 2–3× losers and size is controlled. You can be right 80% of the time and still blow up if one oversized loss wipes out 20 wins. Size protects you from yourself." },

  { icon:"🎓", color:"#8b5cf6", title:"20. Your options learning path",
    body:"Don't try to do everything. Progress in this order — master each before the next:\n\n1) UNDERSTAND (lessons 1–10): what options are, decay, IV, Greeks. No trading yet.\n2) PAPER — SELL income: covered calls on shares you own, then cash-secured puts (the Wheel). High probability, teaches premium.\n3) PAPER — DEFINED RISK: vertical spreads (bull put / bull call), then iron condors. Learn to manage and take profit at 50%.\n4) ONLY THEN, tiny real size: 1 contract, liquid names, 1% risk, 30–45 DTE, no earnings.\n5) NEVER: naked short calls, 0DTE gambling, all-in single bets, or averaging down a dying long option.\n\nOptions are a tool for income and defined-risk positioning — not a lottery. Combine them with your Green Light setups: sell cash-secured puts on A+ names you'd want to own anyway. Patience compounds; leverage without discipline destroys." },
];

const OPTIONS_QUIZ = [
  { q:"A CALL option gives you the right to…", opts:["Buy 100 shares at the strike","Sell 100 shares at the strike","Collect a dividend","Short the stock for free"], correct:0,
    explain:"A call = the right to BUY 100 shares at the strike price. You buy calls when you expect the stock to rise." },
  { q:"1 option contract controls how many shares?", opts:["1","10","100","1000"], correct:2,
    explain:"1 contract = 100 shares. So a $2.00 premium costs $200 (2 × 100)." },
  { q:"Which Greek measures daily TIME DECAY?", opts:["Delta","Theta","Vega","Gamma"], correct:1,
    explain:"Theta = how much value the option loses each day just from time passing. It accelerates near expiration." },
  { q:"AAPL is $205. You own the $200 call for $8. Your breakeven at expiration is…", opts:["$200","$205","$208","$213"], correct:2,
    explain:"Breakeven = strike + premium = $200 + $8 = $208. The stock must be above $208 at expiration for you to profit." },
  { q:"When implied volatility (IV) is HIGH, you should generally…", opts:["Buy options — they'll move more","Sell premium — it's expensive and will deflate","Avoid the market entirely","Only buy weekly options"], correct:1,
    explain:"High IV = expensive options. Pros SELL premium when IV is high (it deflates in your favor). Buying high-IV options invites IV crush." },
  { q:"An out-of-the-money (OTM) option's premium is made of…", opts:["100% intrinsic value","100% extrinsic (time/hope) value","Half dividends","Pure delta"], correct:1,
    explain:"OTM options have zero intrinsic value — you're paying 100% extrinsic value, which decays to $0 by expiration. Buying OTM = buying melting ice." },
  { q:"Which strategy gets you PAID to potentially buy a stock at a discount?", opts:["Long put","Cash-secured put","Long call","Iron condor"], correct:1,
    explain:"Selling a cash-secured put collects premium; if assigned, you buy the stock at the strike minus the premium — a discount. It's step 1 of the Wheel." },
  { q:"A 0.30 delta option roughly means…", opts:["30% chance it finishes in-the-money","It costs $30","It expires in 30 days","30% time decay per day"], correct:0,
    explain:"Delta ≈ the probability of finishing ITM. A 0.30 delta ≈ 30% chance ITM — which is why sellers like selling ~0.16–0.30 delta (70–84% win odds)." },
  { q:"The maximum you can lose buying a long call is…", opts:["Unlimited","The premium you paid","The strike price","100 × the stock price"], correct:1,
    explain:"A long call's max loss is the premium paid — that's it. The max GAIN is unlimited, but you must overcome decay and be right in time." },
  { q:"Compared to a naked long call, a BULL CALL SPREAD…", opts:["Has unlimited risk","Costs more and decays faster","Caps both your risk and your reward","Requires owning 100 shares"], correct:2,
    explain:"A spread (buy one call, sell a higher one) lowers cost and caps max loss — but also caps max gain. It's the disciplined, defined-risk way to bet direction." },
];

const OPTIONS_QUIZ_ADV = [
  { q:"An IV Rank above 50 tells you options are…", opts:["Cheap — favor buying","Expensive — favor selling premium","About to expire","Guaranteed to profit"], correct:1,
    explain:"IV Rank > 50 means implied volatility is high vs the stock's own past year → options are expensive → favor SELLING premium (it deflates in your favor)." },
  { q:"You sold a cash-secured put and got assigned 100 shares. The next Wheel step is…", opts:["Sell a covered call against the shares","Buy another put","Short the stock","Do nothing and hope"], correct:0,
    explain:"After assignment you own 100 shares, so you sell a COVERED CALL against them to collect more premium. If called away at a profit, you restart the Wheel." },
  { q:"An iron condor makes its maximum profit when the stock…", opts:["Rockets up","Crashes down","Stays between the two short strikes","Pays a dividend"], correct:2,
    explain:"An iron condor sells a put spread + a call spread. Max profit = both credits, earned when the stock stays in the range between your short strikes at expiration." },
  { q:"Rolling an option 'for a credit' means…", opts:["Paying extra to extend it","The new position pays more than it costs to close the old one","Converting it to shares","Doubling your size"], correct:1,
    explain:"A credit roll collects net money: the new (further-out) position brings in more than you pay to close the current one. Never pay to enlarge a losing bet." },
  { q:"Vega measures an option's sensitivity to…", opts:["Time passing","Interest rates","Implied volatility","The dividend"], correct:2,
    explain:"Vega = $ change per 1% change in implied volatility. Long options are long vega (IV crush hurts); short options are short vega (crush helps)." },
  { q:"The maximum loss on a bull put (credit) spread is…", opts:["Unlimited","The credit received","Strike width minus the credit received","Zero"], correct:2,
    explain:"Max loss = (distance between the two strikes) − (credit collected), all ×100. That's why credit spreads are 'defined risk' — you know the worst case up front." },
  { q:"Selling premium (as a strategy) typically has…", opts:["Low win rate, huge wins","High win rate, small wins, rare big losses","Guaranteed profit","No risk"], correct:1,
    explain:"Sellers win often (≈70–85%) with small steady gains, but the occasional loss is bigger — which is why defined-risk structures, sizing, and taking profits early matter." },
  { q:"To avoid 'pin risk' at expiration you should…", opts:["Hold to the last second","Close or roll the position before expiration","Always exercise","Buy more"], correct:1,
    explain:"Pin risk = the stock closing right at your strike, leaving assignment uncertain. Close or roll short options before expiration day to avoid it." },
  { q:"Buying a deep-ITM LEAPS call instead of 100 shares is called…", opts:["A straddle","Stock replacement","Naked selling","A dividend capture"], correct:1,
    explain:"A ~0.70–0.80 delta LEAPS call behaves like the stock with far less capital and defined max loss — 'stock replacement'. Base of the Poor Man's Covered Call." },
  { q:"A sound options position-sizing rule is…", opts:["Go all-in on high conviction","Risk ≤ 1–2% of your account per trade","Always use max margin","Size by gut feel"], correct:1,
    explain:"Risk no more than 1–2% of the account per position. For a buyer, premium = max loss, so size = (account × 1%) ÷ premium per contract. Size protects you from one bad trade." },
];

function OptionsQuiz({ C, MONO, SANS }) {
  const POOL = [...OPTIONS_QUIZ, ...OPTIONS_QUIZ_ADV];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const loadStats = () => { try { return JSON.parse(localStorage.getItem("options_quiz_stats")) || {}; } catch { return {}; } };
  const [stats, setStats] = useState(loadStats);   // { [q]: { miss, correct } }
  const [best, setBest] = useState(() => Number(localStorage.getItem("options_quiz_best")) || 0);
  // Bias the deck toward your weak spots: questions you've missed come first, then random fill.
  const buildDeck = () => {
    const s = loadStats();
    const weak = POOL.filter(i => (s[i.q]?.miss || 0) > (s[i.q]?.correct || 0));
    const rest = POOL.filter(i => !weak.includes(i));
    const ordered = [...shuffle(weak), ...shuffle(rest)].slice(0, 12);
    return shuffle(ordered).map(item => {
      const correctVal = item.opts[item.correct];
      const opts = shuffle(item.opts);
      return { q: item.q, opts, correct: opts.indexOf(correctVal), explain: item.explain };
    });
  };
  const [deck, setDeck] = useState(buildDeck);
  const [ans, setAns] = useState({});   // qIndex -> chosen option index
  const reset = () => { setDeck(buildDeck()); setAns({}); };
  const answeredCount = Object.keys(ans).length;
  const score = Object.entries(ans).filter(([i, o]) => deck[i].correct === o).length;

  // Record a result for a question (persist miss/correct tallies).
  const record = (qText, correct) => {
    setStats(prev => {
      const cur = prev[qText] || { miss: 0, correct: 0 };
      const next = { ...prev, [qText]: { miss: cur.miss + (correct ? 0 : 1), correct: cur.correct + (correct ? 1 : 0) } };
      try { localStorage.setItem("options_quiz_stats", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  // Update best score once the whole deck is answered.
  useEffect(() => {
    if (answeredCount === deck.length && deck.length && score > best) {
      setBest(score); try { localStorage.setItem("options_quiz_best", String(score)); } catch {}
    }
  }, [answeredCount, score, deck.length]);

  const weakSpots = Object.entries(stats)
    .filter(([, v]) => (v.miss || 0) > 0)
    .sort((a, b) => (b[1].miss - b[1].correct) - (a[1].miss - a[1].correct))
    .slice(0, 3)
    .map(([q]) => POOL.find(i => i.q === q)).filter(Boolean);
  const attempted = Object.values(stats).reduce((s, v) => s + (v.miss || 0) + (v.correct || 0), 0);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>✅ QUIZ — tap an answer</div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: answeredCount ? (score === answeredCount ? C.green : C.amber) : C.textDim }}>
          Score {score}/{deck.length}{best ? ` · best ${best}/12` : ""}</div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 12 }}>Tap a box — you get the answer and why, instantly. Weak spots come back more often until you nail them.</div>
      {weakSpots.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: `${C.amber}0d`, border: `1px solid ${C.amber}44` }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 6 }}>🎯 YOUR WEAK SPOTS ({attempted} answered)</div>
          {weakSpots.map((w, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, marginBottom: i < weakSpots.length - 1 ? 6 : 0 }}>
              • <b>{w.q}</b> — {w.explain}
            </div>
          ))}
        </div>
      )}
      {deck.map((item, qi) => {
        const chosen = ans[qi];
        const done = chosen != null;
        return (
          <div key={qi} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: qi < deck.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>{qi + 1}. {item.q}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {item.opts.map((opt, oi) => {
                const isCorrect = oi === item.correct;
                const isChosen = chosen === oi;
                let bg = C.surface, bd = C.border, col = C.text, mark = "";
                if (done) {
                  if (isCorrect) { bg = `${C.green}18`; bd = C.green; col = C.green; mark = " ✓"; }
                  else if (isChosen) { bg = `${C.red}18`; bd = C.red; col = C.red; mark = " ✗"; }
                }
                return (
                  <button key={oi} onClick={() => { if (!done) { setAns(a => ({ ...a, [qi]: oi })); record(item.q, oi === item.correct); } }} disabled={done}
                    style={{ textAlign: "left", fontFamily: SANS, fontSize: 13.5, fontWeight: 600, padding: "11px 14px", borderRadius: 9,
                      border: `1.5px solid ${bd}`, background: bg, color: col, cursor: done ? "default" : "pointer" }}>
                    {opt}{mark}
                  </button>
                );
              })}
            </div>
            {done && (
              <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 8, background: `${(chosen === item.correct ? C.green : C.amber)}12`,
                border: `1px solid ${(chosen === item.correct ? C.green : C.amber)}44`, fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                {chosen === item.correct ? "✅ Correct! " : "💡 "}{item.explain}
              </div>
            )}
          </div>
        );
      })}
      {answeredCount === deck.length && (
        <button onClick={reset} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "9px 16px", borderRadius: 8,
          border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>🔄 New questions (shuffle)</button>
      )}
    </div>
  );
}

export default function OptionsEduTab({ C, MONO, SANS }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ padding: "16px 20px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>📈 OPTIONS ACADEMY</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 16 }}>
        20 lessons, beginner → advanced. <b>1–7</b> = the basics (what options are, decay, how they lose). <b>8–20</b> = the deep track: intrinsic/extrinsic value, IV &amp; IV rank, the Greeks in depth, reading a chain, spreads, the Wheel, iron condors, probability &amp; EV, assignment mechanics, LEAPS, rolling, and position sizing. Read in order.
      </div>
      <OptionsPayoffTool C={C} MONO={MONO} SANS={SANS} />
      {OPTIONS_LESSONS.map((l, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${l.color}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
          <div onClick={() => setOpen(open === i ? null : i)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}>
            <span style={{ fontSize: 18 }}>{l.icon}</span>
            <span style={{ flex: 1, fontFamily: SANS, fontSize: 15, fontWeight: 800, color: C.text }}>{l.title}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{open === i ? "▲" : "▼"}</span>
          </div>
          {open === i && (
            <div style={{ padding: "0 16px 16px 16px" }}>
              <pre style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{l.body}</pre>
            </div>
          )}
        </div>
      ))}
      <OptionsQuiz C={C} MONO={MONO} SANS={SANS} />
      <div style={{ marginTop: 14, padding: "12px 16px", background: `${C.amber}10`, border: `1px solid ${C.amber}44`, borderRadius: 10, fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
        ⚠️ Educational only — not financial advice. Options carry real risk of total loss. Practice on paper before risking real money, and consult a licensed advisor for your situation.
      </div>
    </div>
  );
}
