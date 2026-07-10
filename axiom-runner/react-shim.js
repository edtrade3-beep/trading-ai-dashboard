// Lets any bundled file `import { useState } from "react"` without actually
// bundling React — it still loads once from the CDN (see index.html) as
// window.React, and every module resolves "react" to this file at build time
// (see the `alias` option in build-client.js).
const R = window.React;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useCallback = R.useCallback;
export const useMemo = R.useMemo;
export const useRef = R.useRef;
export default R;
