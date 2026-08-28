import type { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';

import type { UIBackground, UINineSliceBackground, UISpriteBackground } from './theme';

type BackgroundNode = Graphics | NineSliceSprite | RepeatingSprite;

const sameNineSlice = (a: UINineSliceBackground, b: UINineSliceBackground): boolean =>
  a.texture === b.texture && a.slices === b.slices && a.border === b.border && a.modes === b.modes;

const sameSprite = (a: UISpriteBackground, b: UISpriteBackground): boolean => a.texture === b.texture && a.fit === b.fit;

/**
 * One painted widget surface. Owns whichever node the current
 * {@link UIBackground} needs - a {@link Graphics} for a vector fill, a
 * {@link NineSliceSprite} for a texture - and swaps it in place when the
 * descriptor's kind changes, keeping the node at its declared child index so a
 * widget's own content stays on top of its background.
 *
 * @internal
 */
export class WidgetBackground {
  private readonly _owner: Container;
  private readonly _index: number;
  private _node: BackgroundNode | null = null;
  private _painted: UIBackground | null = null;

  /**
   * `index` is the child slot this surface claims in `owner`. It is honoured on
   * every (re)insertion, so a background that was dropped - zero size, or a
   * `'none'` skin - comes back underneath the widget's content instead of on
   * top of it.
   */
  public constructor(owner: Container, index: number) {
    this._owner = owner;
    this._index = index;
  }

  /** The live node, or `null` while the background paints nothing. */
  public get node(): BackgroundNode | null {
    return this._node;
  }

  /** Paint `background` at `width` x `height`, replacing whatever was there. */
  public apply(background: UIBackground, width: number, height: number): void {
    if (background.kind === 'none' || width <= 0 || height <= 0) {
      this._replaceNode(null);
      this._painted = background;

      return;
    }

    if (background.kind === 'fill') {
      const graphics = this._node instanceof Graphics ? this._node : this._replaceNode(new Graphics());

      graphics.clear();

      if (background.borderWidth > 0) {
        graphics.lineWidth = background.borderWidth;
        graphics.lineColor = background.borderColor;
      }

      graphics.fillColor = background.color;
      graphics.drawRoundedRectangle(0, 0, width, height, background.cornerRadius);
    } else if (background.kind === 'sprite') {
      const reusable =
        this._node instanceof RepeatingSprite && this._painted !== null && this._painted.kind === 'sprite' && sameSprite(this._painted, background);
      const mode = background.fit === 'tile' ? 'repeat' : 'stretch';
      const sprite = reusable
        ? (this._node as RepeatingSprite)
        : this._replaceNode(new RepeatingSprite(background.texture, { width, height, modeX: mode, modeY: mode }));

      sprite.setSize(width, height);
    } else {
      // The sampled region, slice widths and fill modes are constructor-only on
      // `NineSliceSprite`, so a descriptor that changes any of them needs a new
      // sprite rather than an in-place update.
      const reusable =
        this._node instanceof NineSliceSprite && this._painted !== null && this._painted.kind === 'nineSlice' && sameNineSlice(this._painted, background);
      const sprite = reusable
        ? (this._node as NineSliceSprite)
        : this._replaceNode(
            new NineSliceSprite(background.texture, {
              slices: background.slices,
              width,
              height,
              ...(background.border !== undefined && { border: background.border }),
              ...(background.modes !== undefined && { modes: background.modes }),
            }),
          );

      sprite.setSize(width, height);
    }

    this._painted = background;
  }

  public destroy(): void {
    this._replaceNode(null);
    this._painted = null;
  }

  /** Swap the painted node, re-inserting the replacement at the declared slot. */
  private _replaceNode<T extends BackgroundNode | null>(next: T): T {
    const previous = this._node;

    if (previous === next) {
      return next;
    }

    if (previous !== null) {
      previous.destroy();
    }

    if (next !== null) {
      this._owner.addChildAt(next, Math.min(this._index, this._owner.children.length));
    }

    this._node = next;

    return next;
  }
}
