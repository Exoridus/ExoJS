/**
 * Tier-A structural regression tests for the tilemap chunk renderer.
 *
 * Key measured facts: tiles batch by (blend, tileset texture) across chunks; a
 * dense single-tileset chunk is one draw of N tile instances; multiple tilesets
 * per chunk cost one page (draw) each. Cached chunk geometry means a camera pan
 * rebuilds nothing, and a single tile edit rebuilds exactly one chunk.
 */
import { describe, expect, it } from 'vitest';

import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';
import { buildTilemapScene, makeTilesets, readTilemapRebuilds, resetTilemapRebuilds, type TilemapScene, wireTilemapRenderers } from './tilemapFixtures';

const withTilemapHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    wireTilemapRenderers(harness.backend);
    fn(harness);
  } finally {
    harness.destroy();
  }
};

const fitView = (harness: WebGl2Harness, scene: TilemapScene): void => {
  harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);
};

const measureWithRebuilds = (
  harness: WebGl2Harness,
  scene: TilemapScene,
  beforeFrame?: () => void,
): { drawCalls: number; instances: number; visibleNodes: number; rebuilds: number } => {
  for (let i = 0; i < 3; i++) {
    measureFrame(harness, scene.node, beforeFrame);
  }

  resetTilemapRebuilds();
  const metrics = measureFrame(harness, scene.node, beforeFrame);

  return { drawCalls: metrics.drawCalls, instances: metrics.instances, visibleNodes: metrics.visibleNodes, rebuilds: readTilemapRebuilds() };
};

describe('structural — Tilemap', () => {
  it('dense 32×32 single-tileset chunk → one draw, 1024 tile instances, one chunk node', () => {
    withTilemapHarness(harness => {
      const scene = buildTilemapScene({ widthTiles: 32, heightTiles: 32, chunkSize: 32, tilesets: makeTilesets(1) });
      fitView(harness, scene);

      const result = measureWithRebuilds(harness, scene);

      expect(result.drawCalls).toBe(1);
      expect(result.instances).toBe(1024);
      expect(result.visibleNodes).toBe(1);

      scene.node.destroy();
    });
  });

  it('four interleaved tilesets in one chunk → one page (draw) per tileset', () => {
    withTilemapHarness(harness => {
      const tilesets = makeTilesets(4);
      const scene = buildTilemapScene({ widthTiles: 32, heightTiles: 32, chunkSize: 32, tilesets, tilesetAssign: (tx, ty) => (tx + ty) % 4 });
      fitView(harness, scene);

      const result = measureWithRebuilds(harness, scene);

      expect(result.drawCalls).toBe(4);

      scene.node.destroy();
    });
  });

  it('static frame rebuilds no chunk geometry', () => {
    withTilemapHarness(harness => {
      const scene = buildTilemapScene({ widthTiles: 64, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      fitView(harness, scene);

      expect(measureWithRebuilds(harness, scene).rebuilds).toBe(0);

      scene.node.destroy();
    });
  });

  it('camera pan rebuilds no chunk geometry', () => {
    withTilemapHarness(harness => {
      const scene = buildTilemapScene({ widthTiles: 64, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      fitView(harness, scene);

      let frame = 0;
      const result = measureWithRebuilds(harness, scene, () => {
        frame++;
        harness.view.setCenter(scene.pixelWidth / 2 + frame * 8, scene.pixelHeight / 2);
      });

      expect(result.rebuilds).toBe(0);

      scene.node.destroy();
    });
  });

  it('a single tile mutation rebuilds exactly one chunk', () => {
    withTilemapHarness(harness => {
      const tilesets = makeTilesets(1);
      const scene = buildTilemapScene({ widthTiles: 64, heightTiles: 64, chunkSize: 32, tilesets });
      fitView(harness, scene);

      let frame = 0;
      const result = measureWithRebuilds(harness, scene, () => {
        frame++;
        scene.layers[0].setTileAt(0, 0, { tileset: tilesets[0], localTileId: 0, transform: { flipX: frame % 2 === 0, flipY: false, diagonal: false } });
      });

      expect(result.rebuilds).toBe(1);

      scene.node.destroy();
    });
  });
});
