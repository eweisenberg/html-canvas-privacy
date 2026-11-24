import { SCENE_DEFINITIONS, renderMinimalScene, renderGeometryScene, renderFullScene } from "./canvas_scenes.js";
import { computeHash, quantizeBuffer, computeDelta, renderHeatmap, inspectPixel } from "./inversion.js";

// State
let currentSceneKey = "minimal";
let baselineBuffer = null;
let currentBuffer = null;
let baselineRawHash = "";
let baselineQuantizedHash = "";
let currentRawHash = "";
let currentQuantizedHash = "";
let currentWidth = 200;
let currentHeight = 150;
let currentDeltaResult = null;
let webglInfo = { vendor: "Unknown", renderer: "Unknown" };

// DOM Elements
const sceneSelect = document.getElementById("sceneSelect");
const liveCanvas = document.getElementById("liveCanvas");
const diffCanvas = document.getElementById("diffCanvas");
const liveCtx = liveCanvas.getContext("2d", { willReadFrequently: true });
const canvasDims = document.getElementById("canvasDims");

const baselineSelect = document.getElementById("baselineSelect");
const btnRefreshBaselines = document.getElementById("btnRefreshBaselines");
const btnLoadBaseline = document.getElementById("btnLoadBaseline");
const baselineStatus = document.getElementById("baselineStatus");

const btnSetBaseline = document.getElementById("btnSetBaseline");
const btnSnapshot = document.getElementById("btnSnapshot");
const btnResetBaseline = document.getElementById("btnResetBaseline");
const btnUpload = document.getElementById("btnUpload");

const lsbSlider = document.getElementById("lsbSlider");
const lsbSliderVal = document.getElementById("lsbSliderVal");
const ampSlider = document.getElementById("ampSlider");
const ampSliderVal = document.getElementById("ampSliderVal");

const statAlteredCount = document.getElementById("statAlteredCount");
const statAlteredPct = document.getElementById("statAlteredPct");
const statMaxDelta = document.getElementById("statMaxDelta");
const statMeanDelta = document.getElementById("statMeanDelta");
const statHist0 = document.getElementById("statHist0");
const statHist1 = document.getElementById("statHist1");
const statHist2 = document.getElementById("statHist2");
const statHist3 = document.getElementById("statHist3");

const badgeRawMatch = document.getElementById("badgeRawMatch");
const badgeQuantMatch = document.getElementById("badgeQuantMatch");
const valBaselineRaw = document.getElementById("valBaselineRaw");
const valCurrentRaw = document.getElementById("valCurrentRaw");
const valBaselineQuant = document.getElementById("valBaselineQuant");
const valCurrentQuant = document.getElementById("valCurrentQuant");

const inspectorCoord = document.getElementById("inspectorCoord");
const inspectorBase = document.getElementById("inspectorBase");
const inspectorCur = document.getElementById("inspectorCur");
const inspectorDelta = document.getElementById("inspectorDelta");

const inputMachine = document.getElementById("inputMachine");
const inputBrowser = document.getElementById("inputBrowser");
const inputMode = document.getElementById("inputMode");
const badgeGpu = document.getElementById("badgeGpu");
const uploadStatus = document.getElementById("uploadStatus");

/**
 * Detect WebGL Unmasked Hardware Information
 */
function detectWebGLInfo() {
  try {
    const glCanvas = document.createElement("canvas");
    const gl = glCanvas.getContext("webgl") || glCanvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        webglInfo.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "Unknown";
        webglInfo.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "Unknown";
      }
    }
  } catch (e) {
    console.warn("WebGL query error:", e);
  }

  if (badgeGpu) {
    badgeGpu.textContent = `GPU: ${webglInfo.renderer}`;
  }
}

/**
 * Auto-detect likely browser brand for the input default
 */
function autoDetectBrowser() {
  const ua = navigator.userAgent;
  if (navigator.brave && typeof navigator.brave.isBrave === "function") {
    inputBrowser.value = "brave";
  } else if (ua.includes("Firefox")) {
    inputBrowser.value = "firefox";
  } else if (ua.includes("Edg/")) {
    inputBrowser.value = "edge";
  } else if (ua.includes("Chrome")) {
    inputBrowser.value = "chrome";
  } else {
    inputBrowser.value = "other";
  }
}

