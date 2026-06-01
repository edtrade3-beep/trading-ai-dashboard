(function () {
  function safeKey(key) { return "dixie_" + key; }
  window.DixieStorage = {
    get: function (key, fallback) {
      try { const v = localStorage.getItem(safeKey(key)); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(safeKey(key), JSON.stringify(value)); } catch {}
    },
    remove: function (key) {
      try { localStorage.removeItem(safeKey(key)); } catch {}
    }
  };
})();
