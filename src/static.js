const fs = require("node:fs");
const path = require("node:path");
const { ROOT, MIME_TYPES } = require("./config");

// Serve static files with ETag revalidation: the browser caches the file but
// checks freshness on each load (If-None-Match). When unchanged the server
// returns a tiny 304 instead of re-sending the whole 2.6 MB bundle — so pages
// load instantly on repeat/cold visits, and still bust automatically on deploy
// (a new build changes the file's size/mtime → new ETag → one fresh download).
function serveStatic(pathname, res, req) {
  const cleanPath = pathname === "/" ? "/axiom-runner/index.html" : pathname;
  const filePath = path.join(ROOT, cleanPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(statErr && statErr.code === "ENOENT" ? 404 : 500);
      res.end(statErr && statErr.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    const ext = path.extname(filePath);
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "ETag": etag,
      // Cache, but revalidate every time — never serve stale after a deploy.
      "Cache-Control": "public, max-age=0, must-revalidate",
    };

    // Conditional request: unchanged → 304, no body.
    if (req && req.headers && req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) { res.writeHead(500); res.end("Server error"); return; }
      res.writeHead(200, headers);
      res.end(content);
    });
  });
}

module.exports = { serveStatic };
