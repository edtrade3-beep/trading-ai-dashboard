const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
const insertPath = path.join(__dirname, 'tabs_insert.txt');

let c = fs.readFileSync(filePath, 'utf8');
const insert = fs.readFileSync(insertPath, 'utf8');

const anchor = '      {/* Global Quran audio element — stays mounted across all tab switches */}';
if (!c.includes(anchor)) { console.error("Tab anchor not found"); process.exit(1); }
// The insert already ends with the anchor line, so just replace
c = c.replace(anchor, insert);
fs.writeFileSync(filePath, c);
console.log('Tabs inserted, final size:', c.length);
