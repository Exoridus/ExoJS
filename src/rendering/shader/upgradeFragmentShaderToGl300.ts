/**
 * Upgrades legacy GLSL ES 1.00 fragment shader source to GLSL ES 3.00.
 *
 * If the source already has `#version 300 es` directive, returned unchanged.
 *
 * Transformations applied (1.00 → 3.00):
 *   - Adds `#version 300 es` header
 *   - Adds `precision highp float;` (always — required because the
 *     `out vec4 fragColor;` declaration immediately below uses a
 *     float-typed variable; GLSL ES 3.00 requires precision to be
 *     declared before any float-typed declaration). User precision
 *     declarations later in the source are still respected for
 *     subsequent code (last-precision-wins semantics).
 *   - Adds `out vec4 fragColor;` declaration
 *   - `gl_FragColor` → `fragColor` (word-boundary aware)
 *   - `texture2D(` → `texture(`
 *   - `textureCube(` → `texture(`
 *   - `texture2DProj(` → `textureProj(`
 *   - `varying` → `in`
 *
 * NOT supported (these will produce GLSL compile errors that the user must
 * manually port):
 *   - `gl_FragData[N]` (multi-render-target output) — requires multiple
 *     `out` declarations with `layout(location=N)`
 *   - `texture2DLod` / `textureCubeLod` — semantics depend on context;
 *     map to `textureLod` manually
 *   - `gl_FragDepthEXT` (extension) — use `gl_FragDepth` directly
 *
 * Note: `varying` inside comments will also be replaced. This is expected
 * behaviour and documented explicitly.
 *
 * Idempotent — calling twice returns the same source.
 */
export function upgradeFragmentShaderToGl300(source: string): string {
  // Already 3.00 → return unchanged
  if (/^\s*#version\s+300\s+es/.test(source)) {
    return source;
  }

  // Strip any older #version directive
  const stripped = source.replace(/^\s*#version[^\n]*\n/, '');

  // Token-level replacements (word-boundary safe)
  const transformed = stripped
    .replaceAll(/\bgl_FragColor\b/g, 'fragColor')
    .replaceAll(/\btexture2D(?=\s*\()/g, 'texture')
    .replaceAll(/\btextureCube(?=\s*\()/g, 'texture')
    .replaceAll(/\btexture2DProj(?=\s*\()/g, 'textureProj')
    .replaceAll(/\bvarying\b/g, 'in');

  // Build header. Precision MUST be set before `out vec4 fragColor;`
  // because GLSL ES 3.00 requires precision declared before any
  // float-typed declaration. If the user has their own precision later
  // in the source, GLSL's last-precision-wins rule means their
  // preference applies to their own code; ours just covers fragColor.
  const header = '#version 300 es\n' + 'precision highp float;\n' + 'out vec4 fragColor;\n';

  return header + transformed;
}
