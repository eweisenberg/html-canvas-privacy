#!/usr/bin/env python3
"""
Automated unit tests for Canvas Inversion Testbed:
1. Mathematical Bit-Mask Quantization Verification.
2. Telemetry Ingestion Endpoint Verification.
3. Dataset File Integrity & Buffer Serving Endpoint.
"""

import unittest
import json
import base64
import os
import shutil
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

# Import server components
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from server import run_server, TelemetryHandler, ThreadingHTTPServer, DATA_DIR


class TestQuantizationMath(unittest.TestCase):
    def test_bit_mask_arithmetic(self):
        """Verifies that k-bit truncation masks out bounded noise."""
        for k in range(1, 7):
            mask = (0xFF << k) & 0xFF
            base_val = 200
            for delta in range(-(2**(k-1)), 2**(k-1)):
                farbled_val = base_val + delta
                if 0 <= farbled_val <= 255:
                    q_base = base_val & mask
                    q_farbled = farbled_val & mask
                    if (base_val // (2**k)) == (farbled_val // (2**k)):
                        self.assertEqual(q_base, q_farbled)

    def test_quantization_preserves_high_bits(self):
        """1-bit mask (0xFE) maps 255 to 254 and leaves 254 as 254."""
        mask_1bit = (0xFF << 1) & 0xFF
        self.assertEqual(mask_1bit, 0xFE)
        self.assertEqual(255 & mask_1bit, 254)
        self.assertEqual(254 & mask_1bit, 254)

        mask_2bit = (0xFF << 2) & 0xFF
        self.assertEqual(mask_2bit, 0xFC)
        self.assertEqual(255 & mask_2bit, 252)
        self.assertEqual(253 & mask_2bit, 252)
        self.assertEqual(252 & mask_2bit, 252)


class TestServerEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 8766
        cls.server = ThreadingHTTPServer(("127.0.0.1", cls.port), TelemetryHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.5)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_health_check(self):
        url = f"http://127.0.0.1:{self.port}/api/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data["status"], "healthy")

    def test_collect_and_buffer_retrieval(self):
        width = 4
        height = 4
        synthetic_pixels = bytes([255, 0, 128, 255] * (width * height))
        b64_pixels = base64.b64encode(synthetic_pixels).decode("utf-8")

        payload = {
            "machine": "test-machine",
            "browser": "synthetic-test",
            "mode": "normal",
            "scene": "test-scene",
            "width": width,
            "height": height,
            "raw_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "webgl_vendor": "TestVendor",
            "webgl_renderer": "TestRenderer",
            "pixels_base64": b64_pixels
        }

        # 1. Post to /api/collect
        url = f"http://127.0.0.1:{self.port}/api/collect"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            resp = json.loads(response.read().decode("utf-8"))
            self.assertEqual(resp["status"], "success")
            run_id = resp["id"]

        # 2. Fetch binary buffer via /api/runs/<id>/buffer
        buf_url = f"http://127.0.0.1:{self.port}/api/runs/{run_id}/buffer"
        with urllib.request.urlopen(buf_url) as buf_response:
            self.assertEqual(buf_response.status, 200)
            retrieved_bytes = buf_response.read()
            self.assertEqual(retrieved_bytes, synthetic_pixels)

        # Cleanup
        (DATA_DIR / f"{run_id}.bin").unlink(missing_ok=True)
        (DATA_DIR / f"{run_id}.json").unlink(missing_ok=True)
        (DATA_DIR / f"{run_id}.npz").unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
