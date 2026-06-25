/**
 * Allocation bench launcher — samples per-frame plan allocation across the
 * sprite, nine-slice, repeating, nested, mesh, effect-barrier AND tilemap
 * families, and writes the numbers to `.workspace/output/render-perf/`.
 *
 *   pnpm perf:renderers:alloc
 *
 * SOURCE-ACCURATE. The `perf:renderers:alloc` script passes
 * `--conditions=@codexo/source` (so the `#*` imports resolve to `src`, not the
 * last `dist` build) and `--import ./scripts/glsl-register.mjs` — a node ESM
 * loader hook that loads `.vert`/`.frag` as source text (the node/tsx counterpart
 * of the vitest `realShaderPlugin`) and installs the `__DEV__`/`__VERSION__`/
 * `__REVISION__` build-constant globals. Those three pieces are what a plain
 * `node --import tsx/esm` run lacks: it would resolve to `dist`, choke on the raw
 * GLSL imports, and throw `__DEV__ is not defined`. Always run via the script.
 *
 * The vitest `rendering-perf` allocation TEST measures the same way and is the CI
 * gate; this launcher is the all-scenes sweep (incl. tilemap, which needs the
 * extension's chunk shaders — hence the GLSL loader).
 *
 * @internal Test/perf-only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FrameAllocation } from './allocation';
import { measureFrameAllocation } from './allocation';
import { buildFilteredScene, buildMeshScene, buildNestedScene, buildNineSliceScene, buildRepeatingScene, buildSpriteScene, makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';
import { buildTilemapScene, makeTilesets, wireTilemapRenderers } from './tilemapFixtures';

const VIEW = { w: 1280, h: 720 };

interface Sample {
  readonly id: string;
  build(harness: WebGl2Harness): { root: import('#rendering/RenderNode').RenderNode; beforeFrame?: () => void };
}

const movingSprites =
  (count: number) =>
  (harness: WebGl2Harness): { root: import('#rendering/RenderNode').RenderNode; beforeFrame?: () => void } => {
    const { root, sprites } = buildSpriteScene({ count, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });
    let frame = 0;
    const beforeFrame = (): void => {
      frame++;
      const dx = frame % 2 === 0 ? 1 : -1;
      for (const sprite of sprites) {
        sprite.setPosition(sprite.position.x + dx, sprite.position.y);
      }
    };

    return { root, beforeFrame };
  };

const SAMPLES: readonly Sample[] = [
  { id: 'sprite/1000/1tex/static', build: () => ({ root: buildSpriteScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'sprite/1000/1tex/moving', build: movingSprites(1000) },
  {
    id: 'sprite/1000/8tex/static',
    build: () => ({ root: buildSpriteScene({ count: 1000, textures: makeTextures(8), assign: 'cycle', viewW: VIEW.w, viewH: VIEW.h }).root }),
  },
  { id: 'sprite/10000/1tex/static', build: () => ({ root: buildSpriteScene({ count: 10000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'sprite/10000/1tex/moving', build: movingSprites(10000) },
  {
    id: 'nine-slice/100/1tex/stretch',
    build: () => ({
      root: buildNineSliceScene({ count: 100, textures: makeTextures(1), slice: 16, width: 96, height: 96, fill: 'stretch', viewW: VIEW.w, viewH: VIEW.h })
        .root,
    }),
  },
  {
    id: 'nine-slice/100/8tex/stretch',
    build: () => ({
      root: buildNineSliceScene({
        count: 100,
        textures: makeTextures(8),
        assign: 'cycle',
        slice: 16,
        width: 96,
        height: 96,
        fill: 'stretch',
        viewW: VIEW.w,
        viewH: VIEW.h,
      }).root,
    }),
  },
  {
    id: 'repeating/geometry/100/1tex',
    build: () => ({
      root: buildRepeatingScene({
        count: 100,
        textures: makeTextures(1),
        path: 'geometry',
        width: 128,
        height: 128,
        modeX: 'repeat',
        modeY: 'repeat',
        viewW: VIEW.w,
        viewH: VIEW.h,
      }).root,
    }),
  },
  {
    id: 'repeating/shader/100/1tex',
    build: () => ({
      root: buildRepeatingScene({
        count: 100,
        textures: makeTextures(1),
        path: 'shader',
        width: 128,
        height: 128,
        modeX: 'repeat',
        modeY: 'repeat',
        viewW: VIEW.w,
        viewH: VIEW.h,
      }).root,
    }),
  },
  // Complex scenes — the ones that decide 2b-2f ROI (flat sprite lists barely allocate).
  {
    id: 'nested/1000/8per/d2',
    build: () => ({ root: buildNestedScene({ count: 1000, perContainer: 8, depth: 2, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }),
  },
  {
    id: 'nested/1000/8per/d4',
    build: () => ({ root: buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }),
  },
  { id: 'mesh/1000/1tex', build: () => ({ root: buildMeshScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'filtered/100/1tex', build: () => ({ root: buildFilteredScene({ count: 100, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  // Tilemap — measurable source-accurate now that the GLSL loader handles the
  // chunk shaders (this family used to be excluded). static = chunk geometry
  // fully cached; pan = camera moves but geometry is reused (revision unchanged).
  {
    id: 'tilemap/80x64/static',
    build: harness => {
      wireTilemapRenderers(harness.backend);
      const scene = buildTilemapScene({ widthTiles: 80, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

      return { root: scene.node };
    },
  },
  {
    id: 'tilemap/80x64/pan',
    build: harness => {
      wireTilemapRenderers(harness.backend);
      const scene = buildTilemapScene({ widthTiles: 80, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);
      let frame = 0;
      const beforeFrame = (): void => {
        frame++;
        harness.view.setCenter(scene.pixelWidth / 2 + (frame % 8) * 16, scene.pixelHeight / 2);
      };

      return { root: scene.node, beforeFrame };
    },
  },
];

const results: Array<FrameAllocation & { id: string }> = [];

for (const sample of SAMPLES) {
  const harness = createWebGl2Harness();
  const scene = sample.build(harness);
  const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });

  results.push({ id: sample.id, ...alloc });
  console.log(`${sample.id.padEnd(34)} ${(alloc.bytesPerFrame / 1024).toFixed(2).padStart(9)} KB/frame`);

  scene.root.destroy();
  harness.destroy();
}

const outDir = resolve(process.cwd(), '.workspace/output/render-perf');
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, 'allocation.json');
writeFileSync(outPath, `${JSON.stringify({ results }, null, 2)}\n`);

console.log(`\nWrote ${outPath}`);
