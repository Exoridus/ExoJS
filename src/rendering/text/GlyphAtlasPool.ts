import { type AtlasMode, GlyphAtlas, SDF_RADIUS } from './GlyphAtlas';
import { GlyphMetrics } from './GlyphMetrics';
import { ShapedTextMetrics } from './ShapedTextMetrics';
import type { FontStyle, FontVariant } from './types';

/**
 * Manages one {@link GlyphAtlas} per font variant + mode + SDF radius + pixel
 * ratio combination, and one {@link GlyphMetrics} per font variant.
 *
 * The pool key is
 * `"${family}:${fontStyle}:${fontWeight}:${mode}:${sdfRadius}:${pixelRatio}:${fontVariant}"`.
 * All text nodes sharing that combination draw from the same atlas pages, so
 * identical glyphs are rasterized only once regardless of which node first
 * requests them.
 *
 * The metrics key is only `"${family}:${fontStyle}:${fontWeight}:${fontVariant}"`: an advance
 * is a property of the typeface, not of the raster grid it happens to be drawn
 * on, so every atlas of one variant shares a single measurement cache and no two
 * of them can disagree about where a line breaks.
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
  public getAtlas(
    family: string,
    fontStyle: FontStyle,
    fontVariant: FontVariant,
    fontWeight: string,
    mode: AtlasMode = 'sdf',
    sdfRadius = SDF_RADIUS,
    pixelRatio = 1,
  ): GlyphAtlas {
    const key = `${family}:${fontStyle}:${fontWeight}:${mode}:${sdfRadius}:${pixelRatio}:${fontVariant}`;
    let atlas = this._atlases.get(key);

    if (atlas === undefined) {
      atlas = new GlyphAtlas(
        family,
        fontStyle,
        fontVariant,
        fontWeight,
        this._pageSize,
        mode,
        sdfRadius,
        pixelRatio,
        this.getMetrics(family, fontStyle, fontVariant, fontWeight),
      );
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
  public getMetrics(family: string, fontStyle: FontStyle, fontVariant: FontVariant, fontWeight: string): GlyphMetrics {
    const key = `${family}:${fontStyle}:${fontWeight}:${fontVariant}`;
    let metrics = this._metrics.get(key);

    if (metrics === undefined) {
      metrics = new GlyphMetrics(family, fontStyle, fontVariant, fontWeight);
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
  public getShapedMetrics(
    family: string,
    fontStyle: FontStyle,
    fontVariant: FontVariant,
    fontWeight: string,
    direction: 'ltr' | 'rtl' = 'ltr',
    letterSpacing = 0,
  ): ShapedTextMetrics {
    const key = `${family}:${fontStyle}:${fontWeight}:${direction}:${letterSpacing}:${fontVariant}`;
    let metrics = this._shapedMetrics.get(key);

    if (metrics === undefined) {
      metrics = new ShapedTextMetrics(family, fontStyle, fontVariant, fontWeight, direction, letterSpacing);
      this._shapedMetrics.set(key, metrics);
    }

    return metrics;
  }

  /**
   * Clear every atlas and measurement held for one typeface, across every caps
   * variant, mode, SDF radius, pixel ratio, direction and letter spacing. Used when the
   * variant's underlying face changes (e.g. a previously-fallback `FontFace`
   * finishes loading): a caller that resolved one specific atlas by
   * mode/radius/ratio would clear only the atlas it currently expects to draw
   * from, leaving every other combination of the same variant holding glyph
   * tiles rasterized from the stale face.
   */
  public clearVariant(family: string, fontStyle: FontStyle, fontWeight: string): void {
    // The caps variant sits at the TAIL of every key precisely so this prefix
    // reaches all of them: a face that finishes loading replaces the glyphs of
    // its small-cap rendering as surely as those of its ordinary one.
    const prefix = `${family}:${fontStyle}:${fontWeight}:`;

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
