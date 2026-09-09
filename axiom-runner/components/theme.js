// Shared design tokens — color themes, fonts, layout constants.
// Single source of truth so every tab/component (whether still in the
// axiom-live.jsx monolith or split out under components/) reads the same
// objects. `C` is a mutable singleton: App() does Object.assign(C, THEME_*)
// on theme switch, and every importer of this module shares that one object
// by reference, so the mutation is visible everywhere without re-rendering
// plumbing.
//
// 4-color status system (institutional redesign, 2026-07-29, explicit user
// spec: "Use only four colors: Green=Bullish, Yellow=Caution, Red=Bearish,
// Gray=Neutral"). Applies to STATUS/semantic color only — `green`/`amber`/
// `red`/`textDim` are the 4 status slots (reusing existing keys rather than
// inventing new ones); `bg`/`surface`/`card`/`border`/`text`/etc stay a
// separate neutral "chrome" system. `cyan`/`purple` (formerly used ad hoc
// for confidence badges, AI-content branding, session labels, chart legend
// swatches — never a real bull/bear signal) were retired and every call
// site remapped to `accent` (routine info/navigation blue, outside the
// status system) after a full per-usage grep audit found none of them were
// actually encoding a bullish/bearish/caution/neutral read. `gold` stays as
// a 5th non-status "spotlight" token — it marks the single highest-
// conviction idea on a page regardless of direction, so collapsing it into
// `green` would falsely imply "highest conviction" always means "bullish."

export const THEME_LIGHT = {
  // Backgrounds — clean bright white page with faint-grey cards (no foggy haze)
  bg:         "#ffffff",
  surface:    "#ffffff",
  card:       "#fbfcfe",
  cardHover:  "#eef4fb",
  // Borders
  border:     "#c8d6e8",
  borderLit:  "#afc4db",
  // Text — dark navy-grey instead of near-black, much gentler on eyes
  text:       "#1e2d3d",   // dark navy-grey — readable but not harsh black
  textSec:    "#3d5068",   // medium navy-grey — secondary info
  textDim:    "#4a6070",   // darker than before — no more unreadable light gray
  // Brand accent
  accent:     "#2563eb",
  accentGlow: "rgba(37,99,235,0.16)",
  // Semantic — slightly softer than pure saturated
  green:      "#0d9465",   // slightly muted emerald
  greenBg:    "rgba(13,148,101,0.10)",
  greenLight: "#4fa87e",   // mild/tentative bullish — lighter than `green`, for multi-tier bias scales
  red:        "#c8282a",   // slightly softer red
  redBg:      "rgba(200,40,42,0.10)",
  redLight:   "#d9636a",   // mild/tentative bearish — lighter than `red`, for multi-tier bias scales
  amber:      "#c96f00",   // warm amber
  amberBg:    "rgba(201,111,0,0.10)",
  // Highest-conviction / CEO-pick marker — distinct from `accent` (routine
  // info/navigation blue) and from `amber` (caution). Reserved for the
  // single best idea on a page, not general emphasis.
  gold:       "#9c7a1f",
  goldBg:     "rgba(156,122,31,0.10)",
  // Standard card elevation — a subtle ambient lift, same pattern already
  // used ad-hoc in SoccerWatchTab/CryptoTab/SecFilingsTab, promoted to a
  // shared token so every card can opt in consistently instead of each
  // component hand-rolling its own shadow value.
  shadow:     "0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)",
};
// Dark-mode "AI Trading" palette (2026-09-09, explicit user request: "can
// i have similar interface in my trading platform" → "Restyle the real
// app to match this artifact's exact look" — the artifact being a
// standalone Trade Desk mockup this session built and published
// separately). Real WCAG contrast checked against `bg`/`card` for every
// text-role token before landing here (computed directly, same discipline
// as the 2026-09-07 textDim fix below) — none of this regresses that
// fix's own 4.5:1 floor. THEME_LIGHT is untouched: the mockup this matches
// was explicitly a permanent-dark design with no light variant, and this
// app's real Light/Dark/System toggle (2026-09-09) must keep a real,
// separately-tuned light palette regardless.
export const THEME_DARK = {
  // Backgrounds — deep midnight-blue, cooler and darker than the old warm
  // near-black, matching the mockup's bg-[#070d19]/bg-[#0c1626] pairing.
  bg:         "#070d19",
  surface:    "#0c1626",
  card:       "#0e1b30",
  cardHover:  "#101d33",
  // Borders — cool slate-blue hairlines, same pairing as the mockup.
  border:     "#1b2a3d",
  borderLit:  "#25384f",
  // Text — cool near-white hierarchy (the mockup's own choice), replacing
  // the old warm-cream one now that the whole palette has moved cooler.
  text:       "#f4f7fb",
  textSec:    "#93a3ba",   // 7.6:1 vs bg — secondary info
  // textDim: #7c8ea3 measures 5.79:1 vs bg / 5.14:1 vs card (computed
  // directly) — comfortably above the 2026-09-07 fix's own 4.5:1 floor;
  // a candidate closer to the mockup's literal --text-faint (#5c6d84,
  // 3.68:1) was rejected for exactly that reason. Still real, readable
  // secondary information, never the old <4:1 "eye-strain" gray.
  textDim:    "#7c8ea3",
  // Accent — the mockup's own --accent-2 (its readable-on-dark blue,
  // used for text/links/active-tab labels); its deeper --accent
  // (#2563eb, used there only for solid button fills with white text on
  // top) measures just 3.76:1 on this bg — below the 4.5:1 floor for the
  // many places this app reads `C.accent` directly as TEXT, not just a
  // button fill. Near-identical to the previous accent (#5b9cf6, 6.97:1)
  // by design — a real, deliberate palette shift, not a contrast risk.
  accent:     "#60a5fa",
  accentGlow: "rgba(96,165,250,0.22)",
  // Semantic — the mockup's own emerald/red pairing (Tailwind's
  // emerald-400 / red-500), each re-checked against `bg`: green 10.1:1,
  // red 5.2:1 — both real passes, not just visually similar.
  green:      "#34d399",
  greenBg:    "rgba(52,211,153,0.12)",
  greenLight: "#6ee7b7",   // mild/tentative bullish — lighter than `green`, for multi-tier bias scales
  red:        "#ef4444",
  redBg:      "rgba(239,68,68,0.12)",
  redLight:   "#fca5a5",   // mild/tentative bearish — lighter than `red`, for multi-tier bias scales
  amber:      "#f97316",   // mockup's own orange-500 caution tone — 6.9:1 vs bg
  amberBg:    "rgba(249,115,22,0.14)",
  // Highest-conviction / CEO-pick marker — see THEME_LIGHT.gold for rationale.
  gold:       "#eab308",
  goldBg:     "rgba(234,179,8,0.12)",
  // Standard card elevation — see THEME_LIGHT.shadow for rationale.
  shadow:     "0 1px 3px rgba(0,0,0,0.38), 0 1px 2px rgba(0,0,0,0.3)",
};
export const C = { ...THEME_DARK };

