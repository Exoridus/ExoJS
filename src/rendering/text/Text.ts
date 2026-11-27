import { AbstractText } from './AbstractText';
import type { AtlasMode, AtlasPage } from './GlyphAtlas';
import type { GlyphAtlas } from './GlyphAtlas';
import { SDF_RADIUS } from './GlyphAtlas';
import { getDefaultGlyphAtlasPool } from './GlyphAtlasPool';
import type { LayoutOptions } from './LayoutOptions';
import { ShapedTextSource } from './ShapedTextSource';
import type { ShapingMode } from './shaping';
import { resolveShaping } from './shaping';
import type { TextEffectCapability } from './textEffects';
import {
  autoTextEffectCapability,
  colorGlyphEffectCapability,
  requiredTextEffectReach,
  sdfEffectCapability,
  textReachTierFor,
} from './textEffects';
import { emptyTextLayout, layoutText, validateLayoutOptions } from './textLayout';
import type { StyleChangeHint, TextStyleOptions } from './TextStyle';
import { mergeHint, TextStyle } from './TextStyle';
import type { TextLayoutResult, TextPageQuads, TextSize } from './types';

export type { TextPageQuads };

/**
 * Reject a raster density that cannot mean anything - `0`, negative, `NaN`,
 * `Infinity`. Not clamped: a silently corrected ratio would rasterize an atlas
 * the caller never asked for and hide the typo that produced it.
 */
const assertPixelRatio = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Text pixelRatio must be a positive finite number (got ${value}).`);
  }

  return value;
};

// Track the typeface cache that has actually seen each loaded face. A face
// registered by the caller may already have fallback glyphs in that cache.
const refreshedFaces = new WeakMap<FontFace, { pool: ReturnType<typeof getDefaultGlyphAtlasPool>; variants: Set<string> }>();

const assertSdfRadius = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Text sdfRadius must be a positive finite number (got ${value}).`);
  }

  return value;
};

/**
 * Construction options for a {@link Text} node - a flat merge of visual
 * {@link TextStyleOptions} (appearance) and {@link LayoutOptions} (flow /
 * overflow), plus two construction-only flags. The two source interfaces share
 * no keys, so the flat shape is unambiguous.
 *
 * ```ts
 * const label = new Text('Hello', { fillColor, fontSize: 24, maxWidth: 360 });
 * ```
 */
export interface TextOptions extends TextStyleOptions, LayoutOptions {
  /**
   * Use a colour-glyph (emoji) atlas + the `text-color` shader. Construction-only.
   * Colour glyphs keep their RGBA content and draw fill/tint only: an outline
   * or visible shadow throws {@link TextEffectError} with `'no-distance-field'`.
   */
  colorGlyphs?: boolean;
  /**
   * Fixes the distance-field reach in logical pixels: how far outside each
   * glyph the atlas tile and its field extend. Omit it for the usual case -
   * the reach is then chosen automatically in tiers starting at 4 pixels as the
   * style asks for outlines and shadows, never shrinks, and costs nothing for
   * text without large effects.
   *
   * An explicit value is a hard limit instead: `outlineWidth`, and a shadow's
   * larger offset axis plus its blur, may each use `sdfRadius - 1` logical
   * pixels (one is reserved for the antialiased edge), and anything larger is
   * rejected. Use it to pin atlas memory or to pre-size a node whose effects
   * animate across tiers. The 8-bit field spreads over twice the reach, so a
   * larger reach gives coarser edges under strong magnification. Must be a
   * positive finite number, else `RangeError`. Construction-only.
   */
  sdfRadius?: number;
  /**
   * Device pixels per logical pixel this node's glyphs are RASTERIZED at.
   *
   * Omit it and the node inherits the `pixelRatio` of the {@link Application}
   * it is drawn by - which is the deterministic default, and the only thing that
   * ever happens without an explicit opt-in. Nothing in the text stack reads
   * `window.devicePixelRatio`; there is no silent supersampling.
   *
   * Set it to decouple this node's glyph raster from the surface:
   *
   * ```ts
   * const app = new Application({ canvas: { pixelRatio: 2 } });
   *
   * new Text('9px label', { fontSize: 9 });                 // rasterized at 2
   * new Text('9px label', { fontSize: 9, pixelRatio: 3 });  // rasterized at 3
   * ```
   *
   * The logical font size, layout, advances and line breaks are identical in
   * both - only the raster grid behind the glyphs changes. Must be a positive
   * finite number.
   *
   * The value to want is usually the inherited one. Lowering it lowers the raster
   * resolution the distance field is built from, so the quality floor it hits
   * depends on the glyph - size, thinnest stroke, SDF radius, outline - rather
   * than on the ratio alone, and small text reaches that floor first. Raising it
   * costs roughly the square of the ratio, and bought no visible sharpness for
   * unscaled screen text when measured on hardware.
   *
   * Raise it for content whose ON-SCREEN density exceeds the surface ratio - a
   * node scaled up at runtime, or one drawn through a zoomed camera; lower it to
   * trade sharpness for atlas memory, which is safe on large text and harmful on
   * small. Antialiasing is not part of the trade: the shader sizes its edge against
   * the node's on-screen extent, so an edge lands at about one device pixel at
   * every ratio.
   */
  pixelRatio?: number;
}

