/**
 * WebGL2 tilemap backend-state browser test.
 *
 * A sprite between two tile layers - a character between ground and overhang -
 * binds its own texture to unit 0, the unit the tile shader samples, and sets
 * its own blend mode. The tile layer drawn after it must therefore establish
 * its own texture and blend state rather than trusting what it left behind
 * before the sprite ran.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { TileMapNode } from '@codexo/exojs-tilemap';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear } from './_pixels';
import { createSolidTexture, singleTileMap, wireTilemapRenderers } from './_tilemapScene';

const canvasSize = 64;

describe('WebGL2 tilemap backend state', () => {
  test('a tile layer after a sprite draws with its own tileset and blend mode', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);

    wireTilemapRenderers(backend);

    const tileTexture = createSolidTexture('#ff0000');
    const spriteTexture = createSolidTexture('#0000ff');
    const groundMap = singleTileMap(tileTexture);
    const overhangMap = singleTileMap(tileTexture);
    const root = new Container();

    const ground = new TileMapNode(groundMap);
    const actor = new Sprite(spriteTexture);
    const overhang = new TileMapNode(overhangMap);

    // Overlapping bounds in document order: the draw order is then a
    // correctness constraint the render plan cannot regroup away.
    ground.setPosition(0, 0);
    actor.setPosition(8, 0);
    actor.blendMode = BlendModes.Additive;
    overhang.setPosition(16, 0);

    root.addChild(ground, actor, overhang);

    try {
      renderWebGl2Once(backend, root, new Color(0, 0, 64, 1));

      // One draw call per node: a scene that merged the two tile layers could
      // not observe the sprite's state leaking into the second one.
      expect(backend.stats.drawCalls).toBe(3);

      // The overhang layer alone covers this sample. Its tileset is red and it
      // blends Normal, so the clear colour must be gone; the sprite's texture
      // on unit 0, or its additive blend, would leave blue behind.
      expectPixelNear(readWebGl2Pixel(backend, 28, 8), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      groundMap.destroy();
      overhangMap.destroy();
      tileTexture.destroy();
      spriteTexture.destroy();
      backend.destroy();
    }
  });
});
