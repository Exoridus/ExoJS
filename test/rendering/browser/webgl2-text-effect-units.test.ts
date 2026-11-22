/**
 * WebGL2: text outline and shadow lengths are logical pixels of the node's
 * local space, measured on the rendered frame.
 *
 * The matrix crosses every way a glyph can reach the screen at a different
 * density - surface pixel ratio, node scale - with every distance-field
 * capacity, and asserts the VISIBLE width: the distance between the 50 %
 * crossings of the fill and of the outline, row by row along a straight stem.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { TextEffectError } from '#rendering/text/TextEffectError';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { makeTestApp, makeTestCanvas, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { runEffectUnitSuite } from './_textEffectUnitSuite';

beforeEach(() => resetDefaultGlyphAtlasPool());
afterEach(() => resetDefaultGlyphAtlasPool());

runEffectUnitSuite('WebGL2', {
  // A canvas of `size` device pixels showing `size / ratio` logical units, so
  // the surface ratio reaches the screen exactly as an application's would.
  open: async (size, surfaceRatio) => {
    const app = makeTestApp(makeTestCanvas(size), size / surfaceRatio, surfaceRatio);
    const backend = new WebGl2Backend(app);

    await backend.initialize();
    wireCoreRenderers(backend, app.options.rendering);

    return {
      draw: async root => {
        renderWebGl2Once(backend, root);

        return readWebGl2Frame(backend, size);
      },
      close: () => backend.destroy(),
    };
  },
});

test('a too-large outline is rejected before any frame is drawn', () => {
  expect(() => new Text('H', { sdfRadius: 4, outlineWidth: 4 })).toThrow(TextEffectError);
});
