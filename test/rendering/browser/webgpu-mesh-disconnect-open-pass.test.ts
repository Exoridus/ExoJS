/**
 * WebGPU mesh-renderer mid-frame disconnect browser test.
 *
 * Since the pass-cursor sweep, the WebGPU render pass survives a renderer
 * switch and is only ended (submitted) at genuine frame boundaries — a mesh
 * flush no longer ends it. `WebGpuMeshRenderer.onDisconnect` used to destroy
 * `_vertexBuffer` / `_indexBuffer` / `_uniformBuffer` (and the instanced
 * counterparts) right after its own `flush()`, with no regard for whether
 * that flush's draws had already been recorded into a pass that is STILL
 * OPEN and not yet submitted. A renderer disconnected on its own — outside
 * `WebGpuBackend.destroy()` / device loss, both of which drop the pass first
 * — left those draws bound to now-destroyed buffers sitting in the pass;
 * whatever later ends it submits a command buffer that reads freed GPU
 * memory, a WebGPU validation error.
 *
 * `onDisconnect` now ends its own open pass before destroying its buffers, so
 * the draws reach the queue against live buffers first.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 32;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

/** A 16x16 textured quad geometry (usage 'static' by default). */
const createQuadGeometry = (): Geometry => {
  const stride = 16; // vec2 position (8) + vec2 texcoord (8)
  const buffer = new ArrayBuffer(4 * stride);
  const view = new DataView(buffer);
  const verts = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: 16, y: 0, u: 1, v: 0 },
    { x: 16, y: 16, u: 1, v: 1 },
    { x: 0, y: 16, u: 0, v: 1 },
  ];

  verts.forEach((vert, i) => {
    const base = i * stride;

    view.setFloat32(base + 0, vert.x, true);
    view.setFloat32(base + 4, vert.y, true);
    view.setFloat32(base + 8, vert.u, true);
    view.setFloat32(base + 12, vert.v, true);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    vertexData: buffer,
    stride,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Run `body` inside a validation error scope; returns false on a device-loss skip. */
const runGuarded = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, body: () => void): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    body();
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

describe('WebGPU mesh renderer mid-frame disconnect', () => {
  test('disconnecting the mesh renderer while its draw sits in the still-open pass submits it first — no destroyed-buffer usage', async ctx => {
    const backend = await setupBackend();
    const meshTexture = createSolidTexture('#ff0000');
    const geometry = createQuadGeometry();
    const mesh = new Mesh({ geometry, texture: meshTexture });
    const spriteTexture = createSolidTexture('#00ff00', 8);
    const sprite = new Sprite(spriteTexture);

    sprite.setPosition(16, 16);
    sprite.width = 8;
    sprite.height = 8;

    try {
      await runGuarded(ctx, backend, () => {
        backend.resetStats();
        backend.clear(Color.black);
        // Buffers the mesh draw call (mesh renderer becomes the active renderer).
        mesh.render(backend);
        // Renderer switch: flushes the mesh renderer, recording its draw into
        // the coordinator's pass — which stays OPEN, not submitted — then
        // buffers the sprite draw on the new active renderer.
        sprite.render(backend);

        // Disconnect the mesh renderer directly and mid-frame (not through
        // `backend.destroy()`, which would drop the open pass first): its own
        // draw above is still sitting, unsubmitted, in the pass the sprite
        // renderer is about to append to.
        backend.rendererRegistry.resolve(mesh).disconnect();

        // Ends (submits) whatever pass remains open.
        backend.flush();
      });
    } finally {
      mesh.destroy();
      meshTexture.destroy();
      geometry.destroy();
      sprite.destroy();
      spriteTexture.destroy();
      backend.destroy();
    }
  });
});
