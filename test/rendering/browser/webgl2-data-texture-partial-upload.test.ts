/**
 * `DataTexture.commitRect` must reach the GPU through the WebGL2 backend.
 *
 * A partial upload cannot reuse the full-upload call: `texSubImage2D` reads a
 * tightly packed block, so the backend either lifts the dirty sub-region out of
 * the row-major texture buffer, or - when the region spans the full width and
 * its rows are therefore already contiguous - hands GL the texture buffer
 * itself plus an element offset via the `(…, srcData, srcOffset)` overload.
 * Both shapes must land the same texels at the same origin, and both are silent
 * corruption when they are wrong: nothing throws, the texture simply shows the
 * wrong pixels.
 *
 * Each case renders once to establish the texture on the GPU (a full upload),
 * then mutates a sub-region and renders again, so the second frame is served
 * exclusively by the partial path.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';

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

describe('WebGL2 uploads a partial DataTexture region', () => {
  test('an inset region lands at the right origin and leaves the rest untouched', async () => {
    const backend = await createWebGl2TestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      renderWebGl2Once(backend, root, Color.black);

      expect(pixelAt(readWebGl2Frame(backend, CANVAS), 12, 12)).toEqual([...RED]);

      // Columns 8..15 of rows 8..15 - neither row-aligned nor full-width, so a
      // wrong origin, stride or pack offset shifts the block visibly.
      paintRect(texture, 8, 8, 8, 8, BLUE);
      texture.commitRect(8, 8, 8, 8);

      renderWebGl2Once(backend, root, Color.black);

      const frame = readWebGl2Frame(backend, CANVAS);

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

  test('a wide inset region packs through the native row copy', async () => {
    const backend = await createWebGl2TestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      renderWebGl2Once(backend, root, Color.black);

      // 20 rgba8 texels = 80 channels per row, past the width at which the
      // packing loop switches from element-wise copying to `set(subarray(…))`.
      // The narrow case above stays on the element-wise side, so the two tests
      // together cover both branches of that switch.
      paintRect(texture, 4, 6, 20, 5, BLUE);
      texture.commitRect(4, 6, 20, 5);

      renderWebGl2Once(backend, root, Color.black);

      const frame = readWebGl2Frame(backend, CANVAS);

      expect(pixelAt(frame, 4, 6)).toEqual([...BLUE]);
      expect(pixelAt(frame, 23, 10)).toEqual([...BLUE]);
      expect(pixelAt(frame, 14, 8)).toEqual([...BLUE]);
      // One texel outside the region on every side stayed red.
      expect(pixelAt(frame, 3, 8)).toEqual([...RED]);
      expect(pixelAt(frame, 24, 8)).toEqual([...RED]);
      expect(pixelAt(frame, 14, 5)).toEqual([...RED]);
      expect(pixelAt(frame, 14, 11)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a full-width band of rows uploads the same bytes as an inset region would', async () => {
    const backend = await createWebGl2TestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      renderWebGl2Once(backend, root, Color.black);

      // Full-width rows are already contiguous in the row-major buffer, which
      // routes this through the `srcOffset` overload instead of the packing
      // scratch - the resulting texels must be identical either way.
      paintRect(texture, 0, 20, EDGE, 4, BLUE);
      texture.commitRect(0, 20, EDGE, 4);

      renderWebGl2Once(backend, root, Color.black);

      const frame = readWebGl2Frame(backend, CANVAS);

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

  test('a full-width band starting at row zero uploads at element offset zero', async () => {
    const backend = await createWebGl2TestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      renderWebGl2Once(backend, root, Color.black);

      // The degenerate offset - a wrong `srcOffset` sign or stride shows up as
      // the band landing at the wrong rows even when the offset is 0.
      paintRect(texture, 0, 0, EDGE, 2, BLUE);
      texture.commitRect(0, 0, EDGE, 2);

      renderWebGl2Once(backend, root, Color.black);

      const frame = readWebGl2Frame(backend, CANVAS);

      expect(pixelAt(frame, 0, 0)).toEqual([...BLUE]);
      expect(pixelAt(frame, EDGE - 1, 1)).toEqual([...BLUE]);
      expect(pixelAt(frame, 16, 2)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('successive partial uploads accumulate instead of overwriting each other', async () => {
    const backend = await createWebGl2TestBackend(CANVAS);
    const root = new Container();
    const texture = makeTexture();

    root.addChild(new Sprite(texture));

    try {
      renderWebGl2Once(backend, root, Color.black);

      paintRect(texture, 2, 2, 4, 4, BLUE);
      texture.commitRect(2, 2, 4, 4);

      renderWebGl2Once(backend, root, Color.black);

      // A full-width band after an inset region - the two upload shapes must
      // not clobber one another.
      paintRect(texture, 0, 24, EDGE, 2, BLUE);
      texture.commitRect(0, 24, EDGE, 2);

      renderWebGl2Once(backend, root, Color.black);

      const frame = readWebGl2Frame(backend, CANVAS);

      expect(pixelAt(frame, 3, 3)).toEqual([...BLUE]);
      expect(pixelAt(frame, 25, 25)).toEqual([...BLUE]);
      expect(pixelAt(frame, 14, 14)).toEqual([...RED]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
