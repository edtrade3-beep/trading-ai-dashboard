# DIXIE Marketplace Prefill

Fills Facebook's own Create Vehicle Listing page from data DIXIE already
generated, so you review and click Facebook's own Publish button instead of
retyping everything. It never submits anything for you.

This was built without the ability to test against Facebook's real,
authenticated page (its structure isn't documented), so it's expected to
need a few rounds of live tuning against what you actually see.

## Install (unpacked, Chrome/Edge)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`client/dealer/prefill-extension/`)

## Use

1. In DIXIE, load a vehicle into Workspace, generate its Package, set a price.
2. Go to the 🚀 Post tab → **✨ Open Facebook (prefilled)**.
3. A small "DIXIE: filling listing fields…" banner appears top-right on
   Facebook's page while it fills what it can find.
4. Review every field yourself, attach photos manually (browsers block
   scripts from ever doing this part), then click Facebook's own **Publish**.

## If a field doesn't get filled

That's expected on the first try. Open `content.js`, find the `FIELD_HINTS`
object near the top, and add the label/placeholder text you actually see on
Facebook's page next to that field — e.g. if the real price field's label
is "Asking price" rather than "Price", add `"asking price"` to the `price`
array. Reload the extension (chrome://extensions → the reload icon) and try
again.
