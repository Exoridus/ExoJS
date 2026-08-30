import { pickLayoutOptions } from '#core/serialization/serializerHelpers';
import type { ReadonlyRectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';

import type { LayoutOptions } from './LayoutOptions';
import { buildTextPageQuads, emptyTextLayout } from './textLayout';
import type { StyleChangeHint, TextStyle } from './TextStyle';
import { mergeHint } from './TextStyle';
import type { TextLayoutResult, TextPageQuads, TextSize } from './types';

/**
 * Base class for all text rendering nodes. Owns the string, the style and
 * layout references, the on-demand dirty protocol, and the two extents a
 * laid-out string has.
 *
 * A mutation never lays text out. It marks the node dirty; the pass runs on
 * the next read - `getLocalBounds()`, `textBounds`, or the renderer's collect
 * phase, whichever comes first - and runs exactly once per actual change no
 * matter how many properties were touched in between.
 *
 * Subclasses:
 * - {@link Text} - runtime Canvas 2D / SDF rasterization
 * - {@link BitmapText}  - offline pre-built atlas (BMFont / MSDF)
 */
export abstract class AbstractText extends Drawable {
  protected _text: string;
  protected _style: TextStyle;
  protected _layout: LayoutOptions;

  /** Per-page quad geometry built by the layout pass. */
  private _pageQuads: TextPageQuads[] = [];
  private _advance: TextSize = { width: 0, height: 0 };
  /** The last settled layout result, retained so caret geometry can read placements without re-measuring. */
  private _lastLayout: TextLayoutResult | null = null;
  /** Heaviest change awaiting a layout pass, or `null` when settled. */
  private _pendingHint: StyleChangeHint | null = 'font';

  /**
   * Stamps the node content-dirty when the attached style is mutated IN PLACE.
   *
   * The layout itself waits for the next read, but the stamp cannot: a
   * retained subtree decides whether to replay its recording from the content
   * revision alone, and a replayed group never visits the node to notice that
   * a pass was pending. Bound once so it can be detached again.
   */
  private readonly _onStyleChange = (): void => {
    this._markContentDirty();
  };

  protected constructor(text: string, style: TextStyle, layout: LayoutOptions) {
    super();
    this._text = text;
    this._style = style;
    this._style.onChange.add(this._onStyleChange);
    // Copied, not aliased: the caller keeps its own options object and may
    // well go on mutating it, which must not silently re-flow this node.
    // Narrowed to the layout keys too - `TextOptions` is a flat merge of style
    // and layout, and `Text` hands that whole bag down.
    this._layout = pickLayoutOptions(layout);
  }

  /**
   * Device pixels per logical pixel this node's glyphs are rasterized at.
   *
   * `1` for everything whose glyph source is fixed at build time - a
   * {@link BitmapText} draws from an atlas somebody else already rasterized, and
   * whatever density that atlas was built at is baked into its own metrics.
   * {@link Text} overrides this with the density it resolved for the surface it
   * is drawn on.
   *
   * The renderers read it to convert style lengths that are expressed in logical
   * pixels but applied in atlas texels - the shadow offset is the only one today.
   * @advanced
   */
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style -- a readonly field cannot be overridden by an accessor, and Text has to compute this
  public get rasterPixelRatio(): number {
    return 1;
  }

  /** The string currently displayed by this node. */
  public get text(): string {
    return this._text;
  }

  public set text(v: string) {
    if (this._text === v) return;
    this._text = v;
    this._markDirty('layout');
  }

  /**
   * Flow-control options - `maxWidth`, `letterSpacing`, `whiteSpace` etc.
   *
   * Handed out read-only: the node holds its own copy, so mutating the object
   * would change nothing. Assign a new one to re-flow.
   *
   * Carries layout keys only. A subclass whose options bag merges style and
   * layout into one flat object (as `TextOptions` does) still reports just the
   * layout half here.
   */
  public get layout(): Readonly<LayoutOptions> {
    return this._layout;
  }

  public set layout(v: LayoutOptions) {
    this._layout = pickLayoutOptions(v);
    this._markDirty('layout');
  }

  /**
   * Per-page quad data consumed by the text renderer. Resolves a pending
   * layout pass first, so a reader never sees the previous string's geometry.
   */
  public get pageQuads(): readonly TextPageQuads[] {
    this.syncDirty();

    return this._pageQuads;
  }

  /**
   * The layout result of the string currently displayed - per-glyph
   * placements included - settled on the same pass the node already ran.
   *
   * Caret geometry and hit testing read this instead of re-measuring:
   * calling {@link layoutText} again for a string the node already laid out
   * would duplicate the one measurement the on-demand protocol exists to
   * avoid. Indexes are per glyph (one placement each), the unit the
   * placements are expressed in.
   *
   * @internal
   */
  public get currentLayout(): TextLayoutResult {
    this.syncDirty();

    return this._lastLayout ?? emptyTextLayout();
  }

  /**
   * Advance extent of the laid-out text - where the cursor ends up, which is
   * the number to size a panel or place a caret against.
   *
   * This is NOT the rectangle the glyphs cover: SDF padding, outlines and
   * shadows all reach past it, and in SDF mode the ink even starts at a
   * negative coordinate. {@link getLocalBounds} returns that ink extent, and
   * it is what culling, hit-testing and the gradient box use.
   *
   * Resolves a pending layout pass before answering.
   */
  public get textBounds(): TextSize {
    this.syncDirty();

    return this._advance;
  }

  /**
   * Local ink extent - the union of the glyph quads, resolving a pending
   * layout pass first.
   *
   * The resolve is not optional. Culling reads the local bounds BEFORE the
   * renderer's collect phase gets a chance to call {@link syncDirty}, so a
   * node that deferred its pass would be culled against the previous string's
   * extent - and a label going from empty to non-empty would never appear at
   * all. Reading is still cheap: with nothing pending this returns straight
   * away, so no per-frame invalidation is introduced and a static subtree
   * stays skippable.
   */
  public override getLocalBounds(): ReadonlyRectangle {
    this.syncDirty();

    return super.getLocalBounds();
  }

  /**
   * Resolve a pending layout pass, if any, and apply it synchronously.
   *
   * The renderer calls this before each draw and every extent read resolves on
   * its own, so manual calls are rarely needed.
   */
  public syncDirty(): void {
    if (this.destroyed) return;

    // Consumed BEFORE the pass runs, so the re-entrant read inside
    // `_updateOrigin()` below sees a settled node instead of recursing.
    const hint = this._consumePendingHint();

    if (hint === null || hint === 'tint') return;

    const result = this._runLayout(hint);

    this._lastLayout = result;
    this._advance = result.advance;
    this._pageQuads = buildTextPageQuads(result.placements);
    // Unstamped on purpose: `_markDirty` already stamped when the change came
    // in, and stamping again here would land a frame later than the consumers
    // that already reacted to the first one.
    this._setLocalBoundsUnstamped(result.ink.x, result.ink.y, result.ink.width, result.ink.height);

    // An anchor is a fraction of the bounds, so a node whose text just changed
    // width has to re-derive its origin - otherwise a centred label drifts
    // left as it grows. Mirrors what Sprite does when it switches sub-frame.
    this._updateOrigin();
  }

  /**
   * Advance the node by `dt` milliseconds.
   *
   * Delegates to {@link syncDirty} - kept for manual game-loop patterns,
   * but no longer required; the renderer applies pending changes automatically.
   */
  public update(_dt: number): void {
    this.syncDirty();
  }

  public override destroy(): void {
    this._style.onChange.remove(this._onStyleChange);
    this._pageQuads = [];
    super.destroy();
  }

  // ── Protected ────────────────────────────────────────────────────────────

  /**
   * Mark the laid-out geometry stale without laying anything out. Subclasses
   * call this from every setter that affects the glyph run.
   *
   * The content stamp is not deferred with the pass - see
   * {@link _onStyleChange} for why a retained subtree has to learn about the
   * change immediately even though the geometry can wait.
   */
  protected _markDirty(hint: StyleChangeHint): void {
    this._pendingHint = this._pendingHint === null ? hint : mergeHint(this._pendingHint, hint);
    this._markContentDirty();
  }

  /**
   * Swap the attached style, moving the in-place-mutation subscription with
   * it so the replaced style stops driving this node.
   */
  protected _replaceStyle(style: TextStyle): void {
    this._style.onChange.remove(this._onStyleChange);
    this._style = style;
    this._style.onChange.add(this._onStyleChange);
    this._markDirty('font');
  }

  /**
   * Take the heaviest pending hint and settle the node, folding in whatever
   * the attached {@link TextStyle} has latched since the last pass. A style
   * carries its own dirty flag because it is mutated in place rather than
   * assigned, so polling it here is what makes `label.style.align = ...` land.
   */
  protected _consumePendingHint(): StyleChangeHint | null {
    const own = this._pendingHint;
    const style = this._style.consumeDirty();

    this._pendingHint = null;

    if (own === null) return style;
    if (style === null) return own;

    return mergeHint(own, style);
  }

  /**
   * Anchor against the ADVANCE box, not against the local (ink) bounds.
   *
   * The base implementation derives the origin from `getLocalBounds()`, which
   * is right for every node whose extent is its content. Text is the exception:
   * its ink carries SDF padding that reaches past the glyphs on all four sides,
   * by a different amount on each. Anchoring against it would centre the padded
   * tile rather than the text, and would push an UNanchored label off its own
   * position by the left/top padding. The typographic box is what a caller
   * means by "centre this caption".
   */
  protected override _updateOrigin(): void {
    const { x, y } = this.anchor;

    this.setOrigin(this._advance.width * x, this._advance.height * y);
  }

  /**
   * Run one layout pass. Subclasses supply the glyph provider and style.
   *
   * `hint` is the heaviest change this pass has to account for: only `'font'`
   * invalidates the glyph source, so a subclass that pays to acquire one can
   * reuse its cached provider for a plain `'layout'` pass.
   */
  protected abstract _runLayout(hint: StyleChangeHint): TextLayoutResult;
}
