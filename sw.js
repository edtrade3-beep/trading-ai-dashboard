// sw.js — minimal service worker, added only to satisfy Chrome/Android's
// PWA installability requirement (a manifest alone isn't enough there;
// iOS Safari's "Add to Home Screen" doesn't need this at all). Deliberately
// does NOT cache anything: this app already has a careful, real
// "new version ready" banner (axiom-runner/index.html's notifyOnDeploy)
// that intentionally never force-reloads a live session, and any cache
// layer here would fight that — a user could get served yesterday's
// bundle after today's deploy with no way to tell. Every request just
// passes straight through to the network, same as if no service worker
// existed at all; this file's only real job is existing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));
