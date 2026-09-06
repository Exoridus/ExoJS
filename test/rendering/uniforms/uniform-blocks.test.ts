/**
 * Runtime behaviour of a typed uniform block: what a fresh instance starts
 * from, what an accessor write costs, and when the revision a backend uploads
 * against actually moves.
 *
 * The revision is the whole contract between the accessors and both backends -
 * a write that fails to move it is a value that never reaches the GPU, and one
 * that moves it needlessly is an upload per frame - so it is asserted directly
 * rather than through a backend.
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Vector } from '#math/Vector';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Shader } from '#rendering/shader/Shader';
import { UniformArray, UniformStruct } from '#rendering/uniforms/uniformDeclarations';
import { UniformType } from '#rendering/uniforms/UniformType';

const GLSL = /* glsl */ `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() { fragColor = vec4(uniforms.time); }
`;

const GLSL_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const declaration = {
  time: UniformType.Float,
  steps: UniformType.Int,
  flags: UniformType.Uint,
  origin: UniformType.Vec2,
  tint: UniformType.Vec4,
  view: UniformType.Mat3,
  rows: new UniformArray(UniformType.Vec4, 2),
  custom: new UniformStruct({ shift: UniformType.Vec2, strength: UniformType.Float }),
} as const;

const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL }, uniforms: declaration });

const build = (): MeshMaterial<typeof declaration> => new MeshMaterial({ shader: source });

