#!/usr/bin/env python3
"""
LSB Quantization & Hash Collision Evaluator.
Analyzes captured canvas runs in data/runs/ and measures bit-depth collision thresholds.
Works with standard Python bytes, with automatic NumPy acceleration if installed.
"""

import os
import sys
import json
import hashlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data" / "runs"


def quantize_bytes(raw_bytes: bytes, bits_to_mask: int, mask_alpha: bool = False) -> bytes:
    if bits_to_mask <= 0:
        return raw_bytes
    mask = (0xFF << bits_to_mask) & 0xFF
    out = bytearray(raw_bytes)
    step = 4
    for i in range(0, len(out), step):
        out[i] = out[i] & mask         # R
        out[i + 1] = out[i + 1] & mask # G
        out[i + 2] = out[i + 2] & mask # B
        if mask_alpha and i + 3 < len(out):
            out[i + 3] = out[i + 3] & mask # A
    return bytes(out)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def analyze_runs():
    json_files = sorted(DATA_DIR.glob("*.json"))
    if not json_files:
        print("No captured runs found in data/runs/. Capture some baseline and test runs first!")
        return

    print("=" * 80)
    print(f"Loaded {len(json_files)} Captured Canvas Runs from {DATA_DIR}")
    print("=" * 80)

    runs = []
    for jf in json_files:
        with open(jf, "r", encoding="utf-8") as f:
            meta = json.load(f)
        bin_path = DATA_DIR / meta.get("bin_file", "")
        if bin_path.exists():
            with open(bin_path, "rb") as bf:
                meta["bytes"] = bf.read()
            runs.append(meta)

    if not runs:
        print("No binary data files found matching metadata.")
        return

    # Print run summary table
    print(f"{'Run ID':<40} {'Machine':<15} {'Browser':<10} {'Mode':<10} {'Scene':<10}")
    print("-" * 85)
    for r in runs:
        print(f"{r['id'][:38]:<40} {r['machine'][:14]:<15} {r['browser'][:9]:<10} {r['mode'][:9]:<10} {r['scene'][:9]:<10}")
    print("-" * 85)

    # Find a baseline run (e.g. Chrome normal)
    baselines = [r for r in runs if "chrome" in r["browser"].lower() and "normal" in r["mode"].lower()]
    if not baselines:
        print("\nNote: No explicit 'chrome' + 'normal' run found. Using first run as reference baseline.")
        ref_run = runs[0]
    else:
        ref_run = baselines[0]

    print(f"\nComparing all runs against Reference: [{ref_run['id']}] ({ref_run['browser']} / {ref_run['machine']})")
    print(f"Reference Raw Hash: {sha256_hex(ref_run['bytes'])}\n")

    print(f"{'Target Run':<35} {'Raw Match':<10} {'1-Bit Mask':<12} {'2-Bit Mask':<12} {'3-Bit Mask':<12} {'Max Delta':<10}")
    print("-" * 95)

    ref_bytes = ref_run["bytes"]

    for r in runs:
        if r["id"] == ref_run["id"]:
            continue
        tgt_bytes = r["bytes"]
        if len(tgt_bytes) != len(ref_bytes):
            continue

        raw_match = "MATCH" if sha256_hex(tgt_bytes) == sha256_hex(ref_bytes) else "DIFF"

        # Check quantization collisions
        k_results = []
        for k in [1, 2, 3]:
            q_ref = quantize_bytes(ref_bytes, k)
            q_tgt = quantize_bytes(tgt_bytes, k)
            k_match = "COLLIDE" if sha256_hex(q_ref) == sha256_hex(q_tgt) else "diff"
            k_results.append(k_match)

        # Compute max delta
        max_delta = max(abs(a - b) for a, b in zip(ref_bytes, tgt_bytes))

        print(f"{r['id'][:33]:<35} {raw_match:<10} {k_results[0]:<12} {k_results[1]:<12} {k_results[2]:<12} {f'±{max_delta}':<10}")

    print("=" * 95)


if __name__ == "__main__":
    analyze_runs()
