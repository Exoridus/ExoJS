/**
 * The canonical uniform-block layout, against a hand-written offset table.
 *
 * The table below is derived from the two specifications by hand rather than
 * from the implementation: GLSL `std140` (OpenGL ES 3.0, section 2.12.6.4) and
 * the WGSL uniform address space, which agree on every construct the schema can
 * express. Everything else in the feature - the generated declarations, the
 * accessors, both backends' uploads - is built on these offsets, so this is the
 * one place where being wrong is not caught by anything downstream.
 *
 * The generated declarations are asserted in full for the same reason: the WGSL
 * `@align`/`@size` attributes are what force the aggregate offsets, and their
 * absence would silently produce a different layout rather than an error.
 */

import { describe, expect, test } from 'vitest';

import { UniformArray, UniformBlock, UniformStruct } from '#rendering/uniforms/uniformDeclarations';
import type { UniformNodeLayout } from '#rendering/uniforms/uniformLayout';
import { buildUniformSchemaLayout } from '#rendering/uniforms/uniformSchema';
import { generateGlslUniformDeclarations, generateWgslUniformDeclarations } from '#rendering/uniforms/uniformSource';
import { UniformType } from '#rendering/uniforms/UniformType';

const everyVariant = {
  time: UniformType.Float,
  flags: UniformType.Uint,
  steps: UniformType.Int,
  origin: UniformType.Vec2,
  normal: UniformType.Vec3,
  tint: UniformType.Vec4,
  view: UniformType.Mat3,
  projection: UniformType.Mat4,
  rows: new UniformArray(UniformType.Vec4, 3),
  custom: new UniformStruct({ shift: UniformType.Vec2, strength: UniformType.Float }),
  lights: new UniformArray(new UniformStruct({ color: UniformType.Vec4, radius: UniformType.Float }), 2),
  tail: UniformType.Float,
} as const;

/**
 * `path -> [byte offset, byte size]`, worked out by hand.
 *
 * The running cursor: `time` 0..4, `flags` 4..8, `steps` 8..12; `origin` is a
 * `vec2` so it aligns to 8 (16); `normal` aligns to 16 and occupies 12, not 16;
 * `tint` therefore starts at 48, not 44. `view` is three `vec3` columns in
 * 16-byte slots (48 bytes), `projection` four `vec4` columns. An array's
 * element stride rounds up to 16, and a struct aligns to 16 and pads to a
 * multiple of it - which is what gives `lights` a 32-byte stride for 20 bytes
 * of content.
 */
const expectedOffsets: ReadonlyArray<readonly [path: string, offset: number, size: number]> = [
  ['time', 0, 4],
  ['flags', 4, 4],
  ['steps', 8, 4],
  ['origin', 16, 8],
  ['normal', 32, 12],
  ['tint', 48, 16],
  ['view', 64, 48],
  ['projection', 112, 64],
  ['rows', 176, 48],
  ['custom', 224, 16],
  ['custom.shift', 224, 8],
  ['custom.strength', 232, 4],
  ['lights', 240, 64],
  ['lights.color', 240, 16],
  ['lights.radius', 256, 4],
  ['tail', 304, 4],
];

const expectedByteLength = 320;

const flatten = (members: ReadonlyArray<{ readonly name: string; readonly node: UniformNodeLayout }>, prefix: string): Map<string, UniformNodeLayout> => {
  const flat = new Map<string, UniformNodeLayout>();

  for (const member of members) {
    const path = `${prefix}${member.name}`;

    flat.set(path, member.node);

    if (member.node.kind === 'struct') {
      for (const [key, node] of flatten(member.node.members, `${path}.`)) flat.set(key, node);
    }

    if (member.node.kind === 'array' && member.node.element.kind === 'struct') {
      for (const [key, node] of flatten(member.node.element.members, `${path}.`)) flat.set(key, node);
    }
  }

  return flat;
};

