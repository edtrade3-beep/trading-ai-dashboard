import { useState } from "react";

// ─── EDUCATION & PSYCHOLOGY TAB ──────────────────────────────────────────────
const EDU_MISTAKES_KEY  = "axiom_mistakes_v1";
const EDU_RULES_KEY     = "axiom_rules_v1";
const EDU_JOURNAL_KEY   = "axiom_psych_v1";

const DEFAULT_RULES = [
  "Never risk more than 1% of account per trade",
  "No trades in the first 15 minutes (9:30–9:45 AM)",
  "Always set stop loss BEFORE entering",
  "Take 50% profit at T1, let rest run to T2",
  "No revenge trading — 2 losses in a row = stop for the day",
  "Only trade A+ setups — if in doubt, sit out",
  "Never add to a losing position",
  "Check market regime before every trade",
];

const LESSONS = [
  { id:"l1", category:"MINDSET", title:"Why 90% of traders lose money", icon:"🧠",
    points:["They trade on emotion not rules","They risk too much per trade (10%+ instead of 1%)","They have no written trading plan","They revenge trade after losses","They overtrade — waiting is a skill"] },
  { id:"l2", category:"RISK", title:"The 1% rule — how professionals stay alive", icon:"🛡",
    points:["Risk only 1% of account per trade","$10,000 account = max $100 risk per trade","This means you can lose 100 times in a row and still be in the game","Most traders risk 5-20% and blow up in weeks","Small consistent gains beat big risky wins"] },
  { id:"l3", category:"ENTRY", title:"How to find the perfect entry", icon:"🎯",
    points:["Wait for pullback to EMA21 or MA50 — not breakout","RSI between 35-55 = sweet spot for entries","Volume must confirm — no volume = no conviction","Let the setup come to you, never chase","The best entry is often when it looks scary"] },
  { id:"l4", category:"EXIT", title:"When to sell — the hardest skill in trading", icon:"🚪",
    points:["Take 50% off at T1 (+5-8%) — lock in gains","Move stop to breakeven once T1 is hit","Let remaining 50% run to T2 (+15-20%)","Never hold through earnings without a hedge","Sell 1/3 at T1, 1/3 at T2, let 1/3 run free"] },
  { id:"l5", category:"PSYCHOLOGY", title:"How to stop revenge trading", icon:"😤",
    points:["After 2 losses in a row → close platform, go for a walk","Your brain is in fight-or-flight mode after losses","Revenge trades feel different — they feel urgent, angry","Write down WHY you want to enter before clicking buy","If the reason starts with 'I need to make back' → don't trade"] },
  { id:"l6", category:"PSYCHOLOGY", title:"FOMO — the trader killer", icon:"😰",
    points:["FOMO = Fear Of Missing Out = buying tops","If you missed the move, it's gone — there's always a next one","Ask: would I buy this if it was -10% today? If no, don't buy it +10%","The stock you're watching now is not the last opportunity ever","FOMO trades almost always lose — the setup is already over"] },
  { id:"l7", category:"SETUP", title:"The 3 setups that work 70%+ of the time", icon:"📊",
    points:["1. Pullback to EMA21 in an uptrend (buy the dip)","2. Breakout above 52W high with volume 2x+ average","3. Oversold bounce — RSI < 30, price at major support","All 3 require: trend alignment + volume confirmation + stop loss","Master these 3 before learning anything else"] },
  { id:"l8", category:"MINDSET", title:"Process over profits — the pro mindset", icon:"🏆",
    points:["A good trade can lose money. A bad trade can make money.","Judge yourself on process: did I follow my rules?","Keep a trade journal — review every Friday","Track win rate AND average win vs average loss size","Your edge compounds over 100s of trades, not 1"] },
  { id:"l9", category:"RISK", title:"Position sizing — size matters more than entry", icon:"📐",
    points:["Entry price matters less than how much you risk","$10K account, 1% risk, $5 stop = 200 shares max","Most traders lose because position too big — panic sells","Scale in: buy 50% at entry, add 50% if confirmed","Never go all-in — always leave room to be wrong"] },
  { id:"l10", category:"SETUP", title:"Reading the tape — what price action tells you", icon:"📈",
    points:["Big green candle on high volume = buyers in control","Small candles on low volume = no conviction either way","Long upper wick = sellers rejecting higher prices (bearish)","Long lower wick = buyers rejecting lower prices (bullish)","Candle closing near the high = strength, near the low = weakness"] },
];

const MISTAKE_TYPES = ["FOMO Entry","Revenge Trade","No Stop Loss","Too Big Size","Held Through Earnings",
  "Chased Breakout","Averaged Down","Broke My Rules","Overtrade","Panic Sell","Early Exit","Late Entry"];

