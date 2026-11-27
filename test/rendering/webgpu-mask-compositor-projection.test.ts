import { Matrix } from '#math/Matrix';
import { packAffineMat4 } from '#rendering/affinePacking';
import { WebGpuBackdropBlendCompositor } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import { WebGpuMaskCompositor } from '#rendering/webgpu/WebGpuMaskCompositor';

describe('WebGPU compositor projection packing', () => {
  test.each([
    ['WebGpuMaskCompositor', () => new WebGpuMaskCompositor()],
    ['WebGpuBackdropBlendCompositor', () => new WebGpuBackdropBlendCompositor()],
  ])('%s matches packAffineMat4 including the homogeneous row', (_name, create) => {
    const compositor = create();
    const view = new Matrix();

    view.a = 2;
    view.b = 0.5;
    view.c = -0.25;
    view.d = 3;
    view.x = 7;
    view.y = -9;
    view.e = 0.125;
    view.f = 0.0625;
    view.z = 1.5;

    (compositor as unknown as { _writeProjectionMatrix(m: Matrix): void })._writeProjectionMatrix(view);

    const written = (compositor as unknown as { _projectionData: Float32Array })._projectionData;

    expect(Array.from(written)).toEqual(Array.from(packAffineMat4(view, new Float32Array(16))));
  });
});
