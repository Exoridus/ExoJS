/**
 * Measurement run: the two walks against a direct reference, direct light
 * only, and the leak behind a wall as the sampling is refined.
 *
 * Not a contract. It reports by failing, because this lane prints nothing a
 * passing test says, and it asserts no bound of its own: what it finds is to
 * be read rather than baselined.
 *
 * Run via:  pnpm test:browser:webgpu zz-direct
 */

import { Lighting, PointLight, PolygonOccluder, radiance } from '@codexo/exojs-lighting';
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
/** Receivers across and up: one every eight pixels, off the pixel edges. */
const GRID = 16;
const STEP = canvasSize / GRID;

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

interface SceneOptions {
  readonly wall: number;
  readonly probeSpacing?: number;
  readonly interval?: number;
  readonly cascades?: number;
  readonly softness?: number;
  /** The wide lamp the leak rows use, which reaches past the wall. */
  readonly wide?: boolean;
}

interface Scene {
  readonly lighting: Lighting;
  readonly backend: LightmapBackend;
  destroy(): void;
}

/** The lamp every scene has, and where the wall stands. */
const LAMP = { x: 16, y: 32, radius: 40, intensity: 0.6 } as const;
/** The lamp the leak rows use: wide enough that the receivers behind the wall are lit without it. */
const WIDE_LAMP = { x: 24, y: 64, radius: 96, intensity: 1 } as const;
const WALL_X = 64;

const buildScene = (app: Application, options: SceneOptions): Scene => {
  const lighting = new Lighting({
    quality: radiance({
      bounce: 0,
      probeSpacing: options.probeSpacing ?? 2,
      ...(options.interval !== undefined && { interval: options.interval }),
      ...(options.cascades !== undefined && { cascades: options.cascades }),
    }),
    app,
    ambient: Color.black,
    lightResolution: 1,
  });
  const backend = lighting.backend as LightmapBackend;

  const lamp = options.wide === true ? WIDE_LAMP : LAMP;

  lighting.add(new PointLight({ radius: lamp.radius, intensity: lamp.intensity, softness: options.softness ?? 0 })).setPosition(lamp.x, lamp.y);

  if (options.wall > 0) {
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: WALL_X, y: lamp.y - options.wall / 2 },
          { x: WALL_X, y: lamp.y + options.wall / 2 },
        ],
        { closed: false },
      ),
    );
  }

  return { lighting, backend, destroy: (): void => lighting.destroy() };
};

const runFrame = (host: Host, scene: Scene, walk: 'field' | 'transport'): void => {
  scene.backend.lightWalk = walk;
  scene.lighting.update();
  host.backend.clear(Color.black);
  host.app.framePasses.execute(host.context);
  host.backend.flush();
};

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

const readAt = (host: Host, x: number, y: number): number => readWebGpuPixels(host.backend, canvasSize)(x, y)[0]!;

/** The three receivers behind the wall that every leak row reads. */
const BEHIND: ReadonlyArray<readonly [number, number]> = [
  [72, 64],
  [96, 64],
  [120, 64],
];

const behindOver = (shaded: readonly number[], open: readonly number[]): string =>
  shaded.map((value, index) => `${(value / Math.max(open[index]!, 1)).toFixed(2)} (${value}/${open[index]!})`).join(' ');

/**
 * How far a walk's picture is from the reference, split by what the reference
 * says is there: where it is lit, as a fraction of the reference; where it is
 * dark, as what arrived that should not have.
 */
const against = (measured: readonly number[], reference: readonly number[]): string => {
  let relative = 0;
  let worstRelative = 0;
  let lit = 0;
  let leak = 0;
  let worstLeak = 0;
  let dark = 0;

  for (let index = 0; index < measured.length; index++) {
    const value = measured[index]!;
    const truth = reference[index]!;

    if (truth >= 250 || value >= 250) continue;

    if (truth >= 20) {
      const error = Math.abs(value - truth) / truth;

      relative += error;
      worstRelative = Math.max(worstRelative, error);
      lit++;
    } else if (truth <= 2) {
      leak += value;
      worstLeak = Math.max(worstLeak, value);
      dark++;
    }
  }

  const mean = ((relative / Math.max(lit, 1)) * 100).toFixed(1);
  const worst = (worstRelative * 100).toFixed(0);

  return `lit ${lit}: mean ${mean}% worst ${worst}% | dark ${dark}: mean ${(leak / Math.max(dark, 1)).toFixed(1)} worst ${worstLeak}`;
};

