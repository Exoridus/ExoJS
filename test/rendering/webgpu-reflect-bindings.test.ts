import { reflectComputeBindings } from '#rendering/webgpu/compute/reflectBindings';

describe('reflectComputeBindings', () => {
  test('reflects recognized declarations', () => {
    const layout = reflectComputeBindings(`
      @group(0) @binding(1) var<storage, read_write> out: array<f32>;
      @group(0) @binding(0) var<uniform> params: Params;
    `);

    expect(layout).toEqual([
      [
        { kind: 'buffer', binding: 0, type: 'uniform' },
        { kind: 'buffer', binding: 1, type: 'storage' },
      ],
    ]);
  });

  test('ignores declarations inside comments', () => {
    expect(reflectComputeBindings('// @group(0) @binding(0) var<storage> x: f32;\n/* @group(1) @binding(0) var y: foo; */')).toEqual([]);
  });

  test.each([
    ['storage buffer without an access mode', '@group(0) @binding(0) var<storage> data: array<f32>;'],
    ['depth texture', '@group(0) @binding(0) var depth: texture_depth_2d;'],
    ['swapped attribute order', '@binding(0) @group(0) var<uniform> params: Params;'],
  ])('throws on an unrecognized form: %s', (_name, wgsl) => {
    expect(() => reflectComputeBindings(`@group(0) @binding(1) var<uniform> ok: P;\n${wgsl}`)).toThrow(/unrecognized resource declaration/);
  });
});
