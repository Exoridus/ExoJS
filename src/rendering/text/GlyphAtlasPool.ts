import { type AtlasMode, GlyphAtlas, SDF_RADIUS } from './GlyphAtlas';
import { GlyphMetrics } from './GlyphMetrics';
import { ShapedTextMetrics } from './ShapedTextMetrics';
import type { FontTypefaceKey, FontVariantKey } from './types';

/**
 * Manages one {@link GlyphAtlas} per font variant + mode + SDF radius + pixel
 * ratio combination, and one {@link GlyphMetrics} per font variant.
 *
 * An atlas is keyed by its {@link FontVariantKey} plus mode, SDF radius and
 * pixel ratio. All text nodes sharing that combination draw from the same atlas
 * pages, so identical glyphs are rasterized only once regardless of which node
 * first requests them.
 *
 * A {@link GlyphMetrics} is keyed by the {@link FontVariantKey} alone: an
 * advance is a property of the typeface, not of the raster grid it happens to
 * be drawn on, so every atlas of one variant shares a single measurement cache
 * and no two of them can disagree about where a line breaks.
 *
 * Within every key the caps variant sits LAST, after the typeface half, so the
 * prefix {@link clearVariant} matches reaches each of a typeface's variants.
 *
 * Use {@link getDefaultGlyphAtlasPool} to obtain the shared process-wide
 * instance; tests reset it via {@link resetDefaultGlyphAtlasPool} for isolation.
 *
 * Process-wide is intentional: an atlas is a content cache keyed by everything
 * that changes what a page holds, so sharing it across {@link Application}
 * instances is correct and memory-efficient (identical glyphs rasterize once).
 * That is precisely why the pixel ratio has to be part of the key: two
 * applications at different densities are the ordinary case, and without the
 * ratio the second one would draw from the first one's raster grid. Strict
 * per-backend isolation for mixed-backend multi-app setups is a deferred
 * enhancement - it would require routing the pool through the render context,
 * which text layout reaches before a node is attached to a scene.
 * @advanced
 */
export class GlyphAtlasPool {
  private readonly _atlases = new Map<string, GlyphAtlas>();
  private readonly _metrics = new Map<string, GlyphMetrics>();
  private readonly _shapedMetrics = new Map<string, ShapedTextMetrics>();
  private readonly _pageSize: number;

  public constructor(pageSize = 1024) {
    this._pageSize = pageSize;
  }

  /** The typeface half of a key, which every cache key starts with. */
  private static _typefacePrefix(font: FontTypefaceKey): string {
    return `${font.family}:${font.fontStyle ?? 'normal'}:${font.fontWeight ?? 'normal'}:`;
  }

  /**
   * Returns (or lazily creates) the atlas for the given font variant, mode, SDF
   * radius and raster pixel ratio. Defaults to `'sdf'` mode (R8 DataTexture,
   * Canvas 2D rasterization followed by a Euclidean distance transform) at
   * ratio 1.
   *
   * Nodes with different `sdfRadius` values get separate atlas instances so
   * each can encode a different outline/shadow reach without conflict; nodes at
   * different `pixelRatio` values get separate instances because the pages hold
   * a different raster grid entirely.
   */
  public getAtlas(font: FontVariantKey, mode: AtlasMode = 'sdf', sdfRadius = SDF_RADIUS, pixelRatio = 1): GlyphAtlas {
    const key = `${GlyphAtlasPool._typefacePrefix(font)}${mode}:${sdfRadius}:${pixelRatio}:${font.fontVariant ?? 'normal'}`;
    let atlas = this._atlases.get(key);

    if (atlas === undefined) {
      atlas = new GlyphAtlas(font, this._pageSize, mode, sdfRadius, pixelRatio, this.getMetrics(font));
      this._atlases.set(key, atlas);
    }

    return atlas;
  }

  /**
   * Returns (or lazily creates) the shared logical metrics for a font variant.
   *
   * This is what a measurement wants: it answers advances and kerning without
   * rasterizing a glyph, allocating a page, or having to know a pixel ratio.
   */
  public getMetrics(font: FontVariantKey): GlyphMetrics {
    const key = `${GlyphAtlasPool._typefacePrefix(font)}${font.fontVariant ?? 'normal'}`;
    let metrics = this._metrics.get(key);

    if (metrics === undefined) {
      metrics = new GlyphMetrics(font);
      this._metrics.set(key, metrics);
    }

    return metrics;
  }

  /**
   * Returns (or lazily creates) the shared contextual line measurement for a
   * font variant at one base direction and letter spacing.
   *
   * The counterpart of {@link getMetrics} for text the engine cannot measure
   * one cluster at a time. Direction and letter spacing are part of the key
   * because both change what the browser's text engine shapes, and therefore
   * the width it reports.
   */
  public getShapedMetrics(font: FontVariantKey, direction: 'ltr' | 'rtl' = 'ltr', letterSpacing = 0): ShapedTextMetrics {
    const key = `${GlyphAtlasPool._typefacePrefix(font)}${direction}:${letterSpacing}:${font.fontVariant ?? 'normal'}`;
    let metrics = this._shapedMetrics.get(key);

    if (metrics === undefined) {
      metrics = new ShapedTextMetrics(font, direction, letterSpacing);
      this._shapedMetrics.set(key, metrics);
    }

    return metrics;
  }

  /**
   * Clear every atlas and measurement held for one typeface, across every caps
   * variant, mode, SDF radius, pixel ratio, direction and letter spacing. Used
   * when the typeface's underlying face changes (e.g. a previously-fallback
   * `FontFace` finishes loading): a caller that resolved one specific atlas by
   * mode/radius/ratio would clear only the atlas it currently expects to draw
   * from, leaving every other combination of the same typeface holding glyph
   * tiles rasterized from the stale face.
   *
   * Takes a {@link FontTypefaceKey} rather than a {@link FontVariantKey}
   * because a loaded face replaces the small-cap rendering of a typeface as
   * surely as its ordinary one - there is no caps variant to name here.
   */
  public clearVariant(font: FontTypefaceKey): void {
    const prefix = GlyphAtlasPool._typefacePrefix(font);

    for (const [key, atlas] of this._atlases) {
      if (key.startsWith(prefix)) atlas.clear();
    }

    for (const [key, metrics] of this._shapedMetrics) {
      if (key.startsWith(prefix)) metrics.clear();
    }
  }
}

// ── Module-level default pool ────────────────────────────────────────────────

let _defaultPool: GlyphAtlasPool | null = null;

/**
 * Returns the shared process-wide {@link GlyphAtlasPool}, creating it lazily
 * on first call. All {@link Text} instances use this pool by default.
 */
export const getDefaultGlyphAtlasPool = (): GlyphAtlasPool => {
  if (_defaultPool === null) {
    _defaultPool = new GlyphAtlasPool();
  }
  return _defaultPool;
};

/**
 * Override the default pool. Passing no argument (or `undefined`) causes the
 * next {@link getDefaultGlyphAtlasPool} call to create a fresh instance.
 *
 * Intended for tests: call with a mock pool in `beforeEach` and with no
 * argument in `afterEach` to restore default behaviour.
 */
export const resetDefaultGlyphAtlasPool = (pool?: GlyphAtlasPool): void => {
  _defaultPool = pool ?? null;
};
