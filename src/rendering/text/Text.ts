import { AbstractText } from './AbstractText';
import type { AtlasMode } from './GlyphAtlas';
import type { GlyphAtlas } from './GlyphAtlas';
import { SDF_RADIUS } from './GlyphAtlas';
import { getDefaultGlyphAtlasPool } from './GlyphAtlasPool';
import type { LayoutOptions } from './LayoutOptions';
import { emptyTextLayout, layoutText } from './TextLayout';
import type { StyleChangeHint, TextStyleOptions } from './TextStyle';
import { TextStyle } from './TextStyle';
import type { TextLayoutResult, TextPageQuads, TextSize } from './types';

export type { TextPageQuads };

/**
 * Construction options for a {@link Text} node — a flat merge of visual
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
}

/**
 * GPU-accelerated text node that rasterizes individual glyphs into a shared
 * per-font-variant {@link GlyphAtlas} using the SDF (Signed Distance Field)
 * technique and renders them through the `text-sdf` shader.
 *
 * Style mutations are applied automatically before the next draw — no manual
 * `update()` call required. Mutating `text.style` any number of times in the
 * same frame is cheap; the geometry is rebuilt at most once, on demand.
 *
 * ```ts
 * const label = new Text('Hello', { fontSize: 24 });
 * scene.addChild(label);
 *
 * label.style.fillColor = new Color(255, 0, 0);   // cheap — no atlas work
 * label.style.outlineWidth = 0.08;     // cheap — only shader uniforms
 * // changes are picked up automatically on the next render pass
 * ```
 *
 * **FontFace-first:** load fonts via {@link FontFactory} before constructing
 * the node, then pass the loaded `FontFace` via the `font` style option. The
 * label renders immediately with the correct glyphs — no async waiting needed.
 *
 * ```ts
 * const face = await loader.load(Asset.type('font', 'roboto.woff2', { family: 'Roboto' }));
 * const label = new Text('Score: 0', { font: face, fontSize: 24 });
 * scene.addChild(label); // renders immediately with Roboto
 * ```
 *
 * Enable colour-glyph (emoji) mode via `colorGlyphs: true` in the constructor
 * options. Colour-glyph nodes use the `text-color` shader instead of `text-sdf`.
 * @stable
 */
export class Text extends AbstractText {
  private _colorGlyphs: boolean;
  private _sdfRadius: number;
  private _atlas: GlyphAtlas | null = null;
  private _destroyed = false;
  private _faceLoadVersion = 0;

  public constructor(text: string, options: TextOptions = {}) {
    super(text, new TextStyle(options), options);
    this._colorGlyphs = options.colorGlyphs ?? false;
    this._sdfRadius = options.sdfRadius ?? SDF_RADIUS;

    const face = this._extractFace(options);
    if (face !== null) void this._loadFace(face);
  }

  /**
   * Advance extent `text` would occupy under `options`, without constructing
   * a node. Takes the same options as the constructor and gives the same
   * answer as the resulting node's `textBounds` — it runs the identical
   * layout pass against the identical shared atlas, so the two cannot drift.
   *
   * Rasterizes any glyph not yet in that atlas: measuring an unseen string is
   * not free, and it does claim atlas space.
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

    return layoutText(text, style, options, Text._acquireAtlas(style, options.colorGlyphs ?? false, options.sdfRadius ?? SDF_RADIUS)).advance;
  }

  /** The one place a Text resolves its atlas, so a measurement cannot pick a different one. */
  private static _acquireAtlas(style: TextStyle, colorGlyphs: boolean, sdfRadius: number): GlyphAtlas {
    return getDefaultGlyphAtlasPool().getAtlas(style.fontFamily, style.fontStyle, style.fontWeight, colorGlyphs ? 'color' : 'sdf', sdfRadius);
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

  public override destroy(): void {
    this._destroyed = true;
    this._faceLoadVersion++;
    this._atlas = null;
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

    Text._acquireAtlas(this._style, this._colorGlyphs, this._sdfRadius).clear();
    this._markDirty('font');
  }

  protected override _runLayout(hint: StyleChangeHint): TextLayoutResult {
    // Empty text needs no glyph source at all, and acquiring one would create
    // an atlas for a variant this node may never actually rasterize.
    if (this._text.length === 0) return emptyTextLayout();

    // Only a 'font' change can invalidate which atlas this node draws from;
    // a re-flow reuses the one already resolved.
    const atlas = hint === 'font' || this._atlas === null ? Text._acquireAtlas(this._style, this._colorGlyphs, this._sdfRadius) : this._atlas;

    this._atlas = atlas;

    return layoutText(this._text, this._style, this._layout, atlas);
  }
}

export { SDF_RADIUS };
