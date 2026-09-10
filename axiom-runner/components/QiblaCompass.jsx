import { useState, useEffect, useRef } from "react";

// QiblaCompass.jsx — Islamic tab Phase 2 (2026-09-10). Real great-circle
// bearing to the Kaaba (21.4225°N, 39.8262°E) from the user's own real
// geolocation — the standard initial-bearing formula, not a guess or a
// static image. Distance is a real haversine calculation off the same
// two points. Device-orientation compass rotation is a real progressive
// enhancement (only engages where the browser exposes it AND the user
// grants permission — iOS Safari requires an explicit tap to request it);
// falls back honestly to "bearing from true north" with a static compass
// rose when it isn't available, never fakes a live heading.

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CREAM = "#faf8f2";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function bearingTo(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δφ = toRad(lat2 - lat1), Δλ = toRad(lng2 - lng1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function QiblaCompass() {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [heading, setHeading] = useState(null); // real device compass heading, null if unavailable
  const [orientationRequested, setOrientationRequested] = useState(false);
  const headingSupported = useRef(typeof DeviceOrientationEvent !== "undefined");

  const locate = () => {
    setError(null);
    if (!navigator.geolocation) { setError("Your browser doesn't support location services."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError("Location permission was denied — allow location access to find your Qibla direction.")
    );
  };
  useEffect(() => { locate(); }, []);

  const enableCompass = async () => {
    setOrientationRequested(true);
    // iOS Safari requires an explicit user-gesture permission request;
    // other browsers just start firing the event once one is added.
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try { const res = await DeviceOrientationEvent.requestPermission(); if (res !== "granted") return; } catch { return; }
    }
    const handler = (e) => {
      const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
      if (h != null) setHeading(h);
    };
    window.addEventListener("deviceorientation", handler);
  };

  const bearing = coords ? bearingTo(coords.lat, coords.lng, KAABA_LAT, KAABA_LNG) : null;
  const distance = coords ? distanceKm(coords.lat, coords.lng, KAABA_LAT, KAABA_LNG) : null;
  // Rotate the needle so it always points at the Qibla bearing relative to
  // the phone's current real heading when known; otherwise relative to
  // true north (0° = up = north on a static compass rose).
  const needleRotation = bearing != null ? bearing - (heading || 0) : 0;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.05em", marginBottom: 18 }}>QIBLA DIRECTION</div>

        {!coords && !error && <div style={{ fontFamily: SANS, color: TEXT_DIM, padding: "30px 0" }}>Finding your location…</div>}
        {error && (
          <div>
            <div style={{ fontFamily: SANS, color: "#a13c2a", fontSize: 13.5, marginBottom: 14 }}>{error}</div>
            <button onClick={locate} style={{ background: GREEN, border: "none", color: "#fff", borderRadius: 10, padding: "10px 20px", fontFamily: SANS, fontWeight: 700, cursor: "pointer" }}>Try Again</button>
          </div>
        )}

        {coords && bearing != null && (
          <>
            <div style={{ position: "relative", width: 220, height: 220, margin: "0 auto 20px" }}>
              <svg viewBox="0 0 220 220" width="220" height="220">
                <circle cx="110" cy="110" r="104" fill={CREAM} stroke={BORDER} strokeWidth="2" />
                {[0, 90, 180, 270].map((deg) => {
                  const rad = toRad(deg - 90);
                  const x = 110 + 92 * Math.cos(rad), y = 110 + 92 * Math.sin(rad);
                  return <text key={deg} x={x} y={y + 5} textAnchor="middle" fontFamily={SANS} fontSize="13" fontWeight="700" fill={TEXT_DIM}>{["N", "E", "S", "W"][deg / 90]}</text>;
                })}
                <g transform={`rotate(${needleRotation} 110 110)`} style={{ transition: "transform 0.3s ease-out" }}>
                  <polygon points="110,26 100,110 110,94 120,110" fill={GREEN} />
                  <circle cx="110" cy="110" r="7" fill={GREEN_DARK} />
                </g>
                <text x="110" y="46" textAnchor="middle" fontSize="16">🕋</text>
              </svg>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 900, color: GREEN }}>{Math.round(bearing)}°</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 4 }}>from true north</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginBottom: 18 }}>≈ {Math.round(distance).toLocaleString()} km to the Kaaba</div>

            {!headingSupported.current ? (
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM }}>Your device doesn't expose a live compass — point the {Math.round(bearing)}° mark toward true north using a separate compass app.</div>
            ) : heading == null ? (
              <button onClick={enableCompass} style={{ background: `${GREEN}12`, border: `1.5px solid ${GREEN}`, color: GREEN_DARK, borderRadius: 10, padding: "10px 18px", fontFamily: SANS, fontWeight: 700, cursor: "pointer" }}>
                📱 Use My Phone's Compass
              </button>
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: GREEN_DARK, fontWeight: 700 }}>Live compass active — rotate your phone until the arrow points up.</div>
            )}
            {orientationRequested && heading == null && headingSupported.current && (
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: TEXT_DIM, marginTop: 8 }}>No compass reading yet — move your phone in a figure-8, or your device/browser may not support this.</div>
            )}
          </>
        )}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_DIM, textAlign: "center", marginTop: 12 }}>
        Calculated from your device's location using the great-circle bearing to the Kaaba in Makkah.
      </div>
    </div>
  );
}
