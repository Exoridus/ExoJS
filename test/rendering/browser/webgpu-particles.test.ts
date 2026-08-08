/**
 * WebGPU ParticleSystem browser tests — opt-in, capability-aware.
 *
 * Validates the `@codexo/exojs-particles` WebGpuParticleRenderer end-to-end:
 * a particle spawned with a fixed slot, position, scale and packed color is
 * rendered to a real WebGPU canvas and read back via a 2D-canvas snapshot.
 *
 * Determinism note: `ParticleSystem` has no built-in RNG — spawn/update
 * modules (which may use distributions) are entirely optional. These tests
 * bypass spawn modules altogether and write the SoA arrays
 * (`posX`/`posY`/`scaleX`/`scaleY`/`color`/`lifetime`) directly after calling
 * `system.spawn()`, then render without ever calling `system.update()` — so
 * `elapsed` stays at 0 and the particle never expires. This yields fully
 * deterministic, seed-free particle placement across runs.
 *
 * The renderer itself draws from the render mode's inline WGSL, but the mode's
 * `Material` pairs that WGSL with the shipped GLSL, which the shader-stub
 * plugin blanks — and `ShaderSource` rejects empty GLSL. So this spec does
 * depend on `_glslMocks.ts` restoring the package's `.vert`/`.frag` sources,
 * even though nothing here compiles them.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { particlesExtension, ParticleSystem, RibbonParticles } from '../../../packages/exojs-particles/src/index';
import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();
  // The particle renderer is not part of the core renderer bindings — the
  // `@codexo/exojs-particles` package materialises it itself via its
  // Extension descriptor. Browser tests construct a bare backend (bypassing
  // Application), so the particle binding must be wired explicitly, same as
  // `wireCoreRenderers` does for Sprite/Mesh/Text.
  materializeRendererBindings(backend, particlesExtension.renderers);

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU ParticleSystem — solid color', () => {
  test('a spawned particle renders at its fixed position, clear color elsewhere', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      // Deterministic placement: bypass spawn/update modules entirely and
      // write the SoA slot directly. `lifetime` only matters if `update()`
      // is called — it never is here, so the particle can't expire.
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.rotations[slot] = 0;
      system.color[slot] = 0xffffffff; // opaque white — no tint, texture color passes through
      system.lifetime[slot] = 1;

      // Position the system itself so the particle (system-local quad
      // centered on 0,0, half-extent 8px for a 16x16 texture) lands at
      // (32, 32), well clear of the canvas edges.
      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Interior of the particle quad (32,32 ± 8px) should be red.
      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(28, 28), [255, 0, 0, 255]);
      // A safely particle-free corner remains the clear color (black).
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(60, 60), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('particle color channel tints a white texture', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4 });

    try {
      const slot = system.spawn();

      system.posX[slot] = 0;
      system.posY[slot] = 0;
      system.scaleX[slot] = 1;
      system.scaleY[slot] = 1;
      system.color[slot] = new Color(0, 255, 0).toRgba();
      system.lifetime[slot] = 1;

      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(32, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU ParticleSystem — ribbon', () => {
  test('a chain of particles renders as one connected band', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const root = new Container();
    // The ribbon mode ships its own WGSL, which only a real device ever
    // compiles — a broken module draws nothing and fails the interior
    // assertions below rather than passing silently in the node lanes.
    const system = new ParticleSystem(texture, { capacity: 8, render: new RibbonParticles({ width: 12 }) });

    try {
      // Three particles on a horizontal line, system-local. The strip expands
      // ±6px around it, so at (32, 32) it covers x 16..48, y 26..38.
      for (const x of [-16, 0, 16]) {
        const slot = system.spawn();

        system.posX[slot] = x;
        system.posY[slot] = 0;
        system.scaleX[slot] = 1;
        system.scaleY[slot] = 1;
        system.color[slot] = new Color(0, 255, 0).toRgba();
        system.lifetime[slot] = 1;
      }

      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Along the band: both ends and the middle are filled, which a
      // strip-that-drew-only-one-segment would not satisfy.
      expectPixelNear(readPixel(20, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(32, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(44, 32), [0, 255, 0, 255]);
      // Across it: the band is a band, not the whole column.
      expectPixelNear(readPixel(32, 12), [0, 0, 0, 255]);
      expectPixelNear(readPixel(32, 52), [0, 0, 0, 255]);
      // Past the ends of the path, and a safely empty corner.
      expectPixelNear(readPixel(58, 32), [0, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
