/**
 * Measurement run: what a frame costs under each walk, on the real card.
 *
 * Needs the WebGL2 lane pointed at `--use-angle=d3d11`; on SwiftShader the
 * numbers say something about a CPU rasteriser and nothing about the renderer.
 * Reports by failing, like the other measurement runs.
 *
 * Run via:  pnpm test:browser:webgl zz-timing
 */

import { Lighting, PointLight, PolygonOccluder, radiance } from '@codexo/exojs-lighting';
import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { makeTestApp, makeTestCanvas, readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

/** Frames thrown away before timing, so compilation and first upload are not in it. */
const WARM_UP = 10;
/** Frames timed. Each ends in a one-pixel read, which is what makes the GPU finish before the clock stops. */
const RUNS = 40;

interface Host {
  readonly backend: WebGl2Backend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly size: number;
  destroy(): void;
}

const createHost = async (size: number): Promise<Host> => {
  const app = makeTestApp(makeTestCanvas(size), size);
  const frameTexture = new RenderTexture(size, size);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();

  Object.assign(app, { framePasses, frameTexture, onResize, width: size, height: size });

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  const context = new RenderingContext(backend);

  context.view = new View(size / 2, size / 2, size, size);
  Object.assign(app, { rendering: context });

  const white = new Sprite(Texture.fromColor(Color.white, 1));

  white.width = size;
  white.height = size;
  context.renderTo(white, { target: frameTexture, clear: Color.black });
  white.destroy();

  return {
    backend,
    context,
    app,
    size,
    destroy: (): void => {
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

/** A room with four walls, two lamps and a bar across it: what a scene looks like, not what a microbenchmark does. */
const buildScene = (host: Host, cascades: number | undefined): Lighting => {
  const size = host.size;
  const lighting = new Lighting({
    quality: radiance({ probeSpacing: 2, bounce: 0, ...(cascades !== undefined && { cascades }) }),
    app: host.app,
    ambient: Color.black,
    lightResolution: 1,
  });

  lighting.add(new PointLight({ radius: size * 0.7, intensity: 1, softness: 0.4 })).setPosition(size * 0.2, size * 0.3);
  lighting.add(new PointLight({ radius: size * 0.5, intensity: 0.7, softness: 0.2 })).setPosition(size * 0.75, size * 0.7);

  for (const [ax, ay, bx, by] of [
    [0.1, 0.1, 0.9, 0.1],
    [0.9, 0.1, 0.9, 0.9],
    [0.9, 0.9, 0.1, 0.9],
    [0.1, 0.9, 0.1, 0.1],
    [0.45, 0.2, 0.45, 0.6],
    [0.55, 0.8, 0.85, 0.8],
  ] as const) {
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: ax * size, y: ay * size },
          { x: bx * size, y: by * size },
        ],
        { closed: false },
      ),
    );
  }

  return lighting;
};

const percentile = (sorted: readonly number[], fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;

const time = (host: Host, lighting: Lighting, walk: 'field' | 'transport'): string => {
  const backend = lighting.backend as LightmapBackend;
  const samples: number[] = [];

  backend.lightWalk = walk;

  for (let run = 0; run < WARM_UP + RUNS; run++) {
    const started = performance.now();

    lighting.update();
    host.backend.clear(Color.black);
    host.app.framePasses.execute(host.context);
    host.backend.flush();
    // Reading one pixel is what makes the driver finish the frame before the
    // clock is read; without it the numbers are queue submission times.
    readWebGl2Pixel(host.backend, host.size / 2, host.size / 2);

    if (run >= WARM_UP) {
      samples.push(performance.now() - started);
    }
  }

  samples.sort((left, right) => left - right);

  return `median ${percentile(samples, 0.5).toFixed(2)} ms, p95 ${percentile(samples, 0.95).toFixed(2)} ms`;
};

describe('what a frame costs', () => {
  test('field against transport, direct light only', async () => {
    const lines: string[] = [];

    {
      const probe = await createHost(64);

      const gl = probe.backend.context;
      const info = gl.getExtension('WEBGL_debug_renderer_info');

      lines.push(`MEAS|time|renderer ${String(info === null ? gl.getParameter(0x1f01) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL))}`);
      probe.destroy();
    }

    for (const size of [256, 512]) {
      const host = await createHost(size);

      try {
        for (const cascades of [undefined, 3]) {
          const lighting = buildScene(host, cascades);
          const name = cascades === undefined ? 'default levels' : `${cascades} levels`;

          try {
            for (const walk of ['field', 'transport'] as const) {
              lines.push(`MEAS|time|${size}px ${name} ${walk}: ${time(host, lighting, walk)}`);
            }
          } finally {
            lighting.destroy();
          }
        }
      } finally {
        host.destroy();
      }
    }

    expect(lines.join('\n')).toBe('');
  }, 600000);
});
