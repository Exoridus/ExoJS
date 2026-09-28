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
 * @internal
 */
export const colorShaderSourcesWgsl: string = colorShaderSourcesWgslModule;

/**
 * GLSL ES 3.00 colour helpers with the same names, signatures and constants as
 * {@link colorShaderSourcesWgsl}.
 *
 * A chunk rather than a stage: it carries no `#version` and no `main`, because
 * the shader it is spliced into owns both.
 * @internal
 */
export const colorShaderSourcesGlsl: string = colorShaderSourcesGlslModule;