/**
 * GPU-accelerated text node that rasterizes individual glyphs into a shared
 * per-font-variant {@link GlyphAtlas} using the SDF (Signed Distance Field)
 * technique and renders them through the `text-sdf` shader.
 *
 * Style mutations are applied automatically before the next draw - nothing has
 * to be ticked by hand. Mutating `text.style` any number of times in the same
 * frame is cheap; the geometry is rebuilt at most once, on demand.
 *
 * ```ts
 * const label = new Text('Hello', { fontSize: 24 });
 * scene.addChild(label);
 *
 * label.style.fillColor = new Color(255, 0, 0);   // cheap - no atlas work
 * label.style.outlineWidth = 2;        // cheap - 2 logical px, only shader data
 * // changes are picked up automatically on the next render pass
 * ```
 *
 * **FontFace-first:** load fonts via {@link FontFactory} before constructing
 * the node, then pass the loaded `FontFace` via the `font` style option. The
 * label renders immediately with the correct glyphs - no async waiting needed.
 *
 * ```ts
 * const face = await loader.load({ type: 'font', source: 'roboto.woff2', family: 'Roboto' });
 * const label = new Text('Score: 0', { font: face, fontSize: 24 });
 * scene.addChild(label); // renders immediately with Roboto
 * ```
 *
 * Enable colour-glyph (emoji) mode via `colorGlyphs: true` in the constructor
 * options. Colour-glyph nodes use the `text-color` shader instead of `text-sdf`.
 *
 * Glyphs are rasterized at the {@link Application}'s `pixelRatio`, so text is
 * crisp on a HiDPI surface without any opt-in. {@link TextOptions.pixelRatio}
 * decouples one node's glyph raster from the surface without changing its
 * layout by so much as a line break.
 * @stable
 */
export class Text extends AbstractText {
  private _colorGlyphs: boolean;
  private _sdfRadius: number;
  private readonly _explicitSdfRadius: number | undefined;
  private _effectCapability: TextEffectCapability;
  protected readonly _effectContext = 'Text';
  private _atlas: GlyphAtlas | null = null;
  private _destroyed = false;
  private _watchedFace: FontFace | null = null;

  /** Node-owned raster of the browser-shaped lines, or `null` while this node draws shared glyphs. */
  private _shapedSource: ShapedTextSource | null = null;
  /** Everything the shaped raster is keyed on; a change to any of it invalidates the resource. */
  private _shapedKey = '';
  /** Which representation the settled layout used - what {@link textPages} has to answer for. */
  private _shapingMode: ShapingMode = 'simple';

  /**
   * Re-lays out when the atlas this node currently draws from is cleared -
   * its cached `GlyphInfo` UVs would otherwise keep addressing glyphs that
   * `GlyphAtlas.clear()` just discarded and repacked differently.
   */
  private readonly _onAtlasCleared = (): void => {
    this._releaseShapedSource();
    this._markDirty('layout');
  };

  /**
   * The explicit raster-density override, or `0` for "none".
   *
   * `0` is an internal sentinel and never leaves the class: the public property
   * reports `undefined` when there is no override, because that is the honest
   * answer - the node inherits, it does not carry a ratio of its own.
   */
  private _pixelRatio = 0;

  /**
   * Raster density of the surface this node was last collected for, pushed in
   * by the renderer. Starts at 1 so a node that is measured or bounds-read
   * before it has ever been drawn still has a defined, non-global answer.
   */
  private _surfacePixelRatio = 1;
  private _surfaceMaxTextureSize: number | undefined;

  public constructor(text: string, options: TextOptions = {}) {
    super(text, new TextStyle(options), options);
    this._colorGlyphs = options.colorGlyphs ?? false;
    this._explicitSdfRadius = options.sdfRadius === undefined ? undefined : assertSdfRadius(options.sdfRadius);
    this._sdfRadius = this._explicitSdfRadius ?? this._autoReachFor(SDF_RADIUS);
    this._pixelRatio = options.pixelRatio === undefined ? 0 : assertPixelRatio(options.pixelRatio);
    this._effectCapability = this._colorGlyphs ? colorGlyphEffectCapability : sdfEffectCapability(this._sdfRadius);
    this._attachEffectHost();

    this._watchFace();
  }

