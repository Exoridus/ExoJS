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
 *
 * `forceOpaqueSampleAlpha` covers the one format that cannot be answered by
 * association alone: a native block format with no alpha channel is stored as
 * RGBA where a backend requires it, so its alpha is forced to one before
 * anything reads it. That is distinct from punchthrough BC1, whose alpha is real
 * data. The two resolve to mutually exclusive flags - an opaque source never
 * asks for association - so a source carrying both is a resolution bug, not a
 * redundant pair of steps.
 *
 * @internal - not part of the public package surface.
 */

import { COLOR_PIPELINE_ENABLED } from '#rendering/colorPipelineActivation';

import colorShaderSourcesGlslModule from './shaders/color-transfer.frag';
import colorShaderSourcesWgslModule from './shaders/color-transfer.wgsl';

/**
 * WGSL colour helpers: `srgbToLinear`, `linearToSrgb`, `associateSampledColor`
 * and `forceOpaqueSampleAlpha`, plus a `colorPipelineEnabled` constant mirroring
 * {@link COLOR_PIPELINE_ENABLED}.
 *
 * `colorPipelineEnabled` gates the one shader-side behaviour that has no
 * per-resource opt-in the way a `Texture`'s `colorSpace` does: decoding an
 * AUTHORED value (a packed vertex tint, not a sampled texel) is either always
 * correct or always wrong for a given draw, so it cannot be driven by
 * anything the draw call carries. Compiled as a WGSL `const`, a driver folds
 * `select(a, b, colorPipelineEnabled)` down to `a` while the constant is
 * `false`, so the legacy path stays the exact bytes it always produced - not
 * an equivalent computation, no computation at all.
 *
 * Compose this ahead of any WGSL that calls one of them, in both the vertex and
 * the fragment stage. Helpers are functions, so a stage only needs the ones it
 * calls; composing the whole source keeps every stage's colour contract
 * identical.
 * @internal
 */
export const colorShaderSourcesWgsl = `const colorPipelineEnabled: bool = ${String(COLOR_PIPELINE_ENABLED)};
${colorShaderSourcesWgslModule}`;

/**
 * GLSL ES 3.00 colour helpers with the same names, signatures and constants as
 * {@link colorShaderSourcesWgsl}, including `colorPipelineEnabled`.
 *
 * A chunk rather than a stage: it carries no `#version` and no `main`, because
 * the shader it is spliced into owns both.
 * @internal
 */
export const colorShaderSourcesGlsl = `const bool colorPipelineEnabled = ${String(COLOR_PIPELINE_ENABLED)};
${colorShaderSourcesGlslModule}`;

/**
 * Splice `prologue` into a GLSL ES 3.00 source, after the run of leading
 * `#version`/`#extension`/`#pragma`/`#line` directives and `precision`
 * statements (plus blank lines and line comments) and before the first
 * declaration.
 *
 * A GLSL ES 3.00 unit starts with its own `#version` directive, which must be
 * the first token in the unit, so the prologue cannot simply be prepended.
 * @internal
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
