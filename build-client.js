// Bundle axiom-runner/axiom-live.jsx (+ its axiom-runner/components/*.jsx imports)
// into one plain JS file, so the browser loads a single precompiled bundle
// instead of running Babel on ~2 MB at every load. React/ReactDOM stay as CDN
// globals (see axiom-runner/index.html) — "react" imports resolve to
// react-shim.js, which just re-exports the hooks off window.React, so nothing
// gets bundled from node_modules.
const path = require("path");
const esbuild = require("esbuild");

const ENTRY = path.join(__dirname, "axiom-runner", "axiom-live.jsx");
const OUT = path.join(__dirname, "axiom-runner", "axiom-live.compiled.js");
const REACT_SHIM = path.join(__dirname, "axiom-runner", "react-shim.js");

esbuild
  .build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    format: "iife",
    target: "es2018",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    alias: { react: REACT_SHIM },
    legalComments: "none",
  })
  .then((result) => {
    const fs = require("fs");
    const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`✓ built axiom-live.compiled.js (${kb} KB)`);
  })
  .catch(() => process.exit(1));