  /**
   * Advance extent `text` would occupy under `options`, without constructing
   * a node. Takes the same options as the constructor and gives the same
   * answer as the resulting node's `textBounds` - it runs the identical layout
   * pass over the identical shared metrics, so the two cannot drift.
   *
   * Costs one canvas measurement per glyph it has not seen before, and nothing
   * else: no atlas is created, no glyph is rasterized, and no page is claimed.
   * The answer is therefore independent of `pixelRatio`, of which
   * {@link Application} exists, and of whether anything has been rendered yet -
   * `colorGlyphs`, `sdfRadius` and `pixelRatio` are ignored here because none of
   * them can move a line break.
   *
   * ```ts
   * const { width } = Text.measure('Continue', { fontSize: 24 });
   * button.width = width + 32;
   * ```
   * @stable
   */
  public static measure(text: string, options: TextOptions = {}): TextSize {
    validateLayoutOptions(options);

    if (text.length === 0) {
      return { width: 0, height: 0 };
    }

    const style = new TextStyle(options);
    const pool = getDefaultGlyphAtlasPool();
    const metrics = pool.getMetrics(style.fontKey);
    // Measurement-only, so contextual text is measured through the browser
    // without a raster ever being produced - the shaped node answers the same
    // width from the same cache.
    const shaper = pool.getShapedMetrics(style.fontKey, options.direction ?? 'ltr', options.letterSpacing ?? 0);

    return layoutText(text, style, options, metrics, shaper).advance;
  }

  /** The one place a Text resolves its atlas, so two passes cannot pick different ones. */
  private static _acquireAtlas(style: TextStyle, colorGlyphs: boolean, sdfRadius: number, pixelRatio: number): GlyphAtlas {
    return getDefaultGlyphAtlasPool().getAtlas(style.fontKey, colorGlyphs ? 'color' : 'sdf', sdfRadius, pixelRatio);
  }

  public get style(): TextStyle {
    return this._style;
  }

  public set style(v: TextStyle | TextStyleOptions) {
    this._replaceStyle(v instanceof TextStyle ? v : new TextStyle(v));
    this._watchFace();
  }

  /**
   * `true` if this node was constructed with `colorGlyphs: true`.
   * Colour-glyph nodes use a RGBA atlas (emoji / colour fonts) and
   * the `text-color` shader instead of `text-sdf`.
   */
  public get colorGlyphs(): boolean {
    return this._colorGlyphs;
  }

  /**
   * Distance-field reach in logical pixels this node's glyphs are currently
   * rasterized with; see {@link TextOptions.sdfRadius}. Grows on its own while
   * no explicit radius was given. Nodes with different radii use separate
   * atlas instances.
   */
  public get sdfRadius(): number {
    return this._sdfRadius;
  }

  /** The radius passed at construction, or `undefined` when it is chosen automatically. @internal */
  public get _explicitRadius(): number | undefined {
    return this._explicitSdfRadius;
  }

  /** Check atlas fit for a prospective widget style without changing this text. @internal */
  public _assertStyleFits(style: TextStyle): void {
    if (this._text.length === 0) {
      return;
    }

    const reach = this._explicitSdfRadius ?? this._autoReachFor(this._sdfRadius, style);
    const previous = this._style;

    if (
      this._atlas !== null &&
      this._shapingMode === 'simple' &&
      reach === this._sdfRadius &&
      previous.fontFamily === style.fontFamily &&
      previous.fontSize === style.fontSize &&
      previous.fontStyle === style.fontStyle &&
      previous.fontWeight === style.fontWeight &&
      previous.fontVariant === style.fontVariant &&
      previous.textTransform === style.textTransform &&
      previous.underline === style.underline &&
      previous.strikethrough === style.strikethrough
    ) {
      return;
    }

    // The preview uses the real raster density and layout. Simple glyphs
    // populate the shared atlas the widget will use when the theme commits.
    const preview = new Text(this._text, {
      ...this._layout,
      colorGlyphs: this._colorGlyphs,
      pixelRatio: this.rasterPixelRatio,
      sdfRadius: reach,
    });
    preview._surfaceMaxTextureSize = this._surfaceMaxTextureSize;

    try {
      preview._replaceStyle(style);
      preview._runLayout('font');
    } finally {
      preview.destroy();
    }
  }

