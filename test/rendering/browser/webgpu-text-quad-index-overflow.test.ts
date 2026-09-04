/**
 * WebGPU live-path text quad-index overflow regression.
 *
 * `WebGpuTextRenderer`'s live flush packs every pending glyph quad from the
 * whole frame into ONE shared vertex/index buffer, with a running vertex
 * cursor (`packedV`) that never resets between batches within a flush (see
 * `flush()`). Before the index buffer moved to `uint32`, that cursor fed a
 * `Uint16Array`: `baseV = quadIndex * 4` silently wraps (`& 0xFFFF`) once
 * `quadIndex` reaches 16384 (`16384 * 4 - 1 === 65535`, the last value a
 * `Uint16` can hold), with no error and no warning - a draw past that point
 * reads an EARLIER quad's vertex slot instead of its own.
 *
 * This reproduces that ceiling directly: several filler `Text` nodes sharing
 * one glyph/atlas page push the flush's cumulative quad count past 16384,
 * then one more "marker" glyph is flushed after them. Under the bug, the
 * marker's index wraps to an earlier filler's vertex slot - same glyph
 * shape, but that filler's off-canvas transform, so nothing paints at the
 * marker's own on-canvas position. Fixed, the marker paints normally.
 *
 * Each filler node's OWN glyph count is kept far below 16384 on purpose:
 * `buildTextPageQuads` (`TextLayout.ts`) packs one node's placements into its
 * own index range, a separate ceiling from the renderer-level one under test
 * here (now also fixed, see `text-layout.test.ts`) - a single node with
 * >16384 glyphs would trip both at once and no longer isolate this fix.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';

const canvasSize = 48;

// 5 * 4000 = 20000 filler quads precede the marker - comfortably past the old
// 16384-quad ceiling - while each individual node's 4000 glyphs stay well
// under it.
const fillerNodeCount = 5;
const fillerGlyphsPerNode = 4000;

describe('WebGPU: a live text flush past the old 16384-quad index ceiling still renders', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('a marker glyph flushed after >16384 accumulated quads paints at its own position', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
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
      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const read = readWebGpuPixels(backend, canvasSize);
      const ink = read(3, 10);

      expect(ink, `marker glyph did not paint at its own position — got ${JSON.stringify(ink)}`).not.toEqual([0, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
