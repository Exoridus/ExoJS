import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';
import { compositorShaderSource, WebGpuBackdropBlendCompositor } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

test.each([
  {
    x: -10,
    y: -6,
    width: 40,
    height: 30,
    origin: { x: 0, y: 0, z: 0 },
    copy: { width: 30, height: 24, depthOrArrayLayers: 1 },
  },
  {
    x: 50,
    y: 54,
    width: 30,
    height: 20,
    origin: { x: 50, y: 54, z: 0 },
    copy: { width: 14, height: 10, depthOrArrayLayers: 1 },
  },
])('clipped backdrop captures visible pixels at its target origin ($x,$y)', ({ x, y, width, height, origin, copy }) => {
  const target = new RenderTarget(64, 64, true);
  const source = new RenderTexture(width, height);
  const compositor = new WebGpuBackdropBlendCompositor();
  const copyTextureToTexture = vi.fn();
  const encoder = { copyTextureToTexture, finish: vi.fn() };
  const device = { createCommandEncoder: () => encoder, queue: { submit: vi.fn() } };
  const internals = compositor as unknown as {
    _device: unknown;
    _blendOriginView: Float32Array;
    _ensureBackdrop(...args: unknown[]): GPUTextureView;
    _drawBlend(...args: unknown[]): void;
  };
  const backend = {
    renderTarget: target,
    view: target.view,
    _snapViewport: { x: 0, y: 0, width: 64, height: 64 },
    renderTargetFormat: 'rgba8unorm',
    flushPending() {},
    _getAttachmentPixelSize: () => ({ width: 64, height: 64 }),
    _renderTargetTexture: () => ({}),
  } as unknown as WebGpuBackend;

  internals._device = device;
  const ensure = vi.spyOn(internals, '_ensureBackdrop').mockReturnValue({} as GPUTextureView);
  vi.spyOn(internals, '_drawBlend').mockImplementation(() => {});
  compositor.compose(backend, source, x, y, width, height, BlendModes.Darken);
  expect(ensure).toHaveBeenCalledWith(device, copy.width, copy.height, 'rgba8unorm');
  expect(Array.from(internals._blendOriginView)).toEqual([origin.x, origin.y]);
  expect(copyTextureToTexture).toHaveBeenCalledWith(
    expect.objectContaining({ origin }),
    expect.objectContaining({ origin: { x: 0, y: 0, z: 0 } }),
    copy,
  );
  target.destroy();
  source.destroy();
});

