/**
 * The transport contracts on WebGPU - the same scenes and the same
 * expectations the WebGL2 spec runs, against the WGSL half of the chunk.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { type Case, transportCases } from './_transportCases';
import {
  PROBE_CLEAR,
  PROBE_MASK_HIT,
  PROBE_RADIANCE,
  PROBE_SIZE,
  PROBE_TRANSMITTANCE,
  PROBE_VISITED,
  probeMask,
  probeTables,
  probeUniforms,
  probeWgslSource,
} from './_transportProbe';

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

describe('traceSegment holds its transport contracts (WebGPU)', () => {
  for (const scenario of transportCases()) {
    test(scenario.name, async ctx => {
      const backend = await createWebGpuTestBackend(PROBE_SIZE);
      const tables = probeTables(scenario.segments, scenario.lights, scenario.region, scenario.cell);
      const mask = probeMask(scenario.mask);
      const filter = ShaderFilter.from(probeShader, {
        textures: {
          uSegments: tables.segments,
          uEmitters: tables.emitters,
          uCells: tables.cells,
          uIndices: tables.indices,
          uMask: mask.texture,
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
      filter.uniforms.uScale.set(scenario.scale);

      const radiance: number[][] = [];
      const through: number[][] = [];
      const visited: number[][] = [];
      const hit: number[][] = [];

      try {
        for (const [ax, ay, bx, by] of scenario.traces) {
          filter.uniforms.uA.set(ax, ay);
          filter.uniforms.uB.set(bx, by);

          for (const [mode, into] of [
            [PROBE_RADIANCE, radiance],
            [PROBE_TRANSMITTANCE, through],
            [PROBE_VISITED, visited],
            [PROBE_MASK_HIT, hit],
          ] as const) {
            filter.uniforms.uMode.set(mode);

            if (!(await renderWebGpuOnce(ctx, backend, root, PROBE_CLEAR))) return;

            into.push([...readWebGpuPixels(backend, PROBE_SIZE)(PROBE_SIZE / 2, PROBE_SIZE / 2)]);
          }
        }

        for (const reading of visited) {
          // A walk that saturated the byte either ran out of its step budget
          // or came within one of it; neither is reachable on a grid this
          // small.
          expect(reading[0], 'cells visited').toBeGreaterThan(0);
          expect(reading[0], 'cells visited').toBeLessThan(255);
        }

        (scenario as Case).check(radiance, through, visited, hit);
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
