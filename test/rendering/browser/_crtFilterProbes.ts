import { expect } from 'vitest';

import { Container } from '#rendering/Container';
import { CrtFilter } from '#rendering/filters/CrtFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { expectPixelNear, pixelAt } from './_pixels';

export const CRT_SIZE = 64;

type Frame = ArrayLike<number>;
type Render = (root: Container) => Promise<Frame | null>;

const scene = (filter: CrtFilter | null, alpha = 1, solid = false): { root: Container; texture: Texture } => {
  const source = document.createElement('canvas');

  source.width = CRT_SIZE;
  source.height = CRT_SIZE;

  const context = source.getContext('2d')!;

  context.fillStyle = `rgba(255, 255, 255, ${alpha})`;

  if (solid) {
    context.fillRect(0, 0, CRT_SIZE, CRT_SIZE);
  } else {
    context.fillRect(24, 8, 16, 48);
  }

  const texture = new Texture(source);
  const root = new Container();

  root.addChild(new Sprite(texture));

  if (filter !== null) {
    root.filters = [filter];
  }

  return { root, texture };
};

const changedPixels = (first: Frame, second: Frame): number => {
  let changed = 0;

  for (let offset = 0; offset < first.length; offset += 4) {
    if (
      first[offset] !== second[offset] ||
      first[offset + 1] !== second[offset + 1] ||
      first[offset + 2] !== second[offset + 2] ||
      first[offset + 3] !== second[offset + 3]
    ) {
      changed++;
    }
  }

  return changed;
};

export const crtFilterProbes: ReadonlyArray<{ name: string; run: (render: Render) => Promise<void> }> = [
  {
    name: 'zero strength and separation reproduce the unfiltered frame exactly',
    run: async render => {
      const { root, texture } = scene(null, 0.5);
      const filter = new CrtFilter({ strength: 0, rgbSeparation: 0 });

      try {
        const before = await render(root);

        if (before === null) {
          return;
        }

        root.filters = [filter];

        const after = await render(root);

        if (after !== null) {
          expect(changedPixels(before, after)).toBe(0);
        }
      } finally {
        root.clearFilters();
        root.destroy();
        texture.destroy();
        filter.destroy();
      }
    },
  },
  {
    name: 'separation alone produces red and blue fringes with union alpha',
    run: async render => {
      const { root, texture } = scene(new CrtFilter({ strength: 0, rgbSeparation: 4 / CRT_SIZE }));

      try {
        const frame = await render(root);

        if (frame !== null) {
          expectPixelNear(pixelAt(frame, CRT_SIZE, 21, 20), [255, 0, 0, 255]);
          expectPixelNear(pixelAt(frame, CRT_SIZE, 42, 20), [0, 0, 255, 255]);
          expectPixelNear(pixelAt(frame, CRT_SIZE, 32, 20), [255, 255, 255, 255]);
          expectPixelNear(pixelAt(frame, CRT_SIZE, 16, 20), [0, 0, 0, 0], 0);
        }
      } finally {
        root.destroy();
        texture.destroy();
      }
    },
  },
  {
    name: 'grain leaves transparent padding at zero in every channel',
    run: async render => {
      const { root, texture } = scene(new CrtFilter({ strength: 1, rgbSeparation: 4 / CRT_SIZE, time: 1 }));

      try {
        const frame = await render(root);

        if (frame !== null) {
          for (const [x, y] of [
            [4, 4],
            [8, 32],
            [55, 32],
            [32, 60],
          ] as const) {
            expectPixelNear(pixelAt(frame, CRT_SIZE, x, y), [0, 0, 0, 0], 0);
          }

          expect(pixelAt(frame, CRT_SIZE, 32, 32)[3]).toBe(255);
        }
      } finally {
        root.destroy();
        texture.destroy();
      }
    },
  },
  {
    name: 'fractional coverage survives CRT processing and separated fringes',
    run: async render => {
      const filter = new CrtFilter({ strength: 0, rgbSeparation: 4 / CRT_SIZE });
      const { root, texture } = scene(filter, 0.5);

      try {
        const separated = await render(root);

        if (separated === null) {
          return;
        }

        expectPixelNear(pixelAt(separated, CRT_SIZE, 21, 20), [188, 0, 0, 128], 3);
        expectPixelNear(pixelAt(separated, CRT_SIZE, 42, 20), [0, 0, 188, 128], 3);
        filter.strength = 1;

        const processed = await render(root);

        if (processed !== null) {
          expect(pixelAt(processed, CRT_SIZE, 32, 32)[3]).toBeCloseTo(128, 0);
          expectPixelNear(pixelAt(processed, CRT_SIZE, 8, 32), [0, 0, 0, 0], 0);
        }
      } finally {
        root.destroy();
        texture.destroy();
      }
    },
  },
  {
    name: 'time changes cached grain and a repeated time restores the same frame',
    run: async render => {
      const filter = new CrtFilter({ strength: 1, rgbSeparation: 0, time: 0 });
      const { root, texture } = scene(filter, 1, true);

      root.cacheAsTexture = true;

      try {
        const first = await render(root);
        const repeated = await render(root);

        if (first === null || repeated === null) {
          return;
        }

        expect(changedPixels(first, repeated)).toBe(0);
        filter.time = 1;

        const advanced = await render(root);

        if (advanced === null) {
          return;
        }

        expect(changedPixels(first, advanced)).toBeGreaterThan(64);
        filter.time = 0;

        const restored = await render(root);

        if (restored !== null) {
          expect(changedPixels(first, restored)).toBe(0);
        }
      } finally {
        root.destroy();
        texture.destroy();
      }
    },
  },
  {
    name: 'warped samples outside the capture are transparent instead of smeared edge texels',
    run: async render => {
      const filter = new CrtFilter({ strength: 1, rgbSeparation: 0 });
      const { root, texture } = scene(filter, 1, true);

      try {
        const frame = await render(root);

        if (frame !== null) {
          for (const [x, y] of [
            [0, 0],
            [63, 0],
            [0, 63],
            [63, 63],
          ] as const) {
            expectPixelNear(pixelAt(frame, CRT_SIZE, x, y), [0, 0, 0, 0], 0);
          }

          expect(pixelAt(frame, CRT_SIZE, 32, 32)[3]).toBe(255);
        }

        filter.strength = 0;
        filter.rgbSeparation = 4 / CRT_SIZE;

        const separated = await render(root);

        if (separated !== null) {
          expectPixelNear(pixelAt(separated, CRT_SIZE, 0, 32), [255, 255, 0, 255]);
          expectPixelNear(pixelAt(separated, CRT_SIZE, 63, 32), [0, 255, 255, 255]);
        }
      } finally {
        root.destroy();
        texture.destroy();
      }
    },
  },
];
