/**
 * Structural parity between the GLSL and WGSL halves of every stock shader pair.
 *
 * The engine keeps two hand-written sources per effect rather than generating
 * one from the other, so nothing but a test stops the two from drifting apart.
 * Pixel parity catches drift only where a browser with both backends runs the
 * effect and the difference is visible; this reads the sources themselves and
 * compares what they DECLARE - uniform names and their order, texture and
 * sampler slots, the varying the fragment stage receives, and the entry points
 * the pipeline binds.
 *
 * Deliberately structural, not semantic: it does not check that the two shaders
 * compute the same thing (that is what the browser parity fixtures are for). It
 * checks that they agree on the interface the renderer binds against, which is
 * where silent drift produces a wrong-looking or outright broken second backend.
 */
import { colorMatrixShaderSource } from '#rendering/filters/ColorMatrixFilter';
import { displacementShaderSource } from '#rendering/filters/DisplacementFilter';
import { dropShadowShaderSource } from '#rendering/filters/DropShadowFilter';
import { lut3dShaderSource, lutRgb1dShaderSource } from '#rendering/filters/LutFilter';
import type { ShaderSource } from '#rendering/material/ShaderSource';

// ---------------------------------------------------------------------------
// The pairs under test
// ---------------------------------------------------------------------------

const pairs: ReadonlyArray<{ readonly name: string; readonly source: ShaderSource }> = [
  { name: 'ColorMatrixFilter', source: colorMatrixShaderSource },
  { name: "LutFilter 'rgb1d'", source: lutRgb1dShaderSource },
  { name: "LutFilter '3d'", source: lut3dShaderSource },
  { name: 'DropShadowFilter', source: dropShadowShaderSource },
  { name: 'DisplacementFilter', source: displacementShaderSource },
];

/**
 * Uniforms both languages receive automatically, bound by the filter rather
 * than by the author, and therefore excluded from the user-uniform comparison.
 */
const autoBoundNames = new Set(['uTexture', 'uSampler', 'uResolution', 'uOrientation']);

/** GLSL sampler types, which become texture bindings rather than UBO members. */
const glslSamplerTypes = new Set(['sampler2D', 'sampler2DArray', 'sampler3D', 'samplerCube']);

/** GLSL type ↔ WGSL type, for the pairs the filter uniform packer supports. */
const wgslTypeForGlsl: Readonly<Record<string, string>> = {
  float: 'f32',
  int: 'i32',
  uint: 'u32',
  vec2: 'vec2<f32>',
  vec3: 'vec3<f32>',
  vec4: 'vec4<f32>',
  ivec2: 'vec2<i32>',
  ivec3: 'vec3<i32>',
  ivec4: 'vec4<i32>',
  mat2: 'mat2x2<f32>',
  mat3: 'mat3x3<f32>',
  mat4: 'mat4x4<f32>',
  sampler2D: 'texture_2d<f32>',
};

// ---------------------------------------------------------------------------
// Source readers - regex-level, no grammar. Enough for the declarations the
// filter contract pins down, and nothing beyond them.
// ---------------------------------------------------------------------------

interface Declaration {
  readonly name: string;
  readonly type: string;
}

const stripComments = (source: string): string => {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
};

const matchAll = (source: string, pattern: RegExp): RegExpExecArray[] => {
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const results: RegExpExecArray[] = [];
  let match: RegExpExecArray | null = regex.exec(source);

  while (match !== null) {
    results.push(match);
    match = regex.exec(source);
  }

  return results;
};

/** `uniform <type> <name>;` in declaration order. */
const glslUniforms = (source: string): Declaration[] => {
  return matchAll(stripComments(source), /\buniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(\w+)\s+(\w+)\s*;/).map(m => ({ type: m[1]!, name: m[2]! }));
};

/** `in <type> <name>;` / `out <type> <name>;` at file scope, in order. */
const glslStageVariables = (source: string, direction: 'in' | 'out'): Declaration[] => {
  return matchAll(stripComments(source), new RegExp(`^\\s*${direction}\\s+(\\w+)\\s+(\\w+)\\s*;`, 'm')).map(m => ({ type: m[1]!, name: m[2]! }));
};

interface WgslBinding extends Declaration {
  readonly group: number;
  readonly binding: number;
}

/** `@group(g) @binding(b) var[<...>] name: type;`, sorted by group then binding. */
const wgslBindings = (source: string): WgslBinding[] => {
  return matchAll(stripComments(source), /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/)
    .map(m => ({ group: Number(m[1]), binding: Number(m[2]), name: m[3]!, type: m[4]!.trim() }))
    .sort((a, b) => a.group - b.group || a.binding - b.binding);
};

/** Members of `struct <name> { ... }`, in declaration order. */
const wgslStructMembers = (source: string, structName: string): Declaration[] => {
  const body = new RegExp(`struct\\s+${structName}\\s*\\{([^}]*)\\}`).exec(stripComments(source));

  if (body === null) {
    return [];
  }

  return matchAll(body[1]!, /(\w+)\s*:\s*([^,;]+)[,;]/).map(m => ({ name: m[1]!, type: m[2]!.trim() }));
};

interface WgslEntryPoint {
  readonly name: string;
  readonly parameters: ReadonlyArray<Declaration & { readonly location: number }>;
}

