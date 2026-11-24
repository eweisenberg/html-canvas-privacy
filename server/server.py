#!/usr/bin/env python3
"""
Lightweight Zero-Dependency Telemetry & Web Server for Canvas Inversion Testbed.
Uses Python's standard library http.server, with optional NumPy acceleration.
"""

import os
import sys
import json
import base64
import time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import urllib.parse

# Try importing numpy for .npz exports
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"
DATA_DIR = ROOT_DIR / "data" / "runs"

DATA_DIR.mkdir(parents=True, exist_ok=True)


class TelemetryHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        # Enable CORS for cross-origin or local testing
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            existing_runs = list(DATA_DIR.glob("*.json"))
            resp = {
                "status": "healthy",
                "numpy_available": HAS_NUMPY,
                "runs_count": len(existing_runs),
                "data_dir": str(DATA_DIR)
            }
            self.wfile.write(json.dumps(resp, indent=2).encode("utf-8"))
            return

        elif path == "/api/runs":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            runs = []
            for json_file in sorted(DATA_DIR.glob("*.json"), reverse=True):
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        runs.append(json.load(f))
                except Exception as e:
                    pass
            self.wfile.write(json.dumps(runs, indent=2).encode("utf-8"))
            return

        # Serve raw binary buffer for a specific run ID: /api/runs/<id>/buffer
        elif path.startswith("/api/runs/") and path.endswith("/buffer"):
            parts = path.split("/")
            if len(parts) >= 4:
                run_id = parts[3]
                bin_path = DATA_DIR / f"{run_id}.bin"
                if bin_path.exists():
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Length", str(bin_path.stat().st_size))
                    self.end_headers()
                    with open(bin_path, "rb") as f:
                        self.wfile.write(f.read())
                    return
                else:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Buffer file not found"}).encode("utf-8"))
                    return

        # Default: serve static files from web/
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/collect":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)

            try:
                data = json.loads(body.decode("utf-8"))
                ts = int(time.time() * 1000)
                machine = data.get("machine", "unknown").replace(" ", "_")
                browser = data.get("browser", "unknown").replace(" ", "_")
                mode = data.get("mode", "normal").replace(" ", "_")
                scene = data.get("scene", "minimal").replace(" ", "_")
                filename_base = f"{ts}_{machine}_{browser}_{mode}_{scene}"

                # Decode base64 RGBA buffer
                pixels_b64 = data.get("pixels_base64", "")
                pixel_bytes = base64.b64decode(pixels_b64) if pixels_b64 else b""

                width = data.get("width", 200)
                height = data.get("height", 150)

                # Save raw binary bytes (.bin)
                bin_path = DATA_DIR / f"{filename_base}.bin"
                with open(bin_path, "wb") as f:
                    f.write(pixel_bytes)

                # If NumPy is available, save compressed .npz array
                npz_path = None
                if HAS_NUMPY and pixel_bytes:
                    try:
                        arr = np.frombuffer(pixel_bytes, dtype=np.uint8).reshape((height, width, 4))
                        npz_path = str(DATA_DIR / f"{filename_base}.npz")
                        np.savez_compressed(npz_path, pixels=arr)
                    except Exception as npe:
                        print(f"NumPy export error: {npe}")

                # Save metadata JSON
                meta = {
                    "id": filename_base,
                    "timestamp": ts,
                    "date": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts / 1000)),
                    "machine": machine,
                    "browser": browser,
                    "mode": mode,
                    "scene": scene,
                    "width": width,
                    "height": height,
                    "raw_hash": data.get("raw_hash", ""),
                    "quantized_hash_1bit": data.get("quantized_hash_1bit", ""),
                    "quantized_hash_2bit": data.get("quantized_hash_2bit", ""),
                    "webgl_vendor": data.get("webgl_vendor", "unknown"),
                    "webgl_renderer": data.get("webgl_renderer", "unknown"),
                    "dpr": data.get("dpr", 1.0),
                    "user_agent": data.get("user_agent", ""),
                    "bin_file": f"{filename_base}.bin",
                    "npz_file": f"{filename_base}.npz" if npz_path else None,
                    "byte_size": len(pixel_bytes)
                }

                json_path = DATA_DIR / f"{filename_base}.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                resp = {
                    "status": "success",
                    "id": filename_base,
                    "bytes": len(pixel_bytes),
                    "meta": meta
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
                print(f"[COLLECT] Saved run: {filename_base} ({len(pixel_bytes)} bytes)")

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


def run_server(port=8000):
    server = ThreadingHTTPServer(("0.0.0.0", port), TelemetryHandler)
    print("=" * 60)
    print(f"Canvas Privacy Telemetry Server Running on http://localhost:{port}")
    print(f"Serving UI from: {WEB_DIR}")
    print(f"Storing datasets in: {DATA_DIR}")
    print(f"NumPy Acceleration: {'Enabled (.npz + .bin)' if HAS_NUMPY else 'Disabled (.bin + .json)'}")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
