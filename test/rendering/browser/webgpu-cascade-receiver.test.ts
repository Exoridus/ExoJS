/**
 * What a fragment makes of the probes around it, over the transport walk, on
 * WebGPU - the same scenes and the same expectations the WebGL2 spec runs.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { gatherUniforms } from '../../../packages/exojs-lighting/src/backends/radianceField';
import { transportGatherShader } from '../../../packages/exojs-lighting/src/backends/transportShaders';
import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import {
  FINEST_LEVEL,
  RECEIVER_AT,
  RECEIVER_CELL,
  RECEIVER_PIXEL,
  RECEIVER_PROBES,
  RECEIVER_SIZE,
  RECEIVER_SPACING,
  RECEIVER_TILE,
  RECEIVER_WORLD,
  type ReceiverCase,
  receiverCases,
} from './_cascadeReceiverCases';
import { probeMask, probeTables } from './_transportProbe';

const receiverShader = transportGatherShader(gatherUniforms);

const runCase = async (ctx: { skip: (reason: string) => void }, scenario: ReceiverCase): Promise<void> => {
  const backend = await createWebGpuTestBackend(RECEIVER_SIZE);
  const tables = probeTables(scenario.segments, [], RECEIVER_WORLD, RECEIVER_CELL);
  const mask = probeMask();
  const filter = ShaderFilter.from(receiverShader, {
    textures: {
      uSegments: tables.segments,
      uEmitters: tables.emitters,
      uCells: tables.cells,
      uIndices: tables.indices,
      uMask: mask.texture,
      uMaskCoarse: mask.coarse,
    },
  });
  // The finest cascade, one constant everywhere: the filter's own input.
  const texture = Texture.fromColor(new Color(FINEST_LEVEL, FINEST_LEVEL, FINEST_LEVEL), RECEIVER_PROBES * RECEIVER_TILE);
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = RECEIVER_SIZE;
  sprite.height = RECEIVER_SIZE;
  sprite.filters = [filter];
  root.addChild(sprite);

  // Clip to world over the square the cases describe. The fragment's own row
  // runs from the top here and clip is flipped to match, which lands the
  // fragment of interest on the same texel as on the other backend.
  filter.uniforms.uToWorld.set(RECEIVER_WORLD.width / 2, 0, 0, RECEIVER_WORLD.height / 2);
  filter.uniforms.uWorldOffset.set(RECEIVER_WORLD.width / 2, RECEIVER_WORLD.height / 2);
  filter.uniforms.uOrigin.set(RECEIVER_WORLD.x, RECEIVER_WORLD.y);
  filter.uniforms.uProbes.set(RECEIVER_PROBES, RECEIVER_PROBES);
  filter.uniforms.uSpacing.set(RECEIVER_SPACING);
  filter.uniforms.uTile.set(RECEIVER_TILE);
  filter.uniforms.uAmbient.set(0, 0, 0);
  filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
  filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
  filter.uniforms.uCellSize.set(tables.cellSize);
  filter.uniforms.uTableWidth.set(256);
  filter.uniforms.uMaskCells.set(0, 0);
  filter.uniforms.uMaskBlocks.set(0, 0);
  filter.uniforms.uMaskBasis.set(1, 0, 0, 1);
  filter.uniforms.uMaskOffset.set(0, 0);

  try {
    if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

    scenario.check(readWebGpuPixels(backend, RECEIVER_SIZE)(RECEIVER_PIXEL, RECEIVER_SIZE - 1 - RECEIVER_PIXEL)[0]!);
  } finally {
    root.destroy();
    filter.destroy();
    texture.destroy();
    tables.destroy();
    mask.destroy();
    backend.destroy();
  }
};

describe(`the fragment at ${RECEIVER_AT}, ${RECEIVER_AT} over the transport walk (WebGPU)`, () => {
  for (const scenario of receiverCases()) {
    test(scenario.name, async ctx => {
      await runCase(ctx, scenario);
    });
  }
});
