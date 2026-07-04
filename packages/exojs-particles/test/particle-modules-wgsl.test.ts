/// <reference types="@webgpu/types" />

import { Color } from '@codexo/exojs';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Curve } from '../src/distributions/Curve';
import { AlphaFadeOverLifetime } from '../src/modules/AlphaFadeOverLifetime';
import { AttractToPoint } from '../src/modules/AttractToPoint';
import { ColorOverSpeed } from '../src/modules/ColorOverSpeed';
import { OrbitalForce } from '../src/modules/OrbitalForce';
import { RepelFromPoint } from '../src/modules/RepelFromPoint';
import { Turbulence } from '../src/modules/Turbulence';
import { VelocityOverLifetime } from '../src/modules/VelocityOverLifetime';
import { wgslFieldLayout, wgslUniformByteSize } from '../src/modules/WgslContribution';

// These modules' `wgsl()` / `writeUniforms()` pair is CPU-side codegen: it
// produces a WGSL source fragment (a string) and packs uniform bytes into a
// DataView. Neither requires a real GPU — only `ParticleGpuState`'s actual
// pipeline compile/dispatch needs a browser, and that's covered (with a
// mocked GPUDevice) by particle-gpu.test.ts. This file fills in module-level
// wgsl()/writeUniforms() coverage that the existing CPU apply()-focused
// tests don't exercise.

describe('WgslContribution helpers', () => {
  test('wgslFieldLayout reports size/align for every primitive', () => {
    expect(wgslFieldLayout('f32')).toEqual({ size: 4, align: 4 });
    expect(wgslFieldLayout('i32')).toEqual({ size: 4, align: 4 });
    expect(wgslFieldLayout('u32')).toEqual({ size: 4, align: 4 });
    expect(wgslFieldLayout('vec2<f32>')).toEqual({ size: 8, align: 8 });
    expect(wgslFieldLayout('vec4<f32>')).toEqual({ size: 16, align: 16 });
  });

  test('wgslUniformByteSize packs scalars tightly', () => {
    // Two f32s (4 bytes, 4-align each) pack to 8 bytes, rounded to the
    // struct's own 4-byte alignment.
    const size = wgslUniformByteSize([
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'f32' },
    ]);

    expect(size).toBe(8);
  });

  test('wgslUniformByteSize pads scalar-then-vec2 to the vec2 alignment', () => {
    // f32 (offset 0..4) then vec2<f32> (needs 8-byte alignment) pads to
    // offset 8, ending at 16; struct rounds to the largest alignment (8).
    const size = wgslUniformByteSize([
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'vec2<f32>' },
    ]);

    expect(size).toBe(16);
  });

  test('wgslUniformByteSize rounds the whole struct up to the largest field alignment', () => {
    // f32 (4) + vec4<f32> (16-aligned) -> field starts at 16, ends at 32;
    // struct alignment is 16, 32 is already a multiple so no extra padding.
    const size = wgslUniformByteSize([
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'vec4<f32>' },
    ]);

    expect(size).toBe(32);
  });

  test('wgslUniformByteSize of an empty field list is zero', () => {
    expect(wgslUniformByteSize([])).toBe(0);
  });
});

describe('AttractToPoint wgsl contribution', () => {
  test('wgsl() declares the point/strength/falloff uniforms', () => {
    const mod = new AttractToPoint(10, 20, 500, 50);
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('AttractToPoint');
    expect(contribution.uniforms).toEqual([
      { name: 'point', type: 'vec2<f32>' },
      { name: 'strength', type: 'f32' },
      { name: 'falloff', type: 'f32' },
    ]);
    expect(contribution.body).toContain('modules.u_AttractToPoint');
  });

  test('writeUniforms packs x/y/strength/falloff as little-endian f32', () => {
    const mod = new AttractToPoint(10, 20, 500, 50);
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 0);

    expect(view.getFloat32(0, true)).toBeCloseTo(10);
    expect(view.getFloat32(4, true)).toBeCloseTo(20);
    expect(view.getFloat32(8, true)).toBeCloseTo(500);
    expect(view.getFloat32(12, true)).toBeCloseTo(50);
  });

  test('writeUniforms honours a non-zero byte offset', () => {
    const mod = new AttractToPoint(1, 2, 3, 4);
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 16);

    expect(view.getFloat32(16, true)).toBeCloseTo(1);
    expect(view.getFloat32(20, true)).toBeCloseTo(2);
    expect(view.getFloat32(24, true)).toBeCloseTo(3);
    expect(view.getFloat32(28, true)).toBeCloseTo(4);
  });
});

