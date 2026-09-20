/**
 * The transport contracts on WebGPU - the same scenes and the same
 * expectations the WebGL2 spec runs, against the WGSL half of the chunk.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { type Case, transportCases } from './_transportCases';
import type { MaskSpec } from './_transportProbe';
import {
  PROBE_CLEAR,
  PROBE_EXHAUSTED,
  PROBE_MASK_HIT,
  PROBE_RADIANCE,
  PROBE_SIZE,
  PROBE_TRANSMITTANCE,
  PROBE_VISITED,
  probeMask,
  probeTables,
  probeUniforms,
  probeWgslSource,
  starvedSource,
} from './_transportProbe';
import { sweepMask, sweepRays } from './_transportSweep';

const probeShader = createFilterShader({ wgsl: probeWgslSource, uniforms: probeUniforms });

/** A `PROBE_SIZE`-square white texture, so the filter covers the whole frame. */
const coverTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = PROBE_SIZE;
  source.height = PROBE_SIZE;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build the probe fixture.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PROBE_SIZE, PROBE_SIZE);

  return new Texture(source);
};

const starvedShader = createFilterShader({ wgsl: starvedSource(probeWgslSource, 4), uniforms: probeUniforms });

/**
 * One trace over a chunk with four steps to spend, which every stretch here
 * outruns. Answers whether the walk says it ran out, and what got through.
 */
const runStarved = async (
  ctx: { skip: (reason: string) => void },
  mask: MaskSpec | undefined,
  stretch: readonly [number, number, number, number],
): Promise<readonly number[][] | null> => {
  const backend = await createWebGpuTestBackend(PROBE_SIZE);
  const tables = probeTables([], [], new Rectangle(0, 0, 64, 64), 1);
  const bound = probeMask(mask, true);
  const filter = ShaderFilter.from(starvedShader, {
    textures: {
      uSegments: tables.segments,
      uEmitters: tables.emitters,
      uCells: tables.cells,
      uIndices: tables.indices,
      uMask: bound.texture,
      uMaskCoarse: bound.coarse,
    },
  });
  const texture = coverTexture();
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.filters = [filter];
  root.addChild(sprite);

  filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
  filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
  filter.uniforms.uCellSize.set(tables.cellSize);
  filter.uniforms.uTableWidth.set(256);
  filter.uniforms.uScale.set(1);
  filter.uniforms.uMaskCells.set(bound.cells[0], bound.cells[1]);
  filter.uniforms.uMaskBasis.set(bound.basis[0], bound.basis[1], bound.basis[2], bound.basis[3]);
  filter.uniforms.uMaskOffset.set(bound.offset[0], bound.offset[1]);
  filter.uniforms.uMaskBlocks.set(bound.blocks[0], bound.blocks[1]);
  filter.uniforms.uA.set(stretch[0], stretch[1]);
  filter.uniforms.uB.set(stretch[2], stretch[3]);

  const readings: number[][] = [];

  try {
    for (const mode of [PROBE_EXHAUSTED, PROBE_TRANSMITTANCE, PROBE_VISITED] as const) {
      filter.uniforms.uMode.set(mode);

      if (!(await renderWebGpuOnce(ctx, backend, root, PROBE_CLEAR))) return null;

      readings.push([...readWebGpuPixels(backend, PROBE_SIZE)(PROBE_SIZE / 2, PROBE_SIZE / 2)]);
    }
  } finally {
    root.destroy();
    filter.destroy();
    texture.destroy();
    tables.destroy();
    bound.destroy();
    backend.destroy();
  }

  return readings;
};

describe('the block level against the flat walk (WebGPU)', () => {
  test('every stretch of the sweep finds the same wall either way', async ctx => {
    const backend = await createWebGpuTestBackend(PROBE_SIZE);
    const tables = probeTables([], []);
    const mask = probeMask(sweepMask(), true);
    const filter = ShaderFilter.from(probeShader, {
      textures: {
        uSegments: tables.segments,
        uEmitters: tables.emitters,
        uCells: tables.cells,
        uIndices: tables.indices,
        uMask: mask.texture,
        uMaskCoarse: mask.coarse,
      },
    });
    const texture = coverTexture();
    const root = new Container();
    const sprite = new Sprite(texture);

    sprite.filters = [filter];
    root.addChild(sprite);

    filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
    filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
    filter.uniforms.uCellSize.set(tables.cellSize);
    filter.uniforms.uTableWidth.set(256);
    filter.uniforms.uScale.set(1);
    filter.uniforms.uMaskCells.set(mask.cells[0], mask.cells[1]);
    filter.uniforms.uMaskBasis.set(mask.basis[0], mask.basis[1], mask.basis[2], mask.basis[3]);
    filter.uniforms.uMaskOffset.set(mask.offset[0], mask.offset[1]);
    filter.uniforms.uMode.set(PROBE_MASK_HIT);

    try {
      for (const [ax, ay, bx, by] of sweepRays()) {
        filter.uniforms.uA.set(ax, ay);
        filter.uniforms.uB.set(bx, by);

        const readings: number[] = [];

        for (const blocks of [mask.blocks, [0, 0] as const]) {
          filter.uniforms.uMaskBlocks.set(blocks[0]!, blocks[1]!);

          if (!(await renderWebGpuOnce(ctx, backend, root, PROBE_CLEAR))) return;

          readings.push(readWebGpuPixels(backend, PROBE_SIZE)(PROBE_SIZE / 2, PROBE_SIZE / 2)[0]);
        }

        expect(Math.abs(readings[0]! - readings[1]!), `${ax},${ay} to ${bx},${by}`).toBeLessThanOrEqual(1);
      }
    } finally {
      root.destroy();
      filter.destroy();
      texture.destroy();
      tables.destroy();
      mask.destroy();
      backend.destroy();
    }
    // Eighty round-trips through one device: three seconds on a quiet machine,
    // and past the default the moment the rest of the lane shares the adapter.
  }, 60000);
});

