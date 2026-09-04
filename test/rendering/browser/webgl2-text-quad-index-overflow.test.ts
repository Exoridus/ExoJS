/**
 * WebGL2 counterpart to `webgpu-text-quad-index-overflow.test.ts` - same
 * live-path quad-index overflow, against `WebGl2TextRenderer`'s shared
 * per-flush vertex/index staging (`_drawBatches`). See that file's header
 * for the full mechanism.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';

const canvasSize = 48;

// 5 * 4000 = 20000 filler quads precede the marker - comfortably past the old
// 16384-quad ceiling - while each individual node's 4000 glyphs stay well
// under it (a single node with >16384 glyphs would also trip the separate
// per-node ceiling in `buildTextPageQuads`, now also fixed - see
// `text-layout.test.ts`).
const fillerNodeCount = 5;
const fillerGlyphsPerNode = 4000;

describe('WebGL2: a live text flush past the old 16384-quad index ceiling still renders', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('a marker glyph flushed after >16384 accumulated quads paints at its own position', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const root = new Container();
    const style = { fillColor: Color.white, fontSize: 16 } as const;

    // Filler nodes: same glyph/style as the marker, so they share one atlas
    // page and batch - positioned far off-canvas so their own (correctly
    // indexed) geometry never paints a visible pixel. `cullable = false`
    // keeps the view-frustum cull (`RenderNode.collect` / `SceneNode.inView`)
    // from dropping them before they ever reach the renderer - an off-canvas
    // node is exactly what that cull exists to skip, which would otherwise
    // silently defeat this test (the fillers never accumulate onto the
    // renderer's cursor at all). Only their share of the shared vertex/index
    // buffer's cursor matters here.
    for (let i = 0; i < fillerNodeCount; i++) {
      const filler = new Text('M'.repeat(fillerGlyphsPerNode), style);

      filler.cullable = false;
      filler.setPosition(500, 500 + i * 20);
      root.addChild(filler);
    }

    // Added last, so its quads are appended last within the flush (all
    // fillers + marker share one (shaderType, atlasTexture) batch, and equal
    // sort keys preserve insertion order - Array.prototype.sort is stable).
    const marker = new Text('M', style);

    marker.setPosition(2, 2);
    root.addChild(marker);

    try {
      renderWebGl2Once(backend, root);

      const ink = readWebGl2Pixel(backend, 3, 10);

      expect(ink, `marker glyph did not paint at its own position — got ${JSON.stringify(ink)}`).not.toEqual([0, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