describe('RepelFromPoint wgsl contribution', () => {
  test('wgsl() declares the point/strength/radius uniforms', () => {
    const mod = new RepelFromPoint(0, 0, 100, 200);
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('RepelFromPoint');
    expect(contribution.uniforms?.map(f => f.name)).toEqual(['point', 'strength', 'radius']);
    expect(contribution.body).toContain('repelInRange');
  });

  test('writeUniforms packs x/y/strength/radius', () => {
    const mod = new RepelFromPoint(5, 6, 7, 8);
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 0);

    expect(view.getFloat32(0, true)).toBeCloseTo(5);
    expect(view.getFloat32(4, true)).toBeCloseTo(6);
    expect(view.getFloat32(8, true)).toBeCloseTo(7);
    expect(view.getFloat32(12, true)).toBeCloseTo(8);
  });
});

describe('OrbitalForce wgsl contribution', () => {
  test('wgsl() declares center/angularSpeed/padding uniforms', () => {
    const mod = new OrbitalForce(0, 0, 2);
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('OrbitalForce');
    expect(contribution.uniforms?.map(f => f.name)).toEqual(['center', 'angularSpeed', '_pad0']);
  });

  test('writeUniforms packs x/y/angularSpeed and zeroes the padding field', () => {
    const mod = new OrbitalForce(3, 4, 1.5);
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Poison the padding byte first so we prove writeUniforms overwrites it with 0.
    view.setFloat32(12, 99, true);
    mod.writeUniforms(view, 0);

    expect(view.getFloat32(0, true)).toBeCloseTo(3);
    expect(view.getFloat32(4, true)).toBeCloseTo(4);
    expect(view.getFloat32(8, true)).toBeCloseTo(1.5);
    expect(view.getFloat32(12, true)).toBe(0);
  });
});

describe('Turbulence wgsl contribution', () => {
  test('wgsl() declares uniforms and a hash/noise prelude matching the CPU implementation', () => {
    const mod = new Turbulence(100, 0.02, 2);
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('Turbulence');
    expect(contribution.uniforms?.map(f => f.name)).toEqual(['strength', 'frequency', 'time', '_pad0']);
    expect(contribution.prelude).toContain('exojs_turbulence_valueNoise2');
    expect(contribution.body).toContain('exojs_turbulence_valueNoise2');
  });

  test('writeUniforms advances its internal time by dt * timeScale on every call', () => {
    const mod = new Turbulence(10, 0.05, 2);
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 0, 0.1);
    expect(view.getFloat32(8, true)).toBeCloseTo(0.2); // 0.1 * timeScale(2)

    mod.writeUniforms(view, 0, 0.1);
    expect(view.getFloat32(8, true)).toBeCloseTo(0.4); // accumulated over two calls

    // strength/frequency are written fresh from current fields each call.
    expect(view.getFloat32(0, true)).toBeCloseTo(10);
    expect(view.getFloat32(4, true)).toBeCloseTo(0.05);
    expect(view.getFloat32(12, true)).toBe(0);
  });
});

