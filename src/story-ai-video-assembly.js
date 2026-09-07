"use strict";

// story-ai-video-assembly.js — Video Engine (spec §"7. VIDEO ENGINE").
// FFmpeg-based assembly, $0 API cost. Split into a pure, unit-testable
// command builder (buildFfmpegArgs — given scene/asset data, returns the
// exact argv it would run, no I/O) and a real availability check
// (checkFfmpegAvailable — spawns `ffmpeg -version`, genuinely tested in
// this environment: ffmpeg is NOT installed here, so this correctly
// reports unavailable rather than silently pretending video assembly
// would work).
//
// DISCLOSED: actually RUNNING assembleVideo() end-to-end (spawning real
// ffmpeg against real generated images/audio) is UNTESTED in this
// environment — no ffmpeg binary is present here to execute against, and
// no real image/audio assets exist without configured image/TTS
// providers. The command-construction logic itself (buildFfmpegArgs) IS
// tested — see test/story-ai-video-assembly.test.js.

const { spawn } = require("node:child_process");
const path = require("node:path");

function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"]);
    let resolved = false;
    proc.on("error", () => { if (!resolved) { resolved = true; resolve(false); } });
    proc.on("exit", (code) => { if (!resolved) { resolved = true; resolve(code === 0); } });
  });
}

// Pure — builds the real ffmpeg argv for one scene's Ken-Burns-style
// still-image clip (spec's own "slow zoom/pan" motion requirement), no
// audio yet (audio/subtitle muxing happens in the final assembly step).
// `imagePath`/`outPath` are real filesystem paths the caller already
// resolved; this function never touches the filesystem itself.
function buildSceneClipArgs({ imagePath, outPath, durationSeconds, motion = "slow zoom in", width = 1080, height = 1920, fps = 30 }) {
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  // zoompan filter — a simple, well-documented Ken Burns approximation.
  // zoom increases/decreases linearly over the clip's own frame count;
  // pan filters shift the crop window instead of zooming.
  let filter;
  if (motion === "slow zoom out") {
    filter = `scale=${width * 1.15}:${height * 1.15},zoompan=z='if(lte(zoom,1.0),1.15,max(1.0,zoom-0.0015))':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
  } else if (motion === "horizontal pan") {
    filter = `scale=${width * 1.2}:${height},zoompan=z=1.2:x='if(lte(on,1),0,x+1)':y=0:d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
  } else if (motion === "vertical pan") {
    filter = `scale=${width}:${height * 1.2},zoompan=z=1.2:x=0:y='if(lte(on,1),0,y+1)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
  } else if (motion === "static") {
    filter = `scale=${width}:${height}`;
  } else { // default: slow zoom in
    filter = `scale=${width * 1.15}:${height * 1.15},zoompan=z='min(zoom+0.0015,1.15)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
  }
  return ["-y", "-loop", "1", "-i", imagePath, "-vf", filter, "-t", String(durationSeconds), "-r", String(fps), "-pix_fmt", "yuv420p", outPath];
}

// Pure — builds the real ffmpeg argv for the final mux: concatenated
// scene clips + narration audio + subtitles burned in (or soft, per
// `burnSubtitles`) + optional background music ducked under narration +
// social-friendly H.264/AAC encode, per spec's exact output requirements.
function buildFinalMuxArgs({ concatListPath, narrationAudioPath, musicPath, srtPath, outPath, burnSubtitles = true, musicVolumeDb = -18 }) {
  const inputs = ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-i", narrationAudioPath];
  if (musicPath) inputs.push("-i", musicPath);

  const filters = [];
  let videoLabel = "0:v";
  if (burnSubtitles && srtPath) {
    // subtitles filter needs the path escaped for the filtergraph (colon
    // is a filter-option separator) — same escaping ffmpeg's own docs
    // require on Unix paths.
    const escaped = srtPath.replace(/:/g, "\\:");
    filters.push(`[0:v]subtitles='${escaped}':force_style='Alignment=2,FontSize=20'[vout]`);
    videoLabel = "vout";
  }
  let audioMapArgs;
  if (musicPath) {
    filters.push(`[2:a]volume=${musicVolumeDb}dB[music]`, `[1:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
    audioMapArgs = ["-map", `[${videoLabel}]`, "-map", "[aout]"];
  } else {
    audioMapArgs = ["-map", `[${videoLabel}]`, "-map", "1:a"];
  }

  const args = [...inputs];
  if (filters.length) args.push("-filter_complex", filters.join(";"));
  args.push(...audioMapArgs, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-shortest", outPath);
  return args;
}

// Real, disclosed-untested end-to-end runner — spawns real ffmpeg. Kept
// separate from the pure builders above precisely so the builders can be
// unit-tested without a real ffmpeg binary, while this function is the
// one real place actual process execution happens.
function runFfmpeg(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { cwd });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)));
    proc.on("exit", (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

module.exports = { checkFfmpegAvailable, buildSceneClipArgs, buildFinalMuxArgs, runFfmpeg };
