/**
 * Inversion & Defense Profiling Engine for HTML Canvas Fingerprinting.
 * Provides:
 * - SHA-256 Cryptographic Hashing via Web Crypto API
 * - Bit-plane / LSB Quantization (0 to 6 bits)
 * - Differential Signal Processing & Spatial Delta Matrix
 * - High-Gain Color Heatmap Rendering (detects single-unit +/-1 perturbations)
 * - Pixel Inspector for isolated (x, y) coordinates
 */

/**
 * Computes hexadecimal SHA-256 hash of a Uint8ClampedArray buffer.
 */
export async function computeHash(buffer) {
  if (!buffer || buffer.length === 0) return "";
  // Web Crypto digest expects ArrayBuffer or TypedArray
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer.buffer || buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Applies LSB Quantization:
 * Strips the k least significant bits by bitwise ANDing with (0xFF << k).
 * Example with k=2: 0xFD & 0xFC = 0xFC (erasing +/-1 and +/-2 noise).
 *
 * @param {Uint8ClampedArray} srcBuffer Raw RGBA buffer
 * @param {number} bitsToMask Number of low bits to mask (0 to 6)
 * @param {boolean} maskAlpha Whether to also mask alpha channel (default false)
 * @returns {Uint8ClampedArray} New quantized buffer
 */
export function quantizeBuffer(srcBuffer, bitsToMask, maskAlpha = false) {
  if (bitsToMask <= 0) {
    return new Uint8ClampedArray(srcBuffer);
  }

  const mask = (0xff << bitsToMask) & 0xff;
  const dest = new Uint8ClampedArray(srcBuffer.length);

  for (let i = 0; i < srcBuffer.length; i += 4) {
    dest[i] = srcBuffer[i] & mask;         // R
    dest[i + 1] = srcBuffer[i + 1] & mask; // G
    dest[i + 2] = srcBuffer[i + 2] & mask; // B
    dest[i + 3] = maskAlpha ? (srcBuffer[i + 3] & mask) : srcBuffer[i + 3]; // A
  }

  return dest;
}

/**
 * Compares current buffer against ground-truth baseline buffer.
 * Calculates detailed statistical metrics and constructs a delta matrix.
 */
export function computeDelta(baselineBuffer, currentBuffer, width, height) {
  const totalPixels = width * height;
  if (!baselineBuffer || !currentBuffer || baselineBuffer.length !== currentBuffer.length) {
    return {
      isValid: false,
      totalPixels,
      alteredCount: 0,
      alteredPercent: 0,
      maxDelta: 0,
      channelMax: [0, 0, 0, 0],
      channelSum: [0, 0, 0, 0],
      channelMean: [0, 0, 0, 0],
      histogram: { 0: totalPixels, 1: 0, 2: 0, "3+": 0 },
      heatmapBuffer: new Uint8ClampedArray(totalPixels * 4)
    };
  }

  let alteredCount = 0;
  let maxDelta = 0;
  const channelMax = [0, 0, 0, 0];
  const channelSum = [0, 0, 0, 0];
  const histogram = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  const heatmapBuffer = new Uint8ClampedArray(totalPixels * 4);

  for (let i = 0; i < currentBuffer.length; i += 4) {
    const dR = Math.abs(currentBuffer[i] - baselineBuffer[i]);
    const dG = Math.abs(currentBuffer[i + 1] - baselineBuffer[i + 1]);
    const dB = Math.abs(currentBuffer[i + 2] - baselineBuffer[i + 2]);
    const dA = Math.abs(currentBuffer[i + 3] - baselineBuffer[i + 3]);

    const pixelMax = Math.max(dR, dG, dB, dA);
    const pixelSum = dR + dG + dB + dA;

    channelSum[0] += dR;
    channelSum[1] += dG;
    channelSum[2] += dB;
    channelSum[3] += dA;

    if (dR > channelMax[0]) channelMax[0] = dR;
    if (dG > channelMax[1]) channelMax[1] = dG;
    if (dB > channelMax[2]) channelMax[2] = dB;
    if (dA > channelMax[3]) channelMax[3] = dA;

    if (pixelMax > maxDelta) maxDelta = pixelMax;

    if (pixelSum > 0) {
      alteredCount++;
      if (pixelMax === 1) histogram[1]++;
      else if (pixelMax === 2) histogram[2]++;
      else histogram["3+"]++;
    } else {
      histogram[0]++;
    }

    // Store per-pixel delta vector into heatmap buffer
    heatmapBuffer[i] = dR;
    heatmapBuffer[i + 1] = dG;
    heatmapBuffer[i + 2] = dB;
    heatmapBuffer[i + 3] = dA;
  }

  return {
    isValid: true,
    totalPixels,
    alteredCount,
    alteredPercent: (alteredCount / totalPixels) * 100,
    maxDelta,
    channelMax,
    channelSum,
    channelMean: channelSum.map(s => (s / totalPixels).toFixed(4)),
    histogram,
    heatmapBuffer
  };
}

/**
 * Renders amplified visual difference heatmap onto a destination canvas.
 * Applies false-color mapping so bounded +/-1 noise is prominently visible:
 * - 0 delta -> Pure Black
 * - 1 delta -> Bright Cyan (0, 255, 255)
 * - 2 delta -> Neon Green/Yellow (180, 255, 0)
 * - 3+ delta -> Bright Magenta/Hot Red (255, 0, 100)
 */
export function renderHeatmap(destCanvas, deltaBuffer, width, height, amplification = 50) {
  destCanvas.width = width;
  destCanvas.height = height;
  const ctx = destCanvas.getContext("2d");
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  if (!deltaBuffer) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    return;
  }

  for (let i = 0; i < deltaBuffer.length; i += 4) {
    const dR = deltaBuffer[i];
    const dG = deltaBuffer[i + 1];
    const dB = deltaBuffer[i + 2];
    const dA = deltaBuffer[i + 3];
    const maxChannelDelta = Math.max(dR, dG, dB, dA);

    if (maxChannelDelta === 0) {
      // Zero noise: dark background
      data[i] = 10;
      data[i + 1] = 14;
      data[i + 2] = 20;
      data[i + 3] = 255;
    } else if (maxChannelDelta === 1) {
      // +/-1 noise: Bright Cyan
      const intensity = Math.min(255, 120 + amplification);
      data[i] = 0;
      data[i + 1] = intensity;
      data[i + 2] = 255;
      data[i + 3] = 255;
    } else if (maxChannelDelta === 2) {
      // +/-2 noise: Neon Yellow-Green
      data[i] = 220;
      data[i + 1] = 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    } else {
      // +/-3 or higher: Vibrant Hot Pink / Red
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 110;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Inspects a single coordinate (x, y) and returns detailed color values and deltas.
 */
export function inspectPixel(baselineBuffer, currentBuffer, width, height, x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;

  const idx = (y * width + x) * 4;
  const cur = {
    r: currentBuffer[idx],
    g: currentBuffer[idx + 1],
    b: currentBuffer[idx + 2],
    a: currentBuffer[idx + 3]
  };

  if (!baselineBuffer) {
    return { x, y, current: cur, baseline: null, delta: null };
  }

  const base = {
    r: baselineBuffer[idx],
    g: baselineBuffer[idx + 1],
    b: baselineBuffer[idx + 2],
    a: baselineBuffer[idx + 3]
  };

  const delta = {
    dr: cur.r - base.r,
    dg: cur.g - base.g,
    db: cur.b - base.b,
    da: cur.a - base.a,
    absMax: Math.max(
      Math.abs(cur.r - base.r),
      Math.abs(cur.g - base.g),
      Math.abs(cur.b - base.b),
      Math.abs(cur.a - base.a)
    )
  };

  return { x, y, current: cur, baseline: base, delta };
}