describe('ColorOverSpeed wgsl contribution', () => {
  const makeGradient = (): ColorGradient =>
    new ColorGradient([
      { t: 0, color: new Color(0, 0, 0, 1) },
      { t: 1, color: new Color(255, 255, 255, 1) },
    ]);

  test('wgsl() declares minSpeed/invSpan uniforms and a gradient texture', () => {
    const mod = new ColorOverSpeed(makeGradient(), 0, 100);
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('ColorOverSpeed');
    expect(contribution.uniforms?.map(f => f.name)).toEqual(['minSpeed', 'invSpan']);
    expect(contribution.textures).toEqual([{ name: 'gradient', format: 'rgba8unorm' }]);
  });

  test('writeUniforms packs minSpeed and the reciprocal of the speed span', () => {
    const mod = new ColorOverSpeed(makeGradient(), 20, 70);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 0);

    expect(view.getFloat32(0, true)).toBeCloseTo(20);
    expect(view.getFloat32(4, true)).toBeCloseTo(1 / 50);
  });

  test('writeUniforms guards against a zero-width speed span', () => {
    const mod = new ColorOverSpeed(makeGradient(), 50, 50);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    mod.writeUniforms(view, 0);

    // span is clamped to 1e-5, so invSpan is a large finite number, not Infinity.
    expect(Number.isFinite(view.getFloat32(4, true))).toBe(true);
  });

  test('uploadTextures is a no-op when the gradient binding is missing', () => {
    const mod = new ColorOverSpeed(makeGradient(), 0, 100);
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;

    expect(() => mod.uploadTextures(device, new Map())).not.toThrow();
    expect(writeTexture).not.toHaveBeenCalled();
  });

  test('uploadTextures writes a 256-tap RGBA8 lookup table sampling the gradient', () => {
    const mod = new ColorOverSpeed(makeGradient(), 0, 100);
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;
    const texture = {} as GPUTexture;

    mod.uploadTextures(device, new Map([['gradient', texture]]));

    expect(writeTexture).toHaveBeenCalledTimes(1);
    const [dest, data, layout, size] = writeTexture.mock.calls[0] as [
      GPUImageCopyTexture,
      ArrayBuffer,
      GPUImageDataLayout,
      GPUExtent3DStrict,
    ];

    expect(dest.texture).toBe(texture);
    expect(size).toEqual({ width: 256, height: 1, depthOrArrayLayers: 1 });
    expect(layout.bytesPerRow).toBe(256 * 4);

    const bytes = new Uint8Array(data);
    // First tap samples t=0 (black); last tap samples t=1 (white).
    expect(bytes[0]).toBe(0);
    expect(bytes[(255 * 4) + 0]).toBe(255);
  });
});

describe('VelocityOverLifetime wgsl contribution', () => {
  const makeCurve = (): Curve =>
    new Curve([
      { t: 0, v: 1 },
      { t: 1, v: 0 },
    ]);

  test('wgsl() declares a curve texture and no uniforms', () => {
    const mod = new VelocityOverLifetime(makeCurve());
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('VelocityOverLifetime');
    expect(contribution.uniforms).toBeUndefined();
    expect(contribution.textures).toEqual([{ name: 'curve', format: 'r32float' }]);
    expect(contribution.body).toContain('velRatio');
  });

  test('uploadTextures is a no-op when the curve binding is missing', () => {
    const mod = new VelocityOverLifetime(makeCurve());
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;

    expect(() => mod.uploadTextures(device, new Map())).not.toThrow();
    expect(writeTexture).not.toHaveBeenCalled();
  });

  test('uploadTextures samples the curve into a 256-tap R32F lookup table', () => {
    const mod = new VelocityOverLifetime(makeCurve());
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;

    mod.uploadTextures(device, new Map([['curve', {} as GPUTexture]]));

    expect(writeTexture).toHaveBeenCalledTimes(1);
    const [, data] = writeTexture.mock.calls[0] as [GPUImageCopyTexture, ArrayBuffer];
    const floats = new Float32Array(data);

    expect(floats[0]).toBeCloseTo(1); // t=0
    expect(floats[255]).toBeCloseTo(0); // t=1
  });
});

describe('AlphaFadeOverLifetime wgsl contribution', () => {
  test('wgsl() declares a curve texture and no uniforms', () => {
    const mod = new AlphaFadeOverLifetime();
    const contribution = mod.wgsl();

    expect(contribution.key).toBe('AlphaFadeOverLifetime');
    expect(contribution.uniforms).toBeUndefined();
    expect(contribution.textures).toEqual([{ name: 'curve', format: 'r32float' }]);
  });

  test('uploadTextures is a no-op when the curve binding is missing', () => {
    const mod = new AlphaFadeOverLifetime();
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;

    expect(() => mod.uploadTextures(device, new Map())).not.toThrow();
    expect(writeTexture).not.toHaveBeenCalled();
  });

  test('uploadTextures samples the default 1 -> 0 fade curve into a lookup table', () => {
    const mod = new AlphaFadeOverLifetime();
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;

    mod.uploadTextures(device, new Map([['curve', {} as GPUTexture]]));

    const [, data] = writeTexture.mock.calls[0] as [GPUImageCopyTexture, ArrayBuffer];
    const floats = new Float32Array(data);

    expect(floats[0]).toBeCloseTo(1);
    expect(floats[255]).toBeCloseTo(0);
  });
});
