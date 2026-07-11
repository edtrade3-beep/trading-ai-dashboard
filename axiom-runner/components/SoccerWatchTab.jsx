import { useState, useEffect, useCallback } from "react";

function SoccerIPTVPlayer({ C, MONO, SANS }) {
  const videoRef    = React.useRef(null);
  const hlsRef      = React.useRef(null);
  const [channels,    setChannels]    = React.useState([]);
  const [activeUrl,   setActiveUrl]   = React.useState(null);
  const [activeName,  setActiveName]  = React.useState("");
  const [m3uInput,    setM3uInput]    = React.useState("");
  const [loadingM3u,  setLoadingM3u]  = React.useState(false);
  const [m3uError,    setM3uError]    = React.useState(null);
  const [chSearch,    setChSearch]    = React.useState("");
  const [playerErr,   setPlayerErr]   = React.useState(null);
  const [hlsReady,    setHlsReady]    = React.useState(false);

  // Verified free public sports channels — no subscription, no auth required.
  // All streams are HLS (M3U8). If a stream shows an error, use the M3U loader below
  // to paste your own IPTV subscription URL.
  const DEFAULT_CHANNELS = [
    // ── Pluto TV Sports (free, ad-supported, no login) ─────────────
    // Loaded via server proxy to bypass CORS
    {
      name:  "beIN Sports XTRA",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5d3c6d37abe5cc3b1cf44bd2/master.m3u8?deviceId=free&deviceType=web&deviceMake=chrome&deviceModel=chrome&appName=web&appVersion=na&clientTime=0&serverSideAds=false"),
      flag:  "⚽", group: "Pluto TV Free",
    },
    {
      name:  "Fox Sports On Pluto TV",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5cf3d7b6aab9d1a50e30e27e/master.m3u8?deviceId=free&deviceType=web&deviceMake=chrome&deviceModel=chrome&appName=web&appVersion=na&clientTime=0&serverSideAds=false"),
      flag:  "🇺🇸", group: "Pluto TV Free",
    },
    {
      name:  "Sky Sports News",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5d3c6e06abe5cc3b1cf44d87/master.m3u8?deviceId=free&deviceType=web&deviceMake=chrome&deviceModel=chrome&appName=web&appVersion=na&clientTime=0&serverSideAds=false"),
      flag:  "🇬🇧", group: "Pluto TV Free",
    },
    {
      name:  "Sports News 24/7",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5e3ce1e0d0a6a9a17d77a5db/master.m3u8?deviceId=free&deviceType=web&deviceMake=chrome&deviceModel=chrome&appName=web&appVersion=na&clientTime=0&serverSideAds=false"),
      flag:  "📰", group: "Pluto TV Free",
    },
    // ── Free public broadcaster streams (no auth) ───────────────────
    {
      name:  "Al Jazeera English",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://live-hls-web-aje.getaj.net/AJE/index.m3u8"),
      flag:  "🇶🇦", group: "News / Sports",
    },
    {
      name:  "Euronews",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://euronews-euronews-1-de.samsung.wurl.com/manifest/playlist.m3u8"),
      flag:  "🇪🇺", group: "News / Sports",
    },
    {
      name:  "France 24 English",
      url:   "/api/proxy/m3u?url=" + encodeURIComponent("https://stream.france24.com/hls/live/2037163/F24_EN_LO_HLS/master.m3u8"),
      flag:  "🇫🇷", group: "News / Sports",
    },
    // ── Load full free sports playlists (click → populates channel list) ──
    {
      name:  "📋 Load IPTV-Org Sports (1000+ channels)",
      url:   "https://iptv-org.github.io/iptv/categories/sports.m3u",
      flag:  "📋", group: "Free Playlists", isPlaylist: true,
    },
    {
      name:  "📋 Load IPTV-Org Football Only",
      url:   "https://iptv-org.github.io/iptv/categories/football.m3u",
      flag:  "📋", group: "Free Playlists", isPlaylist: true,
    },
  ];

  // Load HLS.js from CDN once
  React.useEffect(() => {
    if (window.Hls) { setHlsReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js";
    s.onload = () => setHlsReady(true);
    s.onerror = () => setM3uError("Failed to load HLS.js player library.");
    document.head.appendChild(s);
  }, []);

  React.useEffect(() => {
    // Auto-load the bundled sports playlist on mount
    (async () => {
      setLoadingM3u(true);
      setM3uError(null);
      try {
        const r = await fetch("/axiom-runner/assets/playlist.m3u8");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const parsed = parseM3U(text);
        if (!parsed.length) throw new Error("No channels found");
        setChannels(parsed);
      } catch (e) {
        setM3uError(`Could not load playlist: ${e.message}`);
        setChannels(DEFAULT_CHANNELS);
      } finally {
        setLoadingM3u(false);
      }
    })();
  }, []);

  const playStream = React.useCallback((url, name) => {
    setPlayerErr(null);
    setActiveName(name);
    setActiveUrl(url);
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setPlayerErr(`Stream error: ${data.details || "could not load"}`);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      setPlayerErr("Your browser does not support HLS streams. Try Chrome or Firefox.");
    }
  }, []);

  // Parse M3U text into channel objects
  function parseM3U(text) {
    const lines = text.split("\n");
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXTINF")) continue;
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const countryMatch = line.match(/tvg-country="([^"]*)"/);
      const urlLine = lines[i + 1]?.trim();
      if (!urlLine || urlLine.startsWith("#")) continue;
      result.push({
        name:  nameMatch?.[1]?.trim() || "Channel",
        url:   urlLine,
        logo:  logoMatch?.[1] || null,
        group: groupMatch?.[1] || countryMatch?.[1] || "Other",
        flag:  "📺",
      });
    }
    return result;
  }

  const loadM3U = React.useCallback(async (urlOverride) => {
    const src = (urlOverride || m3uInput).trim();
    if (!src) return;
    setLoadingM3u(true);
    setM3uError(null);
    try {
      const r = await fetch(`/api/proxy/m3u?url=${encodeURIComponent(src)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const parsed = parseM3U(text);
      if (!parsed.length) throw new Error("No channels found in playlist");
      setChannels(parsed);
    } catch (e) {
      // Try direct fetch as fallback (works if CORS allows)
      try {
        const r2 = await fetch(src);
        const text2 = await r2.text();
        const parsed2 = parseM3U(text2);
        if (!parsed2.length) throw new Error("No channels found in playlist");
        setChannels(parsed2);
      } catch {
        setM3uError(`Could not load playlist: ${e.message}`);
      }
    } finally {
      setLoadingM3u(false);
    }
  }, [m3uInput]);

  const visible = channels.filter(ch =>
    !chSearch || ch.name.toLowerCase().includes(chSearch.toLowerCase()) || (ch.group || "").toLowerCase().includes(chSearch.toLowerCase())
  );

  // Group channels
  const groups = [...new Set(visible.map(ch => ch.group || "Other"))];

  const btnStyle = (active) => ({
    fontFamily: MONO, fontSize: 12, fontWeight: active ? 800 : 600,
    border: active ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
    background: active ? `${C.accent}22` : C.surface,
    color: active ? C.accent : C.textSec,
    borderRadius: 6, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Player */}
      <div style={{ background: "#000", borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative", aspectRatio: "16/9", maxHeight: 480 }}>
        <video
          ref={videoRef}
          controls
          autoPlay
          style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
        />
        {!activeUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 48 }}>📺</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#888" }}>Select a channel to start watching</span>
          </div>
        )}
        {playerErr && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#c0392b", padding: "8px 14px", fontFamily: MONO, fontSize: 12, color: "#fff" }}>
            ⚠ {playerErr} — <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setPlayerErr(null)}>dismiss</span>
          </div>
        )}
        {activeName && !playerErr && (
          <div style={{ position: "absolute", top: 10, left: 12, background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "4px 10px", fontFamily: MONO, fontSize: 12, color: "#fff", pointerEvents: "none" }}>
            📡 {activeName}
          </div>
        )}
      </div>

      {/* Playlist presets + custom M3U loader */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, flexShrink: 0 }}>PRESET:</span>
        <button onClick={() => loadM3U("/axiom-runner/assets/playlist.m3u8")} disabled={loadingM3u}
          style={{ ...btnStyle(false), padding: "5px 12px", color: C.green, borderColor: C.green }}>
          🏆 SPORTS
        </button>
        <button onClick={() => loadM3U("/axiom-runner/assets/playlist2.m3u8")} disabled={loadingM3u}
          style={{ ...btnStyle(false), padding: "5px 12px", color: C.accent, borderColor: C.accent }}>
          📺 FREE TV
        </button>
        <span style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />
        <input
          value={m3uInput}
          onChange={e => setM3uInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") loadM3U(); }}
          placeholder="…or paste a custom M3U URL (SSC, beIN, Al Kass…)"
          style={{ flex: 1, minWidth: 180, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, outline: "none" }}
        />
        <button onClick={() => loadM3U()} disabled={loadingM3u || !m3uInput.trim()}
          style={{ ...btnStyle(false), background: C.accent, color: "#fff", border: "none", padding: "6px 14px", fontWeight: 800 }}>
          {loadingM3u ? "LOADING…" : "LOAD"}
        </button>
        {m3uError && <span style={{ fontFamily: MONO, fontSize: 12, color: C.red, width: "100%" }}>{m3uError}</span>}
      </div>

      {/* Channel search + list */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>📡 CHANNELS ({visible.length})</span>
          <input
            value={chSearch}
            onChange={e => setChSearch(e.target.value)}
            placeholder="Filter channels…"
            style={{ flex: 1, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "5px 9px", fontFamily: MONO, fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto", scrollbarWidth: "thin" }}>
          {groups.map(group => {
            const grpChannels = visible.filter(ch => (ch.group || "Other") === group);
            return (
              <div key={group}>
                <div style={{ padding: "6px 14px 4px", background: C.surface, borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>
                  {group.toUpperCase()} ({grpChannels.length})
                </div>
                {grpChannels.map((ch, i) => {
                  const isPlaying = activeUrl === ch.url;
                  return (
                    <div
                      key={i}
                      onClick={() => ch.isPlaylist ? loadM3U(ch.url) : playStream(ch.url, ch.name)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                        borderBottom: `1px solid ${C.border}`,
                        background: isPlaying ? `${C.accent}18` : "transparent",
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isPlaying) e.currentTarget.style.background = C.cardHover; }}
                      onMouseLeave={e => { if (!isPlaying) e.currentTarget.style.background = "transparent"; }}
                    >
                      {ch.logo
                        ? <img src={ch.logo} alt="" style={{ width: 28, height: 20, objectFit: "contain", borderRadius: 2, flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />
                        : <span style={{ fontSize: 16, flexShrink: 0 }}>{ch.flag || "📺"}</span>
                      }
                      <span style={{ fontFamily: SANS, fontSize: 12, color: isPlaying ? C.accent : C.text, fontWeight: isPlaying ? 700 : 400, flex: 1 }}>{ch.name}</span>
                      {ch.isPlaylist && <span style={{ fontFamily: MONO, fontSize: 12, color: C.amber, border: `1px solid ${C.amber}44`, borderRadius: 5, padding: "2px 5px" }}>M3U</span>}
                      {isPlaying && <span style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 800 }}>▶ LIVE</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: "30px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No channels match your search</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SoccerWatchTab({ C, MONO, SANS, isTablet }) {
  const [soccerView, setSoccerView] = React.useState("iptv");

  const LEAGUES = [
    { id: "fifa.world",      name: "World Cup",         flag: "🏆" },
    { id: "fifa.friendly",   name: "Intl Friendlies",   flag: "🌍" },
    { id: "eng.1",           name: "Premier League",    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", },
    { id: "esp.1",           name: "La Liga",           flag: "🇪🇸" },
    { id: "ger.1",           name: "Bundesliga",        flag: "🇩🇪" },
    { id: "ita.1",           name: "Serie A",           flag: "🇮🇹" },
    { id: "fra.1",           name: "Ligue 1",           flag: "🇫🇷" },
    { id: "uefa.champions",  name: "Champions League",  flag: "🏆" },
    { id: "uefa.europa",     name: "Europa League",     flag: "🥈" },
    { id: "usa.1",           name: "MLS",               flag: "🇺🇸" },
    { id: "tur.1",           name: "Süper Lig",         flag: "🇹🇷" },
    { id: "sau.1",           name: "Saudi Pro League",  flag: "🇸🇦" },
  ];

  const FREE_SITES = [
    { name: "LiveSoccerTV",   url: "https://www.livesoccertv.com",              icon: "📡", desc: "Find which channel broadcasts every match worldwide" },
    { name: "BBC Sport",      url: "https://www.bbc.co.uk/sport/football",      icon: "🎙", desc: "Free live FA Cup, Women's football & highlights (UK)" },
    { name: "ITVX",           url: "https://www.itv.com/watch/sports",          icon: "📺", desc: "Free live Champions League matches (UK)" },
    { name: "ViX",            url: "https://www.vix.com",                       icon: "🌎", desc: "Free Spanish-language — Liga MX, Copa América" },
    { name: "TUDN",           url: "https://www.tudn.com",                      icon: "⚽", desc: "Free tier — Liga MX, Mexican national team" },
    { name: "Pluto TV",       url: "https://pluto.tv/en/live-tv/sports",        icon: "🆓", desc: "Free sports channels, no sign-up needed" },
    { name: "YouTube Soccer", url: "https://www.youtube.com/@premierleague",    icon: "▶", desc: "Official Premier League, UEFA & club channels" },
    { name: "SofaScore",      url: "https://www.sofascore.com",                 icon: "📊", desc: "Live scores, lineups, stats & stream links" },
    { name: "ESPN Soccer",    url: "https://www.espn.com/soccer/",              icon: "🏟", desc: "Free highlights — Bundesliga, MLS, FA Cup (US)" },
    { name: "OneFootball",    url: "https://www.onefootball.com",               icon: "🌐", desc: "Free highlights and some live streams — global" },
    { name: "Paramount+",     url: "https://www.paramountplus.com",             icon: "📱", desc: "Free trial — Champions League, Serie A (US)" },
    { name: "FlashScore",     url: "https://www.flashscore.com",                icon: "⚡", desc: "Live scores, text commentary & stream finder" },
  ];

  const [soccerLeague, setSoccerLeague] = useState("fifa.world");
  const [soccerGames, setSoccerGames] = useState([]);
  const [soccerLoading, setSoccerLoading] = useState(false);
  const [soccerFetched, setSoccerFetched] = useState(false);
  const [soccerError, setSoccerError] = useState(null);

  const fetchLeague = useCallback(async (leagueId) => {
    setSoccerLoading(true);
    setSoccerError(null);
    setSoccerGames([]);
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`);
      const d = await r.json();
      // Moneyline (American odds) → implied win probability.
      const impl = (ml) => { const v = Number(ml); if (!Number.isFinite(v) || v === 0) return null; return v > 0 ? 100 / (v + 100) : (-v) / ((-v) + 100); };
      const games = (d.events || []).map(ev => {
        const comp = ev.competitions?.[0] || {};
        const home = comp.competitors?.find(c => c.homeAway === "home") || {};
        const away = comp.competitors?.find(c => c.homeAway === "away") || {};
        const status = comp.status?.type;
        // Prediction from ESPN odds (when available)
        const o = comp.odds?.[0];
        let prediction = null;
        if (o) {
          const hP = impl(o.homeTeamOdds?.moneyLine), aP = impl(o.awayTeamOdds?.moneyLine), dP = impl(o.drawOdds?.moneyLine);
          if (hP || aP || dP) {
            const tot = (hP || 0) + (aP || 0) + (dP || 0) || 1;
            const homePct = Math.round((hP || 0) / tot * 100), awayPct = Math.round((aP || 0) / tot * 100), drawPct = Math.round((dP || 0) / tot * 100);
            const favName = (homePct >= awayPct && homePct >= drawPct) ? (home.team?.abbreviation || "Home")
              : (awayPct >= drawPct) ? (away.team?.abbreviation || "Away") : "Draw";
            prediction = { homePct, awayPct, drawPct, favName, detail: o.details || "" };
          } else if (o.details) prediction = { detail: o.details, favName: null };
        }
        return {
          id: ev.id, date: ev.date,
          home: home.team?.displayName || "Home", homeLogo: home.team?.logo || null, homeScore: home.score || "—",
          away: away.team?.displayName || "Away", awayLogo: away.team?.logo || null, awayScore: away.score || "—",
          inProgress: status?.state === "in", finished: status?.state === "post", upcoming: status?.state === "pre",
          clock: status?.displayClock || "", shortDetail: status?.shortDetail || "", prediction,
        };
      });
      setSoccerGames(games);
      setSoccerFetched(true);
    } catch {
      setSoccerError("Could not load schedule — check your connection.");
    } finally {
      setSoccerLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeague(soccerLeague);
    const t = setInterval(() => fetchLeague(soccerLeague), 15 * 60 * 1000); // auto-refresh every 15 min
    return () => clearInterval(t);
  }, [soccerLeague, fetchLeague]);

  const live     = soccerGames.filter(g => g.inProgress);
  const upcoming = soccerGames.filter(g => g.upcoming);
  const finished = soccerGames.filter(g => g.finished);

  // ── Predicted group standings (1-2-3-4) for the World Cup ──
  const [groups, setGroups] = useState([]);
  const [groupsLoad, setGroupsLoad] = useState(false);
  const fetchStandings = useCallback(async (leagueId) => {
    setGroupsLoad(true);
    try {
      const r = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${leagueId}/standings`);
      const d = await r.json();
      const stat = (entry, name) => { const s = (entry.stats || []).find(x => x.name === name); return s ? (s.value != null ? s.value : s.displayValue) : null; };
      const gs = (d.children || []).map(g => ({
        name: g.name || g.abbreviation || "Group",
        teams: (g.standings?.entries || []).map(e => ({
          team: e.team?.displayName || e.team?.name || "—",
          logo: e.team?.logos?.[0]?.href || null,
          rank: Number(stat(e, "rank")) || 99,
          gp: Number(stat(e, "gamesPlayed")) || 0,
          w: Number(stat(e, "wins")) || 0,
          d: Number(stat(e, "ties")) || 0,
          l: Number(stat(e, "losses")) || 0,
          gd: Number(stat(e, "pointDifferential")) || 0,
          pts: Number(stat(e, "points")) || 0,
          advanced: Number(stat(e, "advanced")) === 1,
        })).sort((a, b) => a.rank - b.rank),
      })).filter(g => g.teams.length);
      setGroups(gs);
    } catch { setGroups([]); }
    finally { setGroupsLoad(false); }
  }, []);
  useEffect(() => {
    if (soccerView !== "table") return;
    fetchStandings(soccerLeague);
    const t = setInterval(() => fetchStandings(soccerLeague), 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [soccerView, soccerLeague, fetchStandings]);

  const GameCard = ({ g }) => {
    const stColor = g.inProgress ? C.green : g.finished ? C.textDim : C.amber;
    const stLabel = g.inProgress
      ? `🔴 LIVE ${g.clock}`
      : g.finished ? "FT"
      : (() => { try { return new Date(g.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return g.shortDetail; } })();
    return (
      <div style={{ background: C.card, border: `1px solid ${g.inProgress ? C.green + "55" : C.border}`, borderRadius: 8, padding: "12px 16px", boxShadow: g.inProgress ? `0 0 12px ${C.green}22` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            {g.homeLogo && <img src={g.homeLogo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />}
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.text, fontWeight: 600, textAlign: "right" }}>{g.home}</span>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            {!g.upcoming
              ? <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text }}>{g.homeScore} – {g.awayScore}</div>
              : <div style={{ fontFamily: MONO, fontSize: 13, color: C.amber, fontWeight: 700 }}>VS</div>
            }
            <div style={{ fontFamily: MONO, fontSize: 12, color: stColor, fontWeight: 700, marginTop: 2 }}>{stLabel}</div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            {g.awayLogo && <img src={g.awayLogo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />}
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.text, fontWeight: 600 }}>{g.away}</span>
          </div>
        </div>
        {g.prediction && (g.prediction.homePct != null || g.prediction.detail) && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            {g.prediction.homePct != null ? (<>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: ".06em" }}>🔮 PREDICTION</span>
                {g.prediction.favName && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green }}>{g.prediction.favName} favored</span>}
              </div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.border }}>
                <div style={{ width: g.prediction.homePct + "%", background: C.accent }} title={`${g.home} ${g.prediction.homePct}%`} />
                <div style={{ width: g.prediction.drawPct + "%", background: C.textDim }} title={`Draw ${g.prediction.drawPct}%`} />
                <div style={{ width: g.prediction.awayPct + "%", background: "#d97706" }} title={`${g.away} ${g.prediction.awayPct}%`} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, marginTop: 3 }}>
                <span style={{ color: C.accent }}>{g.prediction.homePct}% W</span>
                <span style={{ color: C.textDim }}>{g.prediction.drawPct}% D</span>
                <span style={{ color: "#d97706" }}>{g.prediction.awayPct}% W</span>
              </div>
            </>) : (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>🔮 Odds: {g.prediction.detail}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const cols = isTablet ? "1fr 1fr" : "repeat(4, 1fr)";

  const tabBtn = (id, label) => (
    <button onClick={() => setSoccerView(id)} style={{
      fontFamily: MONO, fontSize: 12, fontWeight: soccerView === id ? 800 : 600,
      border: soccerView === id ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
      background: soccerView === id ? `${C.accent}22` : "transparent",
      color: soccerView === id ? C.accent : C.textSec,
      borderRadius: 6, padding: "6px 14px", cursor: "pointer",
      borderBottom: soccerView === id ? `2px solid ${C.accent}` : "2px solid transparent",
    }}>{label}</button>
  );

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header + tabs */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, letterSpacing: 2 }}>⚽ SOCCER WATCH</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>IPTV · Live scores · Free streaming links</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {tabBtn("iptv",   "📺 IPTV")}
          {tabBtn("scores", "📅 SCORES")}
          {tabBtn("table",  "🏆 PREDICTED TABLE")}
          {tabBtn("sites",  "🆓 FREE SITES")}
        </div>
      </div>

      {/* ── IPTV TAB ────────────────────────────────────────────────────────── */}
      {soccerView === "iptv" && (
        <SoccerIPTVPlayer C={C} MONO={MONO} SANS={SANS} />
      )}

      {/* ── SCORES TAB ──────────────────────────────────────────────────────── */}
      {soccerView === "scores" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.08em" }}>📅 TODAY'S SCHEDULE</span>
            <button onClick={() => fetchLeague(soccerLeague)} disabled={soccerLoading}
              style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
              {soccerLoading ? "LOADING…" : "↻ REFRESH"}
            </button>
          </div>
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "8px 12px", gap: 6, borderBottom: `1px solid ${C.border}` }}>
            {LEAGUES.map(l => (
              <button key={l.id} onClick={() => setSoccerLeague(l.id)}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: soccerLeague === l.id ? 800 : 500, whiteSpace: "nowrap",
                  border: soccerLeague === l.id ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: soccerLeague === l.id ? `${C.accent}22` : C.surface,
                  color: soccerLeague === l.id ? C.accent : C.textSec,
                  borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
                {l.flag} {l.name}
              </button>
            ))}
          </div>
          <div style={{ padding: "14px 16px" }}>
            {soccerLoading && <div style={{ textAlign: "center", padding: "40px 0", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading schedule…</div>}
            {soccerError && !soccerLoading && <div style={{ textAlign: "center", padding: "30px 0", fontFamily: MONO, fontSize: 12, color: C.red }}>{soccerError}</div>}
            {!soccerLoading && !soccerError && soccerFetched && soccerGames.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 6 }}>No matches scheduled today</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Try another league or check back on match days</div>
              </div>
            )}
            {!soccerLoading && soccerGames.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {live.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.green, animation: "pulse 1.5s infinite" }} />
                      LIVE NOW ({live.length})
                    </div>
                    {live.map(g => <GameCard key={g.id} g={g} />)}
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>UPCOMING ({upcoming.length})</div>
                    {upcoming.map(g => <GameCard key={g.id} g={g} />)}
                  </div>
                )}
                {finished.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>FINAL RESULTS ({finished.length})</div>
                    {finished.map(g => <GameCard key={g.id} g={g} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PREDICTED TABLE TAB ──────────────────────────────────────────────── */}
      {soccerView === "table" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 10 }}>
            48-team format · top <b style={{ color: C.green }}>2 advance</b> + the <b style={{ color: "#d97706" }}>8 best 3rd-place</b> teams (32 to Round of 32) · auto-refresh 15 min
          </div>
          {groupsLoad && !groups.length && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading standings…</div>}
          {!groupsLoad && !groups.length && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No group standings available for this competition right now.</div>}
          {(() => {
          // 2026 format: top 2 of each group + the 8 best 3rd-place teams advance.
          const projOf = (tm) => tm.pts + Math.max(0, 3 - tm.gp) * (tm.gp > 0 ? tm.pts / tm.gp : 1.2) + Math.max(0, tm.gd) * 0.05;
          const thirds = groups.map(g => g.teams[2]).filter(Boolean);
          const qualThirds = new Set([...thirds].sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd)).slice(0, 8).map(t => t.team));
          const thirdsProj = thirds.map(projOf).sort((a, b) => b - a);
          const thirdLine = thirdsProj.length >= 9 ? (thirdsProj[7] + thirdsProj[8]) / 2 : (thirdsProj[thirdsProj.length - 1] ?? 0);
          const logit = (x, mid) => Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-(x - mid) / 1.6)))));
          return (
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: 12 }}>
            {groups.map((g, gi) => {
              const projs = g.teams.map(projOf).sort((a, b) => b - a);
              const line = projs.length >= 3 ? (projs[1] + projs[2]) / 2 : (projs[1] ?? projs[0] ?? 0);
              return (
              <div key={gi} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", background: C.surface, borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{g.name}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
                  <thead><tr style={{ color: C.textDim }}>
                    {["#", "Team", "P", "W", "D", "L", "GD", "Pts", "Adv%", ""].map((h, i) => (
                      <th key={i} style={{ padding: "5px 8px", textAlign: i === 1 ? "left" : "center", fontSize: 10, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {g.teams.map((t, ti) => {
                      const pos = ti + 1;
                      const isThird = pos === 3;
                      const thirdQual = isThird && qualThirds.has(t.team);
                      const advances = pos <= 2 || thirdQual;
                      const advPct = t.advanced ? 99
                        : pos <= 2 ? Math.max(50, logit(projOf(t), line))
                        : isThird ? logit(projOf(t), thirdLine)
                        : logit(projOf(t), line);
                      const posCol = pos <= 2 ? C.green : isThird ? (thirdQual ? "#d97706" : C.textDim) : C.red;
                      return (
                        <tr key={ti} style={{ background: advances ? `${C.green}0c` : "transparent" }}>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: posCol }}>{pos}</td>
                          <td style={{ padding: "6px 8px", display: "flex", alignItems: "center", gap: 6, color: C.text, fontWeight: 600 }}>
                            {t.logo && <img src={t.logo} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />}
                            {t.team}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center", color: C.textDim }}>{t.gp}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", color: C.green }}>{t.w}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", color: C.textDim }}>{t.d}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", color: C.red }}>{t.l}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", color: t.gd >= 0 ? C.green : C.red }}>{t.gd >= 0 ? "+" : ""}{t.gd}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: C.text }}>{t.pts}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: advPct >= 60 ? C.green : advPct >= 35 ? "#d97706" : C.red }}>{advPct}%</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 9, fontWeight: 800, color: posCol }}>{t.advanced ? "✓ IN" : pos <= 2 ? "ADV" : thirdQual ? "3rd ✓" : isThird ? "3rd?" : "OUT"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })}
          </div>
          ); })()}
        </div>
      )}

      {/* ── FREE SITES TAB ───────────────────────────────────────────────────── */}
      {soccerView === "sites" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, letterSpacing: "0.08em" }}>🆓 FREE STREAMING SITES — tap to open</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: cols }}>
            {FREE_SITES.map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer"
                style={{ display: "block", padding: "12px 14px", textDecoration: "none", borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: "transparent", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                onTouchStart={e => e.currentTarget.style.background = C.cardHover}
                onTouchEnd={e => { setTimeout(() => { if (e.currentTarget) e.currentTarget.style.background = "transparent"; }, 300); }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>{s.name}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{s.desc}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
