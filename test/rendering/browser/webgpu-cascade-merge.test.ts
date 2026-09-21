/**
 * What one cascade level makes of the level above it, over the transport walk,
 * on WebGPU - the same scenes and the same expectations the WebGL2 spec runs.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { cascadeUniforms } from '../../../packages/exojs-lighting/src/backends/radianceField';
import { transportCascadeShader } from '../../../packages/exojs-lighting/src/backends/transportShaders';
import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { COARSE_LEVEL, MERGE_CELL, MERGE_PROBES, MERGE_RANGE, MERGE_SPACING, MERGE_TILE, MERGE_WORLD, type MergeCase, mergeCases } from './_cascadeMergeCases';
import { probeMask, probeTables } from './_transportProbe';

const size = MERGE_PROBES * MERGE_TILE;

const mergeShader = transportCascadeShader(cascadeUniforms);

/** The level above, as the filter's own input: one constant everywhere. */
const coarseTexture = (level: number): Texture => Texture.fromColor(new Color(level, level, level), size);

/**
 * Which canvas pixel one probe's direction wrote. A fragment's row counts from
 * the top here, the same way the reader's does, so the two agree.
 */
const readTexel = (backend: Parameters<typeof readWebGpuPixels>[0], probeX: number, probeY: number, direction: number): number => {
  const within = [direction % MERGE_TILE, Math.floor(direction / MERGE_TILE)];

  return readWebGpuPixels(backend, size)(probeX * MERGE_TILE + within[0]!, probeY * MERGE_TILE + within[1]!)[0]!;
};

const runCase = async (ctx: { skip: (reason: string) => void }, scenario: MergeCase): Promise<void> => {
  const backend = await createWebGpuTestBackend(size);
  const tables = probeTables(scenario.segments, scenario.lights, MERGE_WORLD, MERGE_CELL);
  const mask = probeMask();
  const filter = ShaderFilter.from(mergeShader, {
    textures: {
      uSegments: tables.segments,
      uEmitters: tables.emitters,
      uCells: tables.cells,
      uIndices: tables.indices,
      uMask: mask.texture,
      uMaskCoarse: mask.coarse,
      uMaskSuper: mask.super,
      // The bounce reads these; with the factor at zero neither is sampled.
      uFrame: mask.texture,
      uHistory: mask.texture,
    },
  });
  const root = new Container();
  const readings: number[] = [];

  filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
  filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
  filter.uniforms.uCellSize.set(tables.cellSize);
  filter.uniforms.uTableWidth.set(256);
  filter.uniforms.uMaskCells.set(0, 0);
  filter.uniforms.uMaskBlocks.set(0, 0);
  filter.uniforms.uMaskSuperblocks.set(0, 0);
  filter.uniforms.uMaskBasis.set(1, 0, 0, 1);
  filter.uniforms.uMaskOffset.set(0, 0);
  filter.uniforms.uOrigin.set(MERGE_WORLD.x, MERGE_WORLD.y);
  filter.uniforms.uProbes.set(MERGE_PROBES, MERGE_PROBES);
  filter.uniforms.uSpacing.set(MERGE_SPACING);
  filter.uniforms.uTile.set(MERGE_TILE);
  filter.uniforms.uRange.set(0, MERGE_RANGE);
  filter.uniforms.uMerge.set(1);
  filter.uniforms.uCone.set(Math.tan(Math.PI / (MERGE_TILE * MERGE_TILE)));
  filter.uniforms.uSun.set(0, 0, 0, 0);
  filter.uniforms.uSunColor.set(0, 0, 0);
  filter.uniforms.uBounce.set(0);
  filter.uniforms.uBounceStep.set(1);
  filter.uniforms.uAlbedoStep.set(1);
  filter.uniforms.uHistoryValid.set(0);
  filter.uniforms.uToClip.set(1, 0, 0, 1);
  filter.uniforms.uClipOffset.set(0, 0);
  filter.uniforms.uReproject.set(1, 0, 0, 1);
  filter.uniforms.uReprojectOffset.set(0, 0);

  try {
    for (const level of [COARSE_LEVEL, 0]) {
      const texture = coarseTexture(level);
      const sprite = new Sprite(texture);

      sprite.filters = [filter];
      root.addChild(sprite);
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      readings.push(readTexel(backend, scenario.probe[0], scenario.probe[1], scenario.direction));
      root.removeChild(sprite);
      sprite.destroy();
      texture.destroy();
    }

    scenario.check(readings[0]!, readings[1]!);
  } finally {
    root.destroy();
    filter.destroy();
    tables.destroy();
    mask.destroy();
    backend.destroy();
  }
};

describe('one cascade level over the transport walk (WebGPU)', () => {
  for (const scenario of mergeCases()) {
    test(scenario.name, async ctx => {
      await runCase(ctx, scenario);
    });
  }
});
