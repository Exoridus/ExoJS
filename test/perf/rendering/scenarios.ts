/**
 * The renderer benchmark scenario catalog. Each scenario builds a deterministic
 * scene against a harness and declares the structural axes the prompt's matrices
 * call for (counts, textures, blend, materials, transforms, mutation, layers).
 *
 * A scenario's `build` receives the harness so tilemap scenarios can wire their
 * package renderer and fit the camera. `beforeFrame` mutates the scene per frame
 * (moving sprites, panning the camera, editing a tile).
 *
 * @internal Test/perf-only.
 */
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

import { buildNineSliceScene, buildRepeatingScene, buildSpriteScene, makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';
import { buildTilemapScene, makeTilesets, wireTilemapRenderers } from './tilemapFixtures';

export type BenchProfile = 'quick' | 'full';

export interface BuiltScene {
  readonly root: RenderNode;
  readonly beforeFrame?: () => void;
  readonly teardown?: () => void;
}

export interface BenchScenario {
  readonly id: string;
  readonly family: 'sprite' | 'nine-slice' | 'repeating' | 'tilemap';
  readonly tags: Readonly<Record<string, string | number>>;
  build(harness: WebGl2Harness): BuiltScene;
}

const VIEW = { w: 1280, h: 720 };

const spriteCounts = (profile: BenchProfile): number[] => (profile === 'quick' ? [1000] : [100, 1000, 10000, 50000]);
const nineCounts = (profile: BenchProfile): number[] => (profile === 'quick' ? [100] : [10, 100, 1000]);
const repeatCounts = (profile: BenchProfile): number[] => (profile === 'quick' ? [100] : [100, 1000, 5000]);
const tilemapSizes = (profile: BenchProfile): Array<{ w: number; h: number; label: number }> =>
  profile === 'quick'
    ? [{ w: 32, h: 32, label: 1024 }]
    : [
        { w: 32, h: 32, label: 1024 },
        { w: 80, h: 64, label: 5120 },
        { w: 128, h: 80, label: 10240 },
        { w: 160, h: 128, label: 20480 },
      ];

/** Build the full scenario catalog for the given profile. */
export const buildScenarioCatalog = (profile: BenchProfile): BenchScenario[] => {
  const scenarios: BenchScenario[] = [];

  // ── Sprite ────────────────────────────────────────────────────────────
  const spriteTextureCounts = profile === 'quick' ? [1, 8] : [1, 4, 8, 9, 16];

  for (const count of spriteCounts(profile)) {
    for (const textureCount of spriteTextureCounts) {
      // >8 distinct textures cycled forces a flush per slot-window — the O(N²)
      // transform-upload amplification makes huge counts pathologically slow.
      // Demonstrate the break at moderate counts; keep large counts single-draw.
      if (textureCount >= 9 && count > 1000) {
        continue;
      }

      for (const transforms of ['static', 'moving'] as const) {
        if (profile === 'quick' && transforms === 'moving') {
          continue;
        }

        scenarios.push({
          id: `sprite/${count}/${textureCount}tex/${transforms}`,
          family: 'sprite',
          tags: { count, textures: textureCount, blend: 'single', transforms },
          build(): BuiltScene {
            const textures = makeTextures(textureCount);
            const { root, sprites } = buildSpriteScene({ count, textures, assign: 'cycle', viewW: VIEW.w, viewH: VIEW.h });
            let frame = 0;
            const beforeFrame =
              transforms === 'moving'
                ? (): void => {
                    frame++;
                    const dx = frame % 2 === 0 ? 1 : -1;
                    for (const sprite of sprites) {
                      sprite.setPosition(sprite.position.x + dx, sprite.position.y);
                    }
                  }
                : undefined;

            return { root, beforeFrame, teardown: () => root.destroy() };
          },
        });
      }
    }

    // Alternating blend modes — forces a flush per blend change, which exposes
    // the per-flush transform re-upload amplification. Capped at moderate counts
    // because it is intentionally O(N) draws / O(N²) upload bytes.
    if (count <= 1000) {
      scenarios.push({
        id: `sprite/${count}/1tex/alternating-blend`,
        family: 'sprite',
        tags: { count, textures: 1, blend: 'alternating', transforms: 'static' },
        build(): BuiltScene {
          const textures = makeTextures(1);
          const { root } = buildSpriteScene({ count, textures, blendModes: [BlendModes.Normal, BlendModes.Additive], viewW: VIEW.w, viewH: VIEW.h });

          return { root, teardown: () => root.destroy() };
        },
      });
    }
  }

  // ── NineSlice ─────────────────────────────────────────────────────────
  for (const count of nineCounts(profile)) {
    for (const textureCount of profile === 'quick' ? [1] : [1, 8]) {
      for (const fill of (profile === 'quick' ? ['stretch'] : ['stretch', 'repeat', 'mirror-repeat']) as const) {
        scenarios.push({
          id: `nine-slice/${count}/${textureCount}tex/${fill}`,
          family: 'nine-slice',
          tags: { count, textures: textureCount, fill },
          build(): BuiltScene {
            const textures = makeTextures(textureCount);
            const { root } = buildNineSliceScene({ count, textures, assign: 'cycle', slice: 16, width: 96, height: 96, fill, viewW: VIEW.w, viewH: VIEW.h });

            return { root, teardown: () => root.destroy() };
          },
        });
      }
    }
  }

  // ── RepeatingSprite (shader + geometry paths) ──────────────────────────
  for (const count of repeatCounts(profile)) {
    for (const path of ['shader', 'geometry'] as const) {
      for (const textureCount of profile === 'quick' ? [1] : [1, 8]) {
        scenarios.push({
          id: `repeating/${path}/${count}/${textureCount}tex`,
          family: 'repeating',
          tags: { count, textures: textureCount, path },
          build(): BuiltScene {
            const textures = makeTextures(textureCount);
            const { root } = buildRepeatingScene({
              count,
              textures,
              assign: 'cycle',
              path,
              width: 128,
              height: 128,
              modeX: 'repeat',
              modeY: 'repeat',
              viewW: VIEW.w,
              viewH: VIEW.h,
            });

            return { root, teardown: () => root.destroy() };
          },
        });
      }
    }
  }

  // ── Tilemap ───────────────────────────────────────────────────────────
  const tilesetCounts = profile === 'quick' ? [1] : [1, 2, 4, 8];

  for (const size of tilemapSizes(profile)) {
    for (const tilesetCount of tilesetCounts) {
      for (const mutation of (profile === 'quick' ? ['static'] : ['static', 'one-tile', 'pan']) as const) {
        scenarios.push({
          id: `tilemap/${size.label}/${tilesetCount}ts/${mutation}`,
          family: 'tilemap',
          tags: { visibleTiles: size.label, tilesets: tilesetCount, mutation, layers: 1 },
          build(harness: WebGl2Harness): BuiltScene {
            wireTilemapRenderers(harness.backend);

            const tilesets = makeTilesets(tilesetCount);
            const scene = buildTilemapScene({
              widthTiles: size.w,
              heightTiles: size.h,
              chunkSize: 32,
              tilesets,
              tilesetAssign: (tx, ty) => (tx + ty) % tilesetCount,
            });

            harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

            let frame = 0;
            const beforeFrame =
              mutation === 'static'
                ? undefined
                : mutation === 'pan'
                  ? (): void => {
                      frame++;
                      harness.view.setCenter(scene.pixelWidth / 2 + (frame % 8) * 16, scene.pixelHeight / 2);
                    }
                  : (): void => {
                      frame++;
                      const layer = scene.layers[0];
                      layer.setTileAt(frame % size.w, 0, {
                        tileset: tilesets[0],
                        localTileId: 0,
                        transform: { flipX: frame % 2 === 0, flipY: false, diagonal: false },
                      });
                    };

            return { root: scene.node, beforeFrame, teardown: () => scene.node.destroy() };
          },
        });
      }
    }

    // Multi-layer (actor-interleaving-style) at the mid size only.
    if (profile === 'full') {
      scenarios.push({
        id: `tilemap/${size.label}/1ts/3layers`,
        family: 'tilemap',
        tags: { visibleTiles: size.label, tilesets: 1, mutation: 'static', layers: 3 },
        build(harness: WebGl2Harness): BuiltScene {
          wireTilemapRenderers(harness.backend);

          const tilesets = makeTilesets(1);
          const scene = buildTilemapScene({ widthTiles: size.w, heightTiles: size.h, chunkSize: 32, tilesets, layers: 3 });

          harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

          return { root: scene.node, teardown: () => scene.node.destroy() };
        },
      });
    }
  }

  return scenarios;
};