/** The `@vertex` / `@fragment` entry point and its `@location(n)` parameters. */
const wgslEntryPoint = (source: string, stage: 'vertex' | 'fragment'): WgslEntryPoint | null => {
  // The parameter list itself contains `)` (every `@location(n)`), so it runs
  // to the LAST `)` before the return arrow or the body.
  const match = new RegExp(`@${stage}\\s+fn\\s+(\\w+)\\s*\\(([\\s\\S]*?)\\)\\s*(?:->|\\{)`).exec(stripComments(source));

  if (match === null) {
    return null;
  }

  return {
    name: match[1]!,
    parameters: matchAll(match[2]!, /@location\(\s*(\d+)\s*\)\s*(\w+)\s*:\s*([\w<>]+)/).map(m => ({ location: Number(m[1]), name: m[2]!, type: m[3]! })),
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(pairs)('$name shader pair', ({ source }) => {
  test('ships both languages', () => {
    // A stock filter that carried only one language would crash on the other
    // backend under `backend: 'auto'` - the whole reason the pair exists.
    expect(source.glsl).not.toBeNull();
    expect(source.wgsl).not.toBeNull();
  });

  test('binds the same entry points the pipeline asks for', () => {
    expect(wgslEntryPoint(source.wgsl!, 'vertex')?.name).toBe('vertexMain');
    expect(wgslEntryPoint(source.wgsl!, 'fragment')?.name).toBe('fragmentMain');
  });

  test('declares the same fullscreen-quad attributes on both sides', () => {
    const glslAttributes = glslStageVariables(source.glsl!.vertex ?? '', 'in');
    const wgslAttributes = wgslEntryPoint(source.wgsl!, 'vertex')!.parameters;

    expect(glslAttributes.map(a => a.name)).toEqual(['aPosition', 'aUv']);
    expect(wgslAttributes.map(a => a.name)).toEqual(['aPosition', 'aUv']);
    // The vertex buffer layout is hard-coded: slot 0 is position, slot 1 is UV.
    expect(wgslAttributes.map(a => a.location)).toEqual([0, 1]);
    expect(wgslAttributes.map(a => wgslTypeForGlsl[glslAttributes[wgslAttributes.indexOf(a)]!.type])).toEqual(wgslAttributes.map(a => a.type));
  });

  test('passes the same varying into the fragment stage', () => {
    const glslVarying = glslStageVariables(source.glsl!.fragment, 'in').find(v => v.name === 'vUv');
    const wgslVarying = wgslEntryPoint(source.wgsl!, 'fragment')!.parameters.find(p => p.name === 'vUv');

    expect(glslVarying).toBeDefined();
    expect(wgslVarying).toBeDefined();
    expect(wgslVarying!.location).toBe(0);
    expect(wgslTypeForGlsl[glslVarying!.type]).toBe(wgslVarying!.type);
  });

  test('takes the filter input through the same auto-bound slots', () => {
    const glslInput = glslUniforms(source.glsl!.fragment).find(u => u.name === 'uTexture');
    const autoBindings = wgslBindings(source.wgsl!).filter(b => b.group === 0);

    expect(glslInput?.type).toBe('sampler2D');
    // group 0 is the filter's own: resolution at 0, input texture at 1, its
    // sampler at 2. A source may leave out the entries it does not read.
    expect(autoBindings.find(b => b.name === 'uTexture')).toMatchObject({ binding: 1, type: 'texture_2d<f32>' });
    expect(autoBindings.find(b => b.name === 'uSampler')).toMatchObject({ binding: 2, type: 'sampler' });
    expect(autoBindings.every(b => autoBoundNames.has(b.name))).toBe(true);

    // The v-axis orientation follows at 3. A pair declares it on both sides or
    // on neither: a source that turns a directional offset the right way up on
    // one backend only is exactly the drift this file exists to catch.
    const wgslOrientation = autoBindings.find(b => b.name === 'uOrientation');
    const glslOrientation = glslUniforms(source.glsl!.fragment).find(u => u.name === 'uOrientation');

    expect(wgslOrientation === undefined).toBe(glslOrientation === undefined);

    if (wgslOrientation !== undefined) {
      expect(wgslOrientation).toMatchObject({ binding: 3, type: 'f32' });
      expect(glslOrientation!.type).toBe('float');
    }
  });

  test('declares the same user uniforms, in the same order and of matching types', () => {
    // Order is load-bearing on WebGPU: every non-texture uniform is packed into
    // one buffer, one 16-byte slot each, in the order the filter was given them
    // - so a reordered WGSL struct reads another uniform's bytes.
    const glslScalars = glslUniforms(source.glsl!.fragment).filter(u => !autoBoundNames.has(u.name) && !glslSamplerTypes.has(u.type));
    const userUniformBinding = wgslBindings(source.wgsl!).find(b => b.group === 1 && b.binding === 0);
    const wgslScalars = userUniformBinding !== undefined ? wgslStructMembers(source.wgsl!, userUniformBinding.type) : [];

    expect(wgslScalars.map(u => u.name)).toEqual(glslScalars.map(u => u.name));
    expect(wgslScalars.map(u => u.type)).toEqual(glslScalars.map(u => wgslTypeForGlsl[u.type]));
  });

  test('declares the same user textures, in the same slot order', () => {
    // GLSL claims texture slots 1..N in declaration order; WGSL claims
    // `@group(1) @binding(1, 3, 5, ...)` in the same order. Both are derived from
    // the one uniform record, so the two lists have to line up.
    const glslTextures = glslUniforms(source.glsl!.fragment).filter(u => !autoBoundNames.has(u.name) && glslSamplerTypes.has(u.type));
    const wgslTextures = wgslBindings(source.wgsl!).filter(b => b.group === 1 && b.binding > 0 && b.type.startsWith('texture_'));

    expect(wgslTextures.map(t => t.name)).toEqual(glslTextures.map(t => t.name));
    expect(wgslTextures.map(t => t.type)).toEqual(glslTextures.map(t => wgslTypeForGlsl[t.type]));
  });
});