describe('uniform block values', () => {
  test('every field starts at zero, matrices included', () => {
    const material = build();

    expect(material.uniforms.time.value).toBe(0);
    expect(material.uniforms.tint.x).toBe(0);
    expect([...material._blocks[0]!.float32]).toEqual(new Array(material._blocks[0]!.byteLength / 4).fill(0));
  });

  test('declared defaults reach a fresh instance, including nested ones', () => {
    const withDefaults = new Shader({
      glsl: { vertex: GLSL_VERTEX, fragment: GLSL },
      uniforms: {
        time: { type: UniformType.Float, default: 2.5 },
        origin: { type: UniformType.Vec2, default: [10, 20] },
        custom: new UniformStruct({ strength: { type: UniformType.Float, default: 0.75 } }),
      },
    });
    const material = new MeshMaterial({ shader: withDefaults });

    expect(material.uniforms.time.value).toBe(2.5);
    expect(material.uniforms.origin.x).toBe(10);
    expect(material.uniforms.origin.y).toBe(20);
    expect(material.uniforms.custom.strength.value).toBe(0.75);
  });

  test('construction-time values override the declaration', () => {
    const material = new MeshMaterial({ shader: source, uniforms: { time: 4, tint: [1, 0, 0, 1] } });

    expect(material.uniforms.time.value).toBe(4);
    expect(material.uniforms.tint.x).toBe(1);
  });

  test('one source backs several instances without sharing their values', () => {
    const first = build();
    const second = build();

    first.uniforms.time.set(7);

    expect(first.uniforms.time.value).toBe(7);
    expect(second.uniforms.time.value).toBe(0);
    expect(first._blocks[0]!.float32).not.toBe(second._blocks[0]!.float32);
  });

  test('a write advances the revision once, and only when a component changed', () => {
    const material = build();
    const block = material._blocks[0]!;
    const before = block.revision;

    material.uniforms.tint.set(1, 0.5, 0, 1);
    expect(block.revision).toBe(before + 1);

    material.uniforms.tint.set(1, 0.5, 0, 1);
    expect(block.revision).toBe(before + 1);

    material.uniforms.tint.set(1, 0.5, 0, 0.25);
    expect(block.revision).toBe(before + 2);
  });

  test('a value the buffer cannot represent exactly still settles', () => {
    const material = build();
    const block = material._blocks[0]!;

    material.uniforms.time.set(0.1);

    const settled = block.revision;

    material.uniforms.time.set(0.1);

    expect(block.revision).toBe(settled);
  });

  test('an integer field truncates once and then reports no change', () => {
    const material = build();
    const block = material._blocks[0]!;

    material.uniforms.steps.set(3);
    material.uniforms.flags.set(7);

    const settled = block.revision;

    material.uniforms.steps.set(3);
    material.uniforms.flags.set(7);

    expect(block.revision).toBe(settled);
    expect(block.int32[1]).toBe(3);
    expect(block.uint32[2]).toBe(7);
  });

  test('a bulk write advances the revision once for the whole record', () => {
    const material = build();
    const block = material._blocks[0]!;
    const before = block.revision;

    block.set({ time: 1, origin: [2, 3], tint: [4, 5, 6, 7] });

    expect(block.revision).toBe(before + 1);
    expect(material.uniforms.origin.y).toBe(3);
    expect(material.uniforms.tint.w).toBe(7);
  });

  test('accessors are built once and handed out by identity', () => {
    const material = build();

    expect(material.uniforms.tint).toBe(material.uniforms.tint);
    expect(material.uniforms.rows.at(1)).toBe(material.uniforms.rows.at(1));
    expect(material.uniforms.rows.at(0)).not.toBe(material.uniforms.rows.at(1));
    expect(material.uniforms.custom.shift).toBe(material.uniforms.custom.shift);
  });

  test('array elements address their own 16-byte slots', () => {
    const material = build();
    const block = material._blocks[0]!;
    // rows sits at byte 96: time/steps/flags 0..12, origin 16, tint 32, view 48..96.
    const rowsFloat = 96 / 4;

    material.uniforms.rows.at(0).set(1, 2, 3, 4);
    material.uniforms.rows.at(1).set(5, 6, 7, 8);

    expect([...block.float32.subarray(rowsFloat, rowsFloat + 8)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('a Vector, a Color and a Matrix are accepted where the field type is unambiguous', () => {
    const material = build();

    material.uniforms.origin.set(new Vector(3, 4));
    material.uniforms.tint.set(new Color(255, 128, 0, 0.5));
    material.uniforms.view.set(new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9));

    expect(material.uniforms.origin.x).toBe(3);
    expect(material.uniforms.origin.y).toBe(4);
    expect(material.uniforms.tint.x).toBe(1);
    expect(material.uniforms.tint.y).toBeCloseTo(128 / 255, 5);
    expect(material.uniforms.tint.w).toBe(0.5);

    // Three columns in 16-byte slots: (a, c, e), (b, d, f), (x, y, z).
    const view = material._blocks[0]!.float32.subarray(48 / 4, 96 / 4);

    expect([...view]).toEqual([1, 4, 7, 0, 2, 5, 8, 0, 3, 6, 9, 0]);
  });

  test('the raw views are an escape hatch that needs commit', () => {
    const material = build();
    const block = material._blocks[0]!;
    const before = block.revision;

    block.float32[0] = 9;
    expect(block.revision).toBe(before);

    block.commit();
    expect(block.revision).toBe(before + 1);
  });

  test('setPacked replaces the whole block and rejects a wrong length', () => {
    const material = build();
    const block = material._blocks[0]!;
    const packed = new Float32Array(block.byteLength / 4).fill(2);
    const before = block.revision;

    block.setPacked(packed);

    expect(block.revision).toBe(before + 1);
    expect(material.uniforms.time.value).toBe(2);
    expect(() => block.setPacked(new Float32Array(4))).toThrow(/holds 144 bytes; received 16/);
  });

  test('a wrong shape names the field, the expected type and what arrived', () => {
    const material = build();

    expect(() => material._blocks[0]!.set({ tint: 5 as never })).toThrow(/uniforms\.tint.*four numbers.*number `5`/);
    expect(() => material._blocks[0]!.set({ origin: {} as never })).toThrow(/uniforms\.origin.*two numbers.*object with keys \[\]/);
    expect(() => material._blocks[0]!.set({ nope: 1 } as never)).toThrow(/has no field `nope`/);
    expect(() => material.uniforms.custom.set({ nope: 1 } as never)).toThrow(/uniforms\.custom.*has no field `nope`/);
  });

  test('an out-of-range array index is reported rather than silently ignored', () => {
    const material = build();

    expect(() => material.uniforms.rows.at(2)).toThrow(/has 2 elements; index 2 is out of range/);
    expect(() =>
      material.uniforms.rows.set([
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ]),
    ).toThrow(/holds 2 elements; received 3/);
  });

  test('the untyped setters are gone once a schema is declared', () => {
    const material = build();

    expect(() => material.setUniform('time' as never, 1)).toThrow(/not available on a shader source that declares uniforms/);
  });

  test('a source without a declaration keeps the untyped record', () => {
    const raw = new Shader({
      glsl: { vertex: GLSL_VERTEX, fragment: '#version 300 es\nprecision mediump float;\nout vec4 c;\nvoid main(){c=vec4(1);}' },
    });
    const material = new MeshMaterial({ shader: raw, uniforms: { u_time: 1 } });

    expect(raw.uniformSchema).toBeNull();
    expect(material._blocks).toHaveLength(0);
    expect(material.uniforms.u_time).toBe(1);

    material.setUniform('u_time', 2);

    expect(material.uniforms.u_time).toBe(2);
  });
});
