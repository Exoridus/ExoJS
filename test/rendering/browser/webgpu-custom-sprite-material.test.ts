/**
 * WebGPU custom-SpriteMaterial browser test - opt-in, capability-aware.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe), so this test drives a
 * custom {@link SpriteMaterial} (user uniform) through the real
 * {@link WebGpuSpriteRenderer} and asserts the custom path (group 0 projection +
 * shared transform storage, group 1 base-texture slot table, group 2 user UBO) issues an
 * instanced draw without raising a GPU validation error, while keeping the
 * 32-byte instance buffer (transform and tint fetched from storage by nodeIndex).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { spriteMaterialTextureSlots } from '#rendering/sprite/materialSources';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, ScaleModes, WrapModes } from '#rendering/types';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// Fragment-only WGSL: the engine prepends the canonical sprite material
// prologue (spriteMaterialPrologueWgsl), which declares VertexOutput, the
// group(0) projection, the group(1) base-texture slot table and the
// `sampleBase(slot, uv)` helper. The author adds the group(2) user UBO and the
// fragment entry point.
const customFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = sampleBase(input.textureSlot, input.texcoord);
  return vec4<f32>(base.rgb * u_user.color.rgb, 1.0);
}
`.trim();

const materialTextureFragmentWgsl = `
struct UserUniforms { unused: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var u_pattern: texture_2d<f32>;
@group(2) @binding(2) var u_patternSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(u_pattern, u_patternSampler, input.texcoord);
}
`.trim();

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createSolidTexture = (r: number, g: number, b: number, a = 255): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 16;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  context.fillRect(0, 0, source.width, source.height);

  return new Texture(source);
};

const createSplitTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 2;
  source.height = 2;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = '#f00';
  context.fillRect(0, 0, 1, 2);
  context.fillStyle = '#00f';
  context.fillRect(1, 0, 1, 2);

  return new Texture(source, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};

const createMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ wgsl: customFragmentWgsl }),
    uniforms: { u_userColor: [1, 0, 0.5, 1] },
  });

const createPassThroughMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({
      wgsl: `
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return sampleBase(input.textureSlot, input.texcoord) * input.color;
}
`.trim(),
    }),
  });

const render = async (backend: WebGpuBackend, node: RenderNode): Promise<void> => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
  await getBackendDevice(backend).queue.onSubmittedWorkDone();
};

describe('custom SpriteMaterial WebGPU browser', () => {
  test('material sampler overrides only base-texture sampling and mutates live during retained replay', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const texture = createSplitTexture();
    const material = createPassThroughMaterial();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    material.sampler = { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.ClampToEdge };
    sprite.material = material;
    sprite.setPosition(16, 16).setScale(16, 16);
    group.addChild(sprite);

    const cleanup = (): void => {
      group.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    };

    try {
      await render(backend, group);
      await render(backend, group);
      await render(backend, group);
      expectPixelNear(readWebGpuPixels(backend, 64)(31, 24), [255, 0, 0, 255]);

      const replay = vi.spyOn(backend, '_replayRetainedBatch');

      material.sampler.scaleMode = ScaleModes.Linear;
      await render(backend, group);

      const blended = readWebGpuPixels(backend, 64)(31, 24);

      expect(replay).toHaveBeenCalledTimes(1);
      expect(blended[0]).toBeGreaterThan(100);
      expect(blended[0]).toBeLessThan(200);
      expect(blended[2]).toBeGreaterThan(50);
      expect(blended[2]).toBeLessThan(160);
      replay.mockRestore();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      if (!texture.destroyed) cleanup();
    }
  });

  test('retained replay keeps uniform values live and recoverably re-records blend changes', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);
    const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
    const texture = createSolidTexture(255, 255, 255);
    const values = new Float32Array([1, 0, 0, 1]);
    const material = new SpriteMaterial({
      shader: new ShaderSource({ wgsl: customFragmentWgsl }),
      uniforms: { u_userColor: values },
    });
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    sprite.material = material;
    sprite.setPosition(16, 16);
    group.addChild(sprite);

    const cleanup = (): void => {
      group.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    };

    try {
      await render(backend, group); // fragment capture
      await render(backend, group); // instruction recording

      let replay = vi.spyOn(backend, '_replayRetainedBatch');

      await render(backend, group);
      expect(replay).toHaveBeenCalledTimes(1);
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGpuPixels(backend, 64)(24, 24), [255, 0, 0, 255]);

      material.setUniform('u_userColor', [0, 1, 0, 1]);
      replay.mockClear();
      await render(backend, group);

      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGpuPixels(backend, 64)(24, 24), [0, 255, 0, 255]);

      values.set([0, 1, 0, 1]);
      material.setUniform('u_userColor', values);
      await render(backend, group);
      values[0] = 0;
      values[1] = 0;
      values[2] = 1;
      replay.mockClear();
      const writesBeforeMutation = writeBuffer.mock.calls.length;
      await render(backend, group);
      expect(replay).toHaveBeenCalledTimes(1);
      const materialWrites = writeBuffer.mock.calls.slice(writesBeforeMutation).filter(([buffer]) => buffer.label === 'sprite:material-user-uniform-buffer');

      expect(materialWrites).toHaveLength(1);
      expect(backend.stats.drawCalls).toBe(1);
      expect(Array.from(new Float32Array(materialWrites[0]![2] as ArrayBuffer).subarray(0, 4))).toEqual([0, 0, 1, 1]);
      expectPixelNear(readWebGpuPixels(backend, 64)(24, 24), [0, 0, 255, 255]);

      material.blendMode = BlendModes.Additive;
      replay.mockClear();
      await render(backend, group);
      expect(replay).not.toHaveBeenCalled();

      replay.mockRestore();
      replay = vi.spyOn(backend, '_replayRetainedBatch');
      await render(backend, group);
      expect(replay).toHaveBeenCalledTimes(1);
      replay.mockRestore();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      if (!texture.destroyed) cleanup();
    }
  });

  test('retained replay resolves a replacement material texture identity live', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const base = createSolidTexture(255, 255, 255);
    const firstPattern = createSolidTexture(255, 0, 0);
    const secondPattern = createSolidTexture(0, 255, 0);
    const material = new SpriteMaterial({
      shader: new ShaderSource({ wgsl: materialTextureFragmentWgsl }),
      textures: { u_pattern: firstPattern },
    });
    const group = new RetainedContainer();
    const sprite = new Sprite(base);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);
      group.addChild(sprite);

      await render(backend, group);
      await render(backend, group);
      await render(backend, group);
      expectPixelNear(readWebGpuPixels(backend, 64)(24, 24), [255, 0, 0, 255]);

      const replay = vi.spyOn(backend, '_replayRetainedBatch');

      material.setTexture('u_pattern', secondPattern);
      await render(backend, group);

      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGpuPixels(backend, 64)(24, 24), [0, 255, 0, 255]);
      replay.mockRestore();
    } finally {
      group.destroy();
      material.destroy();
      secondPattern.destroy();
      firstPattern.destroy();
      base.destroy();
      backend.destroy();
    }
  });

  test('matches the default premultiply result and preserves per-texture flags inside one custom batch', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);
    // Browser-source pixels are unpremultiplied. The default-true texture must
    // therefore resolve (200, 100, 50, .5) to roughly (100, 50, 25, .5), while
    // the false texture already stores those premultiplied RGB channels.
    const defaultTexture = createSolidTexture(200, 100, 50, 128);
    const customPremultiplyTexture = createSolidTexture(200, 100, 50, 128);
    const customAlreadyPremultipliedTexture = createSolidTexture(100, 50, 25, 128);

    customAlreadyPremultipliedTexture.setPremultiplyAlpha(false);

    const material = createPassThroughMaterial();
    const root = new Container();
    const defaultSprite = new Sprite(defaultTexture);
    const customPremultiplySprite = new Sprite(customPremultiplyTexture);
    const customAlreadyPremultipliedSprite = new Sprite(customAlreadyPremultipliedTexture);

    defaultSprite.setPosition(4, 16);
    customPremultiplySprite.setPosition(24, 16);
    customAlreadyPremultipliedSprite.setPosition(44, 16);
    customPremultiplySprite.material = material;
    customAlreadyPremultipliedSprite.material = material;
    root.addChild(defaultSprite);
    root.addChild(customPremultiplySprite);
    root.addChild(customAlreadyPremultipliedSprite);

    const cleanup = (): void => {
      root.destroy();
      material.destroy();
      defaultTexture.destroy();
      customPremultiplyTexture.destroy();
      customAlreadyPremultipliedTexture.destroy();
      backend.destroy();
    };

    device.pushErrorScope('validation');

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      const validationError = await device.popErrorScope();
      const readPixel = readWebGpuPixels(backend, 64);
      const expected = [100, 50, 25, 255] as const;

      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBe(2);
      expectPixelNear(readPixel(8, 20), expected);
      expectPixelNear(readPixel(28, 20), expected);
      expectPixelNear(readPixel(48, 20), expected);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      if (!defaultTexture.destroyed) cleanup();
    }
  });

  test('issues an instanced custom-material draw with a user uniform and no validation error', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);

    const texture = createSolidTexture(128, 128, 128);
    const material = createMaterial();
    const root = new Container();
    const sprites = [new Sprite(texture), new Sprite(texture), new Sprite(texture)];

    sprites.forEach((sprite, index) => {
      sprite.material = material;
      sprite.setPosition(8 + index * 14, 16);
      root.addChild(sprite);
    });

    device.pushErrorScope('validation');

    let validationError: GPUError | null;

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      validationError = await device.popErrorScope();
    } catch (error) {
      // The software (swiftshader) adapter used in CI can drop the device
      // mid-test ("Instance dropped in popErrorScope"); treat that as an
      // unavailable-adapter skip rather than a failure.
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        root.destroy();
        material.destroy();
        texture.destroy();
        backend.destroy();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      expect(validationError).toBeNull();
      // Three sprites sharing a material and base texture collapse to one draw.
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // Multi-texture batching gate for the custom path. Before base textures
  // rotated through the material slot table this frame cost one draw per
  // sprite; it must now collapse to the plateau of a single instanced draw.
  test('four distinct base textures under one material collapse to a single draw', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);

    const textures = [createSolidTexture(200, 0, 0), createSolidTexture(0, 200, 0), createSolidTexture(0, 0, 200), createSolidTexture(200, 200, 0)];
    const material = createMaterial();
    const root = new Container();

    textures.forEach((texture, index) => {
      const sprite = new Sprite(texture);

      sprite.material = material;
      sprite.setPosition(4 + index * 14, 16);
      root.addChild(sprite);
    });

    const cleanup = (): void => {
      root.destroy();
      material.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    };

    device.pushErrorScope('validation');

    let validationError: GPUError | null;

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      validationError = await device.popErrorScope();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

  test('base-slot exhaustion breaks the custom-material batch', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);

    // One more distinct base texture than the custom path's slot table holds.
    const textures = Array.from({ length: spriteMaterialTextureSlots + 1 }, (_, index) => createSolidTexture(16 * (index + 1), 0, 0));
    const material = createMaterial();
    const root = new Container();

    textures.forEach((texture, index) => {
      const sprite = new Sprite(texture);

      sprite.material = material;
      sprite.setPosition(2 + index * 6, 16);
      root.addChild(sprite);
    });

    const cleanup = (): void => {
      root.destroy();
      material.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    };

    device.pushErrorScope('validation');

    let validationError: GPUError | null;

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      validationError = await device.popErrorScope();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      cleanup();
    }
  });
});
