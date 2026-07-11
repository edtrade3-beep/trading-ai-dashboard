export default function AcademyTab({
  C, MONO, SANS, isTablet,
  activeLesson, setActiveLesson,
  lockEnabled, setLockEnabled, tradingLocked, setTradingLocked,
  dailyMaxLoss, setDailyMaxLoss, setLockReason,
}) {
        const LESSONS = [
          {
            id: "verdict", icon: "🎯", title: "The Final Verdict",
            tagline: "One signal. No confusion.",
            body: `The platform shows ONE verdict for every stock: A+ LONG, LONG, WATCH, CONFLICT, AVOID, SHORT.\n\nThis is not just the technical score. It weighs 4 signals:\n• Tech Momentum (30%) — RSI, EMA, Volume\n• Trend Quality (35%) — MA50, MA200, 52-week position\n• SMC Structure (20%) — Bull/Bear BOS, Order Blocks\n• MACD (15%) — direction\n\nTechnical score alone NEVER means Buy. A stock with RSI 96 can still be AVOID if it has a Bear BOS and is below EMA21. That's exactly what happened with MSTR.`,
            rule: "Never buy a stock just because the tech score is high. Always check the Final Verdict.",
            color: C.accent,
          },
          {
            id: "bos", icon: "📐", title: "Bull BOS — What It Really Means",
            tagline: "The most important signal on this platform.",
            body: `BOS = Break of Structure.\n\nA Bull BOS happens when price breaks ABOVE a previous swing high. This is when institutional money (hedge funds, banks) decides to commit to buying.\n\nBefore a Bull BOS: price is "testing" an area. Could go either way.\nAfter a Bull BOS: institutions have shown their hand. They're buying.\n\nThis is why the platform requires Bull BOS for A+ LONG. Without it, you're guessing. With it, you're following the money.\n\nOn the platform: look at the SMC column → STRUCTURE → Bull BOS @ $X`,
            rule: "Wait for Bull BOS before entering a long. The entry AFTER the break is safer than the entry before.",
            color: C.green,
          },
          {
            id: "risksize", icon: "💰", title: "Position Sizing — The #1 Skill",
            tagline: "How much to buy. Not what to buy.",
            body: `Most traders focus on finding the right stock. Professionals focus on sizing correctly.\n\nThe formula:\n  Risk Amount = Account × Risk %\n  Shares = Risk Amount ÷ (Entry − Stop)\n\nExample:\n  Account: $10,000\n  Risk %: 1% = $100\n  Entry: $50.00, Stop: $47.00 → gap = $3.00\n  Shares = $100 ÷ $3.00 = 33 shares\n  Position size = 33 × $50 = $1,650\n\nNotice: You're only putting $1,650 into a $10,000 account. This is correct. Most beginners put in $5,000 and wonder why they blow up.\n\nThe risk sizer in the scanner does this automatically.`,
            rule: "Never put more than 2% of your account at risk on any single trade. Ever.",
            color: C.amber,
          },
          {
            id: "conflict", icon: "⚠️", title: "CONFLICT SETUP — Walk Away",
            tagline: "When signals disagree, the market is telling you something.",
            body: `A CONFLICT SETUP appears when:\n• Technical score is bullish (high RSI, above EMAs)\n• BUT the structure is bearish (Bear BOS or weak trend)\n\nThis is the most dangerous situation for new traders. Everything LOOKS bullish on the surface. But institutions are quietly distributing (selling to you).\n\nExample: MSTR had score 96/100 — looks great. But Bear BOS + below EMA21 = AVOID.\n\nThe platform catches this automatically. When you see CONFLICT SETUP:\n1. Do not trade it\n2. Wait for alignment\n3. There are other setups\n\nProfessional traders skip more than 90% of setups. Patience is the edge.`,
            rule: "CONFLICT SETUP = no trade. Period. Move on.",
            color: C.amber,
          },
          {
            id: "stops", icon: "🛑", title: "Stop Losses — Why You Must Use Them",
            tagline: "A stop loss is not a sign of weakness. It's your business insurance.",
            body: `Every trade has an entry AND a stop loss. The stop loss answers: "At what price am I wrong?"\n\nWithout a stop: One bad trade can wipe out weeks of gains.\nWith a stop: Your worst trade is controlled. You live to trade another day.\n\nThe platform calculates your stop automatically:\n• For breakouts: below the Order Block\n• For pullbacks: below MA50 or MA200\n• For all setups: maximum 8% from entry\n\nWhen price hits your stop — EXIT. Don't hope. Don't average down. Exit.\n\nThe reason: every professional has a preset stop before they enter. The decision is made when you're CALM, not when the stock is -12% and you're panicking.`,
            rule: "Set your stop before you enter. Honor it without exception.",
            color: C.red,
          },
          {
            id: "regime", icon: "🌍", title: "Market Regime — Trade With The Wind",
            tagline: "Swimming upstream is hard. Swimming with the current is easy.",
            body: `The Institutional Radar shows the market regime: RISK-ON, CAUTION, or RISK-OFF.\n\nRISK-ON: Institutional money flowing into stocks. Go long. Longs work.\nCAUTION: Mixed signals. Smaller size. Be selective.\nRISK-OFF: Institutions reducing risk. Avoid longs. Consider cash or shorts.\n\nThe regime is set by:\n• VIX level (fear)\n• Sector rotation (are defensives outperforming?)\n• Distribution days (how many high-volume down days?)\n• Credit spreads (are bonds weakening?)\n\nYou can be 100% right about a stock and still lose if the regime is Risk-Off. A rising tide lifts all boats. A falling tide sinks them.`,
            rule: "Check the regime every morning. Do not go long in Risk-Off.",
            color: "#42c9d8",
          },
          {
            id: "journal", icon: "📓", title: "The Trading Journal — Your Edge Over Time",
            tagline: "You can't improve what you don't measure.",
            body: `The journal is the most underused feature on the platform.\n\nWhat to log after EVERY trade:\n1. Setup type (Bull Flag, Breakout, etc.)\n2. Entry, Stop, Target\n3. Outcome (Win/Loss)\n4. Why you took it\n5. What you would do differently\n\nAfter 30 trades, the analytics show you:\n• Your win rate by setup type → trade only your best setup\n• Your best day of week → trade more on those days\n• Your biggest mistakes → stop repeating them\n\nMost traders spend 10 hours studying charts and 0 hours studying themselves. The journal reverses this. Your patterns are in your data.`,
            rule: "Log every trade within 1 hour of closing it. Every single one.",
            color: C.purple,
          },
          {
            id: "patience", icon: "⏳", title: "The Most Profitable Trade Is No Trade",
            tagline: "Professionals get paid to wait.",
            body: `This is the hardest lesson and the most valuable.\n\nOn most days, the right action is: DO NOTHING.\n\nThe market does not owe you a trade every day. Forcing setups because you're bored, or because you need to make back yesterday's loss, is how accounts get destroyed.\n\nPro traders operate like a sniper:\n• 95% of the time: watching, waiting, preparing\n• 5% of the time: taking the shot with confidence\n\nWhen the A+ LONG appears with full alignment:\n• Bull BOS confirmed\n• Trend is strong\n• Market regime is Risk-On\n• Volume is above average\n\nTHEN you act — with full size and confidence. Not before.`,
            rule: "No A+ setup = no trade. Turn off the screen and come back tomorrow.",
            color: "#4caf50",
          },

          // ── CHAPTER 2: READING THE MARKET ─────────────────────────────────
          {
            id: "regime2", icon: "📡", title: "How to Read Market Internals",
            tagline: "The market tells you what it wants to do. You just have to listen.",
            body: `Every morning before you trade, check 4 things in order:\n\n1. REGIME (Institutional Radar)\n   Risk-On = institutions are buying. Trade longs.\n   Caution = mixed. Trade smaller size, be selective.\n   Risk-Off = institutions selling. Stay flat or short.\n\n2. VIX (Fear Index)\n   Below 15 = calm market, normal trading\n   15-20 = rising uncertainty, reduce size\n   Above 20 = high fear, most longs will fail\n   Above 25 = danger zone, stay in cash\n\n3. SPY DIRECTION\n   SPY up +1%+ = tailwind. Longs have edge.\n   SPY flat = choppy. Be very selective.\n   SPY down -1%+ = headwind. Avoid longs.\n\n4. SECTOR ROTATION (Money Flow)\n   Where is money flowing in vs out?\n   If Energy and Industrials leading = risk-on\n   If Utilities and Gold leading = risk-off\n\nYou check all 4 BEFORE looking at any individual stock. The regime sets the context. Individual stocks move with the market 70% of the time.`,
            rule: "Check regime FIRST. Then look at individual stocks. Never the other way.",
            color: "#42c9d8",
            try: "Right now: Open Monitor tab. What is the regime? What is VIX? What sectors are flowing in?"
          },
          {
            id: "support", icon: "📊", title: "Support, Resistance & Key Levels",
            tagline: "Price has memory. It always returns to where decisions were made.",
            body: `Support and resistance are price levels where buyers and sellers previously fought.\n\nSUPPORT = price floor where buyers step in\nRESISTANCE = price ceiling where sellers dominate\n\nWhere does support come from?\n• Previous swing lows (price bounced here before)\n• MA50 and MA200 (moving average support)\n• Volume Profile VPOC (where most volume traded)\n• Order Blocks from SMC (where institutions bought)\n• Previous day's high/low (PDH/PDL)\n• 52-week high/low (big psychological levels)\n\nThe more times price touches a level = the stronger it is.\nEqual highs or equal lows = a "stop cluster" — institutions hunt these.\n\nWhen support becomes resistance:\nIf price breaks below a support level and then returns to it — that same level is now RESISTANCE. This is one of the most reliable patterns in trading.\n\nPractical use:\n• Buy near support with stop BELOW support\n• Sell near resistance with target AT OR BEFORE resistance\n• Never buy above resistance — wait for the break and retest`,
            rule: "Always know the nearest support AND resistance BEFORE you enter any trade.",
            color: "#26a69a",
            try: "Open any stock in the scanner. Look at the SMC column. Find the nearest Order Block. That is your support."
          },
          {
            id: "volume", icon: "📈", title: "Volume — The Most Honest Indicator",
            tagline: "Price can lie. Volume cannot.",
            body: `Price moves mean nothing without volume context.\n\nHigh volume + price up = REAL buying (institutions)\nHigh volume + price down = REAL selling (institutions)\nLow volume + price up = FAKE rally (retail only, will reverse)\nLow volume + price down = NORMAL pullback (healthy)\n\nRVOL (Relative Volume) explained:\n• RVOL 1.0 = normal volume\n• RVOL 1.5 = 50% more than average — something is happening\n• RVOL 2.0 = 2× average — big players are moving\n• RVOL 3.0+ = major institutional activity — could be breakout or breakdown\n\nThe platform calculates RVOL for every stock in the scanner.\nNEVER buy a breakout on RVOL below 1.2. Breakouts on low volume almost always fail.\n\nVolume Pace (VOL PACE column):\nThe scanner shows projected end-of-day volume based on time elapsed.\n• 1.0× = on pace for normal day\n• 2.0× = tracking for double normal volume\n• 3.0×+ = extraordinary volume — A+ setup territory\n\nVolume before price:\nInstitutions can't buy large positions without revealing themselves through volume. Smart money CANNOT be hidden. That's why volume leads price — you see them buying before price moves.`,
            rule: "Only take breakouts on RVOL ≥ 1.5. Low volume breakouts fail. High volume breakouts stick.",
            color: C.cyan,
            try: "In the scanner, sort by VOL PACE column. Stocks at top = highest current volume activity."
          },
          {
            id: "entries", icon: "🎯", title: "Entry Timing — When Exactly to Buy",
            tagline: "Being right about the stock is not enough. Timing is everything.",
            body: `Most traders lose not because they pick wrong stocks but because they enter at the wrong time.\n\n3 ENTRY TYPES on this platform:\n\n1. DEEP VALUE ZONE\n   Price at lowest entry zone (near 52w low or major support)\n   Highest reward potential, but requires patience\n   Stop loss is tight (just below support)\n   Best for: oversold bounces, value setups\n\n2. BETTER ENTRY\n   Price pulling back to mid-support zone\n   Good risk/reward. Pattern confirmed.\n   This is the "standard" professional entry\n\n3. STARTER ENTRY (near trigger)\n   Price approaching breakout level\n   Smaller initial size to test the setup\n   Add size only when Bull BOS confirms\n   Stop loss is wider\n\nThe TRIGGER level is the breakout price. When price closes above trigger with high RVOL = full entry.\n\nTHE MOST IMPORTANT RULE:\nAlways calculate your stop loss BEFORE you enter. If the stop is too far away and the risk is too large for your size — skip the trade. Wait for a better entry or a different setup.\n\nEntry checklist:\n□ Final Verdict: LONG or A+ LONG\n□ Bull BOS confirmed or price at support\n□ RVOL above 1.2×\n□ Market regime: RISK-ON or WATCH (not RISK-OFF)\n□ Stop loss calculated and accepted\n□ Position size calculated (using the risk sizer)`,
            rule: "Calculate stop loss and position size BEFORE clicking buy. Not after.",
            color: C.green,
            try: "Click any LONG setup in the scanner. Look at the ENTRY ZONES in the Technicals column. Which zone is price in right now?"
          },
          {
            id: "exits", icon: "🏁", title: "When to Take Profits & Cut Losses",
            tagline: "The entry gets you in. The exit determines if you profit.",
            body: `Most traders have a plan for entering. Almost none have a plan for exiting.\n\nCUTTING LOSSES:\n• Set stop loss before entry. When price hits it — exit. No exceptions.\n• DO NOT move your stop loss further down to "give it more room"\n  (This is how small losses become catastrophic ones)\n• If you feel yourself hoping — exit immediately\n• The stock owes you nothing\n\nTAKING PROFITS — 2 approaches:\n\n1. TARGET-BASED (platform shows T1 and T2)\n   T1 at +8% = sell 50% of position\n   T2 at +15% = sell remaining 50%\n   This locks in profit and lets winners run\n\n2. TRAILING STOP\n   As price moves up, raise your stop\n   Example: entered $50, price goes to $60\n   Move stop from $46 to $55 (below new support)\n   Now you cannot lose on this trade\n\nWHEN TO EXIT EARLY (before target):\n• Volume dries up significantly\n• Price stalls at major resistance\n• Market regime shifts to Risk-Off\n• Bear BOS forms on lower timeframe\n• You feel anxious about the position (size too large)\n\nTHE MOST IMPORTANT EXIT RULE:\nScale out — never sell everything at once. Sell partial at T1, let the rest run. This is how you capture big moves without giving everything back.`,
            rule: "Sell 50% at T1. Trail stop on the rest. Never watch a winner turn into a loser.",
            color: "#ff9800",
            try: "For your next trade: write down T1, T2, and stop BEFORE you enter. Commit to the plan."
          },
          {
            id: "premarket", icon: "🌅", title: "The Professional Morning Routine",
            tagline: "The 30 minutes before the market opens are worth more than 6 hours during the day.",
            body: `Professionals don't react to the market. They prepare for it.\n\n8:30 AM ET — Pre-Market Check (15 min)\n□ Check Telegram — did you get a gap or SMC alert overnight?\n□ Open Monitor tab — what is the regime?\n□ Check VIX — rising or falling?\n□ Check pre-market movers (Gap Scanner)\n□ Are there any earnings today? (Earnings Calendar)\n□ Any major economic events? (Economic Calendar)\n\n8:45 AM ET — Build Your Watchlist (10 min)\n□ Run the Smart Scanner\n□ Filter to A+ and LONG setups only\n□ Identify top 3 setups with:\n   - Clear entry level\n   - Defined stop loss\n   - Realistic target\n□ Note the key price levels for each\n\n9:00 AM ET — Set Alerts (5 min)\n□ Set price alerts at entry levels for your top 3 stocks\n□ This way you don't have to watch all day\n\n9:30 AM — Market Opens\n□ Do NOT trade the first 5 minutes\n□ Watch how your watchlist opens\n□ Let price settle and confirm the direction\n□ Enter only when your setup is confirmed\n\nMost profitable traders trade for 2-3 hours and then stop.\n9:30-11:00 AM and 2:00-3:30 PM are highest quality windows.\nMidday (11:30 AM - 1:30 PM) = low volume choppy = avoid`,
            rule: "Prepare your watchlist the night before or by 9:00 AM. Never trade stocks you haven't researched.",
            color: "#ffd700",
            try: "Tomorrow morning: open the platform at 8:30 AM. Check regime, VIX, and pre-market gaps before touching anything."
          },
          {
            id: "psychology", icon: "🧠", title: "Trading Psychology — Your Biggest Enemy",
            tagline: "The market doesn't hurt you. You hurt yourself.",
            body: `Every trader has two enemies:\n1. The market (manageable with a system)\n2. Their own emotions (the real danger)\n\nTHE 4 EMOTIONS THAT DESTROY ACCOUNTS:\n\n1. FEAR OF MISSING OUT (FOMO)\n   "Everyone is making money on this stock!"\n   You chase the stock after it's already up 10%\n   You pay the worst price\n   The stock reverses and you're immediately down\n   Fix: if you missed the setup, let it go. There's always another one.\n\n2. REVENGE TRADING\n   You just lost $200\n   You feel angry and want to make it back NOW\n   You take a bad setup with double size\n   You lose $400\n   Fix: after a losing trade, walk away for 30 minutes minimum.\n\n3. OVERCONFIDENCE\n   You had 3 winning trades in a row\n   You feel invincible\n   You take a risky setup with large size\n   It fails. You give back all your gains in one trade.\n   Fix: same rules every trade. Win or lose.\n\n4. PARALYSIS\n   A perfect A+ setup appears\n   You hesitate because you're afraid of losing\n   You miss the entry\n   You watch it move without you\n   Fix: trust your system. If the checklist is complete — enter.\n\nPsychology check before every trade:\nAsk yourself: "Am I trading because this is a great setup, or because I feel something?"`,
            rule: "If you feel excitement, anger, or fear about a trade — reduce size by 50% or don't trade at all.",
            color: C.purple,
            try: "After your next loss, set a timer for 30 minutes before your next trade. Notice what you feel during that time."
          },
          {
            id: "patterns", icon: "🏈", title: "Chart Patterns — The 4 You Actually Need",
            tagline: "Don't memorize 50 patterns. Master these 4.",
            body: `Forget everything except these 4 patterns. They account for 80% of institutional setups.\n\n1. 🚀 BREAKOUT\n   What: price at or above 52-week high with high volume\n   How to trade: enter above the breakout candle with stop below\n   Context needed: Bull BOS confirmed, RVOL ≥ 2×\n   Why it works: no overhead supply. Price discovery mode.\n   Mistake: buying TOO early before confirmation\n\n2. 🏈 BULL FLAG\n   What: sharp move up (the pole), then tight sideways consolidation (the flag)\n   How to trade: enter when price breaks above the flag on volume\n   Context needed: EMA9 > EMA21, RSI 50-65\n   Why it works: consolidation shakes out weak hands, then continues\n   Mistake: buying during the consolidation (wait for the break)\n\n3. ☕ CUP & HANDLE\n   What: rounded bottom (cup) followed by small pullback (handle)\n   How to trade: enter at handle break on volume\n   Context needed: price near 52-week high, positive sector\n   Why it works: accumulation pattern — institutions building positions\n   Time frame: takes weeks to form. Better on daily chart.\n\n4. 🔄 OVERSOLD BOUNCE\n   What: RSI below 35 + price at major support (MA200 or 52w low)\n   How to trade: enter when price shows first green candle recovery\n   Context needed: sector still healthy, news not catastrophic\n   Why it works: mean reversion. Price stretched too far from average.\n   Risk: falling knives. Never catch unless support holds.\n\nThe scanner detects all 4 in the PATTERN column. When you see one, open the deep dive to check if the pattern has full alignment.`,
            rule: "Only trade patterns that align with the Final Verdict. A bull flag in a Risk-Off market still fails.",
            color: "#4caf50",
            try: "In the scanner, look at the PATTERN column. Which stocks show BREAKOUT or BULL FLAG right now?"
          },
          {
            id: "smc2", icon: "🏦", title: "Smart Money Concepts — Full Picture",
            tagline: "You are not trading charts. You are trading against institutions.",
            body: `The SMC column on your platform shows institutional footprints. Here's how to read them:\n\nORDER BLOCKS (OBs)\n• A Bull OB is the LAST BEARISH candle before a major upward move\n• This is where institutions placed their buy orders\n• When price returns to an OB, institutions defend it (buy again)\n• Best entry: buy when price touches a Bull OB and shows reaction\n\nFAIR VALUE GAPS (FVGs)\n• A gap in price where no trading occurred\n• Price always tries to "fill" these gaps (return to that area)\n• Bull FVG: gap above current price = upside target\n• Bear FVG: gap below current price = downside risk\n\nBREAK OF STRUCTURE (BOS)\n• Bull BOS: price breaks above previous swing high\n  → institutions committed to buying. Trend is UP.\n• Bear BOS: price breaks below previous swing low\n  → institutions committed to selling. Trend is DOWN.\n\nCHANGE OF CHARACTER (ChoCh)\n• First sign a trend is ending\n• In an uptrend: first lower low = ChoCh\n• After ChoCh: wait for confirmation before fighting the trend\n\nHOW TO USE IT IN SEQUENCE:\n1. Check direction: Bull BOS or Bear BOS?\n2. Find nearest Order Block in that direction\n3. Wait for price to enter the Order Block\n4. Enter when you see a rejection (price holds the OB)\n5. Stop below the OB\n6. Target: next swing high or Bear FVG\n\nThis is how institutional traders actually trade. The scanner's SMC column shows all of this automatically.`,
            rule: "The Order Block entry is the most precise entry you can get. Wait for price to come TO the OB, then enter.",
            color: C.amber,
            try: "Open any stock's deep dive. Find the nearest Bull OB in the SMC column. That is your entry zone."
          },
          {
            id: "sizing2", icon: "💲", title: "Advanced Position Sizing",
            tagline: "How you size your trades determines whether you survive long enough to succeed.",
            body: `Basic sizing (from the earlier lesson): Risk Amount ÷ (Entry - Stop) = Shares.\n\nNow the professional rules:\n\nRULE 1: Maximum Position Size\nNever put more than 10-15% of your account into ONE stock.\nEven if the risk is only 1%, don't let any single position dominate.\n\nRULE 2: Scaling In\nDon't buy your full position all at once.\n• 50% at initial entry (testing the setup)\n• 50% when Bull BOS confirms\nThis way if the setup fails at the entry, you lose less.\n\nRULE 3: Correlation\nIf you own 5 tech stocks and the market drops — they ALL drop together.\nThis is why the platform warns about concentration.\nDiversify across sectors when holding multiple positions.\n\nRULE 4: Win Rate vs Risk/Reward\nYou DON'T need a 70% win rate to be profitable.\nExample:\n• Win rate: 40% (you lose more often than you win)\n• Average win: $300 · Average loss: $100\n• 10 trades: 4 wins = $1,200 · 6 losses = $600\n• Net profit: $600\n\nThis is why R:R ratio matters more than win rate.\nThe platform calculates R:R for every setup.\nMinimum: 1.5:1 (target at least 1.5× what you risk)\nIdeal: 2:1 or better\n\nRULE 5: Never trade with money you can't afford to lose\nEvery trade must be sized as if you KNOW it will hit the stop.\nIf hitting the stop would hurt you financially — size is too large.`,
            rule: "Minimum R:R of 1.5:1. If the target isn't 1.5× the risk — don't take the trade.",
            color: C.accent,
            try: "For your next trade: calculate R:R. Entry-Stop=Risk. Target-Entry=Reward. Reward÷Risk=R:R. Accept only ≥1.5."
          },
          {
            id: "mistakes", icon: "⚠️", title: "The 10 Most Common Mistakes",
            tagline: "Every mistake on this list has destroyed accounts. Learn from other people's pain.",
            body: `1. CHASING ENTRIES\n   Buying after the move already happened. Price is extended.\n   Fix: if you missed it, wait for the pullback or next setup.\n\n2. IGNORING THE MARKET REGIME\n   Buying individual stocks when SPY is in free fall.\n   Fix: check regime before anything else.\n\n3. MOVING STOPS\n   Changing your stop loss to "give it more room" after entering.\n   Fix: your stop is decided BEFORE entry. Never move it lower.\n\n4. AVERAGING DOWN\n   Adding to a losing position hoping it will recover.\n   Fix: never add to a loser. Add only to winners.\n\n5. OVERTRADING\n   Taking 10+ trades a day. Transaction costs eat profits. Fatigue leads to mistakes.\n   Fix: maximum 2-3 trades per day. Quality over quantity.\n\n6. POSITION TOO LARGE\n   One trade represents 30-50% of your account.\n   Fix: max 10-15% per position, 1% risk per trade.\n\n7. TRADING NEWS\n   Reacting to headlines without setup confirmation.\n   Fix: news sets context. Setup triggers entry.\n\n8. NOT USING STOPS\n   "I'll just watch it. I'll sell if it drops."\n   You don't sell. It keeps dropping. You hold hoping. It gaps down overnight.\n   Fix: always. use. stops.\n\n9. TRADING ON TIPS\n   Someone in a group says "buy XXXX" and you buy without research.\n   Fix: if it's not in your scanner with a confirmed setup — it doesn't exist.\n\n10. QUITTING AFTER A LOSING STREAK\n   3 losing trades → panic → stop trading the system\n   → system starts working → you missed the recovery\n   Fix: losing streaks happen to everyone. Trust the process. Reduce size, don't quit.`,
            rule: "Print this list. Read it before every trading day. Most losses come from these 10 mistakes.",
            color: C.red,
            try: "Which of these 10 mistakes have you made? Write them down. That is your personal weakness list."
          },
        ];

        // activeLesson state hoisted to top level (Rules of Hooks)
        const lesson = LESSONS.find(l => l.id === activeLesson);

        return (
          <div style={{ padding: "16px 20px", maxWidth: 960, margin: "0 auto" }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>
                📚 TRADING ACADEMY
              </div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
                Practical education built into your trading platform. Every lesson is connected to what you see in the scanner and deep dive. No theory for theory's sake — only what matters for real trading.
              </div>
            </div>

            {/* Lesson detail */}
            {lesson ? (
              <div>
                <button onClick={() => setActiveLesson(null)}
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`, background: C.surface,
                    color: C.textDim, borderRadius: 6, padding: "6px 14px", cursor: "pointer", marginBottom: 20 }}>
                  ← Back to lessons
                </button>
                <div style={{ background: C.card, border: `1px solid ${lesson.color}44`,
                  borderLeft: `6px solid ${lesson.color}`, borderRadius: 12, padding: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <span style={{ fontSize: 36 }}>{lesson.icon}</span>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: lesson.color }}>{lesson.title}</div>
                      <div style={{ fontFamily: SANS, fontSize: 14, color: C.textSec, fontStyle: "italic", marginTop: 4 }}>"{lesson.tagline}"</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.9,
                    whiteSpace: "pre-line", marginBottom: 24 }}>
                    {lesson.body}
                  </div>
                  <div style={{ background: `${lesson.color}14`, border: `1px solid ${lesson.color}44`,
                    borderRadius: 8, padding: "14px 18px", marginBottom: lesson.try ? 12 : 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: lesson.color, marginBottom: 6, letterSpacing: "0.06em" }}>
                      📌 THE RULE
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.text }}>
                      {lesson.rule}
                    </div>
                  </div>
                  {lesson.try && (
                    <div style={{ background: `${C.accent}0d`, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "14px 18px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.accent, marginBottom: 6, letterSpacing: "0.06em" }}>
                        ▶ TRY THIS NOW
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
                        {lesson.try}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Max Loss Setting */}
                <div style={{ background: `${C.red}0d`, border: `1px solid ${C.red}44`, borderRadius: 10,
                  padding: "16px 20px", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.red }}>🛑 DAILY MAX LOSS LOCK</div>
                        {/* ON/OFF toggle */}
                        <button
                          onClick={() => { const n = !lockEnabled; setLockEnabled(n); try{localStorage.setItem("lock_enabled",String(n));}catch{} if (!n) { setTradingLocked(false); setLockReason(""); } }}
                          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900,
                            background: lockEnabled ? C.green : C.surface,
                            color: lockEnabled ? "#fff" : C.textDim,
                            borderRadius: 20, padding: "4px 14px", cursor: "pointer",
                            border: `1px solid ${lockEnabled ? C.green : C.border}` }}>
                          {lockEnabled ? "ON" : "OFF"}
                        </button>
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 4 }}>
                        {lockEnabled ? "Platform will lock when daily P&L reaches -$" + dailyMaxLoss + ". Toggle OFF to disable." : "Toggle ON to activate. Prevents revenge trading after big losses."}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {lockEnabled && (
                        <>
                          <span style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Lock at -$</span>
                          <input type="number" value={dailyMaxLoss}
                            onChange={e => { setDailyMaxLoss(e.target.value); try { localStorage.setItem("daily_max_loss", e.target.value); } catch {} }}
                            style={{ width: 80, fontFamily: MONO, fontSize: 14, fontWeight: 700,
                              background: C.surface, border: `1px solid ${C.red}44`, color: C.red,
                              borderRadius: 6, padding: "6px 10px", textAlign: "center" }} />
                        </>
                      )}
                      {tradingLocked && (
                        <button onClick={() => { setTradingLocked(false); setLockReason(""); }}
                          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, border: `1px solid ${C.accent}`,
                            background: `${C.accent}18`, color: C.accent, borderRadius: 6, padding: "7px 16px", cursor: "pointer" }}>
                          🔓 UNLOCK NOW
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chapter headers + Lessons grid */}
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>
                    📖 {LESSONS.length} LESSONS · Click any to read in full
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: 12 }}>
                  {LESSONS.map(l => (
                    <div key={l.id} onClick={() => setActiveLesson(l.id)}
                      style={{ background: C.card, border: `1px solid ${l.color}33`,
                        borderLeft: `4px solid ${l.color}`, borderRadius: 10,
                        padding: "16px 18px", cursor: "pointer",
                        transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = C.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 22 }}>{l.icon}</span>
                        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: l.color }}>{l.title}</div>
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, fontStyle: "italic", marginBottom: 8 }}>
                        "{l.tagline}"
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: l.color, fontWeight: 700 }}>
                        Read lesson →
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 24, padding: "14px 18px", background: C.surface, borderRadius: 8,
                  border: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>
                  💡 <strong style={{ color: C.text }}>How to use the Academy:</strong> After every scan, before you trade anything, ask yourself: "Do I understand WHY the Final Verdict says what it says?" If not — open the relevant lesson. The goal is not to memorize rules. It's to understand them so deeply that they become automatic.
                </div>
              </>
            )}
          </div>
        );
}