/**
 * Render the chosen scene to the canvas and extract pixel buffer
 */
async function renderCurrentScene() {
  const def = SCENE_DEFINITIONS[currentSceneKey];
  currentWidth = def.width;
  currentHeight = def.height;
  if (canvasDims) canvasDims.textContent = `${currentWidth}x${currentHeight}`;

  liveCanvas.width = currentWidth;
  liveCanvas.height = currentHeight;

  if (currentSceneKey === "minimal") {
    renderMinimalScene(liveCtx, currentWidth, currentHeight);
  } else if (currentSceneKey === "geometry") {
    renderGeometryScene(liveCtx, currentWidth, currentHeight);
  } else if (currentSceneKey === "full") {
    renderFullScene(liveCtx, currentWidth, currentHeight);
  }

  // Extract pixel buffer
  const imgData = liveCtx.getImageData(0, 0, currentWidth, currentHeight);
  currentBuffer = new Uint8ClampedArray(imgData.data);

  // Compute Raw Hash
  currentRawHash = await computeHash(currentBuffer);
  valCurrentRaw.textContent = currentRawHash || "--";

  // Compute Quantized Hash
  await updateQuantizedHashes();

  // Update Deltas
  updateDeltaAnalysis();
}

/**
 * Fetch list of saved runs from /api/runs to populate the baseline selector
 */
async function fetchBaselinesList(autoLoadLatest = true) {
  try {
    const res = await fetch("/api/runs");
    if (!res.ok) return;
    const runs = await res.json();

    baselineSelect.innerHTML = "";
    if (runs.length === 0) {
      baselineSelect.innerHTML = `<option value="none">-- No Saved Runs Found --</option>`;
      return;
    }

    const matchingRuns = runs.filter(r => r.scene === currentSceneKey);
    const targetRuns = matchingRuns.length > 0 ? matchingRuns : runs;

    targetRuns.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      const shortHash = (r.raw_hash || "").substring(0, 8);
      opt.textContent = `[${r.browser.toUpperCase()}] ${r.machine} (${r.date || r.id}) - hash:${shortHash}...`;
      baselineSelect.appendChild(opt);
    });

    if (autoLoadLatest && !baselineBuffer) {
      const chromeRun = targetRuns.find(r => r.browser.toLowerCase().includes("chrome")) || targetRuns[0];
      if (chromeRun) {
        baselineSelect.value = chromeRun.id;
        await loadBaselineById(chromeRun.id);
      }
    }
  } catch (e) {
    console.warn("Could not fetch runs from server:", e);
  }
}

/**
 * Load raw binary buffer from /api/runs/<id>/buffer and set as baseline
 */
