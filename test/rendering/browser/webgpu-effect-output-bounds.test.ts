/**
 * WebGPU control cells for `webgl2-effect-output-bounds.test.ts`.
 *
 * The capture domain is decided once, in the render plan, and both backends
 * consume it. These cells prove the WGSL half actually does - that no backend
 * recomputes the expansion for itself, and that a blur's tail survives the trip
 * through a WebGPU target exactly as it does through a WebGL2 one.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const size = 128;
const contentSide = 32;
const contentLeft = 48;
const contentRight = contentLeft + contentSide;
const centre = contentLeft + contentSide / 2;
const lit = 8;

const createWhiteTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 16;

  const context = source.getContext('2d');

  if (!context) throw new Error('2D context is required to create test textures.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 16, 16);

  return new Texture(source);
};

const litSpanOnRow = (frame: Uint8ClampedArray, row: number): readonly [number, number] | null => {
  let first = -1;
  let last = -1;

  for (let x = 0; x < size; x++) {
    if (frame[(row * size + x) * 4]! > lit) {
      if (first === -1) first = x;
      last = x;
    }
  }

  return first === -1 ? null : [first, last];
};

const litSpanOnColumn = (frame: Uint8ClampedArray, column: number): readonly [number, number] | null => {
  let first = -1;
  let last = -1;

  for (let y = 0; y < size; y++) {
    if (frame[(y * size + column) * 4]! > lit) {
      if (first === -1) first = y;
      last = y;
    }
  }

  return first === -1 ? null : [first, last];
};

interface SceneOptions {
  readonly radii: readonly number[];
  readonly clip?: boolean;
}

interface Scene {
  readonly frame: Uint8ClampedArray;
  readonly sizes: ReadonlyArray<readonly [number, number]>;
  readonly dispose: () => void;
}

const render = async (ctx: { skip: (reason: string) => void }, options: SceneOptions): Promise<Scene | null> => {
  const backend = await createWebGpuTestBackend(size, 1);
  const texture = createWhiteTexture();
  const root = new Container();
  const sprite = new Sprite(texture);
  const filters = options.radii.filter(radius => radius > 0).map(radius => new BlurFilter({ radius }));
  const owner = backend as unknown as Record<string, unknown>;
  const original = backend.acquireRenderTexture.bind(backend);
  const sizes: Array<[number, number]> = [];

  sprite.width = contentSide;
  sprite.height = contentSide;
  sprite.setPosition(contentLeft, contentLeft);
  root.addChild(sprite);

  if (filters.length > 0) root.filters = filters;
  if (options.clip === true) root.clip = true;

  owner['acquireRenderTexture'] = (width: number, height: number): RenderTexture => {
    sizes.push([width, height]);

    return original(width, height);
  };

  const dispose = (): void => {
    delete owner['acquireRenderTexture'];
    root.destroy();
    for (const filter of filters) filter.destroy();
    texture.destroy();
    backend.destroy();
  };

  if (!(await renderWebGpuOnce(ctx, backend, root))) {
    dispose();

    return null;
  }

  return { frame: readWebGpuFrame(backend, size), sizes, dispose };
};

describe('WebGPU consumes the same planned effect bounds', () => {
  test('a blur tail escapes the source bounds on every edge', async ctx => {
    const scene = await render(ctx, { radii: [10] });

    if (scene === null) return;

    try {
      const row = litSpanOnRow(scene.frame, centre);
      const column = litSpanOnColumn(scene.frame, centre);

      expect(row, 'the row must cross the square').not.toBeNull();
      expect(column, 'the column must cross the square').not.toBeNull();
      expect(row![0], `row: ${row!.join('..')}`).toBeLessThan(contentLeft - 3);
      expect(row![1], `row: ${row!.join('..')}`).toBeGreaterThan(contentRight + 2);
      expect(column![0], `column: ${column!.join('..')}`).toBeLessThan(contentLeft - 3);
      expect(column![1], `column: ${column!.join('..')}`).toBeGreaterThan(contentRight + 2);
    } finally {
      scene.dispose();
    }
  });

  test('the capture domain matches the one WebGL2 allocates', async ctx => {
    // The same targets at the same size the WebGL2 cell pins: a chain of two
    // 6-unit blurs puts a 12-unit margin on every side of a 32-square. Any
    // backend-local recomputation of the expansion would show up here. Five
    // borrows - three chain targets plus one separable-blur scratch each.
    const scene = await render(ctx, { radii: [6, 6] });

    if (scene === null) return;

    try {
      expect(scene.sizes).toHaveLength(5);

      for (const recorded of scene.sizes) {
        expect(recorded).toEqual([contentSide + 24, contentSide + 24]);
      }
    } finally {
      scene.dispose();
    }
  });

  test('an explicit clip still cuts the expanded blur', async ctx => {
    const unclipped = await render(ctx, { radii: [10] });
    const clipped = await render(ctx, { radii: [10], clip: true });

    if (unclipped === null || clipped === null) {
      unclipped?.dispose();
      clipped?.dispose();

      return;
    }

    try {
      const unclippedSpan = litSpanOnRow(unclipped.frame, centre)!;
      const clippedSpan = litSpanOnRow(clipped.frame, centre)!;

      expect(unclippedSpan[0]).toBeLessThan(contentLeft);
      expect(clippedSpan[0], `unclipped ${unclippedSpan.join('..')} vs clipped ${clippedSpan.join('..')}`).toBeGreaterThanOrEqual(contentLeft);
      expect(clippedSpan[1], `unclipped ${unclippedSpan.join('..')} vs clipped ${clippedSpan.join('..')}`).toBeLessThan(contentRight);
    } finally {
      unclipped.dispose();
      clipped.dispose();
    }
  });

  test('a cached node follows a radius mutated after attachment', async ctx => {
    const backend = await createWebGpuTestBackend(size, 1);
    const texture = createWhiteTexture();
    const root = new Container();
    const sprite = new Sprite(texture);
    const blur = new BlurFilter({ radius: 3 });

    sprite.width = contentSide;
    sprite.height = contentSide;
    sprite.setPosition(contentLeft, contentLeft);
    root.addChild(sprite);
    root.cacheAsTexture = true;
    root.addFilter(blur);

    const dispose = (): void => {
      root.destroy();
      blur.destroy();
      texture.destroy();
      backend.destroy();
    };

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const before = litSpanOnRow(readWebGpuFrame(backend, size), centre)!;

      blur.radius = 14;

      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const after = litSpanOnRow(readWebGpuFrame(backend, size), centre)!;

      expect(after[0], `${before.join('..')} vs ${after.join('..')}`).toBeLessThan(before[0]);
      expect(after[1], `${before.join('..')} vs ${after.join('..')}`).toBeGreaterThan(before[1]);
    } finally {
      dispose();
    }
  });
});
