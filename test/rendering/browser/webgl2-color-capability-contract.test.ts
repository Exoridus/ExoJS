/**
 * Optional-capability failure modes of the colour pipeline on a real WebGL2
 * context.
 *
 * The eight-bit sRGB path is the contract every device honours: a missing
 * compression extension, missing float extensions or a lost context may refuse
 * the feature that needs them, but never the default colour path. Each spec
 * records the environment it ran on (browser, GPU, extensions) so a skipped or
 * differing result stays attributable.
 *
 * Run via:  pnpm test:browser:webgl
 */
import { afterEach, describe, expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { RenderError } from '#rendering/RenderError';
import { Sprite } from '#rendering/sprite/Sprite';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, TextureFormat } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Encoded } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const size = 8;
const trackedExtensions = ['EXT_color_buffer_float', 'OES_texture_float_linear', 'EXT_float_blend', 'WEBGL_lose_context', 'WEBGL_compressed_texture_s3tc'];

const describeEnvironment = (backend: WebGl2Backend): string => {
  const gl = backend.context;
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo === null ? 'unavailable' : String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
  const enabled = trackedExtensions.filter(name => gl.getExtension(name) !== null);

  return `webgl2 | ${navigator.userAgent} | ${renderer} | extensions: ${enabled.join(',') || 'none'} | compressed: ${backend.supportedTextureFormats.length}`;
};

const solidSrgbTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(source);
};

const drawSolid = (backend: WebGl2Backend, texture: Texture): void => {
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = size;
  sprite.height = size;
  root.addChild(sprite);

  try {
    renderWebGl2Encoded(backend, root);
  } finally {
    root.destroy();
  }
};

const loseAndRestore = async (backend: WebGl2Backend): Promise<void> => {
  const lose = backend.context.getExtension('WEBGL_lose_context');

  expect(lose, 'WEBGL_lose_context must be available to drive a restoration').not.toBeNull();

  const restored = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('webglcontextrestored not delivered within 5s')), 5000);

    backend.onContextRestored.add(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  lose!.loseContext();
  await restored;
};

describe('colour capability contract (WebGL2)', () => {
  const disposers: Array<() => void> = [];

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()!();
    }
  });

  const open = async (): Promise<WebGl2Backend> => {
    const backend = await createWebGl2TestBackend(size);

    disposers.push(() => backend.destroy());
    console.info(`[color-capability-contract] ${describeEnvironment(backend)}`);

    return backend;
  };

  test('the default sRGB path renders on this device whatever optional formats it lacks', async () => {
    const backend = await open();
    const texture = solidSrgbTexture('#808080');

    disposers.push(() => texture.destroy());
    drawSolid(backend, texture);

    expectPixelNear(readWebGl2Pixel(backend, 4, 4), [128, 128, 128, 255]);
  });

  test('a compressed format the device cannot sample is refused explicitly and leaves the default path intact', async ctx => {
    const backend = await open();
    const unsupported = Object.values(CompressedTextureFormat).find(format => !backend.supportedTextureFormats.includes(format));

    if (unsupported === undefined) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
      ctx.skip('this device samples every compressed texture format the engine knows');

      return;
    }

    const compressed = new CompressedTexture({
      format: unsupported,
      levels: [{ data: new Uint8Array(compressedLevelByteLength(unsupported, 4, 4)), width: 4, height: 4 }],
    });
    const plain = solidSrgbTexture('#808080');

    disposers.push(
      () => compressed.destroy(),
      () => plain.destroy(),
    );

    try {
      backend.bindTexture(compressed, 0);
      expect.unreachable('an unsupported compressed format must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('unsupported-format');
    }

    drawSolid(backend, plain);

    expectPixelNear(readWebGl2Pixel(backend, 4, 4), [128, 128, 128, 255]);
  });

  test('float capabilities follow the enabled extensions, and unblendable float32 refuses fixed-function blending', async ctx => {
    const backend = await open();
    const gl = backend.context;
    const renderable = gl.getExtension('EXT_color_buffer_float') !== null;
    const capabilities = backend.getColorFormatCapabilities(TextureFormat.Rgba32F);

    expect(capabilities.renderable).toBe(renderable);
    expect(capabilities.filterable).toBe(gl.getExtension('OES_texture_float_linear') !== null);
    expect(capabilities.blendable).toBe(renderable && gl.getExtension('EXT_float_blend') !== null);
    expect(backend.getColorFormatCapabilities(TextureFormat.Rgba8Srgb).blendable).toBe(true);

    if (!renderable || capabilities.blendable) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
      ctx.skip(renderable ? 'this device blends into float32 attachments' : 'this device cannot render into float attachments');

      return;
    }

    const target = new RenderTexture(size, size, { format: TextureFormat.Rgba32F });

    disposers.push(() => target.destroy());
    backend.setRenderTarget(target);

    expect(() => backend.setBlendMode(BlendModes.Normal)).toThrow(/does not support fixed-function blending/);
  });

  test('a lost and restored context re-probes capabilities and keeps rendering the default path', async () => {
    const backend = await open();
    const texture = solidSrgbTexture('#808080');
    const before = {
      float: backend.getColorFormatCapabilities(TextureFormat.Rgba16F),
      srgb: backend.getColorFormatCapabilities(TextureFormat.Rgba8Srgb),
      compressed: [...backend.supportedTextureFormats],
    };

    disposers.push(() => texture.destroy());
    drawSolid(backend, texture);
    expectPixelNear(readWebGl2Pixel(backend, 4, 4), [128, 128, 128, 255]);

    await loseAndRestore(backend);

    expect(backend.getColorFormatCapabilities(TextureFormat.Rgba16F)).toEqual(before.float);
    expect(backend.getColorFormatCapabilities(TextureFormat.Rgba8Srgb)).toEqual(before.srgb);
    expect([...backend.supportedTextureFormats]).toEqual(before.compressed);

    drawSolid(backend, texture);
    expectPixelNear(readWebGl2Pixel(backend, 4, 4), [128, 128, 128, 255]);
    expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
  });
});
