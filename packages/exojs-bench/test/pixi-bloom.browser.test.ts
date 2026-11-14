// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { type Browser, chromium } from 'playwright';
import { expect, test } from 'vitest';

import type { EngineAdapter } from '../src/rendering/EngineAdapter';
import { readEngineVersion, startViteServer } from '../src/shared/viteServer';

test('composite bloom preserves scene pixels and emits spread on both renderers', async () => {
  const server = await startViteServer({
    pageDir: fileURLToPath(new URL('../src/rendering/page', import.meta.url)),
    version: readEngineVersion(),
  });
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(server.resolvedUrls!.local[0]!);
    const paths = Object.fromEntries(
      ['exojs', 'pixi'].map(name => [
        name,
        `/@fs/${fileURLToPath(new URL(`../src/rendering/adapters/${name}.ts`, import.meta.url)).replaceAll('\\', '/')}`,
      ]),
    );
    // Keep browser imports in a string so Vitest cannot rewrite them to its SSR loader.
    await page.evaluate(
      `Promise.all([${JSON.stringify(paths['exojs'])}, ${JSON.stringify(paths['pixi'])}].map(path => import(path))).then(([exo, pixi]) => { globalThis.bloomAdapters = [exo.createExoJsAdapter(), pixi.createPixiAdapter()]; })`,
    );
    const comparison = await page.evaluate(async () => {
      const { bloomAdapters } = globalThis as unknown as { bloomAdapters: EngineAdapter[] };
      // White input isolates kernel spread from the renderers' different colour conversions.
      const fillRect = CanvasRenderingContext2D.prototype.fillRect;

      CanvasRenderingContext2D.prototype.fillRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof fillRect>) {
        this.fillStyle = '#ffffff';
        fillRect.apply(this, args);
      };

      const baselineImages: Uint8Array[] = [];
      const bloomPixels: number[] = [];

      for (const adapter of bloomAdapters) {
        const captures: Uint8Array[] = [];

        for (const compositeBlurStrength of [0, 2]) {
          const canvas = document.createElement('canvas');
          document.body.append(canvas);

          try {
            await adapter.init(canvas, 'webgl2');
            adapter.buildScene(
              {
                id: 'composite',
                category: 'render-targets',
                crossArm: true,
                nodeCounts: [1000],
                nestingDepth: 2,
                textureCount: 1,
                mutationFraction: 0,
                cullingEnabled: false,
                compositeBlurStrength,
              },
              1000,
              0xc0ffee,
            );
            adapter.renderFrame();
            const gl = canvas.getContext('webgl2')!;
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            const pixels = new Uint8Array(1280 * 720 * 4);
            gl.readPixels(0, 0, 1280, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            captures.push(pixels);
          } finally {
            adapter.teardown();
            canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
            canvas.remove();
          }
        }

        const [plain, pixels] = captures as [Uint8Array, Uint8Array];
        let changed = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i]! > plain[i]! + 8) {
            changed++;
          }
        }

        // The no-bloom frame must match visually on both engines, including
        // the now-correct ExoJS canvas output encoding. Bloom intensity itself
        // may differ because ExoJS blurs linear light while Pixi's stock blur
        // processes its renderer's intermediate color representation.
        baselineImages.push(plain);
        bloomPixels.push(changed);
      }

      let maximum = 0;
      let withinEight = 0;

      for (let i = 0; i < baselineImages[0]!.length; i += 4) {
        let difference = 0;

        for (let channel = 0; channel < 4; channel++) {
          difference = Math.max(difference, Math.abs(baselineImages[0]![i + channel]! - baselineImages[1]![i + channel]!));
        }

        maximum = Math.max(maximum, difference);

        if (difference <= 8) {
          withinEight++;
        }
      }

      return { maximum, withinEight: withinEight / (1280 * 720), bloomPixels };
    });

    for (const count of comparison.bloomPixels) {
      expect(count).toBeGreaterThan(1000);
    }

    // Compare the common unfiltered scene strictly; do not assert that a
    // gamma-space competitor blur and a linear-light blur are pixel-identical.
    // Both separate bloom effects must remain substantial (asserted above).
    expect(comparison.maximum).toBeLessThanOrEqual(18);
    expect(comparison.withinEight).toBeGreaterThan(0.98);
  } finally {
    await browser?.close();
    await server.close();
  }
}, 120_000);
