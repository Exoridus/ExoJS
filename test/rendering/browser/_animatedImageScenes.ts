import type { AssetFactoryContext } from '#assets/AssetFactory';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import type { ImageSequenceSource } from '#rendering/texture/ImageSequenceSource';
import { Texture } from '#rendering/texture/Texture';

import { createResourceTracker } from './_animatedResourceTracker';
import type { RgbaTuple } from './_pixels';
import { expectPixelNear } from './_pixels';

const urls = import.meta.glob('../../fixtures/animated/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const loadFixture = async (name: string): Promise<ArrayBuffer> =>
  (await fetch(urls[`../../fixtures/animated/${name}`]!)).arrayBuffer();

/** One backend under test: a render function, a pixel reader and an upload counter. */
export interface AnimatedImageHarness {
  readonly name: string;
  create(): Promise<{
    render(ctx: { skip: (reason: string) => void }, root: RenderNode): Promise<boolean>;
    pixel(x: number, y: number): RgbaTuple;
    uploads(): number;
    destroy(): void;
  }>;
}

const factory = new TextureFactory();

const sourceOf = (texture: Texture): ImageSequenceSource => texture._getFrameSource() as ImageSequenceSource;

// Playback is held on the displayed frame so a slow render cannot let the animation run ahead of the assertions; `advance` steps exactly one frame.
const open = async (name: string): Promise<Texture> => {
  const texture = await factory.create(await loadFixture(name), {} as AssetFactoryContext<never>);

  sourceOf(texture).pause();

  return texture;
};

const release = (texture: Texture): void => {
  factory.dispose(texture);
  texture.destroy();
};

const advance = (texture: Texture, timeoutMs = 3000): Promise<void> =>
  new Promise((resolve, reject) => {
    const source = sourceOf(texture);
    const timer = setTimeout(() => {
      texture._removeUpdateListener(listener);
      source.pause();
      reject(new Error('timed out waiting for the next animation frame'));
    }, timeoutMs);

    const listener = (): void => {
      clearTimeout(timer);
      texture._removeUpdateListener(listener);
      source.pause();
      resolve();
    };

    texture._addUpdateListener(listener);
    source.play();
  });

const expectPixelAt = (
  gpu: { pixel(x: number, y: number): RgbaTuple },
  texture: Texture,
  x: number,
  y: number,
  expected: RgbaTuple,
  step: number,
): void => {
  const actual = gpu.pixel(x, y);

  try {
    expectPixelNear(actual, expected, 4);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const around = [
      [4, 4],
      [12, 12],
      [28, 28],
    ]
      .map(([px, py]) => `(${px}, ${py}): [${gpu.pixel(px!, py!).join(', ')}]`)
      .join(' ');

    throw new Error(
      `step ${step} (${sourceOf(texture).decoderKind} decoder) at (${x}, ${y}): got [${actual.join(', ')}], expected [${expected.join(', ')}] (frame now ${around}): ${reason}`,
      { cause: error },
    );
  }
};

const black: RgbaTuple = [0, 0, 0, 255];
const blue: RgbaTuple = [0, 0, 255, 255];
const red: RgbaTuple = [255, 0, 0, 255];
const green: RgbaTuple = [0, 255, 0, 255];

// Over a black clear, per frame of animated.png: top-left (4,4) and middle (12,12).
const topLeft: readonly RgbaTuple[] = [blue, blue, green, black, black];
const middle: readonly RgbaTuple[] = [blue, red, blue, blue, blue];

export const describeAnimatedImageRendering = (harness: AnimatedImageHarness): void => {
  for (const mode of ['ImageDecoder', 'software compositor'] as const) {
    describeAnimatedImageCells(harness, mode);
  }
};

const describeAnimatedImageCells = (harness: AnimatedImageHarness, mode: 'ImageDecoder' | 'software compositor'): void => {
  describe(`${harness.name} (${mode}): animated image textures`, () => {
    const holder = globalThis as { ImageDecoder?: unknown };
    const original = holder.ImageDecoder;

    beforeEach(() => {
      if (mode === 'software compositor') {
        holder.ImageDecoder = undefined;
      }
    });

    afterEach(() => {
      holder.ImageDecoder = original;
    });

    test('every frame reaches the screen with its authored disposal and blend', async ctx => {
      const gpu = await harness.create();
      const texture = await open('animated.png');
      const sprite = new Sprite(texture);

      try {
        let index = 0;

        for (let step = 0; step < 6; step++) {
          if (!(await gpu.render(ctx, sprite))) {
            return;
          }

          expectPixelAt(gpu, texture, 4, 4, topLeft[index]!, step);
          expectPixelAt(gpu, texture, 12, 12, middle[index]!, step);

          await advance(texture);
          index = (index + 1) % 5;
        }
      } finally {
        sprite.destroy();
        release(texture);
        gpu.destroy();
      }
    });

    test('several sprites and a second handle upload once per frame per handle, never per draw', async ctx => {
      const gpu = await harness.create();
      const texture = await open('animated.png');
      const second = new Texture();

      second._copyPayloadFrom(texture);

      const root = new Container();
      const sprites = [new Sprite(texture), new Sprite(texture), new Sprite(second)];

      sprites.forEach(sprite => root.addChild(sprite));

      try {
        if (!(await gpu.render(ctx, root))) {
          return;
        }

        const before = gpu.uploads();
        const frames = 4;

        for (let frame = 0; frame < frames; frame++) {
          await advance(texture);

          for (let draw = 0; draw < 3; draw++) {
            if (!(await gpu.render(ctx, root))) {
              return;
            }
          }
        }

        expect(gpu.uploads() - before).toBe(frames * 2);
      } finally {
        root.destroy();
        second.destroy();
        release(texture);
        gpu.destroy();
      }
    });

    for (const [label, wrap] of [
      ['a RetainedContainer', (): Container => new RetainedContainer()],
      [
        'a cacheAsTexture subtree',
        (): Container => {
          const container = new Container();

          container.cacheAsTexture = true;

          return container;
        },
      ],
    ] as const) {
      test(`${label} picks up new animation frames`, async ctx => {
        const gpu = await harness.create();
        const texture = await open('animated.png');
        const sprite = new Sprite(texture);
        const group = wrap();

        group.addChild(sprite);

        try {
          if (!(await gpu.render(ctx, group))) {
            return;
          }

          expectPixelNear(gpu.pixel(12, 12), blue, 4);

          // Idle replays must not change anything.
          await gpu.render(ctx, group);
          expectPixelNear(gpu.pixel(12, 12), blue, 4);

          await advance(texture);

          if (!(await gpu.render(ctx, group))) {
            return;
          }

          expectPixelNear(gpu.pixel(12, 12), red, 4);
        } finally {
          group.destroy();
          release(texture);
          gpu.destroy();
        }
      });
    }

    test('repeated load, switch and destroy leaves no decoder or frame open', async ctx => {
      const gpu = await harness.create();
      const tracker = createResourceTracker();

      try {
        for (let round = 0; round < 8; round++) {
          const texture = await open(round % 2 === 0 ? 'animated.png' : 'animated.gif');
          const sprite = new Sprite(texture);

          if (!(await gpu.render(ctx, sprite))) {
            return;
          }

          await advance(texture);
          await gpu.render(ctx, sprite);

          // Switching away must not leave the animation drawing into the sprite.
          sprite.setTexture(null);
          release(texture);
          sprite.destroy();
        }

        await new Promise(resolve => setTimeout(resolve, 150));
        expect({ leaked: tracker.leaked(), opened: tracker.opened() }).toMatchObject({ leaked: { decoders: 0, frames: 0, bitmaps: 0 } });
        expect(tracker.opened().decoders + tracker.opened().bitmaps).toBeGreaterThan(0);
      } finally {
        tracker.restore();
        gpu.destroy();
      }
    });
  });
};
