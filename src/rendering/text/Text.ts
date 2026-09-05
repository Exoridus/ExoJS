import { assert } from '#core/dev';

import { AbstractText } from './AbstractText';
import type { AtlasMode, AtlasPage } from './GlyphAtlas';
import type { GlyphAtlas } from './GlyphAtlas';
import { SDF_RADIUS } from './GlyphAtlas';
import { getDefaultGlyphAtlasPool } from './GlyphAtlasPool';
import type { LayoutOptions } from './LayoutOptions';
import { ShapedTextSource } from './ShapedTextSource';
import type { ShapingMode } from './shaping';
import { resolveShaping } from './shaping';
import { emptyTextLayout, layoutText } from './textLayout';
import type { StyleChangeHint, TextStyleOptions } from './TextStyle';
import { TextStyle } from './TextStyle';
import type { TextLayoutResult, TextPageQuads, TextSize } from './types';

export type { TextPageQuads };

/**
 * Reject a raster density that cannot mean anything - `0`, negative, `NaN`,
 * `Infinity`. Not clamped: a silently corrected ratio would rasterize an atlas
 * the caller never asked for and hide the typo that produced it.
 */
const assertPixelRatio = (value: number): number => {
  assert(Number.isFinite(value) && value > 0, `Text pixelRatio must be a positive finite number (got ${value}).`);

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
  /** Use a colour-glyph (emoji) atlas + the `text-color` shader. Construction-only. */
  colorGlyphs?: boolean;
  /** SDF buffer radius in pixels. Construction-only. */
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
 * label.style.outlineWidth = 0.08;     // cheap - only shader uniforms
 * // changes are picked up automatically on the next render pass
 * ```
 *
 * **FontFace-first:** load fonts via {@link FontFactory} before constructing
 * the node, then pass the loaded `FontFace` via the `font` style option. The
 * label renders immediately with the correct glyphs - no async waiting needed.
 *
 * ```ts
 * const face = await loader.load(Asset.type('font', 'roboto.woff2', { family: 'Roboto' }));
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
  private _atlas: GlyphAtlas | null = null;
  private _destroyed = false;
  private _faceLoadVersion = 0;

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

  public constructor(text: string, options: TextOptions = {}) {
    super(text, new TextStyle(options), options);
    this._colorGlyphs = options.colorGlyphs ?? false;
    this._sdfRadius = options.sdfRadius ?? SDF_RADIUS;
    this._pixelRatio = options.pixelRatio === undefined ? 0 : assertPixelRatio(options.pixelRatio);

    const face = this._extractFace(options);
    if (face !== null) void this._loadFace(face);
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
    if (text.length === 0) return { width: 0, height: 0 };

    const style = new TextStyle(options);
    const pool = getDefaultGlyphAtlasPool();
    const metrics = pool.getMetrics(style.fontFamily, style.fontStyle, style.fontVariant, style.fontWeight);
    // Measurement-only, so contextual text is measured through the browser
    // without a raster ever being produced - the shaped node answers the same
    // width from the same cache.
    const shaper = pool.getShapedMetrics(
      style.fontFamily,
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      options.direction ?? 'ltr',
      options.letterSpacing ?? 0,
    );

    return layoutText(text, style, options, metrics, shaper).advance;
  }

  /** The one place a Text resolves its atlas, so two passes cannot pick different ones. */
  private static _acquireAtlas(style: TextStyle, colorGlyphs: boolean, sdfRadius: number, pixelRatio: number): GlyphAtlas {
    return getDefaultGlyphAtlasPool().getAtlas(
      style.fontFamily,
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      colorGlyphs ? 'color' : 'sdf',
      sdfRadius,
      pixelRatio,
    );
  }

  public get style(): TextStyle {
    return this._style;
  }

  public set style(v: TextStyle | TextStyleOptions) {
    this._replaceStyle(v instanceof TextStyle ? v : new TextStyle(v));

    if (!(v instanceof TextStyle)) {
      const face = this._extractFace(v);
      if (face !== null) void this._loadFace(face);
    }
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
   * SDF buffer radius (pixels) used when rasterizing glyphs for this node.
   * Determines the maximum usable outline/shadow reach.
   * Nodes with different radii use separate atlas instances.
   */
  public get sdfRadius(): number {
    return this._sdfRadius;
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

    if (this._pixelRatio === next) return;

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
  public _setSurfacePixelRatio(pixelRatio: number): void {
    const next = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;

    if (this._surfacePixelRatio === next) return;

    this._surfacePixelRatio = next;

    if (this._pixelRatio === 0) this._markDirty('font');
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

    if (this._shapingMode === 'browser' && this._shapedSource !== null) return this._shapedSource.pages;

    return this._atlas?.pages ?? [];
  }

  public override destroy(): void {
    this._destroyed = true;
    this._faceLoadVersion++;
    this._atlas?.onCleared.remove(this._onAtlasCleared);
    this._atlas = null;
    this._releaseShapedSource();
    super.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Extract a {@link FontFace} from raw style options, or return null. */
  private _extractFace(opts: TextStyleOptions): FontFace | null {
    if (typeof FontFace === 'undefined') return null;
    if (opts.font instanceof FontFace) return opts.font;
    return null;
  }

  /**
   * Register `face` with `document.fonts` if needed, await its load, then
   * clear the relevant atlas slice and rebuild geometry.
   *
   * Uses a version counter to discard stale loads when the style is replaced
   * before the previous face finishes loading.
   */
  private async _loadFace(face: FontFace): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return;

    const version = ++this._faceLoadVersion;

    if (!document.fonts.has(face)) {
      document.fonts.add(face);
    }

    try {
      await face.load();
    } catch {
      return;
    }

    if (this._destroyed || version !== this._faceLoadVersion) return;

    // Not `Text._acquireAtlas(...).clear()`: before this node's first collection
    // `rasterPixelRatio` resolves through the surface-ratio default of 1
    // (`_surfacePixelRatio`), which can disagree with the ratio the node will
    // actually rasterize at once it is drawn. Clearing by ratio would clear
    // the wrong atlas and leave the one this node uses holding fallback-font
    // tiles indefinitely; clearing the whole variant reaches every ratio.
    getDefaultGlyphAtlasPool().clearVariant(this._style.fontFamily, this._style.fontStyle, this._style.fontWeight);
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
      hint === 'font' || this._atlas === null ? Text._acquireAtlas(this._style, this._colorGlyphs, this._sdfRadius, this.rasterPixelRatio) : this._atlas;

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
    const key = `${style.fontFamily}:${style.fontStyle}:${style.fontVariant}:${style.fontWeight}:${mode}:${this._sdfRadius}:${pixelRatio}:${direction}:${letterSpacing}`;

    if (this._shapedSource !== null && this._shapedKey === key) return this._shapedSource;

    this._releaseShapedSource();

    const source = new ShapedTextSource({
      family: style.fontFamily,
      fontStyle: style.fontStyle,
      fontVariant: style.fontVariant,
      fontWeight: style.fontWeight,
      metrics: getDefaultGlyphAtlasPool().getShapedMetrics(style.fontFamily, style.fontStyle, style.fontVariant, style.fontWeight, direction, letterSpacing),
      mode,
      sdfRadius: this._sdfRadius,
      pixelRatio,
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