describe('direct light, measured', () => {
  test('against a direct reference, and the leak as sampling is refined', async ctx => {
    const host = await createHost();
    const root = new Container();
    const cover = Texture.fromColor(Color.white, GRID);
    const sprite = new Sprite(cover);
    const lines: string[] = [];

    root.addChild(sprite);

    try {
      for (const wall of [0, 80]) {
        const scene = buildScene(host.app, { wall });

        runFrame(host, scene, 'transport');

        const transport = readGrid(host, STEP);
        const tables = scene.backend.transport;
        const blocks = scene.backend.maskBlocks;

        if (tables === null || blocks === null) throw new Error('no transport tables');

        const grid = tables.grid;
        const filter = ShaderFilter.from(referenceShader, {
          textures: {
            uSegments: tables.segments,
            uEmitters: tables.emitters,
            uCells: tables.cells,
            uIndices: tables.indices,
            uMask: scene.backend.maskTexture,
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

        const references: Record<number, number[]> = {};

        for (const directions of [256, 1024, 4096]) {
          filter.uniforms.uDirections.set(directions);

          if (!(await renderWebGpuOnce(ctx, host.backend, root, Color.black))) throw new Error('the reference did not render');

          references[directions] = readGrid(host, 1);
        }

        sprite.filters = [];
        runFrame(host, scene, 'field');

        const field = readGrid(host, STEP);
        const name = wall > 0 ? 'wall' : 'open';

        lines.push(`MEAS|${name}|reference 256 vs 4096: ${against(references[256]!, references[4096]!)}`);
        lines.push(`MEAS|${name}|reference 1024 vs 4096: ${against(references[1024]!, references[4096]!)}`);
        lines.push(`MEAS|${name}|transport vs reference: ${against(transport, references[4096]!)}`);
        lines.push(`MEAS|${name}|field vs reference: ${against(field, references[4096]!)}`);

        filter.destroy();
        scene.destroy();
      }

      // The small-source falloff: the receivers sit 12 and 24 world units from
      // the lamp, so a source resolved as a point falls off by two.
      {
        const scene = buildScene(host.app, { wall: 0 });
        const ratios: string[] = [];

        for (const walk of ['field', 'transport'] as const) {
          runFrame(host, scene, walk);
          ratios.push(`${walk} ${(readAt(host, 28, 32) / Math.max(readAt(host, 40, 32), 1)).toFixed(3)}`);
        }

        lines.push(`MEAS|falloff|near over far, analytic 2.000: ${ratios.join(' | ')}`);
        scene.destroy();
      }

      // What is left behind the wall, over what the same receivers read with
      // the wall taken away.
      for (const probeSpacing of [1, 2, 4]) {
        for (const interval of [0.5, 1, 2]) {
          for (const cascades of [3, 4, 5, 6]) {
            const lit = buildScene(host.app, { wall: 0, probeSpacing, interval, cascades, wide: true });

            runFrame(host, lit, 'transport');

            const open = BEHIND.map(([x, y]) => readAt(host, x, y));

            lit.destroy();

            const shaded = buildScene(host.app, { wall: 80, probeSpacing, interval, cascades, wide: true });

            runFrame(host, shaded, 'transport');

            const behind = BEHIND.map(([x, y]) => readAt(host, x, y));

            shaded.destroy();
            lines.push(`MEAS|leak|spacing ${probeSpacing} interval ${interval} cascades ${cascades}: ${behindOver(behind, open)}`);
          }
        }
      }

      // The same, by how long the wall is and how large the source is.
      for (const wall of [24, 80, 128]) {
        for (const softness of [0, 1]) {
          const lit = buildScene(host.app, { wall: 0, cascades: 5, softness, wide: true });

          runFrame(host, lit, 'transport');

          const open = BEHIND.map(([x, y]) => readAt(host, x, y));

          lit.destroy();

          const shaded = buildScene(host.app, { wall, cascades: 5, softness, wide: true });

          runFrame(host, shaded, 'transport');

          const behind = BEHIND.map(([x, y]) => readAt(host, x, y));

          shaded.destroy();
          lines.push(`MEAS|shape|wall ${wall} softness ${softness}: ${behindOver(behind, open)}`);
        }
      }
    } finally {
      root.destroy();
      cover.destroy();
      host.destroy();
    }

    expect(lines.join('\n')).toBe('');
  }, 600000);
});
