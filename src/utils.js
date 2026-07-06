function round2(value) {
  return Math.round(value * 100) / 100;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function trimText(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractXmlTag(xmlBlock, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = String(xmlBlock || "").match(regex);
  return m?.[1] ? decodeXmlEntities(m[1].trim()) : "";
}

function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

async function fetchJsonSafe(url, headers = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...headers,
      }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload || null;
  } catch {
    return null;
  }
}

function readRequestBodyBuffer(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readRequestBody(req) {
  return readRequestBodyBuffer(req, 1024 * 1024).then(buf => buf.toString("utf8"));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

// Forgiving env-flag check: on/true/1/yes/enabled (trimmed, case-insensitive).
function isOn(v) { return ["on", "true", "1", "yes", "enabled"].includes(String(v || "").trim().toLowerCase()); }

module.exports = {
  round2, average, trimText, stripHtml, decodeXmlEntities, extractXmlTag,
  withTimeout, fetchJsonSafe, readRequestBody, readRequestBodyBuffer, writeJson, isOn
};
