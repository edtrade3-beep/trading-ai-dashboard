// DIXIE Marketplace Prefill — content script.
//
// Reads vehicle data DIXIE attached to the URL (see openFacebookPrefilled()
// in client/dealer/index.html) and fills matching fields on Facebook's own
// Create Vehicle Listing page. Never clicks Publish/submit — that's always
// a manual, deliberate action by the person using this.
//
// THIS IS BEST-EFFORT. Facebook's page structure is not documented and can
// change at any time, which will silently break field-matching below. If a
// field isn't getting filled, that's expected until FIELD_HINTS is tuned to
// match what's actually on the page — see the labels/placeholders you see
// in the real form and add them to the relevant array below.

const FIELD_HINTS = {
  title:         ["title", "listing title", "vehicle title"],
  price:         ["price"],
  description:   ["description", "details", "more about this vehicle"],
  year:          ["year"],
  make:          ["make"],
  model:         ["model"],
  trim:          ["trim"],
  mileage:       ["mileage", "odometer"],
  vin:           ["vin", "vehicle identification number"],
  bodyStyle:     ["body style", "body type", "vehicle type"],
  exteriorColor: ["exterior color", "color"],
};

function decodePayload() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("dixie");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch (e) {
    console.error("[DIXIE prefill] couldn't decode payload:", e);
    return null;
  }
}

// React tracks input state internally and ignores a plain `el.value = x`
// assignment — this goes through the native setter so React's onChange
// actually fires, the same trick every React-form-filling tool uses.
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fieldLabelText(el) {
  const direct = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").toLowerCase();
  if (direct) return direct;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent.trim().toLowerCase();
  }
  return "";
}

function findFieldFor(key) {
  const hints = FIELD_HINTS[key] || [key];
  const candidates = Array.from(document.querySelectorAll("input, textarea"));
  for (const hint of hints) {
    for (const el of candidates) {
      if (fieldLabelText(el).includes(hint)) return el;
    }
  }
  // Fallback: a label/span whose exact text matches a hint, look for an
  // input in the same row/container.
  for (const hint of hints) {
    const textEls = Array.from(document.querySelectorAll("label, span, div")).filter(
      (e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === hint
    );
    for (const labelEl of textEls) {
      const row = labelEl.closest("div");
      const input = row && row.querySelector("input, textarea");
      if (input) return input;
    }
  }
  return null;
}

function makeBanner() {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;background:#111827;color:#fff;" +
    "padding:10px 14px;border-radius:8px;font:13px -apple-system,Segoe UI,sans-serif;" +
    "max-width:280px;box-shadow:0 4px 16px rgba(0,0,0,.35)";
  document.documentElement.appendChild(el);
  return el;
}

function run() {
  const data = decodePayload();
  if (!data) return;

  const entries = Object.entries(data).filter(([, v]) => v != null && v !== "");
  if (!entries.length) return;

  const banner = makeBanner();
  banner.textContent = "DIXIE: filling listing fields…";
  const filled = new Set();

  function attempt() {
    for (const [key, value] of entries) {
      if (filled.has(key)) continue;
      const el = findFieldFor(key);
      if (el) {
        setNativeValue(el, String(value));
        filled.add(key);
      }
    }
    banner.textContent = `DIXIE: filled ${filled.size}/${entries.length} fields — review before publishing.`;
    if (filled.size >= entries.length) {
      clearInterval(interval);
      setTimeout(() => banner.remove(), 6000);
    }
  }

  // The form renders asynchronously (React), so poll rather than a single
  // pass. Stops after 15s regardless — if nothing matched, the page's real
  // labels don't match FIELD_HINTS yet and need tuning.
  const interval = setInterval(attempt, 500);
  setTimeout(() => {
    clearInterval(interval);
    if (filled.size === 0) {
      banner.textContent = "DIXIE: couldn't match any fields automatically — paste from DIXIE's Post tab instead.";
      setTimeout(() => banner.remove(), 8000);
    }
  }, 15000);

  attempt();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
