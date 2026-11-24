# HTML Canvas Fingerprint Inversion & Defense Audit

Course Project for CS 4501 Privacy. An empirical audit and mathematical inversion analysis of browser canvas fingerprinting defenses (specifically Brave's Farbling mechanism and Firefox's privacy.resistFingerprinting).

---

## Quickstart: Launching the Testbed

The testbed runs with zero external dependencies using Python's standard library:

```bash
# 1. Start the local telemetry and web server
python server/server.py
```
Open `http://localhost:8000` in any web browser.

---

## How to Use the Testbed

### 1. Test in Google Chrome (Ground-Truth Control)
1. Open `http://localhost:8000` in Google Chrome on your computer.
2. Under **Preset Scene**, leave it on **Stage 1: Minimal Glyph & Polygon (A + Triangle)**.
3. Set Machine ID to your machine name (e.g. `ethan-windows` or `machine-1`).
4. Click **Set Current Tab as Baseline**.
5. Click **Save Snapshot to Dataset** to record your baseline run.

### 2. Test in Brave Browser (Farbling Defense Active)
1. Open `http://localhost:8000` in Brave on the same computer.
2. The page automatically loads your saved Chrome baseline from the server.
3. Inspect the **Amplified Difference Heatmap**:
   - The pixels modified by Brave Farbling display in false color (Cyan for +/-1, Yellow for +/-2, Red/Pink for +/-3+).
   - Compare solid background pixels against anti-aliased glyph edges.
4. Hover or click on any pixel:
   - The **Pixel Inspector** shows exact coordinates (x, y), current RGBA, baseline RGBA, and channel deltas (dR, dG, dB, dA).
5. Under **LSB Quantization Inversion**:
   - The Raw SHA-256 shows `MISMATCH`.
   - Move the **Masked Low Bits (k) slider** from 0 to 1 or 2 bits.
   - When the Quantized SHA-256 badge switches to `COLLISION`, the bounded noise has been stripped and the true underlying hardware signature is recovered.
6. Click **Save Snapshot to Dataset**.

---

## Dataset Evaluation and Analysis

All runs are recorded in `data/runs/` as raw binary buffers (`.bin`) and structured metadata (`.json`), with optional `.npz` if NumPy is installed.

To evaluate hash collisions and residual deltas across all saved runs:
```bash
python analysis/lsb_quantization.py
```

To run the automated test suite:
```bash
python tests/test_pipeline.py
```

---

## Repository Structure

```
html-canvas-privacy/
├── README.md
├── requirements.txt
├── server/
│   └── server.py              # Zero-dependency local server & telemetry collector
├── web/
│   ├── index.html             # Minimal two-column testbed dashboard
│   ├── style.css              # Clean, minimal stylesheet
│   └── js/
│       ├── canvas_scenes.js   # Minimal, Geometry, and Full scene renderers
│       ├── inversion.js       # LSB quantization, delta matrix, pixel inspector, heatmap
│       └── harness.js         # Event orchestration, WebGL query, telemetry
├── analysis/
│   └── lsb_quantization.py    # Bit-depth sweep and collision analyzer
├── tests/
│   └── test_pipeline.py       # Automated unit tests for math and server
└── data/
    └── runs/                  # Saved telemetry runs (.bin, .json, .npz)
```
