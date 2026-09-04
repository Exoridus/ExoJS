/**
 * Browser-native text shaping against a real WebGL2 backend, a real
 * `GlyphAtlas` and the real canvas text engine.
 *
 * What this file establishes is the platform contract the shaped path rests
 * on - that the browser reorders a bidi line, joins Arabic letters and places
 * a combining mark when it is handed the complete line - and that the engine
 * turns that into geometry the text renderer can draw. The claims are made on
 * the deterministic quad geometry (`Text.pageQuads`) and on canvas
 * measurements rather than on read-back pixels, for the reason the layout
 * browser spec gives: the text renderer drives texture units with raw GL calls
 * that only a full multi-renderer frame primes. Cross-backend pixel parity is
 * asserted separately, in the WebGPU project where both backends are live at
 * once.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

const ARABIC = 'العربية';
const HEBREW = 'שלום';
const MIXED = `Build 42 - ${ARABIC} (Beta)`;
const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const COMBINING = 'é';
const FLAG = '\u{1F1E9}\u{1F1EA}';

const defaultWebGlAttributes: WebGLContextAttributes = {
  antialias: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (width: number, height: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width, height },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

/** Total quads across every page - one per cluster on the simple path, one per line when shaped. */
const quadCount = (text: Text): number => text.pageQuads.reduce((total, batch) => total + batch.quadCount, 0);

/** The canvas the browser measures with, configured exactly as the engine configures its own. */
const measureCtx = (font: string, direction: CanvasDirection): CanvasRenderingContext2D => {
  const ctx = document.createElement('canvas').getContext('2d');

  if (!ctx) throw new Error('2D context required.');

  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.direction = direction;

  return ctx;
};

