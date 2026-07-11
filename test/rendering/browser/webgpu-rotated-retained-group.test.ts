/**
 * WebGPU renderer-matrix browser tests — RetainedContainer under ROTATION
 * (review findings F3/B-01 + B-07 pixel gate for the per-group matrix).
 *
 * Track B Slice 2 routes a retained group's matrix to the GPU as the
 * projection UBO's `group` (sprite/nine-slice/repeating mat4x4, mesh/text
 * mat3x3). A transposed packing of that matrix is invisible for the
 * translation-only group moves the existing cells exercise, but flips every
 * ROTATED group. These cells rotate a RetainedContainer over a sprite, a
 * single (CPU-baked) mesh, an instanced static-geometry mesh pair — the path
 * whose group mat3x3 used to be packed transposed — and bitmap text, and
 * assert the canonical world positions. Expected pixels are mirrored 1:1 in
 * webgl2-rotated-retained-group.test.ts for cross-backend equality.
 *
 * Group transform: SceneNode.setRotation(θ) builds (a, b, c, d) =
 * (cosθ, sinθ, -sinθ, cosθ), so position (32, 32) + rotation 90° maps
 * child-local (x, y) to world (32 + y, 32 - x); the TRANSPOSED application
 * would map it to (32 - y, 32 + x) — the black-checked artifact positions.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

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

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

const createSolidTexture = (color: string, size: number): Texture => {
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

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas
// page at the line origin, so its quad covers (0,0)–(size,size) before any
// node/group transform (same fixture as webgpu-retained-container.test.ts).
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
};

// A solid-color quad (two triangles) in local space with vertex colors; the
// default mesh path samples the 1×1 white texture, so the output is the
// vertex color. usage defaults to 'static' — the instanced-batch requirement.
const coloredQuad = (x0: number, y0: number, x1: number, y1: number, rgba: RgbaTuple): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, rgba[0]);
    view.setUint8(base + 9, rgba[1]);
    view.setUint8(base + 10, rgba[2]);
    view.setUint8(base + 11, rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: buffer,
    stride,
  });
};

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
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

const buildRotatedGroup = (): { root: Container; group: RetainedContainer } => {
  const root = new Container();
  const group = new RetainedContainer();

  group.setPosition(32, 32);
  group.setRotation(90);
  root.addChild(group);

  return { root, group };
};

describe('WebGPU renderer matrix: rotated RetainedContainer cells', () => {
  test('sprite in a rotated group renders at the rotated position and tracks rotation updates', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const { root, group } = buildRotatedGroup();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      // Local (0..16)² → world x∈(32,48), y∈(16,32).
      expectPixelNear(readPixel(40, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]); // unrotated position stays empty
      expectPixelNear(readPixel(24, 40), [0, 0, 0, 255]); // transposed-artifact region stays empty

      // Rotation update on the retained group: -90° maps local (x, y) to
      // world (32 - y, 32 + x) → x∈(16,32), y∈(32,48).
      group.setRotation(-90);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 40), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 24), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('single mesh in a rotated group renders at the rotated position', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#00ff00', 16);
    const { root, group } = buildRotatedGroup();
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      texture,
    });

    try {
      group.addChild(mesh);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 24), [0, 255, 0, 255]); // rotated position
      expectPixelNear(readPixel(24, 40), [0, 0, 0, 255]); // transposed-artifact region
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]); // unrotated position
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('instanced static-geometry mesh pair in a rotated group renders both instances rotated', async ctx => {
    const backend = await setupBackend();
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);
    const { root, group } = buildRotatedGroup();
    const meshA = new Mesh({ geometry });
    const meshB = new Mesh({ geometry });

    try {
      // meshA local (0..16)²              → world x∈(32,48), y∈(16,32)
      // meshB local x∈(0,16), y∈(-32,-16) → world x∈(0,16), y∈(16,32)
      meshB.setPosition(0, -32);
      group.addChild(meshA);
      group.addChild(meshB);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      // Two same-geometry/same-material static meshes inside one group merge
      // into a single instanced draw — the exact WGSL slot-math + group
      // mat3x3 path under test.
      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 24), [255, 0, 0, 255]); // meshA rotated center
      expectPixelNear(readPixel(8, 24), [255, 0, 0, 255]); // meshB rotated center
      expectPixelNear(readPixel(24, 40), [0, 0, 0, 255]); // transposed meshA artifact region
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]); // unrotated meshA position
    } finally {
      root.destroy();
      geometry.destroy();
      backend.destroy();
    }
  });

  test('bitmap text in a rotated group renders at the rotated position', async ctx => {
    const backend = await setupBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);
    const { root, group } = buildRotatedGroup();

    try {
      group.addChild(text);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Glyph local (0..32)² → world x∈(32,64), y∈(0,32).
      expectPixelNear(readPixel(48, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(16, 48), [0, 0, 0, 255]); // transposed-artifact region
      expectPixelNear(readPixel(48, 48), [0, 0, 0, 255]); // unrotated position
    } finally {
      text.destroy();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
