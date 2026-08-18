import { type BitmapText } from '#rendering/text/BitmapText';
import { Text } from '#rendering/text/Text';

// ── Shared per-node data layout ──────────────────────────────────────────────
//
// 10 texels (40 floats) per node, packed identically by WebGl2TextRenderer
// (an RGBA32F data texture) and WebGpuTextRenderer (a storage buffer) - only
// the destination resource differs, never the bytes.
//
// Texel 0 : (a,  c,  0,  tx) - mat3 column-major: col0 + translate.x
// Texel 1 : (b,  d,  0,  ty) - mat3 column-major: col1 + translate.y
// Texel 2 : (r,  g,  b,  a ) - fillColor (linear 0-1)
// Texel 3 : (r,  g,  b,  a ) - outlineColor
// Texel 4 : (outlineMin, shadowAlpha, shadowBlur, gradientEnabled)
//             outlineMin = 0.5 → disabled; < 0.5 → enabled with that threshold
// Texel 5 : (r,  g,  b,  a ) - shadowColor
// Texel 6 : (shadowOffX_px, shadowOffY_px, gradientVertical, sdfRadius_logical)
// Texel 7 : (r,  g,  b,  a ) - gradientTop
// Texel 8 : (r,  g,  b,  a ) - gradientBottom
// Texel 9 : (minX, minY, w, h) - text block bounds (local space, for gradient UV)
//
// texel 0's spare `.z` carries the snap-mode flag the vertex shader reads to
// decide whether to snap the glyph origin to the device-pixel grid. Both
// shaders divide the shadow offset by the atlas page size (a per-batch
// uniform) to convert px → UV space.

/** Texels per packed node row. @internal */
export const textNodeDataTexels = 10;
/** Floats per packed node row (`textNodeDataTexels * 4`). @internal */
export const textNodeDataFloats = textNodeDataTexels * 4;

/**
 * Packs texels 0-1 (8 floats: world transform + snap-mode flag) for `node`
 * into `target` starting at float index `base`. Factored out of
 * {@link packTextNodeData} because the own-transform-move O(1) retained-batch
 * patch (`WebGl2TextRenderer._patchOwnTransformRow`,
 * `WebGpuTextRenderer._patchOwnTransformRow`) rewrites only this pair of
 * texels when a node moves, without touching the rest of its packed style.
 * @internal
 */
export function packTextNodeTransform(target: Float32Array, base: number, node: Text | BitmapText): void {
  // In-bounds: `toArray(false)` returns the fixed 9-element mat3 column-major array.
  const m = node.getGlobalTransform().toArray(false); // col-major: [a,c,0, b,d,0, tx,ty,1]

  target[base + 0] = m[0]!; // a
  target[base + 1] = m[1]!; // c
  target[base + 2] = node.pixelSnapMode; // snap-mode flag
  target[base + 3] = m[6]!; // tx
  target[base + 4] = m[3]!; // b
  target[base + 5] = m[4]!; // d
  target[base + 6] = m[5]!; // 0
  target[base + 7] = m[7]!; // ty
}

/**
 * Packs one node's full 10-texel (40-float) row - world transform, snap-mode
 * flag, fill/outline/shadow colors, shadow offset, gradient axis/colors, and
 * ink bounds - into `target` starting at float index `base`.
 *
 * Backend-free: this is the single implementation both `WebGl2TextRenderer`
 * and `WebGpuTextRenderer` call to fill their respective per-node data
 * resources (a `DataTexture` row and a storage-buffer row), so the layout
 * only has one implementation to test and keep the two backends in sync.
 * @internal
 */
export function packTextNodeData(target: Float32Array, base: number, node: Text | BitmapText): void {
  const style = node.style;

  // Transform (texels 0-1)
  packTextNodeTransform(target, base, node);

  // Fill color (texel 2)
  const fc = style.fillColor;
  target[base + 8] = fc.r / 255;
  target[base + 9] = fc.g / 255;
  target[base + 10] = fc.b / 255;
  target[base + 11] = fc.a;

  // Outline color (texel 3)
  const oc = style.outlineColor;
  target[base + 12] = oc.r / 255;
  target[base + 13] = oc.g / 255;
  target[base + 14] = oc.b / 255;
  target[base + 15] = oc.a;

  // Params (texel 4): outlineMin, shadowAlpha, shadowBlur, gradientEnabled
  // outlineMin = 0.5 → disabled; 0.5 - outlineWidth when enabled
  const outlineMin = style.outlineWidth > 0 ? Math.max(0, 0.5 - style.outlineWidth) : 0.5;
  target[base + 16] = outlineMin;
  target[base + 17] = style.shadowAlpha;
  // Shadow blur only. This used to carry a 0.03 floor because the same
  // number was the shader's antialiasing width, and a node without a shadow
  // still needed an edge to fade over; the shaders now derive that width per
  // fragment from the field's screen-space gradient, so a floor here would
  // only smear the shadow of a node that asked for none.
  target[base + 18] = style.shadowBlur * 0.1;
  target[base + 19] = style.gradientColors !== null ? 1 : 0;

  // Shadow color (texel 5)
  const sc = style.shadowColor;
  target[base + 20] = sc.r / 255;
  target[base + 21] = sc.g / 255;
  target[base + 22] = sc.b / 255;
  target[base + 23] = sc.a;

  // Shadow offset + gradient axis (texel 6)
  // Stored in ATLAS TEXELS; the shaders divide by the atlas page size to get
  // the UV offset. The style states the offset in LOGICAL pixels, and one
  // logical pixel is `rasterPixelRatio` texels - without the scale a shadow
  // would shorten by exactly that factor as the glyph raster got denser.
  const texelsPerLogicalPixel = node.rasterPixelRatio;
  target[base + 24] = style.shadowOffsetX * texelsPerLogicalPixel;
  target[base + 25] = style.shadowOffsetY * texelsPerLogicalPixel;
  target[base + 26] = style.gradientAxis === 'vertical' ? 1 : 0;
  // The node's SDF buffer radius in LOGICAL pixels, which is the field's scale:
  // the distance value moves by 1/radius per logical unit whatever the atlas
  // density. The fragment stage sizes its antialiased edge from it. Zero means
  // "unknown", which is the honest answer for a BitmapText - an offline MSDF
  // atlas carries no distance range - and selects the derivative fallback.
  target[base + 27] = node instanceof Text ? node.sdfRadius : 0;

  // Gradient top (texel 7) / bottom (texel 8)
  const gc = style.gradientColors;
  if (gc !== null) {
    target[base + 28] = gc[0].r / 255;
    target[base + 29] = gc[0].g / 255;
    target[base + 30] = gc[0].b / 255;
    target[base + 31] = gc[0].a;
    target[base + 32] = gc[1].r / 255;
    target[base + 33] = gc[1].g / 255;
    target[base + 34] = gc[1].b / 255;
    target[base + 35] = gc[1].a;
  } else {
    target[base + 28] = target[base + 29] = target[base + 30] = target[base + 31] = 0;
    target[base + 32] = target[base + 33] = target[base + 34] = target[base + 35] = 0;
  }

  // Text ink bounds (texel 9): (minX, minY, width, height)
  // The vertex shader uses these to compute normalized gradient UV, so it
  // needs the rectangle the glyph quads actually cover - not the advance
  // extent, whose origin is (0, 0) while the SDF quads start at a negative
  // offset.
  const ink = node.getLocalBounds();
  target[base + 36] = ink.x;
  target[base + 37] = ink.y;
  target[base + 38] = ink.width;
  target[base + 39] = ink.height;
}