async function loadBaselineById(runId) {
  if (!runId || runId === "none") return;
  baselineStatus.textContent = `Loading baseline ${runId}...`;

  try {
    const res = await fetch(`/api/runs/${runId}/buffer`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    baselineBuffer = new Uint8ClampedArray(arrayBuffer);
    baselineRawHash = await computeHash(baselineBuffer);
    valBaselineRaw.textContent = baselineRawHash;

    baselineStatus.textContent = `Active Baseline: ${runId} (${(baselineBuffer.length / 1024).toFixed(1)} KB)`;

    await updateQuantizedHashes();
    updateDeltaAnalysis();
  } catch (err) {
    baselineStatus.textContent = `Failed to load: ${err.message}`;
  }
}

/**
 * Update quantized buffers and hashes according to LSB slider
 */
async function updateQuantizedHashes() {
  const bits = parseInt(lsbSlider.value, 10);
  lsbSliderVal.textContent = `${bits} bit${bits === 1 ? "" : "s"} (${0xff << bits & 0xff})`;

  if (currentBuffer) {
    const qCur = quantizeBuffer(currentBuffer, bits);
    currentQuantizedHash = await computeHash(qCur);
    valCurrentQuant.textContent = currentQuantizedHash;
  }

  if (baselineBuffer) {
    const qBase = quantizeBuffer(baselineBuffer, bits);
    baselineQuantizedHash = await computeHash(qBase);
    valBaselineQuant.textContent = baselineQuantizedHash;
  } else {
    valBaselineQuant.textContent = "-- (Set Baseline First)";
  }

  updateBadges();
}

/**
 * Compare current buffer with baseline buffer and render heatmap
 */
function updateDeltaAnalysis() {
  const amp = parseInt(ampSlider.value, 10);
  ampSliderVal.textContent = `${amp}x`;

  if (!baselineBuffer) {
    statAlteredCount.textContent = "--";
    statAlteredPct.textContent = "--";
    statMaxDelta.textContent = "--";
    statMeanDelta.textContent = "--";
    statHist0.textContent = "--";
    statHist1.textContent = "--";
    statHist2.textContent = "--";
    statHist3.textContent = "--";
    renderHeatmap(diffCanvas, null, currentWidth, currentHeight, amp);
    updateBadges();
    return;
  }

  if (baselineBuffer.length !== currentWidth * currentHeight * 4) {
    baselineStatus.textContent = "Warning: Baseline dimensions do not match current scene.";
    return;
  }

  currentDeltaResult = computeDelta(baselineBuffer, currentBuffer, currentWidth, currentHeight);

  statAlteredCount.textContent = `${currentDeltaResult.alteredCount.toLocaleString()} / ${currentDeltaResult.totalPixels.toLocaleString()}`;
  statAlteredPct.textContent = `${currentDeltaResult.alteredPercent.toFixed(2)}%`;
  statMaxDelta.textContent = `+/-${currentDeltaResult.maxDelta} (R:${currentDeltaResult.channelMax[0]}, G:${currentDeltaResult.channelMax[1]}, B:${currentDeltaResult.channelMax[2]})`;
  statMeanDelta.textContent = `R:${currentDeltaResult.channelMean[0]} G:${currentDeltaResult.channelMean[1]} B:${currentDeltaResult.channelMean[2]}`;

  statHist0.textContent = currentDeltaResult.histogram[0].toLocaleString();
  statHist1.textContent = currentDeltaResult.histogram[1].toLocaleString();
  statHist2.textContent = currentDeltaResult.histogram[2].toLocaleString();
  statHist3.textContent = currentDeltaResult.histogram["3+"].toLocaleString();

  renderHeatmap(diffCanvas, currentDeltaResult.heatmapBuffer, currentWidth, currentHeight, amp);
  updateBadges();
}

/**
 * Update Match / Mismatch status badges
 */
function updateBadges() {
  if (!baselineBuffer) {
    badgeRawMatch.className = "status-tag";
    badgeRawMatch.textContent = "NO BASELINE";
    badgeQuantMatch.className = "status-tag";
    badgeQuantMatch.textContent = "NO BASELINE";
    return;
  }

  if (currentRawHash === baselineRawHash) {
    badgeRawMatch.className = "status-tag match";
    badgeRawMatch.textContent = "MATCH";
  } else {
    badgeRawMatch.className = "status-tag mismatch";
    badgeRawMatch.textContent = "MISMATCH";
  }

  if (currentQuantizedHash === baselineQuantizedHash) {
    badgeQuantMatch.className = "status-tag match";
    badgeQuantMatch.textContent = "COLLISION";
  } else {
    badgeQuantMatch.className = "status-tag mismatch";
    badgeQuantMatch.textContent = "NO COLLISION";
  }
}

/**
 * Handle pixel hover / click inspection on canvas
 */
function handlePixelHover(canvasElement, evt) {
  const rect = canvasElement.getBoundingClientRect();
  const scaleX = currentWidth / rect.width;
  const scaleY = currentHeight / rect.height;

  const x = Math.floor((evt.clientX - rect.left) * scaleX);
  const y = Math.floor((evt.clientY - rect.top) * scaleY);

  const info = inspectPixel(baselineBuffer, currentBuffer, currentWidth, currentHeight, x, y);
  if (!info) return;

  inspectorCoord.textContent = `(${info.x}, ${info.y})`;
  inspectorCur.textContent = `rgba(${info.current.r}, ${info.current.g}, ${info.current.b}, ${info.current.a})`;

  if (info.baseline) {
    inspectorBase.textContent = `rgba(${info.baseline.r}, ${info.baseline.g}, ${info.baseline.b}, ${info.baseline.a})`;
    const signR = info.delta.dr >= 0 ? `+${info.delta.dr}` : `${info.delta.dr}`;
    const signG = info.delta.dg >= 0 ? `+${info.delta.dg}` : `${info.delta.dg}`;
    const signB = info.delta.db >= 0 ? `+${info.delta.db}` : `${info.delta.db}`;
    const signA = info.delta.da >= 0 ? `+${info.delta.da}` : `${info.delta.da}`;
    inspectorDelta.textContent = `dR:${signR}, dG:${signG}, dB:${signB}, dA:${signA} (Max: ${info.delta.absMax})`;
  } else {
    inspectorBase.textContent = "--";
    inspectorDelta.textContent = "--";
  }
}

/**
 * Convert Uint8ClampedArray to Base64
 */
function bufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer.buffer || buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Upload snapshot to backend /api/collect
 */
async function uploadToBackend() {
  if (!currentBuffer) return;

  btnUpload.disabled = true;
  uploadStatus.textContent = "Uploading to server...";

  try {
    const q1 = quantizeBuffer(currentBuffer, 1);
    const q2 = quantizeBuffer(currentBuffer, 2);
    const hash1 = await computeHash(q1);
    const hash2 = await computeHash(q2);

    const payload = {
      machine: inputMachine.value.trim() || "unnamed-machine",
      browser: inputBrowser.value.trim() || "unknown-browser",
      mode: inputMode.value.trim() || "normal",
      scene: currentSceneKey,
      width: currentWidth,
      height: currentHeight,
      raw_hash: currentRawHash,
      quantized_hash_1bit: hash1,
      quantized_hash_2bit: hash2,
      webgl_vendor: webglInfo.vendor,
      webgl_renderer: webglInfo.renderer,
      dpr: window.devicePixelRatio || 1,
      user_agent: navigator.userAgent,
      pixels_base64: bufferToBase64(currentBuffer)
    };

    const res = await fetch("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.status === "success") {
      uploadStatus.textContent = `Saved as ${data.id}.npz (${(data.bytes / 1024).toFixed(1)} KB)`;
      fetchBaselinesList(false);
    } else {
      uploadStatus.textContent = `Error: ${data.message || "Failed to save"}`;
    }
  } catch (err) {
    uploadStatus.textContent = `Network Error: ${err.message}`;
  } finally {
    btnUpload.disabled = false;
  }
}

// Event Listeners
sceneSelect.addEventListener("change", (e) => {
  currentSceneKey = e.target.value;
  baselineBuffer = null;
  valBaselineRaw.textContent = "-- (Set Baseline First)";
  renderCurrentScene();
  fetchBaselinesList(true);
});

btnSetBaseline.addEventListener("click", () => {
  if (!currentBuffer) return;
  baselineBuffer = new Uint8ClampedArray(currentBuffer);
  baselineRawHash = currentRawHash;
  valBaselineRaw.textContent = baselineRawHash;
  baselineStatus.textContent = "In-memory baseline set from current tab.";
  updateQuantizedHashes();
  updateDeltaAnalysis();
});

btnSnapshot.addEventListener("click", () => {
  renderCurrentScene();
});

btnResetBaseline.addEventListener("click", () => {
  baselineBuffer = null;
  baselineRawHash = "";
  baselineQuantizedHash = "";
  valBaselineRaw.textContent = "-- (No baseline)";
  valBaselineQuant.textContent = "--";
  baselineStatus.textContent = "";
  updateDeltaAnalysis();
  updateBadges();
});

btnRefreshBaselines.addEventListener("click", () => fetchBaselinesList(false));

btnLoadBaseline.addEventListener("click", () => {
  loadBaselineById(baselineSelect.value);
});

lsbSlider.addEventListener("input", () => {
  updateQuantizedHashes();
});

ampSlider.addEventListener("input", () => {
  updateDeltaAnalysis();
});

liveCanvas.addEventListener("mousemove", (e) => handlePixelHover(liveCanvas, e));
diffCanvas.addEventListener("mousemove", (e) => handlePixelHover(diffCanvas, e));

btnUpload.addEventListener("click", uploadToBackend);

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  detectWebGLInfo();
  autoDetectBrowser();
  renderCurrentScene();
  fetchBaselinesList(true);
});
