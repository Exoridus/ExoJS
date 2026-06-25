/**
 * Allocation bench launcher — runs the sampler across the sprite, nine-slice and
 * repeating families and writes the numbers to `.workspace/output/render-perf/`.
 *
 *   node --import tsx/esm test/perf/rendering/run-allocation.ts
 *   (or: pnpm perf:renderers:alloc)
 *
 * ⚠️ RESOLVES TO `dist`, NOT THE WORKING TREE. This launcher runs under plain
 * `node --import tsx/esm`, so the package's `#*` subpath imports resolve via their
 * `default` condition to `./dist/esm/*.js` — i.e. the LAST BUILD, not your edited
 * `src`. (The `@codexo/source` condition would point at `src`, but then tsx chokes
 * on the raw `.frag`/`.vert` GLSL imports, which only the vitest projects wire up.)
 * For a source-accurate before/after gate use the allocation TEST instead
 * (`vitest --project=rendering-perf test/perf/rendering/allocation.test.ts`,
 * add `--disableConsoleIntercept` to see the per-scene numbers); that project
 * resolves `#*` → `src` and handles GLSL. Treat this script's numbers as a coarse
 * post-build cross-check only.
 *
 * Scenes are built directly via the `fixtures` builders rather than through
 * {@link buildScenarioCatalog}: the catalog pulls in the tilemap fixtures, whose
 * `@codexo/*` package imports resolve to `src` (no built dist) and then hit raw
 * `.frag` GLSL imports that node/tsx cannot load. So the tilemap family is profiled
 * by the allocation TEST (run under vitest), not here.
 *
 * Spec 04 "Harte Regel": no perf PR merges without a before/after number on the
 * scenes it targets. The allocation TEST now covers deep container nesting +
 * effect/barrier nodes (the per-scope plan-playback path 2c addressed) and
 * mesh/graphics scenes (→ 2e); this standalone launcher stays GLSL-free and so
 * still cannot profile the tilemap family. 2d (TransformBuffer hash) is CPU
 * time, not allocation — it needs a wall-clock profile, not this sampler.
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

const VIEW = { w: 1280, h: 720 };

interface Sample {
  readonly id: string;
  build(harness: WebGl2Harness): { root: import('#rendering/RenderNode').RenderNode; beforeFrame?: () => void };
}

const movingSprites = (count: number) => (harness: WebGl2Harness): { root: import('#rendering/RenderNode').RenderNode; beforeFrame?: () => void } => {
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
  { id: 'sprite/1000/8tex/static', build: () => ({ root: buildSpriteScene({ count: 1000, textures: makeTextures(8), assign: 'cycle', viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'sprite/10000/1tex/static', build: () => ({ root: buildSpriteScene({ count: 10000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'sprite/10000/1tex/moving', build: movingSprites(10000) },
  { id: 'nine-slice/100/1tex/stretch', build: () => ({ root: buildNineSliceScene({ count: 100, textures: makeTextures(1), slice: 16, width: 96, height: 96, fill: 'stretch', viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'nine-slice/100/8tex/stretch', build: () => ({ root: buildNineSliceScene({ count: 100, textures: makeTextures(8), assign: 'cycle', slice: 16, width: 96, height: 96, fill: 'stretch', viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'repeating/geometry/100/1tex', build: () => ({ root: buildRepeatingScene({ count: 100, textures: makeTextures(1), path: 'geometry', width: 128, height: 128, modeX: 'repeat', modeY: 'repeat', viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'repeating/shader/100/1tex', build: () => ({ root: buildRepeatingScene({ count: 100, textures: makeTextures(1), path: 'shader', width: 128, height: 128, modeX: 'repeat', modeY: 'repeat', viewW: VIEW.w, viewH: VIEW.h }).root }) },
  // Complex scenes — the ones that decide 2b-2f ROI (flat sprite lists barely allocate).
  { id: 'nested/1000/8per/d2', build: () => ({ root: buildNestedScene({ count: 1000, perContainer: 8, depth: 2, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'nested/1000/8per/d4', build: () => ({ root: buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'mesh/1000/1tex', build: () => ({ root: buildMeshScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
  { id: 'filtered/100/1tex', build: () => ({ root: buildFilteredScene({ count: 100, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h }).root }) },
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
