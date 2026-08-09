/**
 * `DataTexture.commitRect` must reach the GPU through the WebGPU backend.
 *
 * A partial upload cannot reuse the full-upload call: `queue.writeTexture`
 * reads a tightly packed block, so the backend has to lift the dirty
 * sub-region out of the row-major texture buffer, hand it the right
 * `bytesPerRow`/`rowsPerImage`, and place it at the right `origin`. Every one
 * of those is a silent-corruption bug when it is wrong — nothing throws, the
 * texture simply shows the wrong texels — and the mock-device specs can only
 * check the bytes handed to the driver, not what the driver makes of them.
 *
 * Each case renders once to establish the texture on the GPU (a full upload),
 * then mutates a sub-region and renders again, so the second frame is served
 * exclusively by the partial path. Both frames go through `renderWebGpuOnce`,
 * which opens one validation scope per flush — a single scope spanning both
 * flushes misreports.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const CANVAS = 64;
const EDGE = 32;

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

/** A uniformly red `EDGE`×`EDGE` `DataTexture`, drawn 1:1 into the canvas at the origin. */
const makeTexture = (): DataTexture<TextureFormat.Rgba8> => {
  const data = new Uint8Array(EDGE * EDGE * 4);

  for (let i = 0; i < EDGE * EDGE; i++) {
    data.set(RED, i * 4);
  }

  return new DataTexture({ width: EDGE, height: EDGE, format: TextureFormat.Rgba8, data });
};

/** Paint a solid rectangle of texels into the CPU-side buffer, leaving the dirty flag alone. */
const paintRect = (texture: DataTexture<TextureFormat.Rgba8>, x: number, y: number, width: number, height: number, color: readonly number[]): void => {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      texture.buffer.set(color, (row * EDGE + column) * 4);
    }
  }
};

const pixelAt = (frame: ArrayLike<number>, x: number, y: number): readonly [number, number, number, number] => {
  const i = (y * CANVAS + x) * 4;

  return [frame[i]!, frame[i + 1]!, frame[i + 2]!, frame[i + 3]!];
};

describe('WebGPU uploads a partial DataTexture region', () => {
  test('an inset region lands at the right origin and leaves the rest untouched', async ctx => {
    const backend = await createWebGpuTestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(pixelAt(readWebGpuFrame(backend, CANVAS), 12, 12)).toEqual([...RED]);

      // Columns 8..15 of rows 8..15 — neither row-aligned nor full-width, so a
      // wrong origin, stride or pack offset shifts the block visibly.
      paintRect(texture, 8, 8, 8, 8, BLUE);
      texture.commitRect(8, 8, 8, 8);

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      const frame = readWebGpuFrame(backend, CANVAS);

      expect(pixelAt(frame, 12, 12)).toEqual([...BLUE]);
      expect(pixelAt(frame, 8, 8)).toEqual([...BLUE]);
      expect(pixelAt(frame, 15, 15)).toEqual([...BLUE]);
      // One texel outside the region on every side stayed red.
      expect(pixelAt(frame, 7, 12)).toEqual([...RED]);
      expect(pixelAt(frame, 16, 12)).toEqual([...RED]);
      expect(pixelAt(frame, 12, 7)).toEqual([...RED]);
      expect(pixelAt(frame, 12, 16)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a full-width band of rows uploads the same bytes as an inset region would', async ctx => {
    const backend = await createWebGpuTestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      // Full-width rows are already contiguous in the row-major buffer, which
      // lets the backend skip the packing copy entirely — the resulting texels
      // must be identical either way.
      paintRect(texture, 0, 20, EDGE, 4, BLUE);
      texture.commitRect(0, 20, EDGE, 4);

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      const frame = readWebGpuFrame(backend, CANVAS);

      expect(pixelAt(frame, 0, 20)).toEqual([...BLUE]);
      expect(pixelAt(frame, 16, 22)).toEqual([...BLUE]);
      expect(pixelAt(frame, EDGE - 1, 23)).toEqual([...BLUE]);
      // The rows immediately above and below the band are untouched.
      expect(pixelAt(frame, 16, 19)).toEqual([...RED]);
      expect(pixelAt(frame, 16, 24)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('successive partial uploads accumulate instead of overwriting each other', async ctx => {
    const backend = await createWebGpuTestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      paintRect(texture, 2, 2, 4, 4, BLUE);
      texture.commitRect(2, 2, 4, 4);

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      paintRect(texture, 24, 24, 4, 4, BLUE);
      texture.commitRect(24, 24, 4, 4);

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      const frame = readWebGpuFrame(backend, CANVAS);

      // The second upload must not have reset the texture to the buffer state
      // of the first — both regions are blue at the same time.
      expect(pixelAt(frame, 3, 3)).toEqual([...BLUE]);
      expect(pixelAt(frame, 25, 25)).toEqual([...BLUE]);
      expect(pixelAt(frame, 14, 14)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
