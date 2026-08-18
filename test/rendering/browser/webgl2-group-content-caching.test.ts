/**
 * WebGL2 group-uniform content caching gates.
 *
 * The backend's render-group id changes on every group boundary, even when the
 * effective matrix bytes stay identical. Core sprite variants and the tilemap
 * renderer must skip `u_group` uploads in that case; the retained repeating
 * replay path keeps a separate cache and must do the same across frames.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { singleTileMap, wireTilemapRenderers } from './_tilemapScene';

const canvasSize = 64;
const spriteSize = 12;
const positions = [2, 20, 38] as const;
const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
] as const satisfies readonly RgbaTuple[];

const createBackend = async (wire: (backend: WebGl2Backend) => void): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wire(backend);

  return backend;
};

const createSolidTexture = (color: string, size = 8): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d')!;

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

type VariantSprite = NineSliceSprite | RepeatingSprite | Sprite;

const variantCases: ReadonlyArray<{ name: string; create: (texture: Texture) => VariantSprite }> = [
  {
    name: 'Sprite',
    create: texture => {
      const sprite = new Sprite(texture);

      sprite.width = spriteSize;
      sprite.height = spriteSize;

      return sprite;
    },
  },
  {
    name: 'NineSliceSprite',
    create: texture => new NineSliceSprite(texture, { slices: 2, border: 2, width: spriteSize, height: spriteSize }),
  },
  {
    name: 'RepeatingSprite',
    create: texture => new RepeatingSprite(texture, { width: spriteSize, height: spriteSize }),
  },
];

describe('WebGL2 group uniform — content caching', () => {
  test.each(variantCases)('$name skips uploads across identity-only group id changes', async ({ create }) => {
    const backend = await createBackend(wireCoreRenderers);
    const texture = createSolidTexture('#ffffff');
    const variants = colors.map(([r, g, b], index) => {
      const sprite = create(texture);

      sprite.setPosition(positions[index]!, 2);
      sprite.tint = new Color(r, g, b, 1);

      return sprite;
    });
    const identityGroup = new Matrix();
    const render = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      variants[0]!.render(backend);
      backend._setRenderGroupTransform(identityGroup);
      variants[1]!.render(backend);
      backend._setRenderGroupTransform(null);
      variants[2]!.render(backend);
      backend.flush();
    };
    const matrixUpload = vi.spyOn(backend.context, 'uniformMatrix3fv');

    try {
      render();
      render();
      matrixUpload.mockClear();

      const groupIdBefore = backend.renderGroupTransformId;

      render();

      expect(backend.renderGroupTransformId - groupIdBefore).toBe(2);
      expect(matrixUpload).not.toHaveBeenCalled();

      for (let i = 0; i < variants.length; i++) {
        expectPixelNear(readWebGl2Pixel(backend, positions[i]! + spriteSize / 2, 2 + spriteSize / 2), colors[i]!);
      }
    } finally {
      matrixUpload.mockRestore();
      variants.forEach(sprite => sprite.destroy());
      texture.destroy();
      backend.destroy();
    }
  });

  test('TileMapNode skips uploads across identity-only group id changes', async () => {
    const backend = await createBackend(wireTilemapRenderers);
    const textures = ['#ff0000', '#00ff00', '#0000ff'].map(color => createSolidTexture(color, 16));
    const nodes = textures.map((texture, index) => {
      const node = new TileMapNode(singleTileMap(texture));

      node.setPosition(positions[index]!, 20);

      return node;
    });
    const identityGroup = new Matrix();
    const render = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      nodes[0]!.render(backend);
      backend._setRenderGroupTransform(identityGroup);
      nodes[1]!.render(backend);
      backend._setRenderGroupTransform(null);
      nodes[2]!.render(backend);
      backend.flush();
    };
    const matrixUpload = vi.spyOn(backend.context, 'uniformMatrix3fv');

    try {
      render();
      render();
      matrixUpload.mockClear();

      const groupIdBefore = backend.renderGroupTransformId;

      render();

      expect(backend.renderGroupTransformId - groupIdBefore).toBe(2);
      expect(matrixUpload).not.toHaveBeenCalled();

      for (let i = 0; i < nodes.length; i++) {
        expectPixelNear(readWebGl2Pixel(backend, positions[i]! + 8, 28), colors[i]!);
      }
    } finally {
      matrixUpload.mockRestore();
      nodes.forEach(node => node.destroy());
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('retained RepeatingSprite replay skips an unchanged identity group upload', async () => {
    const backend = await createBackend(wireCoreRenderers);
    const texture = createSolidTexture('#ffffff', 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(region, { width: 16, height: 16, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    repeating.setPosition(8, 8);
    repeating.tint = new Color(255, 0, 0, 1);
    group.addChild(repeating);

    const render = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      group.render(backend);
      backend.flush();
    };
    const matrixUpload = vi.spyOn(backend.context, 'uniformMatrix3fv');

    try {
      render();
      render();
      render();
      matrixUpload.mockClear();

      const replay = vi.spyOn(backend, '_replayRetainedBatch');

      render();

      expect(replay).toHaveBeenCalled();
      expect(matrixUpload).not.toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
    } finally {
      matrixUpload.mockRestore();
      group.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
