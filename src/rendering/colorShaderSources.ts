/**
 * The shared colour-space and alpha-association helper sources every draw stage
 * that samples colour composes.
 *
 * Two rules hold across both backends and every source kind, and this module
 * exists so they cannot be restated per path:
 *
 * - **Association is applied once, here.** A sampled colour is associated by
 *   {@link colorShaderSourcesWgsl}'s `associateSampledColor` and nothing else,
 *   from the engine's resolved per-source answer. No draw path infers the
 *   association from the backend it runs on, from the texture class it holds, or
 *   from the sampled value.
 * - **A transfer function runs only for an undecoded authoring byte.** A sample
 *   taken through an sRGB view is already linear, so `srgbToLinear` must not
 *   follow one. The resolved storage format decides, not the shader.
 * - **An authored value is decoded where it is read.** A packed vertex tint or
 *   a node colour is never sampled through a storage format, so nothing decodes
 *   it on the way to the shader: each draw stage calls `srgbToLinear` on that
 *   RGB exactly once, and never on its alpha, which is coverage rather than
 *   colour.
 *
 * `forceOpaqueSampleAlpha` covers the one format that cannot be answered by
 * association alone: a native block format with no alpha channel is stored as
 * RGBA where a backend requires it, so its alpha is forced to one before
 * anything reads it. That is distinct from punchthrough BC1, whose alpha is real
 * data. The two resolve to mutually exclusive flags - an opaque source never
 * asks for association - so a source carrying both is a resolution bug, not a
 * redundant pair of steps.
 *
 * The composed sources and the splice helper are re-exported from
 * `@codexo/exojs/renderer-sdk` for a package outside Core (a particle, tilemap
 * or lighting renderer) that authors its own colour and needs the same
 * contract; `resolveTransformTextureGlsl`-style internal machinery stays out
 * of that surface.
 */

import colorShaderSourcesGlslModule from './shaders/color-transfer.frag';
import colorShaderSourcesWgslModule from './shaders/color-transfer.wgsl';

/**
 * WGSL colour helpers: `srgbToLinear`, `linearToSrgb`, `associateSampledColor`
 * and `forceOpaqueSampleAlpha`.
 *
 * Compose this ahead of any WGSL that calls one of them, in both the vertex and
 * the fragment stage. Helpers are functions, so a stage only needs the ones it
 * calls; composing the whole source keeps every stage's colour contract
 * identical.
 */
export const colorShaderSourcesWgsl = colorShaderSourcesWgslModule;

/**
 * GLSL ES 3.00 colour helpers with the same names and signatures as
 * {@link colorShaderSourcesWgsl}.
 *
 * A chunk rather than a stage: it carries no `#version` and no `main`, because
 * the shader it is spliced into owns both.
 */
export const colorShaderSourcesGlsl = colorShaderSourcesGlslModule;

/**
 * Splice `prologue` into a GLSL ES 3.00 source, after the run of leading
 * `#version`/`#extension`/`#pragma`/`#line` directives and `precision`
 * statements (plus blank lines and line comments) and before the first
 * declaration.
 *
 * A GLSL ES 3.00 unit starts with its own `#version` directive, which must be
 * the first token in the unit, so the prologue cannot simply be prepended.
 */
export const spliceGlslPrologue = (source: string, prologue: string): string => {
  const lines = source.split('\n');
  let insertAt = 0;

  for (let index = 0; index < lines.length; index++) {
    // In-bounds: index < lines.length via the loop guard.
    const line = lines[index]!.trim();

    if (line === '' || line.startsWith('//')) {
      continue;
    }

    if (
      line.startsWith('#version') ||
      line.startsWith('#extension') ||
      line.startsWith('#pragma') ||
      line.startsWith('#line') ||
      line.startsWith('precision ')
    ) {
      insertAt = index + 1;
      continue;
    }

    break;
  }

  return [...lines.slice(0, insertAt), prologue, ...lines.slice(insertAt)].join('\n');
};
