import { createFilterShader, type Shader, UniformType } from '@codexo/exojs';

import cascadeGatherTransportFragment from './shaders/cascade-gather-transport.frag';
import cascadeGatherTransportWgsl from './shaders/cascade-gather-transport.wgsl';
import cascadeTransportFragment from './shaders/cascade-transport.frag';
import cascadeTransportWgsl from './shaders/cascade-transport.wgsl';
import transportFragment from './shaders/transport.frag';
import transportWgsl from './shaders/transport.wgsl';
import transportFilterHead from './shaders/transport-filter.frag';

/**
 * What the transport chunk adds to a shader's uniform block, on top of
 * whatever that shader needs of its own.
 * @internal
 */
export const transportUniforms = {
  uGridOrigin: UniformType.Vec2,
  uGridCells: UniformType.Vec2,
  uMaskCells: UniformType.Vec2,
  uMaskBasis: UniformType.Vec4,
  uMaskOffset: UniformType.Vec2,
  uMaskBlocks: UniformType.Vec2,
  uCellSize: UniformType.Float,
  uTableWidth: UniformType.Float,
} as const;

/**
 * The tables and the mask, in the order a filter that binds them has to list
 * them: on WebGPU the numbering follows the order of the textures a filter was
 * created with, and this text spells that numbering out.
 */
const bindings = (names: readonly string[], language: 'glsl' | 'wgsl'): string =>
  names
    .map((name, index) =>
      language === 'glsl'
        ? `uniform sampler2D ${name};`
        : `@group(1) @binding(${index * 2 + 1}) var ${name}: texture_2d<f32>;\n@group(1) @binding(${index * 2 + 2}) var ${name}Sampler: sampler;`,
    )
    .join('\n');

/** The chunk's own textures, which every shader that walks binds. */
const WALK_TEXTURES = ['uSegments', 'uEmitters', 'uCells', 'uIndices', 'uMask', 'uMaskCoarse'] as const;

/**
 * A cascade level also reads what a surface it ends on gives back: the frame
 * the camera drew, for the albedo, and the light field of the previous frame,
 * for what fell on it.
 */
const CASCADE_TEXTURES = [...WALK_TEXTURES, 'uFrame', 'uHistory'] as const;

/**
 * What the bounce term needs on top of the chunk's own: the factor, how far
 * back along a ray the free side of a surface is, the camera this frame, and
 * where a point of it sat in the frame the light field was last gathered
 * through.
 * @internal
 */
export const transportBounceUniforms = {
  uToClip: UniformType.Vec4,
  uClipOffset: UniformType.Vec2,
  uReproject: UniformType.Vec4,
  uReprojectOffset: UniformType.Vec2,
  uBounce: UniformType.Float,
  uBounceStep: UniformType.Float,
  uAlbedoStep: UniformType.Float,
  uHistoryValid: UniformType.Float,
} as const;

const glsl = (textures: readonly string[], body: string): string =>
  `${transportFilterHead}
${bindings(textures, 'glsl')}

${transportFragment}

${body}`;

const wgsl = (textures: readonly string[], body: string): string =>
  `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
${bindings(textures, 'wgsl')}

${transportWgsl}

${body}`;

/**
 * The finest cascade read back out at each fragment, with the way from the
 * fragment to each of its four probes walked.
 * @internal
 */
export const transportGatherShader = <U extends Record<string, UniformType>>(uniforms: U): Shader<U & typeof transportUniforms> =>
  createFilterShader({
    glsl: { fragment: glsl(WALK_TEXTURES, cascadeGatherTransportFragment) },
    wgsl: wgsl(WALK_TEXTURES, cascadeGatherTransportWgsl),
    uniforms: { ...uniforms, ...transportUniforms },
  });

/**
 * One cascade level, walked over this frame's geometry and occluder mask.
 *
 * The uniform schema is the field walk's plus the chunk's, so the host sets
 * the same probe, interval and merge terms either way.
 * @internal
 */
export const transportCascadeShader = <U extends Record<string, UniformType>>(
  uniforms: U,
): Shader<U & typeof transportUniforms & typeof transportBounceUniforms> =>
  createFilterShader({
    glsl: { fragment: glsl(CASCADE_TEXTURES, cascadeTransportFragment) },
    wgsl: wgsl(CASCADE_TEXTURES, cascadeTransportWgsl),
    uniforms: { ...uniforms, ...transportUniforms, ...transportBounceUniforms },
  });