// ── SVG Chart Pattern drawings ───────────────────────────────────────────────
function ChartSVG({ type, w = 280, h = 140 }) {
  const s = { overflow: "visible" };
  const bg = "#0a0e1a", grid = "#1e2d42", bull = "#22d47e", bear = "#ef4444", line = "#3b82f6", ma = "#f59e0b";

  const Candle = ({ x, open, close, high, low, isBull, barW = 10 }) => {
    const top = Math.min(open, close), bot = Math.max(open, close);
    return (
      <g>
        <line x1={x} y1={high} x2={x} y2={low} stroke={isBull ? bull : bear} strokeWidth={1.5} />
        <rect x={x - barW/2} y={top} width={barW} height={Math.max(1, bot - top)} fill={isBull ? bull : bear} />
      </g>
    );
  };

  const Line = ({ pts, color = line, width = 2 }) => (
    <polyline points={pts.map(([x,y]) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" />
  );

  const Area = ({ pts, color }) => {
    const path = pts.map(([x,y], i) => `${i===0?"M":"L"}${x},${y}`).join(" ") + ` L${pts.at(-1)[0]},${h} L${pts[0][0]},${h} Z`;
    return <path d={path} fill={`${color}22`} />;
  };

  const GridLines = () => (
    <g>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={0} y1={h * p} x2={w} y2={h * p} stroke={grid} strokeWidth={1} strokeDasharray="3,3" />
      ))}
    </g>
  );

  if (type === "uptrend") {
    const candles = [
      [20,110,90,105,115,true],[40,90,72,88,95,true],[60,105,88,102,110,false],
      [80,88,68,85,92,true],[100,72,52,70,78,true],[120,52,38,50,58,true],
      [140,60,42,58,65,false],[160,42,22,40,48,true],[180,22,5,20,28,true],
      [200,28,12,24,32,false],[220,12,3,10,18,true],[240,3,18,-5,8,true],
    ];
    const maLine = [[25,108],[45,95],[65,88],[85,78],[105,65],[125,55],[145,48],[165,38],[185,28],[205,20],[225,12],[245,5]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <Line pts={maLine} color={ma} />
        {candles.map(([x,o,c,hi,lo,ib]) => <Candle key={x} x={x} open={o} close={c} high={hi} low={lo} isBull={ib} />)}
        <text x={6} y={14} fill={bull} fontSize={10} fontWeight="bold">UPTREND — Higher Highs, Higher Lows</text>
        <text x={w-50} y={h-6} fill={ma} fontSize={9}>MA50 →</text>
      </svg>
    );
  }

  if (type === "support") {
    const pts = [[10,60],[40,40],[70,80],[100,35],[130,70],[160,30],[190,65],[220,28],[250,60],[270,35]];
    const supY = 90;
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <line x1={0} y1={supY} x2={w} y2={supY} stroke={bull} strokeWidth={2} strokeDasharray="6,3" />
        <text x={6} y={supY - 6} fill={bull} fontSize={9}>SUPPORT LEVEL</text>
        <line x1={0} y1={20} x2={w} y2={20} stroke={bear} strokeWidth={2} strokeDasharray="6,3" />
        <text x={6} y={16} fill={bear} fontSize={9}>RESISTANCE LEVEL</text>
        <Line pts={pts} color={line} width={2} />
        {pts.map(([x,y], i) => y > 75 && <circle key={i} cx={x} cy={y} r={4} fill={bull} />)}
        {pts.map(([x,y], i) => y < 30 && <circle key={i} cx={x} cy={y} r={4} fill={bear} />)}
        <text x={6} y={h-6} fill="#666" fontSize={9}>Price bounces off support ✅ rejects resistance ❌</text>
      </svg>
    );
  }

  if (type === "ema_cross") {
    const fast = [[10,120],[40,105],[70,85],[100,65],[130,50],[160,38],[190,28],[220,22],[250,18],[270,15]];
    const slow = [[10,115],[40,108],[70,98],[100,88],[130,75],[160,62],[190,52],[220,44],[250,38],[270,34]];
    const crossX = 115;
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <Area pts={fast} color={bull} />
        <Line pts={slow} color={ma} width={2} />
        <Line pts={fast} color={bull} width={2.5} />
        <line x1={crossX} y1={10} x2={crossX} y2={h-10} stroke="#fff" strokeWidth={1} strokeDasharray="4,2" opacity={0.4} />
        <circle cx={crossX} cy={73} r={6} fill={bull} opacity={0.9} />
        <text x={crossX+8} y={70} fill={bull} fontSize={9} fontWeight="bold">BUY SIGNAL</text>
        <text x={12} y={h-6} fill={bull} fontSize={9}>EMA9 (fast)</text>
        <text x={90} y={h-6} fill={ma} fontSize={9}>EMA21 (slow)</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>EMA 9 crosses above EMA 21 = Bullish ✅</text>
      </svg>
    );
  }

  if (type === "rsi") {
    const pricePts = [[10,90],[35,75],[60,55],[85,40],[110,30],[135,45],[160,35],[185,25],[210,38],[235,28],[260,20]];
    const rsiPts   = [[10,60],[35,55],[60,52],[85,48],[110,35],[135,42],[160,38],[185,32],[210,42],[235,48],[260,55]];
    const rsiH = 50, rsiY = h - rsiH - 10;
    return (
      <svg width={w} height={h + rsiH} style={s}>
        <rect width={w} height={h + rsiH} fill={bg} rx={4} />
        <GridLines />
        <Line pts={pricePts} color={line} width={2} />
        <text x={6} y={14} fill="#ccc" fontSize={10}>RSI DIVERGENCE — Price lower, RSI higher = bullish</text>
        {/* arrows showing divergence */}
        <line x1={110} y1={30} x2={185} y2={25} stroke={bear} strokeWidth={1.5} />
        <line x1={110} y1={rsiY+35} x2={185} y2={rsiY+32} stroke={bull} strokeWidth={1.5} />
        {/* RSI panel */}
        <rect y={rsiY} width={w} height={rsiH} fill="#050b14" />
        <line x1={0} y1={rsiY} x2={w} y2={rsiY} stroke={grid} strokeWidth={1} />
        <line x1={0} y1={rsiY+rsiH*0.3} x2={w} y2={rsiY+rsiH*0.3} stroke={bear} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
        <line x1={0} y1={rsiY+rsiH*0.7} x2={w} y2={rsiY+rsiH*0.7} stroke={bull} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
        <text x={4} y={rsiY+13} fill={bear} fontSize={8}>70</text>
        <text x={4} y={rsiY+rsiH*0.7+4} fill={bull} fontSize={8}>30</text>
        <Line pts={rsiPts.map(([x,y]) => [x, rsiY + y * rsiH / 65])} color="#a78bfa" width={2} />
        <text x={6} y={rsiY + rsiH - 4} fill="#a78bfa" fontSize={9}>RSI(14)</text>
        <text x={140} y={rsiY + 12} fill={bull} fontSize={9}>RSI rising while price drops = BULLISH divergence</text>
      </svg>
    );
  }

  if (type === "cup_handle") {
    const cup = [[15,30],[35,55],[60,78],[90,95],[120,100],[150,95],[175,75],[195,50],[210,30]];
    const handle = [[210,30],[225,45],[235,40],[245,38],[255,35],[265,32],[275,28]];
    const breakout = [[275,28],[285,15],[290,8]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <line x1={15} y1={30} x2={w-10} y2={30} stroke={bear} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.6} />
        <text x={w-80} y={26} fill={bear} fontSize={9}>RESISTANCE</text>
        <Line pts={cup} color={line} width={2.5} />
        <Line pts={handle} color={line} width={2.5} />
        <Line pts={breakout} color={bull} width={3} />
        <circle cx={275} cy={28} r={5} fill={bull} />
        <text x={240} y={14} fill={bull} fontSize={9} fontWeight="bold">BREAKOUT ↑</text>
        <text x={90} y={h-6} fill="#666" fontSize={9}>Cup</text>
        <text x={220} y={h-6} fill="#666" fontSize={9}>Handle</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Cup & Handle — Bullish continuation pattern</text>
        <path d="M 80,100 Q 120,115 160,100" fill="none" stroke="#666" strokeWidth={1} strokeDasharray="3,2" />
      </svg>
    );
  }

  if (type === "head_shoulders") {
    const pts = [
      [15,90],[35,70],[55,55],[75,70],[90,45],[105,70],[125,52],[140,70],[155,55],[170,70],[190,90],[210,110]
    ];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <line x1={35} y1={95} x2={185} y2={95} stroke={bear} strokeWidth={2} strokeDasharray="5,3" />
        <text x={6} y={92} fill={bear} fontSize={9}>NECKLINE</text>
        <Line pts={pts} color={line} width={2.5} />
        {/* Label L, H, R shoulders */}
        <text x={48} y={50} fill={ma} fontSize={9}>L</text>
        <text x={83} y={40} fill={ma} fontSize={9}>HEAD</text>
        <text x={148} y={50} fill={ma} fontSize={9}>R</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Head & Shoulders — Bearish reversal pattern</text>
        <text x={6} y={h-6} fill={bear} fontSize={9}>Break neckline = SELL signal ↓</text>
        <line x1={185} y1={95} x2={210} y2={115} stroke={bear} strokeWidth={2.5} />
        <text x={195} y={128} fill={bear} fontSize={9} fontWeight="bold">↓ SELL</text>
      </svg>
    );
  }

  if (type === "flag") {
    const pole = [[20,120],[40,60]];
    const flag = [[40,60],[60,68],[80,62],[100,70],[120,63],[140,72]];
    const breakout2 = [[140,72],[160,50],[175,30]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <Line pts={pole} color={bull} width={3} />
        <Line pts={flag} color={line} width={2} />
        <line x1={40} y1={60} x2={140} y2={60} stroke="#666" strokeWidth={1} strokeDasharray="3,2" />
        <line x1={40} y1={75} x2={140} y2={75} stroke="#666" strokeWidth={1} strokeDasharray="3,2" />
        <Line pts={breakout2} color={bull} width={3} />
        <circle cx={140} cy={72} r={5} fill={bull} />
        <text x={145} y={50} fill={bull} fontSize={9} fontWeight="bold">BREAKOUT ↑</text>
        <text x={22} y={h-6} fill="#666" fontSize={9}>Pole</text>
        <text x={70} y={h-6} fill="#666" fontSize={9}>Flag (consolidation)</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Bull Flag — Buy the breakout above flag</text>
      </svg>
    );
  }

  if (type === "doji") {
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <text x={6} y={14} fill="#ccc" fontSize={10}>Candlestick Patterns</text>
        {/* Bullish engulfing */}
        <Candle x={30} open={70} close={90} high={65} low={95} isBull={false} barW={12} />
        <Candle x={50} open={95} close={55} high={100} low={50} isBull={true} barW={14} />
        <text x={20} y={h-18} fill={bull} fontSize={8}>Bullish</text>
        <text x={15} y={h-8} fill={bull} fontSize={8}>Engulf</text>
        {/* Doji */}
        <Candle x={100} open={72} close={72} high={55} low={90} isBull={true} barW={12} />
        <text x={88} y={h-8} fill={ma} fontSize={8}>Doji</text>
        {/* Hammer */}
        <Candle x={150} open={60} close={55} high={52} low={90} isBull={true} barW={12} />
        <text x={136} y={h-8} fill={bull} fontSize={8}>Hammer</text>
        {/* Shooting Star */}
        <Candle x={200} open={80} close={85} high={50} low={88} isBull={false} barW={12} />
        <text x={183} y={h-8} fill={bear} fontSize={8}>Shooting</text>
        <text x={188} y={h-18+10} fill={bear} fontSize={8}>Star</text>
        {/* Marubozu */}
        <Candle x={248} open={90} close={40} high={90} low={40} isBull={true} barW={14} />
        <text x={235} y={h-8} fill={bull} fontSize={8}>Marub.</text>
        {/* Labels */}
        <text x={6} y={h-30} fill="#555" fontSize={8}>← bearish   bull →</text>
      </svg>
    );
  }

  if (type === "macd") {
    const macdLine = [[10,60],[40,55],[70,42],[100,35],[130,28],[160,35],[190,48],[220,55],[250,60],[270,65]];
    const signalLine = [[10,62],[40,58],[70,50],[100,42],[130,35],[160,38],[190,45],[220,52],[250,58],[270,62]];
    const midY = h * 0.6;
    const bars = [[10,0],[40,-3],[70,-8],[100,-5],[130,8],[160,12],[190,8],[220,3],[250,-2],[270,-5]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <Line pts={[[10,30],[40,22],[70,18],[100,15],[130,12],[160,18],[190,28],[220,38],[250,45],[270,50]]} color={line} width={2} />
        <text x={6} y={14} fill="#ccc" fontSize={10}>MACD — Momentum indicator</text>
        <rect y={midY-2} width={w} height={3} fill={grid} />
        {bars.map(([x, bh]) => (
          <rect key={x} x={x-8} y={bh < 0 ? midY : midY - bh*2} width={16} height={Math.abs(bh)*2 || 1}
            fill={bh >= 0 ? `${bull}88` : `${bear}88`} />
        ))}
        <Line pts={macdLine.map(([x,y]) => [x, midY + (y-50)*1.2])} color={line} width={1.5} />
        <Line pts={signalLine.map(([x,y]) => [x, midY + (y-52)*1.2])} color={bear} width={1.5} />
        <text x={6} y={h-4} fill={line} fontSize={8}>MACD</text>
        <text x={50} y={h-4} fill={bear} fontSize={8}>Signal</text>
        <text x={110} y={h-4} fill={bull} fontSize={8}>Histogram (green=bull)</text>
      </svg>
    );
  }

  if (type === "vwap") {
    const price2 = [[10,80],[40,65],[70,55],[100,70],[130,45],[160,38],[190,50],[220,35],[250,28],[270,22]];
    const vwap = [[10,75],[40,68],[70,62],[100,60],[130,55],[160,50],[190,48],[220,44],[250,40],[270,37]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4} />
        <GridLines />
        <Line pts={vwap} color={ma} width={2.5} />
        <Area pts={price2} color={bull} />
        <Line pts={price2} color={line} width={2} />
        {/* Mark crossovers */}
        <circle cx={100} cy={65} r={5} fill={bear} />
        <circle cx={190} cy={49} r={5} fill={bull} />
        <text x={105} y={62} fill={bear} fontSize={8}>Price below VWAP = weak</text>
        <text x={195} y={46} fill={bull} fontSize={8}>Price above = strong</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>VWAP — Volume Weighted Avg Price</text>
        <text x={w-70} y={h-6} fill={ma} fontSize={9}>VWAP →</text>
      </svg>
    );
  }

  if (type === "orderflow") {
    // Accumulation → breakout pattern
    const accPts = [[10,80],[30,82],[50,78],[70,83],[90,79],[110,81],[130,77],[150,82],[170,78]];
    const breakPts = [[170,78],[190,60],[210,40],[230,20],[250,10]];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <GridLines/>
        {/* Accumulation zone shading */}
        <rect x={5} y={70} width={170} height={20} fill={`${bull}12`} stroke={`${bull}33`} strokeDasharray="4,2" rx={2}/>
        <text x={60} y={98} fill={bull} fontSize={8}>ACCUMULATION ZONE</text>
        {/* Volume bars */}
        {[15,35,55,75,95,115,135,155].map((x,i) => (
          <rect key={x} x={x-6} y={h-18-(i%2===0?12:6)} width={12} height={i%2===0?12:6} fill={`${bull}44`}/>
        ))}
        <Line pts={accPts} color={line} width={2}/>
        <Line pts={breakPts} color={bull} width={3}/>
        <circle cx={170} cy={78} r={6} fill={bull}/>
        <text x={175} y={72} fill={bull} fontSize={9} fontWeight="bold">BREAKOUT ↑</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Institutional Accumulation → Price Explosion</text>
        <text x={6} y={h-4} fill="#555" fontSize={8}>Low vol consolidation = institutions absorbing supply</text>
      </svg>
    );
  }

  if (type === "volprofile") {
    const bars = [[130,20],[110,15],[90,25],[70,40],[50,60],[30,90],[20,120],[15,80],[20,50],[30,35],[50,20],[70,15]];
    const pocY = 75;
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        {/* Horizontal volume bars */}
        {bars.map(([barW, y], i) => (
          <rect key={i} x={w-barW-2} y={y-5} width={barW} height={9}
            fill={y===pocY?`${bull}99`:`${bull}33`} stroke={y===pocY?bull:"none"} rx={1}/>
        ))}
        {/* Price line */}
        <line x1={0} y1={45} x2={w-130} y2={45} stroke={line} strokeWidth={2}/>
        {/* POC line */}
        <line x1={0} y1={pocY} x2={w} y2={pocY} stroke={bull} strokeWidth={1.5} strokeDasharray="5,3"/>
        <text x={4} y={pocY-4} fill={bull} fontSize={8} fontWeight="bold">POC — Point of Control</text>
        {/* VAH / VAL */}
        <line x1={0} y1={50} x2={w-100} y2={50} stroke={ma} strokeWidth={1} strokeDasharray="3,2"/>
        <line x1={0} y1={100} x2={w-100} y2={100} stroke={ma} strokeWidth={1} strokeDasharray="3,2"/>
        <text x={4} y={46} fill={ma} fontSize={8}>VAH</text>
        <text x={4} y={114} fill={ma} fontSize={8}>VAL</text>
        <rect x={0} y={50} width={8} height={50} fill={`${ma}22`}/>
        <text x={14} y={78} fill={ma} fontSize={8}>Value Area (70%)</text>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Volume Profile — Institutional Battlegrounds</text>
      </svg>
    );
  }

  if (type === "smc") {
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <GridLines/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Smart Money Concepts</text>
        {/* Downtrend */}
        <Line pts={[[10,25],[50,50],[90,35],[110,60]]} color={bear} width={2}/>
        {/* Order Block */}
        <rect x={85} y={25} width={30} height={30} fill={`${bull}25`} stroke={bull} strokeDasharray="3,2" rx={2}/>
        <text x={87} y={23} fill={bull} fontSize={8} fontWeight="bold">OB</text>
        {/* FVG */}
        <rect x={50} y={30} width={40} height={20} fill={`${ma}20`} stroke={ma} strokeDasharray="3,2" rx={2}/>
        <text x={55} y={28} fill={ma} fontSize={8}>FVG</text>
        {/* Liquidity sweep */}
        <Line pts={[[110,60],[130,75],[145,55],[165,30],[200,10],[240,5]]} color={bull} width={2.5}/>
        <circle cx={130} cy={75} r={5} fill={bear}/>
        <text x={100} y={90} fill={bear} fontSize={8}>Liquidity Sweep</text>
        <text x={100} y={100} fill={bear} fontSize={8}>(Stop Hunt)</text>
        {/* Return to OB */}
        <Line pts={[[145,55],[120,42]]} color={ma} width={1.5} strokeDasharray="3,2"/>
        <text x={130} y={38} fill={ma} fontSize={8}>Return to OB</text>
        <text x={6} y={h-4} fill="#555" fontSize={8}>OB = Order Block · FVG = Fair Value Gap</text>
      </svg>
    );
  }

  if (type === "rotation") {
    const sectors = [["XLK Tech","#3b82f6",30],["XLF Fin","#22d47e",70],["XLE Energy","#f59e0b",110],["XLU Util","#7c3aed",150],["XLV Health","#0891b2",190],["XLP Staples","#ef4444",230]];
    const perf = [15,-5,8,-12,-3,2];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Sector Rotation — Where Money Flows</text>
        {/* Cycle circle */}
        <circle cx={140} cy={90} r={60} fill="none" stroke="#1e2d42" strokeWidth={1.5}/>
        {[["Recovery","#22d47e",0],["Expansion","#3b82f6",90],["Slowdown","#f59e0b",180],["Recession","#ef4444",270]].map(([l,c,deg]) => {
          const rad = (deg-90)*Math.PI/180;
          const x = 140 + 72*Math.cos(rad), y = 90 + 72*Math.sin(rad);
          return <text key={l} x={x-18} y={y+4} fill={c} fontSize={8} fontWeight="bold">{l}</text>;
        })}
        {/* Arrow */}
        <path d="M 140 30 A 60 60 0 0 1 200 90" fill="none" stroke={bull} strokeWidth={2} strokeDasharray="4,2"/>
        <text x={6} y={h-4} fill="#555" fontSize={8}>Buy the sector BEFORE it's obvious</text>
      </svg>
    );
  }

  if (type === "marketprofile") {
    const tpos = [[2,8],[4,9],[8,10],[12,9],[8,8],[4,7],[2,6]]; // TPO count per price
    const prices = [55,60,65,70,75,80,85];
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Market Profile — TPO Distribution</text>
        {tpos.map(([cnt,_],i) => {
          const y = 25 + i*16, barW = tpos[i][0]*14, pocW = Math.max(...tpos.map(t=>t[0]))*14;
          const isPOC = tpos[i][0] === Math.max(...tpos.map(t=>t[0]));
          return (
            <g key={i}>
              <rect x={50} y={y} width={barW} height={13} fill={isPOC?`${bull}60`:`${bull}25`} rx={2}/>
              {isPOC && <rect x={50} y={y} width={barW} height={13} fill="none" stroke={bull} rx={2}/>}
              <text x={44} y={y+10} fill={C.textDim||"#888"} fontSize={9} textAnchor="end">{prices[i]}</text>
              {isPOC && <text x={50+barW+4} y={y+10} fill={bull} fontSize={8} fontWeight="bold">POC</text>}
            </g>
          );
        })}
        <text x={6} y={h-4} fill="#555" fontSize={8}>Wider = more time spent = institutional acceptance</text>
      </svg>
    );
  }

  if (type === "optflow") {
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <GridLines/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Options Flow — Smart Money Positioning</text>
        {/* Put/Call ratio gauge */}
        <text x={6} y={32} fill={C.textDim||"#888"} fontSize={9}>PUT/CALL RATIO</text>
        <rect x={6} y={38} width={200} height={14} fill="#1e2d42" rx={7}/>
        <rect x={6} y={38} width={80} height={14} fill={`${bull}88`} rx={7}/>
        <text x={90} y={50} fill={bull} fontSize={9} fontWeight="bold">0.6 BULLISH</text>
        {/* Flow table */}
        {[
          ["NVDA","50 CALL","10,000x","🔥 SWEEP",bull],
          ["AAPL","200 PUT","2,000x","hedge",bear],
          ["SPY","450 CALL","50,000x","🔥 BLOCK",bull],
          ["TSLA","250 PUT","5,000x","hedge",bear],
        ].map(([sym,strike,vol,type2,col],i) => (
          <g key={i}>
            <rect x={6} y={62+i*18} width={264} height={16} fill={`${col}10`} rx={2}/>
            <text x={10} y={74+i*18} fill={col} fontSize={9} fontWeight="bold">{sym}</text>
            <text x={60} y={74+i*18} fill={col} fontSize={9}>{strike}</text>
            <text x={120} y={74+i*18} fill={col} fontSize={9}>{vol}</text>
            <text x={190} y={74+i*18} fill={col} fontSize={9} fontWeight="bold">{type2}</text>
          </g>
        ))}
        <text x={6} y={h-4} fill="#555" fontSize={8}>Sweep = aggressive buy, filled across multiple exchanges</text>
      </svg>
    );
  }

  if (type === "kelly") {
    const w2 = w, h2 = h;
    const pts25 = [[0,130],[30,115],[60,100],[90,88],[120,78],[150,68],[180,60],[210,52],[240,46],[270,40]];
    const pts50 = [[0,130],[30,108],[60,88],[90,72],[120,58],[150,46],[180,36],[210,28],[240,22],[270,16]];
    const pts100= [[0,130],[30,120],[60,125],[90,130],[120,118],[150,108],[180,98],[210,88],[240,78],[270,68]];
    return (
      <svg width={w2} height={h2} style={s}>
        <rect width={w2} height={h2} fill={bg} rx={4}/>
        <GridLines/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Kelly Criterion — Account Growth Simulation</text>
        <Line pts={pts25} color={bull} width={2.5}/>
        <Line pts={pts50} color={ma} width={2}/>
        <Line pts={pts100} color={bear} width={1.5}/>
        <text x={245} y={38} fill={bull} fontSize={9} fontWeight="bold">25% Kelly</text>
        <text x={245} y={14} fill={ma} fontSize={9}>50% Kelly</text>
        <text x={245} y={66} fill={bear} fontSize={9}>Full Kelly</text>
        <text x={6} y={h2-4} fill="#555" fontSize={8}>100 trades · 55% win rate · 2:1 R:R</text>
      </svg>
    );
  }

  if (type === "intermarket") {
    return (
      <svg width={w} height={h} style={s}>
        <rect width={w} height={h} fill={bg} rx={4}/>
        <text x={6} y={14} fill="#ccc" fontSize={10}>Intermarket Relationships</text>
        {[
          ["10Y YIELD ↑","TECH ↓","#ef4444",20,40],
          ["DXY ↑","GOLD ↓","#f59e0b",20,62],
          ["OIL ↑","ENERGY ↑","#22d47e",20,84],
          ["GOLD ↑","RISK OFF","#a78bfa",20,106],
          ["COPPER ↑","GROWTH ↑","#22d47e",20,128],
        ].map(([left,right,col,x,y]) => (
          <g key={left}>
            <rect x={x} y={y-11} width={90} height={14} fill={`${col}20`} stroke={`${col}44`} rx={3}/>
            <text x={x+4} y={y} fill={col} fontSize={10} fontWeight="bold">{left}</text>
            <text x={x+96} y={y} fill="#666" fontSize={12}>→</text>
            <rect x={x+110} y={y-11} width={90} height={14} fill={`${col}15`} stroke={`${col}33`} rx={3}/>
            <text x={x+114} y={y} fill={col} fontSize={10}>{right}</text>
          </g>
        ))}
        <text x={6} y={h-4} fill="#555" fontSize={8}>Check these BEFORE every trade session</text>
      </svg>
    );
  }

  return <svg width={w} height={h}><rect width={w} height={h} fill="#0a0e1a" rx={4} /><text x={10} y={20} fill="#666" fontSize={12}>{type}</text></svg>;
}