test.each([
  { x: -10000, zoom: 1, rotation: 0, originX: 0, captureWidth: 64 },
  { x: -10000, zoom: 2, rotation: 37, originX: 0, captureWidth: 64 },
  { x: 32, zoom: 2, rotation: 0, originX: 32, captureWidth: 32 },
])(
  'oversized clipped quad captures only visible pixels ($x, zoom $zoom, rotation $rotation)',
  ({ x, zoom, rotation, originX, captureWidth }) => {
    vi.stubGlobal('GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2 });
    const target = new RenderTarget(64, 64, true);
    const source = new RenderTexture(8192, 8192);
    const compositor = new WebGpuBackdropBlendCompositor();
    const copyTextureToTexture = vi.fn();
    const encoder = { copyTextureToTexture, finish: vi.fn() };
    const createTexture = vi.fn(({ size }: { size: { width: number; height: number } }) => ({
      ...size,
      createView: () => ({}),
      destroy: vi.fn(),
    }));
    const device = {
      limits: { maxTextureDimension2D: 8192 },
      createTexture,
      createCommandEncoder: () => encoder,
      queue: { submit: vi.fn() },
    };
    const internals = compositor as unknown as {
      _device: unknown;
      _blendOriginView: Float32Array;
      _drawBlend(...args: unknown[]): void;
    };
    const backend = {
      renderTarget: target,
      view: target.view,
      _snapViewport: { x: 0, y: 0, width: 64, height: 64 },
      renderTargetFormat: 'rgba8unorm',
      flushPending() {},
      _getAttachmentPixelSize: () => ({ width: 64, height: 64 }),
      _renderTargetTexture: () => ({}),
    } as unknown as WebGpuBackend;

    target.view.setZoom(zoom).setRotation(rotation);
    internals._device = device;
    const draw = vi.spyOn(internals, '_drawBlend').mockImplementation(() => {});

    try {
      compositor.compose(backend, source, x, -10000, 20000, 20000, BlendModes.Darken);

      expect(createTexture).toHaveBeenCalledTimes(1);
      const size = createTexture.mock.calls[0][0].size;

      expect(size).toEqual({ width: captureWidth, height: 64 });
      expect(size.width).toBeLessThanOrEqual(device.limits.maxTextureDimension2D);
      expect(size.height).toBeLessThanOrEqual(device.limits.maxTextureDimension2D);
      expect(copyTextureToTexture).toHaveBeenCalledWith(
        expect.objectContaining({ origin: { x: originX, y: 0, z: 0 } }),
        expect.objectContaining({ origin: { x: 0, y: 0, z: 0 } }),
        { width: captureWidth, height: 64, depthOrArrayLayers: 1 },
      );
      expect(draw).toHaveBeenCalledWith(backend, source, expect.anything(), x, -10000, 20000, 20000, BlendModes.Darken, false);
      expect(compositorShaderSource).toContain('(input.position.xy - blend.captureOrigin) / vec2<f32>(textureDimensions(backdropTexture))');

      for (let y = 0; y < 64; y++) {
        for (let x = originX; x < 64; x++) {
          const u = (x + 0.5 - internals._blendOriginView[0]) / size.width;
          const v = (y + 0.5 - internals._blendOriginView[1]) / size.height;

          expect(originX + Math.floor(u * size.width)).toBe(x);
          expect(Math.floor(v * size.height)).toBe(y);
        }
      }
    } finally {
      compositor.disconnect();
      target.destroy();
      source.destroy();
      vi.unstubAllGlobals();
    }
  },
);

test('an animated capture region reallocates the backdrop only when it outgrows it', () => {
  vi.stubGlobal('GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2 });
  const created: Array<{ width: number; height: number }> = [];
  const createTexture = vi.fn(({ size }: { size: { width: number; height: number } }) => {
    created.push({ ...size });

    return { createView: () => ({}), destroy: vi.fn() };
  });
  const compositor = new WebGpuBackdropBlendCompositor();
  const internals = compositor as unknown as {
    _device: unknown;
    _ensureBackdrop(device: unknown, width: number, height: number, format: string): unknown;
  };
  const device = { createTexture, limits: { maxTextureDimension2D: 8192 } };

  internals._device = device;

  try {
    const views: unknown[] = [];

    for (let frame = 0; frame < 60; frame++) {
      views.push(internals._ensureBackdrop(device, 40 + frame * 2, 30, 'rgba8unorm'));
    }

    // The first allocation is exact, later ones step up instead of following
    // every single-pixel change of an animated region.
    expect(created[0]).toEqual({ width: 40, height: 30 });
    expect(created.length).toBeLessThan(10);

    // A region the current allocation already covers reuses its view.
    expect(internals._ensureBackdrop(device, 41, 30, 'rgba8unorm')).toBe(views.at(-1));

    // A different target format still needs its own texture.
    const beforeFormatChange = created.length;

    internals._ensureBackdrop(device, 41, 30, 'bgra8unorm');

    expect(created.length).toBe(beforeFormatChange + 1);

    for (const size of created) {
      expect(size.width).toBeGreaterThanOrEqual(40);
      expect(size.height).toBeGreaterThanOrEqual(30);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

test('backdrop growth stays within GPU maximum texture dimensions', () => {
  vi.stubGlobal('GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2 });
  const created: Array<{ width: number; height: number }> = [];
  const createTexture = vi.fn(({ size }: { size: { width: number; height: number } }) => {
    created.push({ ...size });

    return { createView: () => ({}), destroy: vi.fn() };
  });
  const device = { createTexture, limits: { maxTextureDimension2D: 128 } };
  const compositor = new WebGpuBackdropBlendCompositor();
  const internals = compositor as unknown as {
    _device: unknown;
    _ensureBackdrop(device: unknown, width: number, height: number, format: string): unknown;
  };
  internals._device = device;

  try {
    internals._ensureBackdrop(device, 100, 96, 'rgba8unorm');
    const withinLimit = internals._ensureBackdrop(device, 120, 110, 'rgba8unorm');

    expect(created).toEqual([{ width: 100, height: 96 }, { width: 128, height: 128 }]);
    expect(internals._ensureBackdrop(device, 128, 128, 'rgba8unorm')).toBe(withinLimit);
    expect(createTexture).toHaveBeenCalledTimes(2);
  } finally {
    compositor.disconnect();
    vi.unstubAllGlobals();
  }
});
