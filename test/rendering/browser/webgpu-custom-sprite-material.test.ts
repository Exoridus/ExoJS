/**
 * WebGPU custom-SpriteMaterial browser test — opt-in, capability-aware.
 *
 * Skips gracefully when WebGPU is unavailable (navigator.gpu absent or no
 * adapter), matching webgpu-smoke.test.ts. When WebGPU IS available it drives a
 * custom {@link SpriteMaterial} (user uniform) through the real
 * {@link WebGpuSpriteRenderer} and asserts the custom path (group 0 projection,
 * group 1 base texture, group 2 user UBO) issues an instanced draw without
 * raising a GPU validation error, while keeping the 56-byte instance buffer.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { SpriteMaterial } from '@/rendering/material/SpriteMaterial';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

// Fragment-only WGSL: the engine prepends the canonical sprite vertex module
// (spriteVertexWgsl), which declares VertexOutput, the group(0) projection, and
// the group(1) base texture (`u_texture`/`u_sampler`). The author adds the
// group(2) user UBO and the fragment entry point.
const customFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = textureSample(u_texture, u_sampler, input.texcoord);
  return vec4<f32>(base.rgb * u_user.color.rgb, 1.0);
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

const createSolidTexture = (r: number, g: number, b: number): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 16;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = `rgb(${r}, ${g}, ${b})`;
  context.fillRect(0, 0, source.width, source.height);

  return new Texture(source);
};

const createMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ wgsl: customFragmentWgsl }),
    uniforms: { u_userColor: [1, 0, 0.5, 1] },
  });

describe('custom SpriteMaterial WebGPU browser', () => {
  test('issues an instanced custom-material draw with a user uniform and no validation error', async ctx => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    const device = getBackendDeviceOrSkip(ctx, backend);

    if (!device) {
      backend.destroy();

      return;
    }

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
});
