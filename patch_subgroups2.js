const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Find the line with id: "ipo" inside the markets sub-group
let ipoLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('{ id: "ipo",') && lines[i].includes('DIVIDENDS')) {
    ipoLine = i;
    break;
  }
}
if (ipoLine === -1) { console.error('ipo line not found'); process.exit(1); }

// Check if already patched
if (lines[ipoLine + 1] && lines[ipoLine + 1].includes('feargreed')) {
  console.log('Already patched, skipping');
  process.exit(0);
}

// Insert the three new tab entries after the ipo line, before the closing ],
const insert = [
  '            { id: "feargreed",   label: "😨 FEAR/GREED" },',
  '            { id: "breadth",     label: "📊 BREADTH" },',
  '            { id: "seasonality", label: "📅 SEASONAL" },',
];
lines.splice(ipoLine + 1, 0, ...insert);

fs.writeFileSync(filePath, lines.join('\n'));
console.log('SUB_GROUPS patched at line', ipoLine + 1, ', total lines:', lines.length);
