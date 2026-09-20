/**
 * Measurement run: where the transport walk is furthest from the direct
 * reference, and whether that distance closes as the sampling is refined.
 *
 * Reports by failing, like the other measurement runs. Not a contract.
 *
 * Run via:  pnpm test:browser:webgpu zz-nearfield
 */

import { Lighting, PointLight, radiance } from '@codexo/exojs-lighting';
import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { transportTableWidth } from '../../../packages/exojs-lighting/src/backends/transportGeometry';
import { makeTestApp, makeTestCanvas, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { referenceFragmentSource, referenceUniforms, referenceWgslSource } from './_referenceProbe';

const canvasSize = 128;
const GRID = 16;
const STEP = canvasSize / GRID;
const LAMP = { x: 16, y: 32, radius: 40, intensity: 0.6 } as const;

const referenceShader = createFilterShader({ glsl: { fragment: referenceFragmentSource }, wgsl: referenceWgslSource, uniforms: referenceUniforms });

interface Host {
  readonly backend: WebGpuBackend;
  readonly context: RenderingContext;
  readonly app: Application;
  destroy(): void;
}

const createHost = async (): Promise<Host> => {
  const app = makeTestApp(makeTestCanvas(canvasSize), canvasSize);
  const frameTexture = new RenderTexture(canvasSize, canvasSize);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();

  Object.assign(app, { framePasses, frameTexture, onResize, width: canvasSize, height: canvasSize });

  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  const context = new RenderingContext(backend);

  context.view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);
  Object.assign(app, { rendering: context });

  const white = new Sprite(Texture.fromColor(Color.white, 1));

  white.width = canvasSize;
  white.height = canvasSize;
  context.renderTo(white, { target: frameTexture, clear: Color.black });
  white.destroy();

  return {
    backend,
    context,
    app,
    destroy: (): void => {
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

interface Quality {
  readonly name: string;
  readonly probeSpacing: number;
  readonly lightResolution: number;
  readonly interval?: number;
}

const readGrid = (host: Host, spread: number): number[] => {
  const read = readWebGpuPixels(host.backend, canvasSize);
  const rows: number[] = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      rows.push(read(x * spread + spread / 2, y * spread + spread / 2)[0]!);
    }
  }

  return rows;
};

describe('the near-field worst case', () => {
  test('where it is, and whether refining the sampling closes it', async ctx => {
    const host = await createHost();
    const root = new Container();
    const cover = Texture.fromColor(Color.white, GRID);
    const sprite = new Sprite(cover);
    const lines: string[] = [];

    root.addChild(sprite);

    const qualities: readonly Quality[] = [
      { name: 'spacing 2, resolution 1', probeSpacing: 2, lightResolution: 1 },
      { name: 'spacing 1, resolution 1', probeSpacing: 1, lightResolution: 1 },
      { name: 'spacing 1, resolution 2', probeSpacing: 1, lightResolution: 2 },
      { name: 'spacing 1, resolution 2, interval 0.5', probeSpacing: 1, lightResolution: 2, interval: 0.5 },
    ];

    try {
      for (const quality of qualities) {
        const lighting = new Lighting({
          quality: radiance({ bounce: 0, probeSpacing: quality.probeSpacing, ...(quality.interval !== undefined && { interval: quality.interval }) }),
          app: host.app,
          ambient: Color.black,
          lightResolution: quality.lightResolution,
        });
        const backend = lighting.backend as LightmapBackend;

        backend.lightWalk = 'transport';
        lighting.add(new PointLight({ radius: LAMP.radius, intensity: LAMP.intensity, softness: 0 })).setPosition(LAMP.x, LAMP.y);
        lighting.update();
        host.backend.clear(Color.black);
        host.app.framePasses.execute(host.context);
        host.backend.flush();

        const measured = readGrid(host, STEP);
        const tables = backend.transport;
        const blocks = backend.maskBlocks;

        if (tables === null || blocks === null) throw new Error('no transport tables');

        const grid = tables.grid;
        const filter = ShaderFilter.from(referenceShader, {
          textures: {
            uSegments: tables.segments,
            uEmitters: tables.emitters,
            uCells: tables.cells,
            uIndices: tables.indices,
            uMask: backend.maskTexture,
            uMaskCoarse: blocks.texture,
          },
        });

        sprite.filters = [filter];
        filter.uniforms.uGridOrigin.set(grid.originX, grid.originY);
        filter.uniforms.uGridCells.set(grid.width, grid.height);
        filter.uniforms.uCellSize.set(grid.cellSize);
        filter.uniforms.uTableWidth.set(transportTableWidth);
        filter.uniforms.uMaskCells.set(0, 0);
        filter.uniforms.uMaskBlocks.set(0, 0);
        filter.uniforms.uMaskBasis.set(1, 0, 0, 1);
        filter.uniforms.uMaskOffset.set(0, 0);
        filter.uniforms.uToWorld.set(canvasSize / 2, 0, 0, canvasSize / 2);
        filter.uniforms.uWorldOffset.set(canvasSize / 2, canvasSize / 2);
        filter.uniforms.uReach.set(512);
        filter.uniforms.uScale.set(1);
        filter.uniforms.uDirections.set(4096);

        if (!(await renderWebGpuOnce(ctx, host.backend, root, Color.black))) throw new Error('the reference did not render');

        const reference = readGrid(host, 1);

        sprite.filters = [];

        let worst = 0;
        let worstAt = -1;
        let sum = 0;
        let lit = 0;

        for (let index = 0; index < reference.length; index++) {
          const truth = reference[index]!;
          const value = measured[index]!;

          if (truth < 20 || truth >= 250 || value >= 250) continue;

          const error = Math.abs(value - truth) / truth;

          sum += error;
          lit++;

          if (error > worst) {
            worst = error;
            worstAt = index;
          }
        }

        const x = (worstAt % GRID) * STEP + STEP / 2;
        const y = Math.floor(worstAt / GRID) * STEP + STEP / 2;
        const away = Math.hypot(x - LAMP.x, y - LAMP.y);

        lines.push(
          `MEAS|near|${quality.name}: mean ${((sum / Math.max(lit, 1)) * 100).toFixed(1)}% over ${lit} | worst ${(worst * 100).toFixed(0)}% at ${x},${y} ` +
            `(${away.toFixed(0)} from the lamp, reference ${reference[worstAt]!} measured ${measured[worstAt]!})`,
        );

        // The same receiver at every quality, so the sequence is comparable.
        const fixed = 5 * GRID + 2;
        const fixedError = Math.abs(measured[fixed]! - reference[fixed]!) / Math.max(reference[fixed]!, 1);

        lines.push(`MEAS|near|${quality.name}: at 20,44 reference ${reference[fixed]!} measured ${measured[fixed]!} error ${(fixedError * 100).toFixed(0)}%`);

        filter.destroy();
        lighting.destroy();
      }
    } finally {
      root.destroy();
      cover.destroy();
      host.destroy();
    }

    expect(lines.join('\n')).toBe('');
  }, 600000);
});
