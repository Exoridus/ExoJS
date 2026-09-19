/**
 * The transport contracts on WebGL2.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describe, test } from 'vitest';

import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { type Case, transportCases } from './_transportCases';
import { PROBE_CLEAR, PROBE_RADIANCE, PROBE_SIZE, PROBE_TRANSMITTANCE, probeFragmentSource, probeTables, probeUniforms } from './_transportProbe';

const probeShader = createFilterShader({ glsl: { fragment: probeFragmentSource }, uniforms: probeUniforms });

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

const runCase = async (scenario: Case): Promise<void> => {
  const backend = await createWebGl2TestBackend(PROBE_SIZE);
  const tables = probeTables(scenario.segments, scenario.lights);
  const filter = ShaderFilter.from(probeShader, {
    textures: { uSegments: tables.segments, uEmitters: tables.emitters, uCells: tables.cells, uIndices: tables.indices },
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
  filter.uniforms.uScale.set(scenario.scale);

  const radiance: number[][] = [];
  const through: number[][] = [];

  try {
    for (const [ax, ay, bx, by] of scenario.traces) {
      filter.uniforms.uA.set(ax, ay);
      filter.uniforms.uB.set(bx, by);

      for (const [mode, into] of [
        [PROBE_RADIANCE, radiance],
        [PROBE_TRANSMITTANCE, through],
      ] as const) {
        filter.uniforms.uMode.set(mode);
        renderWebGl2Once(backend, root, PROBE_CLEAR);
        into.push([...readWebGl2Pixel(backend, PROBE_SIZE / 2, PROBE_SIZE / 2)]);
      }
    }

    scenario.check(radiance, through);
  } finally {
    root.destroy();
    filter.destroy();
    texture.destroy();
    tables.destroy();
    backend.destroy();
  }
};

describe('traceSegment holds its transport contracts (WebGL2)', () => {
  for (const scenario of transportCases()) {
    test(scenario.name, async () => {
      await runCase(scenario);
    });
  }
});