const DEEP_LESSONS = [
  { id:"dl1", cat:"TREND", icon:"📈", title:"How to read an Uptrend", chart:"uptrend", color:"#22d47e",
    summary:"An uptrend = series of higher highs and higher lows. Price stays above the rising MA50.",
    points:[
      "Higher High (HH) + Higher Low (HL) = confirmed uptrend — look for this sequence",
      "MA50 acts as a moving support line — price bounces off it during healthy pullbacks",
      "Each pullback to MA50 in an uptrend is a BUY opportunity — not a reason to sell",
      "Uptrend breaks when price closes BELOW MA50 on high volume — that's your warning",
      "Volume should increase on up candles and decrease on pullback candles (healthy pattern)",
    ],
    rule:"Only buy pullbacks in uptrends, never chase breakouts without pullback confirmation" },

  { id:"dl2", cat:"LEVELS", icon:"🎯", title:"Support & Resistance — The Foundation", chart:"support", color:"#3b82f6",
    summary:"Support = price floor where buyers step in. Resistance = price ceiling where sellers dominate.",
    points:[
      "Support = a price level where price has bounced UP multiple times — buyers defend it",
      "Resistance = a level where price has been rejected DOWN multiple times — sellers defend it",
      "Once resistance is BROKEN, it becomes new support (role reversal) — very powerful",
      "The more times a level has been tested, the stronger it is — and the bigger the move when it breaks",
      "Round numbers ($50, $100, $200) act as psychological support/resistance — always mark them",
    ],
    rule:"Never enter without identifying nearby support. Your stop loss goes just below support." },

  { id:"dl3", cat:"INDICATORS", icon:"⚡", title:"EMA Crossover — The Most Used Signal", chart:"ema_cross", color:"#22d47e",
    summary:"EMA9 crossing above EMA21 = short-term momentum turning bullish. Classic entry trigger.",
    points:[
      "EMA9 = 9-day Exponential Moving Average — reacts fast to price changes",
      "EMA21 = 21-day EMA — slower, shows medium-term trend direction",
      "EMA9 crosses ABOVE EMA21 = Golden Cross (bullish) — price gaining upward momentum",
      "EMA9 crosses BELOW EMA21 = Death Cross (bearish) — momentum turning down",
      "Best when combined with RSI < 60 (not overbought) and volume confirming the move",
    ],
    rule:"Enter when EMA9 crosses above EMA21 AND price is above MA50 AND RSI < 65" },

  { id:"dl4", cat:"INDICATORS", icon:"📊", title:"RSI — Read Overbought & Oversold", chart:"rsi", color:"#a78bfa",
    summary:"RSI measures momentum 0-100. Below 30 = oversold (bounce). Above 70 = overbought (caution).",
    points:[
      "RSI below 30 = stock is oversold — sellers exhausted — bounce likely (BUY zone)",
      "RSI above 70 = stock is overbought — buyers exhausted — pullback likely (SELL zone)",
      "RSI DIVERGENCE = most powerful signal: price makes new low but RSI makes higher low = BULLISH",
      "RSI 40-60 = neutral zone — price can go either way — wait for extreme",
      "RSI alone is NOT enough — always combine with price levels and trend direction",
    ],
    rule:"RSI < 35 near support = high probability bounce setup. RSI > 70 near resistance = consider selling." },

  { id:"dl5", cat:"PATTERNS", icon:"☕", title:"Cup & Handle — Bullish Continuation", chart:"cup_handle", color:"#f59e0b",
    summary:"One of the most reliable bullish patterns. Forms over weeks/months. Breakout = strong buy.",
    points:[
      "Cup = U-shaped base that forms after a downtrend (takes 4-20 weeks to form)",
      "Handle = small pullback on the right side of the cup (5-15% consolidation)",
      "Breakout above the handle resistance = confirmed BUY signal — strong conviction",
      "Volume should DROP during the cup formation, then SURGE on the breakout",
      "Price target = measure the depth of the cup and add it to the breakout level",
    ],
    rule:"Buy when price breaks above handle resistance on volume 2x+ average. Stop below handle low." },

  { id:"dl6", cat:"PATTERNS", icon:"🏔", title:"Head & Shoulders — Bearish Reversal", chart:"head_shoulders", color:"#ef4444",
    summary:"Classic reversal pattern. Left shoulder, head, right shoulder. Break neckline = sell signal.",
    points:[
      "Left Shoulder = first peak after an uptrend, followed by a pullback",
      "Head = a higher peak (new high) — looks bullish but is a trap",
      "Right Shoulder = lower peak, similar height to left shoulder — trend weakening",
      "Neckline = line connecting the two lows between shoulders — KEY level",
      "When price breaks BELOW neckline on volume = strong SELL signal. Price targets the depth of head.",
    ],
    rule:"Short/exit longs when price closes below neckline. Target = neckline minus head-to-neckline distance." },

  { id:"dl7", cat:"PATTERNS", icon:"🚩", title:"Bull Flag — Best Momentum Entry", chart:"flag", color:"#22d47e",
    summary:"Strong move up (pole) followed by tight consolidation (flag). Breakout = continuation.",
    points:[
      "Pole = sharp vertical move up on high volume — shows conviction and momentum",
      "Flag = small, tight pullback that consolidates the gains (usually 5-10% retracement)",
      "Flag channel should be slightly downward sloping — if it goes sideways, it's weaker",
      "Volume should DRY UP during the flag — sellers are not motivated to push it lower",
      "Breakout above flag's upper trendline on high volume = BUY. Target = pole length added to breakout.",
    ],
    rule:"Buy breakout above flag on 1.5x+ volume. Stop below flag low. Target = pole height from breakout." },

  { id:"dl8", cat:"INDICATORS", icon:"🔢", title:"MACD — Trend & Momentum Combined", chart:"macd", color:"#3b82f6",
    summary:"MACD = Moving Average Convergence Divergence. Shows trend direction AND momentum strength.",
    points:[
      "MACD Line = difference between 12-day EMA and 26-day EMA (fast minus slow)",
      "Signal Line = 9-day EMA of the MACD line — when MACD crosses above signal = BUY",
      "Histogram = MACD minus Signal. Growing histogram = momentum building",
      "MACD above zero line = bullish momentum. Below zero = bearish momentum.",
      "MACD divergence: price makes new high but MACD doesn't = momentum weakening = SELL",
    ],
    rule:"Buy when MACD crosses above signal line AND both are above zero. Sell when crosses below." },

  { id:"dl9", cat:"INDICATORS", icon:"💧", title:"VWAP — Institutional Price Level", chart:"vwap", color:"#f59e0b",
    summary:"VWAP = the average price weighted by volume. Institutions use it as a benchmark.",
    points:[
      "VWAP = Volume Weighted Average Price — the 'fair value' price for the day",
      "Price above VWAP = bulls in control, institutions are comfortable buying",
      "Price below VWAP = bears in control, institutions selling into any rally",
      "First VWAP reclaim of the day (price crosses above) = strong intraday BUY signal",
      "End of day price vs VWAP = tells you if institutional activity was net bullish or bearish",
    ],
    rule:"Intraday: only go long when price is above VWAP. Short only below VWAP. Never fight the tape." },

  { id:"dl10", cat:"CANDLES", icon:"🕯", title:"Read Candlesticks in 5 Minutes", chart:"doji", color:"#f59e0b",
    summary:"Every candle tells a story. Learn to read them and you'll understand market psychology.",
    points:[
      "Bullish Engulfing = big green candle swallows previous red candle — buyers took control",
      "Doji = open and close almost equal — market indecision, trend may be changing",
      "Hammer = long lower wick, small body — sellers tried to push lower but buyers rejected it (BULLISH)",
      "Shooting Star = long upper wick, small body — buyers tried to push higher but sellers rejected (BEARISH)",
      "Marubozu = candle with no wicks — pure momentum in one direction, very strong signal",
    ],
    rule:"Single candles are clues, not signals. Always confirm with the next 1-2 candles and volume." },

  // ── INSTITUTIONAL LEVEL ───────────────────────────────────────────────────
  { id:"pro1", cat:"INSTITUTIONAL", icon:"🏛", title:"Order Flow — How Institutions Move Price", chart:"orderflow", color:"#7c3aed",
    summary:"Institutions can't buy all at once without moving price against themselves. Understanding this gives you the edge.",
    points:[
      "A $500M fund buying NVDA cannot hit the ask — they'd push price 10% against themselves",
      "Instead they ACCUMULATE over days/weeks at key levels, absorbing sell orders quietly",
      "Signs of institutional accumulation: price holds a level + volume dries up + no breakdowns",
      "When they finish buying → price explodes because all sell orders are absorbed",
      "Dark pools (off-exchange trades) hide 35-40% of ALL US volume — institutions use them to hide orders",
      "Large block prints on Level 2 (10,000+ share orders) = institutional activity — follow it",
    ],
    rule:"Find areas where price consolidates on LOW volume near support — that's accumulation. Enter before the explosion." },

  { id:"pro2", cat:"INSTITUTIONAL", icon:"📦", title:"Volume Profile — Where Institutions Traded", chart:"volprofile", color:"#7c3aed",
    summary:"Volume Profile shows the exact price levels where the most volume occurred. These are institutional battlegrounds.",
    points:[
      "Point of Control (POC) = the price level with the MOST volume traded — strongest magnet level",
      "Value Area (VA) = range where 70% of all volume occurred — price returns here after extremes",
      "Low Volume Nodes (LVN) = price levels with almost no volume — price moves FAST through these",
      "High Volume Nodes (HVN) = heavy volume = strong support/resistance — hard to break through",
      "If price is above POC = bullish bias. Below POC = bearish bias. Simple and powerful.",
      "Price gaps through LVNs and stalls at HVNs — trade accordingly",
    ],
    rule:"Buy when price pulls back to POC or Value Area Low (VAL) in an uptrend. These are institutional re-entry zones." },

  { id:"pro3", cat:"INSTITUTIONAL", icon:"⚡", title:"Smart Money Concepts — Order Blocks & FVGs", chart:"smc", color:"#0891b2",
    summary:"ICT/SMC concepts used by institutional traders: order blocks, fair value gaps, liquidity sweeps.",
    points:[
      "Order Block (OB) = last bearish candle before a strong bullish move — institutions left orders here",
      "When price returns to an OB = high probability BUY — institutions defend their position",
      "Fair Value Gap (FVG) = price moved so fast it left a 'gap' in market efficiency — price fills these",
      "Liquidity Sweep = price dips below obvious lows to hit retail stop losses, then REVERSES — trap",
      "Inducement = when price makes a fake breakout above resistance to grab retail longs, then dumps",
      "Smart money ALWAYS takes liquidity before reversing — don't place stops at obvious levels",
    ],
    rule:"Don't place stops at round numbers or obvious recent lows — smart money knows where they are. Use less obvious levels." },

  { id:"pro4", cat:"INSTITUTIONAL", icon:"🔄", title:"Sector Rotation — Follow the Money", chart:"rotation", color:"#16a34a",
    summary:"Institutions move $billions between sectors based on economic cycle. Being in the right sector = 3x easier trading.",
    points:[
      "Early Cycle (recovery): Financials, Consumer Discretionary, Tech lead — economy starting to grow",
      "Mid Cycle (expansion): Industrials, Materials, Energy outperform — everything is growing",
      "Late Cycle (slowdown): Energy, Utilities, Healthcare — defensive sectors take leadership",
      "Recession: Utilities, Consumer Staples, Healthcare hold up — people still need food and medicine",
      "Watch relative strength: if XLF (Financials ETF) is leading SPY = early cycle = buy growth stocks",
      "The sector leading the market today tells you where we are in the cycle — follow it",
    ],
    rule:"Always trade in the LEADING sector. A mediocre stock in a hot sector beats a great stock in a cold sector every time." },

  { id:"pro5", cat:"INSTITUTIONAL", icon:"📊", title:"Market Profile — TPO & Auction Theory", chart:"marketprofile", color:"#f59e0b",
    summary:"Used by professional futures traders. Market is an auction — price moves to find acceptance or rejection.",
    points:[
      "Market Profile breaks each day into 30-min periods called TPOs (Time Price Opportunities)",
      "Initial Balance (IB) = first hour of trading — sets the day's context. Narrow IB = trending day likely",
      "Value Area = where 70% of day's trading occurred — price returns here when it overshoots",
      "Price ABOVE value = bullish. Price BELOW value = bearish. Simple framework.",
      "Trending day: price opens, never looks back, closes near extremes — ride with size",
      "Range day: price opens in value, oscillates — fade the extremes (sell highs, buy lows of range)",
    ],
    rule:"If price opens ABOVE yesterday's Value Area High and holds = bullish trend day. Buy and hold. Don't scalp." },

  { id:"pro6", cat:"INSTITUTIONAL", icon:"🎯", title:"Options Flow — Read What Whales Are Buying", chart:"optflow", color:"#ef4444",
    summary:"Unusual options activity is the best leading indicator available. Big money bets millions on direction weeks ahead.",
    points:[
      "Unusual Call Sweep = institution bought massive calls, often BEFORE a bullish move — follow it",
      "Put/Call Ratio below 0.7 = excessive bullishness → contrarian SELL signal (everyone is long)",
      "Put/Call Ratio above 1.3 = excessive fear → contrarian BUY signal (everyone hedging = bottom near)",
      "Gamma Squeeze: stock rises → market makers must buy shares to hedge calls → price rockets",
      "When calls with 30+ DTE trade at 10x+ average volume = smart money knows something",
      "Never trade options into earnings — IV always crashes after the event even if you're right",
    ],
    rule:"Find stocks with unusual call sweeps (3x+ normal volume, 30+ DTE, out-of-the-money) — smart money is positioning." },

  { id:"pro7", cat:"RISK", title:"Kelly Criterion — Optimal Position Sizing", icon:"📐", chart:"kelly", color:"#22d47e",
    summary:"Professional fund managers use Kelly to mathematically calculate the perfect bet size. Never under or over-bet.",
    points:[
      "Kelly Formula: f* = (Win% × WinSize − Loss% × LossSize) / WinSize",
      "Example: 55% win rate, 2:1 R:R → Kelly = (0.55×2 − 0.45×1)/2 = 33% of capital",
      "Full Kelly is too aggressive — most pros use 25-50% Kelly (fractional Kelly) to reduce volatility",
      "At 1% risk per trade with 55% win rate and 2:1 R:R = account grows +47% per 100 trades",
      "Over-betting (too large) = higher volatility, more emotional decisions, lower geometric return",
      "Under-betting (too small) = safe but slow. Kelly finds the mathematically optimal middle ground.",
    ],
    rule:"Use 25% Kelly (quarter-Kelly). If math says risk 20%, risk 5%. Consistency and survival beat optimization." },

  { id:"pro8", cat:"INSTITUTIONAL", icon:"🌍", title:"Intermarket Analysis — Macro Signals", chart:"intermarket", color:"#3b82f6",
    summary:"Stocks don't trade in isolation. Bond yields, dollar, oil, and gold send signals before price moves.",
    points:[
      "Rising 10Y Treasury yield → tech stocks sell off (higher discount rate = lower valuations)",
      "Rising USD (DXY) → commodities fall, emerging markets fall, multinational earnings hurt",
      "Oil rising → energy sector leads, consumer stocks hurt (higher costs), inflation up",
      "Gold rising → risk-off signal, dollar weakening, inflation fears, uncertainty rising",
      "When bonds AND stocks fall together = liquidity crisis (2008, 2020 March) — sell everything",
      "Copper leads the economy by 3-6 months — rising copper = global growth = buy cyclicals",
    ],
    rule:"Check 10Y yield, DXY, and VIX before every trade. These tell you what institutions are doing RIGHT NOW." },

  // ── MACRO EVENTS PLAYBOOK (no chart — text scenarios) ──────────────────────
  { id:"mac1", cat:"MACRO EVENTS", icon:"🌡", title:"CPI — Inflation Data (8:30 AM ET)", color:"#ef4444",
    summary:"The #1 market mover. Measures inflation. Lower = good for stocks (rate cuts coming). Higher = bad.",
    points:[
      "🔴 HOTTER than expected → stocks DROP, dollar UP, tech hit hardest. Fed keeps rates high longer.",
      "🟢 COOLER than expected → stocks RALLY, rate-cut bets surge, growth/tech lead.",
      "🟡 INLINE → small move, often a relief rally (uncertainty removed).",
      "Example, expected 3.0%: prints 3.4% = Nasdaq -1 to -3% in minutes. Prints 2.6% = big green day.",
      "Tech & high-growth react MOST (high valuations hate high rates). Value/defensives react less.",
    ],
    rule:"Don't hold trades INTO CPI. Wait 15-30 min after 8:30 AM, let SPY pick a direction, THEN trade the reaction." },

  { id:"mac2", cat:"MACRO EVENTS", icon:"💼", title:"Jobs Report / NFP (1st Friday, 8:30 AM)", color:"#f59e0b",
    summary:"Non-Farm Payrolls. The twist: good news can be bad news — markets want MODERATE cooling.",
    points:[
      "🔴 TOO STRONG (way above) → stocks often DROP. Hot economy = Fed stays restrictive.",
      "🟢 SLIGHTLY WEAK / cooling → stocks RALLY. 'Goldilocks' — Fed can cut.",
      "🔴 WAY TOO WEAK → stocks DROP on recession fear (now it's bad-bad).",
      "Also watch wage growth (avg hourly earnings) — hot wages = sticky inflation = bearish.",
      "Unemployment rate ticking up slightly = market likes it (cooling without breaking).",
    ],
    rule:"Want 'not too hot, not too cold.' Trade the reaction, not the number. No positions held into 8:30 AM." },

  { id:"mac3", cat:"MACRO EVENTS", icon:"🏛", title:"FOMC Meeting — Fed Rate Decision (2:00 PM ET)", color:"#7c3aed",
    summary:"8x/year the Fed sets interest rates. The single most volatile scheduled event. Two parts: the decision (2pm) + Powell's press conference (2:30pm).",
    points:[
      "🟢 Rate CUT or dovish tone → stocks RALLY hard (cheaper money = higher valuations).",
      "🔴 Rate HIKE or hawkish tone → stocks DROP (higher rates pressure everything).",
      "⚠️ The DECISION is usually priced in — the REAL move comes from Powell's 2:30pm presser & tone.",
      "Wild whipsaw 2:00-3:00 PM: price can swing both ways violently before settling. Avoid this window.",
      "Watch the 'dot plot' (rate projections) — more cuts projected = bullish, fewer = bearish.",
      "Key phrases: 'data dependent' = neutral, 'higher for longer' = bearish, 'cutting cycle' = bullish.",
    ],
    rule:"NEVER trade 2:00-3:00 PM on FOMC day. Wait for the close or next morning once the tone is clear." },

  { id:"mac4", cat:"MACRO EVENTS", icon:"📈", title:"PCE — The Fed's Favorite Inflation Gauge", color:"#ef4444",
    summary:"Personal Consumption Expenditures. The inflation number the Fed actually uses for decisions. Same rules as CPI but Fed weighs it more.",
    points:[
      "🟢 Cool Core PCE → strong rally, rate-cut odds rise (this is THE number Fed targets at 2%).",
      "🔴 Hot Core PCE → selloff, rate cuts get pushed back.",
      "'Core' PCE (excludes food & energy) matters most — that's what the Fed watches.",
      "Released ~end of month, 8:30 AM ET. Less hyped than CPI but arguably more important.",
    ],
    rule:"Treat like CPI — wait for the reaction. Core PCE matters more than headline." },

  { id:"mac5", cat:"MACRO EVENTS", icon:"🛒", title:"Retail Sales & GDP", color:"#3b82f6",
    summary:"Consumer spending (retail sales) + total economy (GDP). Show economic strength.",
    points:[
      "Retail Sales STRONG → consumer healthy → bullish for stocks (but can be inflationary).",
      "Retail Sales WEAK → consumer slowing → recession worry → bearish.",
      "GDP measures total growth — strong = healthy economy, negative 2 quarters = recession.",
      "These move markets LESS than CPI/Jobs/FOMC but still cause volatility.",
    ],
    rule:"Secondary events — smaller moves. Still avoid holding into the 8:30 AM release." },

  { id:"mac6", cat:"MACRO EVENTS", icon:"🎯", title:"How to Trade ANY Macro Event", color:"#22d47e",
    summary:"The universal playbook that works for every scheduled high-impact release.",
    points:[
      "1. BEFORE: close or tighten positions. No new trades 30 min before.",
      "2. AT RELEASE: do NOTHING. Watch the whipsaw — price spikes both ways in seconds.",
      "3. WAIT 15-30 min: let the market pick a real direction after the dust settles.",
      "4. THEN trade: if SPY trends clearly + your Green Light setups align → enter with the trend.",
      "5. The number matters less than the REACTION — hot CPI can still rally if priced in.",
      "6. On red/uncertain reactions → just sit out. There's always tomorrow.",
    ],
    rule:"Trade the reaction, never the prediction. Patience around events is what separates pros from gamblers." },
];