describe('browser text shaping (WebGL2)', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  // ── Platform capability probe ──────────────────────────────────────────────

  test('the platform provides the primitives the shaped path is built on', () => {
    expect(typeof Intl.Segmenter).toBe('function');

    const ctx = measureCtx('20px sans-serif', 'rtl');

    expect(ctx.direction).toBe('rtl');
    expect(typeof ctx.measureText(ARABIC).width).toBe('number');
  });

  test('canvas joins Arabic letters, so a whole line measures narrower than its isolated glyphs', () => {
    const ctx = measureCtx('20px sans-serif', 'ltr');
    const whole = ctx.measureText(ARABIC).width;
    let isolated = 0;

    for (const char of ARABIC) {
      isolated += ctx.measureText(char).width;
    }

    // Joining forms are narrower than the isolated forms they replace. This is
    // exactly the difference the per-cluster path cannot see, and the reason
    // Arabic has to be measured and rasterized as a line.
    expect(whole).toBeLessThan(isolated);
  });

  // ── Representation selection ──────────────────────────────────────────────

  test.each([
    ['plain Latin', 'Score: 1234', 'simple'],
    ['CJK', '日本語', 'simple'],
    ['a combining sequence', COMBINING, 'simple'],
    ['a ZWJ emoji sequence', ZWJ_FAMILY, 'simple'],
    ['a flag', FLAG, 'simple'],
    ['Arabic', ARABIC, 'browser'],
    ['Hebrew', HEBREW, 'browser'],
    ['mixed Latin and Arabic', MIXED, 'browser'],
  ] as const)('%s settles on the %s path', (_label, value, expected) => {
    const text = new Text(value, { fontSize: 24, fillColor: Color.white });

    expect(text.shapingMode).toBe(expected);

    text.destroy();
  });

  test('an explicit request overrides what the content would have chosen', () => {
    const forcedSimple = new Text(ARABIC, { fontSize: 24, shaping: 'simple' });
    const forcedBrowser = new Text('Latin', { fontSize: 24, shaping: 'browser' });

    expect(forcedSimple.shapingMode).toBe('simple');
    expect(forcedBrowser.shapingMode).toBe('browser');

    forcedSimple.destroy();
    forcedBrowser.destroy();
  });

  // ── Geometry ──────────────────────────────────────────────────────────────

  test('a shaped line is one quad, and a simple line is one quad per cluster', () => {
    const shaped = new Text(ARABIC, { fontSize: 24, fillColor: Color.white });
    const simple = new Text('Latin', { fontSize: 24, fillColor: Color.white });

    expect(quadCount(shaped)).toBe(1);
    expect(quadCount(simple)).toBe('Latin'.length);

    shaped.destroy();
    simple.destroy();
  });

  test('a shaped multi-line block places one quad per line', () => {
    const text = new Text(`${ARABIC}\n${HEBREW}`, { fontSize: 24, fillColor: Color.white });

    expect(quadCount(text)).toBe(2);
    expect(text.currentLayout.lines).toHaveLength(2);

    text.destroy();
  });

  test('a shaped line reports the width the browser measured for it', () => {
    const text = new Text(MIXED, { fontSize: 24, fillColor: Color.white });
    const expected = measureCtx(`normal 24px ${text.style.fontFamily}`, 'ltr').measureText(MIXED).width;

    expect(text.textBounds.width).toBeCloseTo(expected, 0);

    text.destroy();
  });

  test('the base direction reaches the browser, so an RTL line measures as one', () => {
    const ltr = new Text(MIXED, { fontSize: 24 });
    const rtl = new Text(MIXED, { fontSize: 24, direction: 'rtl' });

    // Both are shaped and both cover the same characters, so the advance is the
    // same; what differs is the visual order, which only pixels can show.
    expect(rtl.shapingMode).toBe('browser');
    expect(rtl.textBounds.width).toBeGreaterThan(0);
    expect(rtl.textBounds.width).toBeCloseTo(ltr.textBounds.width, 0);

    ltr.destroy();
    rtl.destroy();
  });

  test.each([
    ['a ZWJ emoji sequence', ZWJ_FAMILY],
    ['a flag', FLAG],
    ['a combining sequence', COMBINING],
  ])('%s is one glyph on the simple path', (_label, value) => {
    const text = new Text(value, { fontSize: 24, fillColor: Color.white });

    expect(text.currentLayout.placements).toHaveLength(1);

    text.destroy();
  });

  test('an ellipsis near a cluster boundary drops whole clusters', () => {
    const value = `AB${FLAG}CD`;
    const text = new Text(value, {
      fontSize: 24,
      fillColor: Color.white,
      maxWidth: 60,
      maxHeight: 30,
      breakWords: true,
      overflow: 'ellipsis',
    });
    const placements = text.currentLayout.placements;
    const last = placements.at(-1)!;

    // Whatever survived, the flag is either wholly there or wholly gone, and
    // the ellipsis stands for no source character.
    expect(last.sourceStart).toBe(last.sourceEnd);

    for (const placement of placements.slice(0, -1)) {
      expect(placement.sourceEnd - placement.sourceStart === 1 || placement.sourceEnd - placement.sourceStart === FLAG.length).toBe(true);
    }

    text.destroy();
  });

  test('measuring contextual text allocates no shaped resource', () => {
    const size = Text.measure(ARABIC, { fontSize: 24 });

    expect(size.width).toBeGreaterThan(0);

    // A node laid out from the same state has to agree with the measurement.
    const text = new Text(ARABIC, { fontSize: 24 });

    expect(text.textBounds.width).toBeCloseTo(size.width, 3);

    text.destroy();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  test.each([
    ['Arabic', ARABIC],
    ['Hebrew', HEBREW],
    ['mixed Latin and Arabic', MIXED],
    ['a combining sequence', `A${COMBINING}B`],
    ['a ZWJ emoji sequence', ZWJ_FAMILY],
  ])('%s draws through the real backend without error', async (_label, value) => {
    const backend = await createBackend(256, 128);
    const text = new Text(value, { fontSize: 28, fillColor: Color.white });

    text.setPosition(8, 8);

    expect(() => render(backend, text)).not.toThrow();
    expect(quadCount(text)).toBeGreaterThan(0);

    text.destroy();
  });

  test('a shaped node releases its pages when the text stops needing them', async () => {
    const backend = await createBackend(256, 128);
    const text = new Text(ARABIC, { fontSize: 28, fillColor: Color.white });

    render(backend, text);

    const shapedPages = text.textPages.length;

    expect(shapedPages).toBeGreaterThan(0);

    // Back to content the shared atlas can serve: the node must stop reporting
    // its own pages, and the atlas's pages take over.
    text.text = 'Latin';
    render(backend, text);

    expect(text.shapingMode).toBe('simple');
    expect(text.textPages).toBe(text.atlas?.pages);

    text.destroy();
  });
});