describe('a walk with no budget left (WebGPU)', () => {
  test('the cell walk reports running out and blocks rather than reporting what it never read', async ctx => {
    const readings = await runStarved(ctx, undefined, [0.1, 0.2, 63.9, 63.7]);

    if (readings === null) return;

    expect(readings[0]![0], 'ran out').toBe(255);
    expect(readings[1]![0], 'what got through').toBe(0);
    expect(readings[2]![0], 'cells read').toBe(4);
  });

  test('the mask walk reports running out and blocks the stretch where it stopped', async ctx => {
    const readings = await runStarved(ctx, { texels: 64, world: new Rectangle(0, 0, 64, 64), blocked: [] }, [0.1, 32, 63.9, 32]);

    if (readings === null) return;

    expect(readings[0]![0], 'ran out').toBe(255);
    expect(readings[1]![0], 'what got through').toBe(0);
  });
});

describe('traceSegment holds its transport contracts (WebGPU)', () => {
  for (const scenario of transportCases()) {
    test(scenario.name, async ctx => {
      const backend = await createWebGpuTestBackend(PROBE_SIZE);
      const tables = probeTables(scenario.segments, scenario.lights, scenario.region, scenario.cell);
      const mask = probeMask(scenario.mask, true);
      const filter = ShaderFilter.from(probeShader, {
        textures: {
          uSegments: tables.segments,
          uEmitters: tables.emitters,
          uCells: tables.cells,
          uIndices: tables.indices,
          uMask: mask.texture,
          uMaskCoarse: mask.coarse,
        },
      });
      const texture = coverTexture();
      const root = new Container();
      const sprite = new Sprite(texture);

      sprite.filters = [filter];
      root.addChild(sprite);

      filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
      filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
      filter.uniforms.uCellSize.set(tables.cellSize);
      filter.uniforms.uTableWidth.set(256);
      filter.uniforms.uMaskCells.set(mask.cells[0], mask.cells[1]);
      filter.uniforms.uMaskBasis.set(mask.basis[0], mask.basis[1], mask.basis[2], mask.basis[3]);
      filter.uniforms.uMaskOffset.set(mask.offset[0], mask.offset[1]);
      filter.uniforms.uMaskBlocks.set(mask.blocks[0], mask.blocks[1]);
      filter.uniforms.uScale.set(scenario.scale);

      const radiance: number[][] = [];
      const through: number[][] = [];
      const visited: number[][] = [];
      const hit: number[][] = [];
      const drained: number[][] = [];
      const flatHit: number[][] = [];
      const flatVisited: number[][] = [];

      try {
        for (const [ax, ay, bx, by] of scenario.traces) {
          filter.uniforms.uA.set(ax, ay);
          filter.uniforms.uB.set(bx, by);

          for (const [mode, into] of [
            [PROBE_RADIANCE, radiance],
            [PROBE_TRANSMITTANCE, through],
            [PROBE_VISITED, visited],
            [PROBE_MASK_HIT, hit],
            [PROBE_EXHAUSTED, drained],
          ] as const) {
            filter.uniforms.uMode.set(mode);

            if (!(await renderWebGpuOnce(ctx, backend, root, PROBE_CLEAR))) return;

            into.push([...readWebGpuPixels(backend, PROBE_SIZE)(PROBE_SIZE / 2, PROBE_SIZE / 2)]);
          }

          if (scenario.mask === undefined) continue;

          // The same stretch again with no block level bound, which is the
          // walk the hierarchy has to agree with texel for texel.
          filter.uniforms.uMaskBlocks.set(0, 0);

          for (const [mode, into] of [
            [PROBE_MASK_HIT, flatHit],
            [PROBE_VISITED, flatVisited],
          ] as const) {
            filter.uniforms.uMode.set(mode);

            if (!(await renderWebGpuOnce(ctx, backend, root, PROBE_CLEAR))) return;

            into.push([...readWebGpuPixels(backend, PROBE_SIZE)(PROBE_SIZE / 2, PROBE_SIZE / 2)]);
          }

          filter.uniforms.uMaskBlocks.set(mask.blocks[0], mask.blocks[1]);
        }

        for (const reading of drained) {
          // The work count says nothing about this: a stretch that misses the
          // grid legitimately reads zero and a long one can fill the byte.
          // Whether the walk finished is its own answer, and every contract
          // case expects one that did.
          expect(reading[0], 'the walk ran out of its budget').toBe(0);
        }

        for (let index = 0; index < flatHit.length; index++) {
          // Skipping a block may not skip a wall: the hierarchy exists to read
          // fewer texels, not to answer differently.
          expect(Math.abs(hit[index]![0]! - flatHit[index]![0]!), 'hit with and without the block level').toBeLessThanOrEqual(1);
        }

        (scenario as Case).check(radiance, through, visited, hit, flatVisited);
      } finally {
        root.destroy();
        filter.destroy();
        texture.destroy();
        tables.destroy();
        mask.destroy();
        mask.destroy();
        backend.destroy();
      }
    });
  }
});
