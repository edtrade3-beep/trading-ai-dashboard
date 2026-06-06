// Content script — reads highlighted text on Facebook/Messenger pages.
// Does NOT auto-send, does NOT scrape the DOM aggressively.
// Only returns the user's current text selection when the popup asks for it.

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_SELECTION") {
    const sel = (window.getSelection ? window.getSelection().toString() : "").trim();
    sendResponse({ text: sel });
  }
  return true;
});