describe('uniform block layout', () => {
  const schema = buildUniformSchemaLayout(everyVariant, undefined)!;
  const block = schema.blocks[0]!;
  const flat = flatten(block.members, '');

  test.each(expectedOffsets)('%s sits at byte %d and occupies %d bytes', (path, offset, size) => {
    const node = flat.get(path);

    expect(node).toBeDefined();
    expect(node!.offset).toBe(offset);
    expect(node!.size).toBe(size);
  });

  test('the block is padded to a multiple of 16 bytes', () => {
    expect(block.byteLength).toBe(expectedByteLength);
    expect(block.byteLength % 16).toBe(0);
  });

  test('array elements stride by a multiple of 16', () => {
    const rows = flat.get('rows')!;
    const lights = flat.get('lights')!;

    expect(rows.kind).toBe('array');
    expect(lights.kind).toBe('array');
    expect(rows.kind === 'array' && rows.stride).toBe(16);
    expect(lights.kind === 'array' && lights.stride).toBe(32);
  });

  test('an array element type below a 16-byte stride is rejected at declaration', () => {
    expect(() => new UniformArray(UniformType.Float as never, 4)).toThrow(/stride below 16 bytes/);
    expect(() => new UniformArray(UniformType.Vec2 as never, 4)).toThrow(/stride below 16 bytes/);
  });

  test('the GLSL declaration spells the std140 block', () => {
    expect(generateGlslUniformDeclarations(schema)).toBe(
      [
        'struct ExoUniforms_custom {',
        '    highp vec2 shift;',
        '    highp float strength;',
        '};',
        'struct ExoUniforms_lights {',
        '    highp vec4 color;',
        '    highp float radius;',
        '};',
        'layout(std140) uniform ExoUniforms {',
        '    highp float time;',
        '    highp uint flags;',
        '    highp int steps;',
        '    highp vec2 origin;',
        '    highp vec3 normal;',
        '    highp vec4 tint;',
        '    highp mat3 view;',
        '    highp mat4 projection;',
        '    highp vec4 rows[3];',
        '    ExoUniforms_custom custom;',
        '    ExoUniforms_lights lights[2];',
        '    highp float tail;',
        '} uniforms;',
      ].join('\n'),
    );
  });

  test('the WGSL declaration carries the attributes that force the same offsets', () => {
    expect(generateWgslUniformDeclarations(schema, 2)).toBe(
      [
        'struct ExoUniforms_custom {',
        '    shift: vec2<f32>,',
        '    @size(8) strength: f32,',
        '};',
        'struct ExoUniforms_lights {',
        '    color: vec4<f32>,',
        '    @size(16) radius: f32,',
        '};',
        'struct ExoUniforms {',
        '    time: f32,',
        '    flags: u32,',
        '    steps: i32,',
        '    origin: vec2<f32>,',
        '    normal: vec3<f32>,',
        '    tint: vec4<f32>,',
        '    view: mat3x3<f32>,',
        '    projection: mat4x4<f32>,',
        '    @align(16) rows: array<vec4<f32>, 3>,',
        '    @align(16) custom: ExoUniforms_custom,',
        '    @align(16) lights: array<ExoUniforms_lights, 2>,',
        '    @size(16) tail: f32,',
        '};',
        '@group(2) @binding(0) var<uniform> uniforms: ExoUniforms;',
      ].join('\n'),
    );
  });

  test('named blocks take consecutive bindings in declaration order', () => {
    const explicit = buildUniformSchemaLayout(undefined, {
      camera: new UniformBlock({ projection: UniformType.Mat4 }),
      material: new UniformBlock({ tint: UniformType.Vec4, opacity: UniformType.Float }),
    })!;

    expect(explicit.implicit).toBe(false);
    expect(explicit.blocks.map(entry => entry.typeName)).toEqual(['ExoUniforms_camera', 'ExoUniforms_material']);
    expect(explicit.blocks.map(entry => entry.instance)).toEqual(['camera', 'material']);
    expect(generateWgslUniformDeclarations(explicit, 1)).toContain('@group(1) @binding(0) var<uniform> camera: ExoUniforms_camera;');
    expect(generateWgslUniformDeclarations(explicit, 1)).toContain('@group(1) @binding(1) var<uniform> material: ExoUniforms_material;');
  });

  test('`uniforms` and `uniformBlocks` cannot both be declared', () => {
    expect(() => buildUniformSchemaLayout(everyVariant, { camera: new UniformBlock({ tint: UniformType.Vec4 }) })).toThrow(/not both/);
  });
});
