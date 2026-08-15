/**
 * WebGPU device-lifecycle regression tests — real adapter, real devices.
 *
 * A `GPUDevice` is backed by a driver-side device (on D3D12: a command queue)
 * and the driver keeps only a small number of them alive at once — measured at
 * 64 on the Windows/D3D12 machine this regression was found on, after which
 * `requestDevice()` rejects with
 * `D3D12 create command queue failed with E_OUTOFMEMORY`. Dropping the last JS
 * reference merely makes the wrapper collectable, so before `destroy()`
 * released the device explicitly the whole browser lane depended on garbage
 * collection running often enough — which is exactly why it failed
 * intermittently across files while every file passed in isolation.
 *
 * The cycle test therefore keeps every device wrapper referenced: garbage
 * collection is ruled out as the release mechanism, so completing more cycles
 * than the driver has live device slots can only mean the teardown released
 * them itself.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test, vi } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 64;

/**
 * Comfortably above the 64 live devices the D3D12 driver granted before
 * rejecting, and still only a few seconds of runtime.
 */
const cycles = 96;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  return canvas;
};

const buildScene = (): Container => {
  const root = new Container();
  const graphics = new Graphics();

  graphics.fillStyle = Color.red;
  graphics.drawRectangle(8, 8, 32, 32);
  root.addChild(graphics);

  return root;
};

const createBackend = async (): Promise<WebGpuBackend> => {
  const backend = new WebGpuBackend(makeApp(makeCanvas()));

  wireCoreRenderers(backend);

  await backend.initialize();

  return backend;
};

describe('WebGPU device lifecycle', () => {
  test('destroy() releases the device without relying on garbage collection', { timeout: 300_000 }, async () => {
    const scene = buildScene();
    // Holding these is the point of the test — see the file header.
    const devices: GPUDevice[] = [];

    for (let cycle = 0; cycle < cycles; cycle++) {
      let backend: WebGpuBackend;

      try {
        backend = await createBackend();
      } catch (error) {
        throw new Error(`Device acquisition failed after ${cycle} completed create/destroy cycles.`, { cause: error });
      }

      devices.push(backend.device);

      backend.resetStats();
      backend.clear(Color.black);
      scene.render(backend);
      backend.flush();
      backend.destroy();
    }

    expect(devices).toHaveLength(cycles);

    // Every device reports the intentional-teardown reason, which is what
    // `destroy()` calling `GPUDevice.destroy()` produces.
    const reasons = await Promise.all(devices.map(async device => (await device.lost).reason));

    expect(new Set(reasons)).toStrictEqual(new Set(['destroyed']));
  });

  test('a destroyed backend does not attempt device recovery', { timeout: 60_000 }, async () => {
    const backend = await createBackend();
    const device = backend.device;
    const restored = vi.fn();
    const recoveryError = vi.fn();

    backend.onDeviceRestored.add(restored);
    backend.onRenderError.add(recoveryError);
    backend.destroy();

    expect((await device.lost).reason).toBe('destroyed');

    // Recovery would re-request an adapter and dispatch onDeviceRestored (or,
    // once every retry failed, an onRenderError) — neither may happen for a
    // teardown the caller asked for.
    await new Promise<void>(resolve => {
      setTimeout(resolve, 250);
    });

    expect(restored).not.toHaveBeenCalled();
    expect(recoveryError).not.toHaveBeenCalled();
  });

  test('a fresh backend initializes after a previous one was destroyed', { timeout: 60_000 }, async () => {
    const first = await createBackend();
    const firstDevice = first.device;

    first.destroy();

    const second = await createBackend();

    try {
      expect(second.device).toBeDefined();
      expect(second.device).not.toBe(firstDevice);
    } finally {
      second.destroy();
    }
  });
});