// Font trio swapped 2026-09-09 to match the "AI Trading" mockup exactly
// (Manrope display / IBM Plex Sans body / IBM Plex Mono data) — loaded for
// real via a Google Fonts <link> in index.html. The PREVIOUS names here
// (Inter/JetBrains Mono/Oswald) were never actually loaded anywhere in
// this app (no @font-face, no font link existed) — every one of those
// declarations was silently falling back to the browser's system-ui font
// this whole time; this is the first time this app's declared fonts and
// its actually-rendered fonts agree.
// SANS  — body copy, labels, navigation.
export const SANS = `'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
// MONO  — true monospace for prices, tickers, percentages, scores.
export const MONO = `'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Courier New', monospace`;
// NUM   — bold display face for headline numbers/verdicts (e.g. Trade
// GPS's "NO TRADE"/"BUY STOCK").
export const NUM = `'Manrope', 'IBM Plex Sans', system-ui, sans-serif`;
export const LAYOUT = {
  // Real cap (2026-08-25, explicit user request: "make sure all pages
  // centered"). Was the string "100%" — a no-op maxWidth, since the main
  // content wrapper's own `width` in axiom-live.jsx is ALSO a
  // calc(100% - sidebar) expression in the same reference frame, so
  // maxWidth never actually constrained anything: every page stretched
  // edge-to-edge with zero cap, confirmed live on a 2200px-wide viewport
  // (candles/cards stretched thin, no centering, because there was
  // nothing to center — the box always filled 100% of the available
  // width). 1800 only ever engages on genuinely wide monitors (a
  // standard 1920px display has ~1700px available after the 220px
  // sidebar — below this cap, so unaffected); on wider setups the page
  // now centers within the leftover space instead of stretching into it.
  // The one call site (axiom-live.jsx's shared content wrapper) also
  // switched from a fixed marginLeft to a calc() that actually centers
  // the capped box within the after-sidebar region, not just left-aligns
  // it flush against the sidebar.
  pageMaxWidth: 1800,
  contentPadding: "14px 18px 24px",
  gridGap: 12,
  sidebarWidth: 220,   // persistent left nav (Sidebar.jsx), desktop/tablet only
};
