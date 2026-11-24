/**
 * Canvas Scene Generators for Fingerprint Auditing and Inversion.
 * Staged complexity:
 * 1. Minimal: Solid background + single character 'A' + small polygon
 * 2. Geometry: Bezier curves, radial/linear gradients, overlapping alpha shapes
 * 3. Full: Multi-font typography, Unicode symbols, sub-pixel text, composite blend modes
 */

export const SCENE_DEFINITIONS = {
  minimal: {
    name: "Minimal Glyph and Polygon",
    width: 200,
    height: 150,
    description: "Solid background with single character 'A' and a small colored triangle."
  },
  geometry: {
    name: "Subpixel Geometry and Gradients",
    width: 250,
    height: 180,
    description: "Bezier curves with fractional coordinates, line joins, radial gradients, and alpha blending."
  },
  full: {
    name: "Full Composite Fingerprint",
    width: 320,
    height: 200,
    description: "High-entropy scene with complex font fallback chains and blend modes."
  }
};

/**
 * Stage 1: Minimal Scene
 * Tests whether farbling affects solid white background (255, 255, 255),
 * solid black interior (0, 0, 0), or specifically anti-aliased edge boundaries.
 */
export function renderMinimalScene(ctx, width, height) {
  // 1. Solid pure white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 2. Centered large character 'A'
  ctx.fillStyle = "#000000";
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("A", width / 2 - 20, height / 2 + 5);

  // 3. Small sharp colored polygon (triangle) to check color channel farbling
  ctx.fillStyle = "#ff0055";
  ctx.beginPath();
  ctx.moveTo(width - 50, 25);
  ctx.lineTo(width - 20, 80);
  ctx.lineTo(width - 80, 80);
  ctx.closePath();
  ctx.fill();

  // 4. Single 1px black border around canvas
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);
}

/**
 * Stage 2: Subpixel Geometry & Gradient Scene
 * Introduces floating-point curve evaluation and color interpolation.
 */
export function renderGeometryScene(ctx, width, height) {
  // 1. Diagonal Linear Gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0f2027");
  grad.addColorStop(0.5, "#203a43");
  grad.addColorStop(1, "#2c5364");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Overlapping Alpha Circles
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#ff416c";
  ctx.beginPath();
  ctx.arc(60, 60, 45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8a2387";
  ctx.beginPath();
  ctx.arc(100, 75, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Fractional Bezier Curves with Round Caps and Miter Joins
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "#00f2fe";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(15.5, height - 25.5);
  ctx.bezierCurveTo(60.25, 20.75, 140.8, height - 10.2, width - 25.5, 35.5);
  ctx.stroke();

  // 4. Radial Gradient Sphere
  const radGrad = ctx.createRadialGradient(width - 50, height - 50, 5, width - 50, height - 50, 35);
  radGrad.addColorStop(0, "#f9d423");
  radGrad.addColorStop(1, "#ff4e50");
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(width - 50, height - 50, 30, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Stage 3: Full Composite High-Entropy Fingerprint Scene
 * Standard multi-attribute fingerprinting scene triggering font engine heuristics.
 */
export function renderFullScene(ctx, width, height) {
  // 1. Soft Background
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, width, height);

  // 2. Multi-Font Fallback Chain & Ligatures
  ctx.textBaseline = "top";
  ctx.font = "16px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = "#111827";
  ctx.fillText("Fingerprint Inversion Audit", 12, 12);

  // 3. Sub-pixel Font Placement & Color Shifts
  ctx.font = "italic 13.5px 'Times New Roman', serif";
  ctx.fillStyle = "#4b5563";
  ctx.fillText("DirectWrite / FreeType Subpixel Raster", 12.35, 36.75);

  // 4. Unicode Symbols (Omega, Pi, Sigma, Copyright, Registered)
  ctx.font = "18px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#1e293b";
  ctx.fillText("Unicode Glyphs: \u03A9 \u03C0 \u2211 \u00A9 \u00AE", 12, 60);

  // 5. Global Composite Operation (Multiply / Screen)
  ctx.save();
  ctx.globalCompositeOperation = "multiply";

  ctx.fillStyle = "rgba(239, 68, 68, 0.75)";
  ctx.beginPath();
  ctx.arc(width - 80, 85, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(59, 130, 246, 0.75)";
  ctx.beginPath();
  ctx.arc(width - 50, 105, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // 6. Complex path with dashes and quadratic curves
  ctx.save();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 2]);
  ctx.beginPath();
  ctx.moveTo(12, height - 30);
  ctx.quadraticCurveTo(width / 2, height - 60, width - 15, height - 20);
  ctx.stroke();
  ctx.restore();

  // 7. Small micro-pattern in corner
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(width - 25 + i * 4, 10, 4, 15);
  }
}
