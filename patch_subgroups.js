const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const oldMarkets =
`          markets: [
            { id: "news",     label: "NEWS" },
            { id: "earnings", label: "EARNINGS" },
            { id: "macro",    label: "MACRO" },
            { id: "sectors",  label: "SECTORS" },
            { id: "rotation", label: "ROTATION" },
            { id: "calendar", label: "📅 CALENDAR" },
            { id: "analyst",  label: "🎯 ANALYST" },
            { id: "ipo",      label: "💸 DIVIDENDS" },
          ],`;

const newMarkets =
`          markets: [
            { id: "news",        label: "NEWS" },
            { id: "earnings",    label: "EARNINGS" },
            { id: "macro",       label: "MACRO" },
            { id: "sectors",     label: "SECTORS" },
            { id: "rotation",    label: "ROTATION" },
            { id: "calendar",    label: "📅 CALENDAR" },
            { id: "analyst",     label: "🎯 ANALYST" },
            { id: "ipo",         label: "💸 DIVIDENDS" },
            { id: "feargreed",   label: "😨 FEAR/GREED" },
            { id: "breadth",     label: "📊 BREADTH" },
            { id: "seasonality", label: "📅 SEASONAL" },
          ],`;

if (!c.includes(oldMarkets)) { console.error("SUB_GROUPS markets anchor not found"); process.exit(1); }
c = c.replace(oldMarkets, newMarkets);
fs.writeFileSync(filePath, c);
console.log('SUB_GROUPS updated, size:', c.length);
