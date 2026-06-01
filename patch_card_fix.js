const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const cardDef = '        const card = (extra = {}) => ({ background: C.card, border: "1px solid " + C.border, borderRadius: 10, ...extra });';

// Find and fix feargreed tab
let fgLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('activeTab === "feargreed"') && lines[i].includes('(() => {')) {
    fgLine = i;
    break;
  }
}
if (fgLine === -1) { console.error('feargreed tab not found'); process.exit(1); }
// Insert card def after the opening line of the IIFE
lines.splice(fgLine + 1, 0, cardDef);
console.log('Added card to feargreed at line', fgLine + 1);

// Find and fix breadth tab (line numbers shifted by 1)
let bdLine = -1;
for (let i = fgLine + 2; i < lines.length; i++) {
  if (lines[i].includes('activeTab === "breadth"') && lines[i].includes('(() => {')) {
    bdLine = i;
    break;
  }
}
if (bdLine === -1) { console.error('breadth tab not found'); process.exit(1); }
lines.splice(bdLine + 1, 0, cardDef);
console.log('Added card to breadth at line', bdLine + 1);

// Find and fix seasonality tab
let seLine = -1;
for (let i = bdLine + 2; i < lines.length; i++) {
  if (lines[i].includes('activeTab === "seasonality"') && lines[i].includes('(() => {')) {
    seLine = i;
    break;
  }
}
if (seLine === -1) { console.error('seasonality tab not found'); process.exit(1); }
lines.splice(seLine + 1, 0, cardDef);
console.log('Added card to seasonality at line', seLine + 1);

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Done, total lines:', lines.length);
