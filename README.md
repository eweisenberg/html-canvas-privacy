# HTML Canvas Fingerprint Inversion & Defense Audit

Course Project for CS 4501 Privacy. An empirical audit and mathematical inversion analysis of browser canvas fingerprinting defenses (specifically Brave's Farbling mechanism and Firefox's privacy.resistFingerprinting).

---

## Quickstart: Starting the Server

The testbed uses Python's standard library and requires zero external pip installations:

```bash
# Start the local telemetry and web server
python server/server.py
```
Open `http://localhost:8000` in your browser.

---

## Complete Experimental Testing Protocol

To test whether Brave's Farbling defense can be bypassed and inverted, follow this exact step-by-step protocol.

### Phase 1: Machine 1 Data Collection (6 Snapshots)

Leave **Preset Scene** set to **Stage 1: Minimal Glyph and Polygon (A + Triangle)** throughout all steps.

#### 1. Google Chrome (Ground-Truth Control)
1. Open `http://localhost:8000` in Google Chrome.
2. In **Dataset Tagging and Telemetry**:
   - Machine ID: `machine-1` (or your name)
   - Browser: `chrome`
   - Mode: `normal`
3. Click **Set Current Tab as Baseline**.
4. Click **Save Snapshot to Dataset** (Run 1 captured).
5. Refresh the page (`F5`) and click **Save Snapshot to Dataset** again (Run 2 captured).
   - *Purpose*: Verifies that standard Chrome rendering is 100% deterministic (0 delta).

#### 2. Brave Normal (Testing Cross-Restart Seed Rotation)
1. Open `http://localhost:8000` in Brave Browser.
   - Confirm that the Brave Lion icon in the address bar has Shields UP.
   - The page will automatically load your Chrome baseline from the server.
2. In **Dataset Tagging and Telemetry**:
   - Machine ID: `machine-1`
   - Browser: `brave`
   - Mode: `normal`
3. Click **Save Snapshot to Dataset** (Run 3 captured).
4. **Completely quit Brave** (`Alt + F4` or close all windows) to force Brave to rotate its session key.
5. Re-open Brave, navigate to `http://localhost:8000`, and click **Save Snapshot to Dataset** (Run 4 captured).
   - *Purpose*: Verifies whether Brave rotates its PRNG seed on browser restart.

#### 3. Brave Private Window (Testing Private Session Unmasking)
1. In Brave, open a **New Private Window** (`Ctrl + Shift + N`).
2. Navigate to `http://localhost:8000`.
3. In **Dataset Tagging and Telemetry**:
   - Machine ID: `machine-1`
   - Browser: `brave`
   - Mode: `private`
4. Click **Save Snapshot to Dataset** (Run 5 captured).
5. Close the Private Window completely.
6. Open a fresh Private Window, navigate to `http://localhost:8000`, and click **Save Snapshot to Dataset** (Run 6 captured).
   - *Purpose*: Tests whether private browsing sessions can be linked back to the physical hardware.

---

### Phase 2: Running the Collision & Inversion Analysis

Run the evaluation script in your terminal:

```bash
python analysis/lsb_quantization.py
```

#### Expected Output Format
```
Target Run                          Raw Match  1-Bit Mask   2-Bit Mask   3-Bit Mask   Max Delta 
-----------------------------------------------------------------------------------------------
1795530086524_machine-1_chrome_no   MATCH      COLLIDE      COLLIDE      COLLIDE      ±0        
1795530099562_machine-1_brave_nor   DIFF       COLLIDE      COLLIDE      COLLIDE      ±1        
1795530104928_machine-1_brave_nor   DIFF       COLLIDE      COLLIDE      COLLIDE      ±1        
1795530129368_machine-1_brave_pri   DIFF       COLLIDE      COLLIDE      COLLIDE      ±1        
1795530143991_machine-1_brave_pri   DIFF       COLLIDE      COLLIDE      COLLIDE      ±1        
```

#### How to Interpret the Output
1. **Raw Match: DIFF**:
   Brave successfully perturbed the canvas output. A standard tracking script relying on raw SHA-256 sees different hashes and assumes these are different devices.
2. **Max Delta: ±1**:
   Quantifies the defense bounds. Brave standard farbling injects noise strictly bounded by $\pm 1$ and modifies only non-transparent color channels ($R, G, B$) while leaving Alpha completely untouched.
3. **1-Bit Mask: COLLIDE**:
   The inversion attack succeeded. Masking the lowest bit (`pixel & 0xFE` / $k=1$) strips 100% of the injected noise and forces all Brave normal and private sessions to collide with the true Chrome baseline.

---

### Phase 3: Machine 2 Testing (Cross-Machine Discrimination)

To prove that 1-bit quantization does not simply collapse all computers into the same hash, your project partner repeats the test on their computer (different GPU/OS):

1. Partner clones/pulls the git repository:
   ```bash
   git pull
   python server/server.py
   ```
2. Partner repeats Phase 1 using **Machine ID: `machine-2`**.
3. Run `python analysis/lsb_quantization.py`.
4. **Verification Criteria**:
   - Machine 2's Brave runs must collide with **Machine 2's Chrome**.
   - Machine 2's runs must **not** collide with **Machine 1's Chrome**.
   - This proves the technique strips defense noise while preserving true cross-device uniqueness.

---

### Phase 4: Staged Scene Complexity

Once Stage 1 is validated on both machines, switch the **Preset Scene** dropdown to:
- **Stage 2: Subpixel Geometry and Gradients**: Evaluates Bezier curves, line joins, and alpha blending.
- **Stage 3: Full Composite Fingerprint**: Evaluates multi-font fallback chains (`DirectWrite` vs `CoreText` vs `FreeType`) and composite operations.

Run `python analysis/lsb_quantization.py` to compare whether complex rasterization scenes require 1-bit or 2-bit quantization.

---

## Automated Unit Tests

To run the automated test suite verifying server endpoints and bit-mask arithmetic:

```bash
python tests/test_pipeline.py
```

---

## Repository Structure

```
html-canvas-privacy/
├── README.md                  # Experimental protocol and documentation
├── requirements.txt           # Optional analysis dependencies (numpy, scipy)
├── server/
│   └── server.py              # Zero-dependency local server & telemetry collector
├── web/
│   ├── index.html             # Clean testbed dashboard
│   ├── style.css              # Minimal stylesheet
│   └── js/
│       ├── canvas_scenes.js   # Minimal, Geometry, and Full scene renderers
│       ├── inversion.js       # LSB quantization, delta matrix, pixel inspector, heatmap
│       └── harness.js         # Event orchestration, WebGL query, telemetry
├── analysis/
│   └── lsb_quantization.py    # Bit-depth sweep and collision analyzer
├── tests/
│   └── test_pipeline.py       # Automated unit tests
└── data/
    └── runs/                  # Captured telemetry runs (.bin, .json, .npz)
```