export default function EducationTab({ C, MONO, SANS }) {
  const [section, setSection] = useState("lessons"); // lessons | rules | mistakes | journal
  const [openLesson, setOpenLesson] = useState(null);
  const [lessonFilter, setLessonFilter] = useState("ALL");
  const [rules, setRules] = useState(() => { try { return JSON.parse(localStorage.getItem(EDU_RULES_KEY)) || DEFAULT_RULES; } catch { return DEFAULT_RULES; } });
  const [newRule, setNewRule] = useState("");
  const [mistakes, setMistakes] = useState(() => { try { return JSON.parse(localStorage.getItem(EDU_MISTAKES_KEY)) || []; } catch { return []; } });
  const [mistakeForm, setMistakeForm] = useState({ type:"FOMO Entry", ticker:"", note:"", lesson:"" });
  const [journalEntries, setJournalEntries] = useState(() => { try { return JSON.parse(localStorage.getItem(EDU_JOURNAL_KEY)) || []; } catch { return []; } });
  const [journalForm, setJournalForm] = useState({ mood:"😊", focus:"5", discipline:"5", note:"" });
  const [checkedRules, setCheckedRules] = useState({});

  const saveRules   = r => { setRules(r); localStorage.setItem(EDU_RULES_KEY, JSON.stringify(r)); };
  const saveMistakes= m => { setMistakes(m); localStorage.setItem(EDU_MISTAKES_KEY, JSON.stringify(m)); };
  const saveJournal = j => { setJournalEntries(j); localStorage.setItem(EDU_JOURNAL_KEY, JSON.stringify(j)); };

  // Deep lessons filter (DEEP_LESSONS replaces old LESSONS in UI)
  const deepFiltered = lessonFilter === "ALL" ? DEEP_LESSONS : DEEP_LESSONS.filter(l => l.cat === lessonFilter);
  const mistakeCount = MISTAKE_TYPES.map(t => ({ type: t, count: mistakes.filter(m => m.type === t).length })).sort((a,b) => b.count - a.count);

  const catColor = c => ({ MINDSET:"#7c3aed", RISK:"#dc2626", ENTRY:"#16a34a", EXIT:"#f59e0b", PSYCHOLOGY:"#0891b2", SETUP:"#2563eb" })[c] || C.accent;

  const MOODS = ["😤","😰","😔","😐","🙂","😊","🔥"];

  const card = { background: C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:16 };

  return (
    <div style={{ padding:"16px 20px", maxWidth:1000, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontFamily:MONO, fontSize:20, fontWeight:900, color:C.text }}>🎓 EDUCATION & PSYCHOLOGY</div>
        <div style={{ fontFamily:SANS, fontSize:12, color:C.textDim, marginTop:3 }}>Master the mental game — the edge most traders ignore</div>
      </div>

      {/* Section tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {[["lessons","📚 LESSONS"],["rules","📋 MY RULES"],["mistakes","⚠️ MISTAKES"],["journal","🧘 PSYCH LOG"]].map(([id,label]) => (
          <button key={id} onClick={() => setSection(id)}
            style={{ background: section===id ? C.accent : C.surface,
              color: section===id ? "#fff" : C.textSec,
              border: `1px solid ${section===id ? C.accent : C.border}`,
              borderRadius:8, fontFamily:MONO, fontSize:12, fontWeight:700,
              padding:"8px 16px", cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── DEEP LESSONS WITH CHARTS ── */}
      {section === "lessons" && (
        <div>
          {/* Category filter */}
          <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
            {["ALL","MACRO EVENTS","INSTITUTIONAL","TREND","LEVELS","INDICATORS","PATTERNS","CANDLES","RISK"].map(c => (
              <button key={c} onClick={() => setLessonFilter(c)}
                style={{ background: lessonFilter===c ? C.accent : C.surface,
                  color: lessonFilter===c ? "#fff" : C.textSec,
                  border:`1px solid ${lessonFilter===c ? C.accent : C.border}`,
                  borderRadius:6, fontFamily:MONO, fontSize:11, fontWeight:700, padding:"4px 12px", cursor:"pointer" }}>
                {c}
              </button>
            ))}
            <span style={{ fontFamily:SANS, fontSize:12, color:C.textDim, alignSelf:"center", marginLeft:8 }}>
              {deepFiltered.length} lessons
            </span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {deepFiltered.map(lesson => (
              <div key={lesson.id}
                style={{ background:C.card, border:`1px solid ${openLesson===lesson.id ? lesson.color+"88" : C.border}`,
                  borderLeft:`4px solid ${lesson.color}`, borderRadius:12, overflow:"hidden" }}>

                {/* Collapsed header */}
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer" }}
                  onClick={() => setOpenLesson(openLesson===lesson.id ? null : lesson.id)}>
                  <span style={{ fontSize:22, flexShrink:0 }}>{lesson.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, color:lesson.color,
                        background:`${lesson.color}18`, borderRadius:3, padding:"1px 6px", letterSpacing:"0.06em" }}>
                        {lesson.cat}
                      </span>
                    </div>
                    <div style={{ fontFamily:MONO, fontSize:15, fontWeight:900, color:C.text }}>{lesson.title}</div>
                    <div style={{ fontFamily:SANS, fontSize:12, color:C.textDim, marginTop:3 }}>{lesson.summary}</div>
                  </div>
                  <span style={{ fontFamily:MONO, fontSize:12, color:C.textDim, flexShrink:0 }}>
                    {openLesson===lesson.id ? "▲ close" : "▼ open"}
                  </span>
                </div>

                {/* Expanded — chart + content */}
                {openLesson === lesson.id && (
                  <div style={{ borderTop:`1px solid ${C.border}` }}>
                    <div style={{ display:"grid", gridTemplateColumns: lesson.chart ? "auto 1fr" : "1fr", gap:0 }}>
                      {/* Chart (optional) */}
                      {lesson.chart && (
                        <div style={{ background:"#050b14", padding:12, borderRight:`1px solid ${C.border}` }}>
                          <ChartSVG type={lesson.chart} />
                        </div>
                      )}
                      {/* Content */}
                      <div style={{ padding:"14px 16px" }}>
                        <div style={{ fontFamily:MONO, fontSize:11, fontWeight:900, color:C.textDim,
                          letterSpacing:"0.08em", marginBottom:10 }}>KEY CONCEPTS</div>
                        {lesson.points.map((p,i) => (
                          <div key={i} style={{ display:"flex", gap:10, padding:"7px 0",
                            borderBottom:`1px solid ${C.border}33` }}>
                            <span style={{ fontFamily:MONO, fontSize:12, color:lesson.color,
                              fontWeight:700, minWidth:22, flexShrink:0 }}>{i+1}.</span>
                            <span style={{ fontFamily:SANS, fontSize:13, color:C.text, lineHeight:1.55 }}>{p}</span>
                          </div>
                        ))}
                        {/* Golden rule */}
                        <div style={{ marginTop:14, padding:"10px 14px",
                          background:`${lesson.color}12`, border:`1px solid ${lesson.color}44`,
                          borderRadius:8 }}>
                          <div style={{ fontFamily:MONO, fontSize:10, fontWeight:900, color:lesson.color,
                            letterSpacing:"0.08em", marginBottom:4 }}>⭐ THE RULE</div>
                          <div style={{ fontFamily:SANS, fontSize:13, color:C.text, lineHeight:1.5 }}>
                            {lesson.rule}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MY RULES ── */}
      {section === "rules" && (
        <div>
          <div style={{ fontFamily:SANS, fontSize:13, color:C.textDim, marginBottom:14 }}>
            Check off rules before every trade. Your pre-trade checklist.
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
            {rules.map((r,i) => (
              <div key={i} style={{ ...card, display:"flex", alignItems:"center", gap:12,
                background: checkedRules[i] ? `${C.green}10` : C.card,
                border:`1px solid ${checkedRules[i] ? C.green+"44" : C.border}` }}>
                <input type="checkbox" checked={!!checkedRules[i]}
                  onChange={e => setCheckedRules(prev => ({ ...prev, [i]: e.target.checked }))}
                  style={{ width:18, height:18, accentColor:C.green, cursor:"pointer", flexShrink:0 }} />
                <span style={{ fontFamily:SANS, fontSize:13, color:checkedRules[i] ? C.green : C.text,
                  flex:1, textDecoration:checkedRules[i]?"line-through":"none" }}>{r}</span>
                <button onClick={() => saveRules(rules.filter((_,j)=>j!==i))}
                  style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:14, padding:"0 4px" }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input value={newRule} onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter" && newRule.trim()) { saveRules([...rules, newRule.trim()]); setNewRule(""); } }}
              placeholder="Add your own rule… (Enter to save)"
              style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8,
                fontFamily:SANS, fontSize:13, color:C.text, padding:"10px 14px", outline:"none" }} />
            <button onClick={() => { if(newRule.trim()) { saveRules([...rules, newRule.trim()]); setNewRule(""); } }}
              style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8,
                fontFamily:MONO, fontSize:12, fontWeight:700, padding:"10px 16px", cursor:"pointer" }}>+ ADD</button>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setCheckedRules({})}
              style={{ background:C.surface, color:C.textSec, border:`1px solid ${C.border}`, borderRadius:6,
                fontFamily:MONO, fontSize:11, padding:"6px 12px", cursor:"pointer" }}>↺ RESET</button>
            <button onClick={() => { if(window.confirm("Reset to default rules?")) saveRules(DEFAULT_RULES); }}
              style={{ background:C.surface, color:C.red, border:`1px solid ${C.red}44`, borderRadius:6,
                fontFamily:MONO, fontSize:11, padding:"6px 12px", cursor:"pointer" }}>RESET DEFAULT</button>
          </div>
        </div>
      )}

      {/* ── MISTAKE TRACKER ── */}
      {section === "mistakes" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {/* Log form */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ ...card }}>
              <div style={{ fontFamily:MONO, fontSize:12, fontWeight:900, color:C.red, marginBottom:12 }}>⚠️ LOG A MISTAKE</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <select value={mistakeForm.type} onChange={e => setMistakeForm(p=>({...p,type:e.target.value}))}
                  style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                    fontFamily:SANS, fontSize:13, color:C.text, padding:"8px 10px" }}>
                  {MISTAKE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={mistakeForm.ticker} onChange={e => setMistakeForm(p=>({...p,ticker:e.target.value.toUpperCase()}))}
                  placeholder="Ticker (optional)"
                  style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                    fontFamily:MONO, fontSize:13, color:C.text, padding:"8px 10px" }} />
                <textarea value={mistakeForm.note} onChange={e => setMistakeForm(p=>({...p,note:e.target.value}))}
                  placeholder="What happened? Why did you break your rules?"
                  rows={3}
                  style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                    fontFamily:SANS, fontSize:13, color:C.text, padding:"8px 10px", resize:"vertical" }} />
                <textarea value={mistakeForm.lesson} onChange={e => setMistakeForm(p=>({...p,lesson:e.target.value}))}
                  placeholder="What will you do differently next time?"
                  rows={2}
                  style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                    fontFamily:SANS, fontSize:13, color:C.text, padding:"8px 10px", resize:"vertical" }} />
                <button onClick={() => {
                  saveMistakes([{ id:Date.now(), ...mistakeForm, ts:new Date().toISOString() }, ...mistakes].slice(0,100));
                  setMistakeForm({ type:"FOMO Entry", ticker:"", note:"", lesson:"" });
                }} style={{ background:C.red, color:"#fff", border:"none", borderRadius:8,
                  fontFamily:MONO, fontSize:12, fontWeight:700, padding:"10px", cursor:"pointer" }}>
                  LOG MISTAKE
                </button>
              </div>
            </div>

            {/* Top patterns */}
            <div style={{ ...card }}>
              <div style={{ fontFamily:MONO, fontSize:12, fontWeight:900, color:C.amber, marginBottom:10 }}>📊 YOUR TOP MISTAKES</div>
              {mistakeCount.filter(m=>m.count>0).slice(0,6).map(m => (
                <div key={m.type} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontFamily:SANS, fontSize:12, color:C.text }}>{m.type}</span>
                  <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color: m.count >= 3 ? C.red : C.amber }}>{m.count}×</span>
                </div>
              ))}
              {!mistakes.length && <div style={{ fontFamily:SANS, fontSize:12, color:C.textDim }}>No mistakes logged yet</div>}
            </div>
          </div>

          {/* History */}
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:600, overflowY:"auto" }}>
            <div style={{ fontFamily:MONO, fontSize:12, fontWeight:900, color:C.textDim, marginBottom:4 }}>HISTORY ({mistakes.length})</div>
            {mistakes.map(m => (
              <div key={m.id} style={{ ...card, borderLeft:`3px solid ${C.red}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:C.red }}>{m.type}</span>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {m.ticker && <span style={{ fontFamily:MONO, fontSize:11, color:C.accent }}>{m.ticker}</span>}
                    <span style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{new Date(m.ts).toLocaleDateString()}</span>
                    <button onClick={() => saveMistakes(mistakes.filter(x=>x.id!==m.id))}
                      style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:12 }}>✕</button>
                  </div>
                </div>
                {m.note && <div style={{ fontFamily:SANS, fontSize:12, color:C.textSec, marginBottom:4 }}>{m.note}</div>}
                {m.lesson && <div style={{ fontFamily:SANS, fontSize:12, color:C.green }}><strong>Lesson:</strong> {m.lesson}</div>}
              </div>
            ))}
            {!mistakes.length && <div style={{ fontFamily:SANS, fontSize:13, color:C.textDim, textAlign:"center", padding:"40px 0" }}>No mistakes logged yet<br/><span style={{fontSize:12}}>Logging mistakes = fastest way to improve</span></div>}
          </div>
        </div>
      )}

      {/* ── PSYCHOLOGY LOG ── */}
      {section === "journal" && (
        <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:14 }}>
          {/* Entry form */}
          <div style={{ ...card }}>
            <div style={{ fontFamily:MONO, fontSize:12, fontWeight:900, color:C.cyan, marginBottom:12 }}>🧘 TODAY'S CHECK-IN</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginBottom:6 }}>MOOD</div>
              <div style={{ display:"flex", gap:8 }}>
                {MOODS.map(m => (
                  <button key={m} onClick={() => setJournalForm(p=>({...p,mood:m}))}
                    style={{ fontSize:22, background: journalForm.mood===m ? `${C.accent}22` : "none",
                      border:`1px solid ${journalForm.mood===m ? C.accent : C.border}`,
                      borderRadius:6, padding:"4px 6px", cursor:"pointer" }}>{m}</button>
                ))}
              </div>
            </div>
            {[["focus","FOCUS LEVEL",C.green],["discipline","DISCIPLINE",C.accent]].map(([k,l,col]) => (
              <div key={k} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{l}</span>
                  <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:col }}>{journalForm[k]}/10</span>
                </div>
                <input type="range" min="1" max="10" value={journalForm[k]}
                  onChange={e => setJournalForm(p=>({...p,[k]:e.target.value}))}
                  style={{ width:"100%", accentColor:col }} />
              </div>
            ))}
            <textarea value={journalForm.note} onChange={e => setJournalForm(p=>({...p,note:e.target.value}))}
              placeholder="How are you feeling? Any bias or emotion affecting trading today?"
              rows={4}
              style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                fontFamily:SANS, fontSize:13, color:C.text, padding:"8px 10px", resize:"vertical", boxSizing:"border-box" }} />
            <button onClick={() => {
              saveJournal([{ id:Date.now(), ...journalForm, ts:new Date().toISOString() }, ...journalEntries].slice(0,90));
              setJournalForm({ mood:"😊", focus:"5", discipline:"5", note:"" });
            }} style={{ width:"100%", marginTop:10, background:C.cyan||C.accent, color:"#fff", border:"none", borderRadius:8,
              fontFamily:MONO, fontSize:12, fontWeight:700, padding:"10px", cursor:"pointer" }}>
              SAVE CHECK-IN
            </button>
            {/* Psychology tips */}
            <div style={{ marginTop:14, padding:12, background:`${C.amber}10`, border:`1px solid ${C.amber}33`, borderRadius:8 }}>
              <div style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:C.amber, marginBottom:6 }}>💡 TODAY'S RULE</div>
              {[
                "If mood < 😊, reduce position size by 50%",
                "If discipline < 7, only take A+ setups",
                "Feeling fearful? The setup you skip = the one that works",
                "Feeling greedy? Take profits earlier than planned",
              ][new Date().getDay() % 4] && (
                <div style={{ fontFamily:SANS, fontSize:12, color:C.amber }}>
                  {["If mood < 😊, reduce position size by 50%","If discipline < 7, only take A+ setups","Feeling fearful? The setup you skip = the one that works","Feeling greedy? Take profits earlier than planned"][new Date().getDay() % 4]}
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:600, overflowY:"auto" }}>
            <div style={{ fontFamily:MONO, fontSize:12, fontWeight:900, color:C.textDim, marginBottom:4 }}>HISTORY ({journalEntries.length} entries)</div>
            {journalEntries.map(e => (
              <div key={e.id} style={{ ...card, display:"flex", gap:10, alignItems:"flex-start" }}>
                <span style={{ fontSize:22, flexShrink:0 }}>{e.mood}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:12, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{new Date(e.ts).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
                    <span style={{ fontFamily:MONO, fontSize:10, color:C.green }}>Focus {e.focus}/10</span>
                    <span style={{ fontFamily:MONO, fontSize:10, color:C.accent }}>Discipline {e.discipline}/10</span>
                  </div>
                  {e.note && <div style={{ fontFamily:SANS, fontSize:12, color:C.textSec }}>{e.note}</div>}
                </div>
                <button onClick={() => saveJournal(journalEntries.filter(x=>x.id!==e.id))}
                  style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:14, flexShrink:0 }}>✕</button>
              </div>
            ))}
            {!journalEntries.length && (
              <div style={{ textAlign:"center", padding:"40px 0" }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🧘</div>
                <div style={{ fontFamily:MONO, fontSize:14, color:C.text, marginBottom:6 }}>Start your daily check-in</div>
                <div style={{ fontFamily:SANS, fontSize:12, color:C.textDim }}>Traders who track their psychology improve 3× faster</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

