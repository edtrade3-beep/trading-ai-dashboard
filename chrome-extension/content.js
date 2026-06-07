// Content script — reads message text from the OPEN Facebook/Messenger conversation.
// Triggered ONLY when you click a button in the popup. No background monitoring,
// no auto-send, no data collection. It just reads what's already on your screen.

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_SELECTION") {
    const sel = (window.getSelection ? window.getSelection().toString() : "").trim();
    sendResponse({ text: sel });
    return true;
  }

  if (req.type === "GET_LATEST_MESSAGE") {
    sendResponse({ text: readLatestIncomingMessage() });
    return true;
  }

  return true;
});

// Reads the most recent INCOMING message bubble from the open conversation.
// Uses multiple strategies because Facebook's DOM changes often.
function readLatestIncomingMessage() {
  try {
    // Strategy 1: message rows (Messenger uses role="row" for each message)
    let rows = Array.from(document.querySelectorAll('[role="row"]'));
    // Strategy 2: fallback to gridcell
    if (rows.length === 0) rows = Array.from(document.querySelectorAll('[role="gridcell"]'));

    const texts = [];
    for (const row of rows) {
      // Skip rows that are clearly outgoing (sent by you).
      // Facebook marks your own messages differently; incoming usually have an avatar
      // and align left. We grab visible text from message-like nodes.
      const t = extractBubbleText(row);
      if (t) texts.push(t);
    }

    if (texts.length) {
      // Return the last meaningful message
      return texts[texts.length - 1].slice(0, 600);
    }

    // Strategy 3: last resort — grab dir="auto" spans (message text containers)
    const spans = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .map(el => (el.innerText || "").trim())
      .filter(t => t.length > 2 && t.length < 600 && !/^\d{1,2}:\d{2}/.test(t)); // skip timestamps
    if (spans.length) return spans[spans.length - 1].slice(0, 600);

    return "";
  } catch (e) {
    return "";
  }
}

function extractBubbleText(row) {
  // Get the visible text of a message row, filtered to look like a real message
  const raw = (row.innerText || "").trim();
  if (!raw) return "";
  // Filter out UI noise
  if (/^(Enter|Sent|Seen|Active|Like|Reply|React|\d{1,2}:\d{2})/i.test(raw)) return "";
  if (raw.length < 2 || raw.length > 600) return "";
  // Take the longest line (usually the message body, not timestamps/names)
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const body = lines.sort((a, b) => b.length - a.length)[0] || raw;
  if (body.length < 2) return "";
  return body;
}
