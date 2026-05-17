const fs = require("node:fs");
const path = require("node:path");
const { ROOT, MIME_TYPES } = require("./config");

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/axiom-runner/index.html" : pathname;
  const filePath = path.join(ROOT, cleanPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0"
    });
    res.end(content);
  });
}

module.exports = { serveStatic };