  protected override _effectCeiling(): TextEffectCapability {
    if (this._colorGlyphs || this._explicitSdfRadius !== undefined) {
      return this._effectCapability;
    }

    return autoTextEffectCapability;
  }

  /** The smallest automatic tier at or above `current` that covers the attached style. */
  private _autoReachFor(current: number, style = this._style): number {
    return textReachTierFor(
      current,
      requiredTextEffectReach(style.outlineWidth, style.shadowAlpha, style.shadowOffsetX, style.shadowOffsetY, style.shadowBlur),
    );
  }

  protected override _consumePendingHint(): StyleChangeHint | null {
    const hint = super._consumePendingHint();

    if (hint === 'font') {
      this._watchFace();
    }

    if (hint === null || this._colorGlyphs || this._explicitSdfRadius !== undefined) {
      return hint;
    }

    const reach = this._autoReachFor(this._sdfRadius);

    if (reach === this._sdfRadius) {
      return hint;
    }

    // A larger tier is a different atlas: the glyph source has to be re-resolved
    // before the next draw reads the new field scale.
    this._sdfRadius = reach;
    this._effectCapability = sdfEffectCapability(reach);

    return mergeHint(hint, 'font');
  }

  /** @internal */
  public _textEffectCapability(): TextEffectCapability {
    return this._effectCapability;
  }

  /**
   * The EXPLICIT raster-density override, or `undefined` when this node
   * inherits the {@link Application}'s `pixelRatio`.
   *
   * Reports what was set, not what is in force: a node with no override answers
   * `undefined` rather than the ratio it happens to be rasterizing at, because
   * the inherited value belongs to the surface and can differ between two
   * applications drawing the same node. {@link rasterPixelRatio} is the resolved
   * number.
   *
   * Assigning `undefined` drops an override and returns the node to inheriting.
   * Any other value must be a positive finite number.
   */
  public get pixelRatio(): number | undefined {
    return this._pixelRatio > 0 ? this._pixelRatio : undefined;
  }

  public set pixelRatio(v: number | undefined) {
    const next = v === undefined ? 0 : assertPixelRatio(v);

    if (this._pixelRatio === next) {
      return;
    }

    this._pixelRatio = next;
    // 'font' rather than 'layout': the atlas this node draws from is keyed on
    // the ratio, so the change invalidates the glyph source itself.
    this._markDirty('font');
  }

  /**
   * The resolved raster density - the explicit {@link pixelRatio} when there is
   * one, otherwise the `pixelRatio` of the surface this node was last collected
   * for (1 until it has been collected once).
   */
  public override get rasterPixelRatio(): number {
    return this._pixelRatio > 0 ? this._pixelRatio : this._surfacePixelRatio;
  }

  /**
   * Tell this node the raster density of the surface it is about to be drawn on.
   *
   * Called by the backend text renderers during collection, which is the
   * earliest point where a node and a concrete surface are both in hand - a
   * `Text` constructor knows no {@link Application}, and materializing an
   * inherited ratio there would mean reading a global. A node with an explicit
   * override records the value but keeps rasterizing at its own.
   * @internal
   */
  public _setSurfacePixelRatio(pixelRatio: number, maxTextureSize = this._surfaceMaxTextureSize): void {
    if (maxTextureSize !== this._surfaceMaxTextureSize) {
      this._surfaceMaxTextureSize = maxTextureSize;

      if (this._shapedSource !== null && maxTextureSize !== undefined) {
        this._releaseShapedSource();
        this._markDirty('layout');
      }
    }

    const next = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;

    if (this._surfacePixelRatio === next) {
      return;
    }

    this._surfacePixelRatio = next;

    if (this._pixelRatio === 0) {
      this._markDirty('font');
    }
  }

  /**
   * The atlas mode used by this node: `'color'` for colour glyphs,
   * `'sdf'` for standard text.
   */
  public get atlasMode(): AtlasMode {
    return this._colorGlyphs ? 'color' : 'sdf';
  }

  /** The {@link GlyphAtlas} this node currently draws from. */
  public get atlas(): GlyphAtlas | null {
    return this._atlas;
  }

  /**
   * Which representation the settled layout used - `'simple'` for shared atlas
   * glyphs, `'browser'` for lines the browser shaped. Follows from the content
   * and from `shaping`; useful for diagnostics and benchmarks.
   */
  public get shapingMode(): ShapingMode {
    this.syncDirty();

    return this._shapingMode;
  }

