import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';
import { WebGpuBackdropBlendCompositor } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

test.each([
  {
    x: -10,
    y: -6,
    width: 40,
    height: 30,
    origin: { x: 0, y: 0, z: 0 },
    destination: { x: 10, y: 6, z: 0 },
    copy: { width: 30, height: 24, depthOrArrayLayers: 1 },
  },
  {
    x: 50,
    y: 54,
    width: 30,
    height: 20,
    origin: { x: 50, y: 54, z: 0 },
    destination: { x: 0, y: 0, z: 0 },
    copy: { width: 14, height: 10, depthOrArrayLayers: 1 },
  },
])('clipped backdrop preserves its position in the full quad ($x,$y)', ({ x, y, width, height, origin, destination, copy }) => {
  const target = new RenderTarget(64, 64, true);
  const source = new RenderTexture(width, height);
  const compositor = new WebGpuBackdropBlendCompositor();
  const copyTextureToTexture = vi.fn();
  const encoder = { copyTextureToTexture, finish: vi.fn() };
  const device = { createCommandEncoder: () => encoder, queue: { submit: vi.fn() } };
  const internals = compositor as unknown as {
    _device: unknown;
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
  expect(ensure).toHaveBeenCalledWith(device, width, height, 'rgba8unorm');
  expect(copyTextureToTexture).toHaveBeenCalledWith(
    expect.objectContaining({ origin }),
    expect.objectContaining({ origin: destination }),
    copy,
  );
  target.destroy();
  source.destroy();
});
