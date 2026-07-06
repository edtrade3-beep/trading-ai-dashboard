// Precompile axiom-runner/axiom-live.jsx (JSX → JS) so the browser no longer runs Babel on ~2 MB
// at every load. Mirrors the runtime transforms the old in-browser boot did, then writes a plain
// JS file the page can load directly. React/ReactDOM stay as CDN globals (classic JSX runtime).
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "axiom-runner", "axiom-live.jsx");
const OUT = path.join(__dirname, "axiom-runner", "axiom-live.compiled.js");

function build() {
  let src = fs.readFileSync(SRC, "utf8");
  src = src
    .replace(
      /import\s+\{\s*useState,\s*useEffect,\s*useCallback,\s*useMemo,\s*useRef\s*\}\s+from\s+["']react["'];?/,
      "const { useState, useEffect, useCallback, useMemo, useRef } = React;"
    )
    .replace(/export\s+default\s+function\s+App\s*\(/, "function App(")
    // Expose App wrapped in the error boundary so a runtime crash shows a recovery
    // screen instead of a blank page.
    .concat("\nwindow.__AXIOM_APP__ = function AppRoot(){ return React.createElement(RhErrorBoundary, null, React.createElement(App)); };\n");

  // Classic JSX runtime → React.createElement (React is a global from the CDN script).
  const result = esbuild.transformSync(src, {
    loader: "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2018",
    legalComments: "none",
  });

  fs.writeFileSync(OUT, result.code);
  const kb = (Buffer.byteLength(result.code) / 1024).toFixed(0);
  console.log(`✓ built axiom-live.compiled.js (${kb} KB)`);
}

build();