  /**
   * The pages `pageQuads` addresses by index: the shared atlas pages on the
   * simple path, this node's own shaped-line pages on the browser-shaped one.
   *
   * This is what a text renderer resolves a quad batch's texture through, so it
   * never has to know which of the two produced the raster. Resolves a pending
   * layout pass first.
   * @internal
   */
  public get textPages(): readonly AtlasPage[] {
    this.syncDirty();

    if (this._shapingMode === 'browser' && this._shapedSource !== null) {
      return this._shapedSource.pages;
    }

    return this._atlas?.pages ?? [];
  }

  public override destroy(): void {
    this._destroyed = true;
    this._atlas?.onCleared.remove(this._onAtlasCleared);
    this._atlas = null;
    this._releaseShapedSource();
    super.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _watchFace(): void {
    const face = this._style._face;

    if (face === this._watchedFace) {
      return;
    }

    this._watchedFace = face;

    if (face !== null) {
      void this._loadFace(face);
    }
  }

  /**
   * Register `face` with `document.fonts` if needed, await its load, then
   * clear the typeface's measurements and rasters, then rebuild geometry.
   */
  private async _loadFace(face: FontFace): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) {
      return;
    }

    if (!document.fonts.has(face)) {
      document.fonts.add(face);
    }

    try {
      await face.load();
    } catch {
      return;
    }

    if (this._destroyed || this._style._face !== face) {
      return;
    }

    const pool = getDefaultGlyphAtlasPool();
    const font = this._style.fontKey;
    const variant = `${this._style.fontStyle}:${this._style.fontWeight}`;
    let refreshed = refreshedFaces.get(face);

    if (refreshed?.pool !== pool) {
      refreshed = { pool, variants: new Set() };
      refreshedFaces.set(face, refreshed);
    }

    if (!refreshed.variants.has(variant)) {
      refreshed.variants.add(variant);
      pool.clearVariant(font);
    }

    this._markDirty('font');
  }

  protected override _runLayout(hint: StyleChangeHint): TextLayoutResult {
    // Empty text needs no glyph source at all, and acquiring one would create
    // an atlas for a variant this node may never actually rasterize.
    if (this._text.length === 0) {
      this._shapingMode = 'simple';
      this._releaseShapedSource();

      return emptyTextLayout();
    }

    // Only a 'font' change can invalidate which atlas this node draws from;
    // a re-flow reuses the one already resolved.
    const atlas =
      hint === 'font' || this._atlas === null
        ? Text._acquireAtlas(this._style, this._colorGlyphs, this._sdfRadius, this.rasterPixelRatio)
        : this._atlas;

    if (atlas !== this._atlas) {
      this._atlas?.onCleared.remove(this._onAtlasCleared);
      atlas.onCleared.add(this._onAtlasCleared);
    }

    this._atlas = atlas;
    this._shapingMode = resolveShaping(this._text, this._layout);

    if (this._shapingMode === 'simple') {
      this._releaseShapedSource();

      return layoutText(this._text, this._style, this._layout, atlas);
    }

    const source = this._acquireShapedSource();

    source.beginLayout();

    const result = layoutText(this._text, this._style, this._layout, atlas, source);

    source.endLayout();

    return result;
  }

  /**
   * The shaped resource for the current state, rebuilt when anything the
   * raster depends on has changed.
   */
  private _acquireShapedSource(): ShapedTextSource {
    const style = this._style;
    const direction = this._layout.direction ?? 'ltr';
    const letterSpacing = this._layout.letterSpacing ?? 0;
    const mode = this.atlasMode;
    const pixelRatio = this.rasterPixelRatio;
    const font = style.fontKey;
    // Built from the style's own fields rather than from `font`, whose members
    // are optional and would stringify a resolved default as "undefined".
    const variant = `${style.fontFamily}:${style.fontStyle}:${style.fontVariant}:${style.fontWeight}`;
    const key = `${variant}:${mode}:${this._sdfRadius}:${pixelRatio}:${direction}:${letterSpacing}`;

    if (this._shapedSource !== null && this._shapedKey === key) {
      return this._shapedSource;
    }

    this._releaseShapedSource();

    const source = new ShapedTextSource({
      font,
      metrics: getDefaultGlyphAtlasPool().getShapedMetrics(font, direction, letterSpacing),
      mode,
      sdfRadius: this._sdfRadius,
      pixelRatio,
      ...(this._surfaceMaxTextureSize !== undefined && { maxTileSize: this._surfaceMaxTextureSize }),
      direction,
      letterSpacing,
    });

    this._shapedSource = source;
    this._shapedKey = key;

    return source;
  }

  private _releaseShapedSource(): void {
    this._shapedSource?.destroy();
    this._shapedSource = null;
    this._shapedKey = '';
  }
}

export { SDF_RADIUS };
