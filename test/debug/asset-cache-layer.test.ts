/**
 * AssetCacheLayer tests.
 *
 * The layer is driven directly against a stub loader, so a case controls the
 * exact snapshot the panel has to render - including the empty and the
 * overflowing one, which a real loader cannot be asked for on demand.
 */

import type { AssetStats } from '#assets/AssetResidency';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import { Time } from '#core/units';
import { AssetCacheLayer } from '#debug/AssetCacheLayer';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { Text } from '#rendering/text/Text';

// Stub the glyph atlas pool so Text construction never touches a real 2D canvas context.
const fakeGlyph = { x: 0, y: 0, width: 6, height: 10, advance: 6, ascent: 8, page: 0, uvLeft: 0, uvRight: 0.01, uvTop: 0, uvBottom: 0.02 };
const fakePage = { texture: { updateSource: vi.fn() }, index: 0 };
const fakeAtlas = { getGlyph: vi.fn(() => fakeGlyph), pages: [fakePage], clear: vi.fn(), onCleared: new Signal() };
const fakePool = { getAtlas: vi.fn(() => fakeAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(fakePool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

const emptyStats: AssetStats = { ready: 0, pending: 0, failed: 0, bytes: 0, byType: [], largest: [] };

const makeApp = (stats: AssetStats = emptyStats) => {
  const loaderStats = vi.fn(() => stats);

  return {
    app: { loader: { stats: loaderStats } } as unknown as import('#core/Application').Application,
    loaderStats,
  };
};

const time = (ms: number): Seconds => Time.toSeconds(Time.milliseconds(ms));

/** Peek at the layer's private text nodes for panel-content assertions. */
const internals = (layer: AssetCacheLayer): { _header: Text | null; _lines: Text[]; _root: unknown } => layer as unknown as ReturnType<typeof internals>;

/** Every non-blank line the panel currently shows. */
const visibleLines = (layer: AssetCacheLayer): string[] =>
  internals(layer)
    ._lines.filter(line => line.visible)
    .map(line => line.text);

describe('AssetCacheLayer', () => {
  test('viewMode is "screen" and the layer starts hidden', () => {
    const layer = new AssetCacheLayer(makeApp().app);

    expect(layer.viewMode).toBe('screen');
    expect(layer.visible).toBe(false);
  });

  test('the first update snapshots immediately rather than after one interval', () => {
    const { app, loaderStats } = makeApp();
    const layer = new AssetCacheLayer(app);

    layer.update(time(16));

    expect(loaderStats).toHaveBeenCalledTimes(1);
    expect(internals(layer)._root).not.toBeNull();
  });

  test('later frames reuse the snapshot until the refresh interval has elapsed', () => {
    const { app, loaderStats } = makeApp();
    const layer = new AssetCacheLayer(app);

    layer.refreshInterval = Time.seconds(0.5);
    layer.update(time(16));

    // 20 frames of 16ms is 320ms - still inside the interval.
    for (let frame = 0; frame < 20; frame++) layer.update(time(16));
    expect(loaderStats).toHaveBeenCalledTimes(1);

    for (let frame = 0; frame < 20; frame++) layer.update(time(16));
    expect(loaderStats).toHaveBeenCalledTimes(2);
  });

  test('renders counts, per-type rows and the largest assets', () => {
    const { app } = makeApp({
      ready: 3,
      pending: 2,
      failed: 1,
      bytes: 1024 * 1024,
      byType: [
        { type: 'texture', ready: 2, pending: 1, failed: 0, bytes: 1024 * 1024 },
        { type: 'json', ready: 1, pending: 1, failed: 1, bytes: 0 },
      ],
      largest: [{ canonicalKey: 'texture:/hero.png', type: 'texture', bytes: 1024 * 1024 }],
    } as unknown as AssetStats);
    const layer = new AssetCacheLayer(app);

    layer.update(time(16));

    expect(internals(layer)._header?.text).toBe('Assets: 3 ready  1.00 MB');
    expect(visibleLines(layer)).toEqual(['pending 2   failed 1', 'texture      2  1.00 MB', 'json         1  0 B', 'Largest:', '  texture:/hero.png  1.00 MB']);
  });

  test('the largest section is omitted when nothing resident could be sized', () => {
    const { app } = makeApp({ ready: 1, pending: 0, failed: 0, bytes: 0, byType: [{ type: 'json', ready: 1, pending: 0, failed: 0, bytes: 0 }], largest: [] });
    const layer = new AssetCacheLayer(app);

    layer.update(time(16));

    expect(visibleLines(layer)).toEqual(['pending 0   failed 0', 'json         1  0 B']);
  });

  test('overflowing content ends in an overflow marker rather than silently truncating', () => {
    const byType = Array.from({ length: 30 }, (_unused, index) => ({ type: `t${index}`, ready: 1, pending: 0, failed: 0, bytes: 0 }));
    const { app } = makeApp({ ready: 30, pending: 0, failed: 0, bytes: 0, byType, largest: [] });
    const layer = new AssetCacheLayer(app);

    layer.update(time(16));

    const lines = visibleLines(layer);

    expect(lines).toHaveLength(14);
    expect(lines[13]).toBe('... (+17 more)');
  });

  test('destroy() releases the panel and is safe to repeat', () => {
    const layer = new AssetCacheLayer(makeApp().app);

    layer.update(time(16));
    layer.destroy();

    expect(internals(layer)._root).toBeNull();
    expect(internals(layer)._header).toBeNull();
    expect(internals(layer)._lines).toEqual([]);
    expect(() => layer.destroy()).not.toThrow();
    expect(() => new AssetCacheLayer(makeApp().app).destroy()).not.toThrow();
  });
});
