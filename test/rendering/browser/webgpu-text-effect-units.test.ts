/**
 * WebGPU: text outline and shadow lengths are logical pixels of the node's
 * local space, measured on the rendered frame - the same matrix as the WebGL2
 * suite - plus pixel parity between the two backends on identical scenes.
 *
 * Runs in the `browser-webgpu` Chromium, which provides both backends in one
 * instance; skips only when the software WebGPU adapter drops mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { makeTestApp, makeTestCanvas, readWebGl2Frame, readWebGpuFrame, renderWebGl2Once, renderWebGpuOnce } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import type { Frame } from './_textEffectUnits';
import { buildOutlineScene, buildShadowScene, effectCanvasSize, frameDifference, measureOutlineWidth } from './_textEffectUnits';
import type { EffectBackendDriver, EffectBackendSession } from './_textEffectUnitSuite';
import { runEffectUnitSuite } from './_textEffectUnitSuite';

beforeEach(() => resetDefaultGlyphAtlasPool());
afterEach(() => resetDefaultGlyphAtlasPool());

// A canvas of `size` device pixels showing `size / ratio` logical units, so
// the surface ratio reaches the screen exactly as an application's would.
const webGpuDriver: EffectBackendDriver = {
  open: async (size, surfaceRatio) => {
    const backend = new WebGpuBackend(makeTestApp(makeTestCanvas(size), size / surfaceRatio, surfaceRatio));

    wireCoreRenderers(backend);
    await backend.initialize();

    return {
      draw: async (root, ctx) => ((await renderWebGpuOnce(ctx, backend, root)) ? readWebGpuFrame(backend, size) : null),
      close: () => backend.destroy(),
    };
  },
};

const webGl2Driver: EffectBackendDriver = {
  open: async (size, surfaceRatio) => {
    const app = makeTestApp(makeTestCanvas(size), size / surfaceRatio, surfaceRatio);
    const backend = new WebGl2Backend(app);

    await backend.initialize();
    wireCoreRenderers(backend, app.options.rendering);

    return {
      draw: root => {
        renderWebGl2Once(backend, root);

        return Promise.resolve(readWebGl2Frame(backend, size));
      },
      close: () => backend.destroy(),
    };
  },
};

runEffectUnitSuite('WebGPU', webGpuDriver);

describe('WebGL2 / WebGPU effect parity', () => {
  /** The same scene drawn by both backends, built fresh for each so neither shares node state. */
  const drawBoth = async (
    ctx: { skip: (reason: string) => void },
    sessions: [EffectBackendSession, EffectBackendSession],
    build: () => { root: RenderNode; text: { destroy(): void } },
  ): Promise<[Frame, Frame] | null> => {
    const frames: Frame[] = [];

    for (const session of sessions) {
      const scene = build();
      const frame = await session.draw(scene.root, ctx);

      scene.text.destroy();

      if (frame === null) {
        return null;
      }

      frames.push(frame);
    }

    return [frames[0]!, frames[1]!];
  };

  test.for([1, 2, 3])('outline and shadow scenes match pixel for pixel within tolerance at surface ratio %i', async (surfaceRatio, ctx) => {
    const gl = await webGl2Driver.open(effectCanvasSize, surfaceRatio);
    const gpu = await webGpuDriver.open(effectCanvasSize, surfaceRatio);
    const report: string[] = [];

    try {
      const scenes: Array<[string, () => { root: RenderNode; text: { destroy(): void } }, number | null]> = [
        ['outline 2 R8 s1', () => buildOutlineScene({ outlineWidth: 2, sdfRadius: 8, surfaceRatio, scale: 1 }), 2],
        ['outline 4 R16 s2', () => buildOutlineScene({ outlineWidth: 4, sdfRadius: 16, surfaceRatio, scale: 2 }), 4],
        ['outline 1 R4 s0.5', () => buildOutlineScene({ outlineWidth: 1, sdfRadius: 4, surfaceRatio, scale: 0.5 }), null],
        ['shadow 4 blur 1', () => buildShadowScene({ offsetX: 4, blur: 1, surfaceRatio, scale: 1 }), null],
      ];

      for (const [name, build, outlineWidth] of scenes) {
        const frames = await drawBoth(ctx, [gl, gpu], build);

        if (frames === null) {
          return;
        }

        const difference = frameDifference(frames[0], frames[1]);

        report.push(`${name}: MAE ${difference.mae.toFixed(4)} P99 ${difference.p99} max ${difference.max}`);

        // Both stages compute the edge from the transform, never from a
        // hardware derivative, so the remaining difference is filtering and
        // rasterization rounding on edge pixels only.
        expect(difference.mae).toBeLessThan(0.5);
        expect(difference.p99).toBeLessThanOrEqual(2);

        if (outlineWidth !== null) {
          const testCase = { outlineWidth, sdfRadius: 8, surfaceRatio, scale: name.endsWith('s2') ? 2 : 1 };
          const glWidth = measureOutlineWidth(frames[0], effectCanvasSize, testCase).mean;
          const gpuWidth = measureOutlineWidth(frames[1], effectCanvasSize, testCase).mean;

          report.push(`  visible width GL ${glWidth.toFixed(3)} GPU ${gpuWidth.toFixed(3)}`);
          expect(Math.abs(glWidth - gpuWidth)).toBeLessThan(0.1);
        }
      }
    } finally {
      gl.close();
      gpu.close();
      console.info(`[effect parity, surface ratio ${surfaceRatio}]\n${report.join('\n')}`);
    }
  });
});
