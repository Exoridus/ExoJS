import { page, server } from 'vitest/browser';

import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';
import { exerciseSharedTextStyle, sharedTextCanvasSize } from './_sharedTextStyle';

const previousViewport = { width: window.innerWidth, height: window.innerHeight };

beforeAll(async () => {
  await page.viewport(400, 400);
});
afterAll(async () => {
  await page.viewport(previousViewport.width, previousViewport.height);
});
beforeEach(() => resetDefaultGlyphAtlasPool());
afterEach(() => resetDefaultGlyphAtlasPool());

test('WebGL2 renders every shared TextStyle reader after layout and paint mutations', async () => {
  const backend = await createWebGl2TestBackend(sharedTextCanvasSize);
  const canvas = backend.context.canvas as HTMLCanvasElement;

  canvas.style.position = 'fixed';
  canvas.style.left = '8px';
  canvas.style.top = '8px';
  document.body.append(canvas);

  try {
    await exerciseSharedTextStyle(
      async root => {
        renderWebGl2Once(backend, root);
        expect(backend.stats.drawCalls).toBeGreaterThan(0);

        return readWebGl2Frame(backend, sharedTextCanvasSize);
      },
      async state => {
        const bounds = canvas.getBoundingClientRect();

        expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
        expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
        await page.screenshot({
          element: canvas,
          path: `../../../.workspace/visual-review/current/shared-text-style-${state}-webgl2-${server.browser}.png`,
        });
      },
    );
  } finally {
    backend.destroy();
    canvas.remove();
  }
});
