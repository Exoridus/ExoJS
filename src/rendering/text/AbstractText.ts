import { Drawable } from '@/rendering/Drawable';

/**
 * Base class for all text rendering nodes. Provides the common `text`
 * property and the `update(dt)` hook for dirty-driven rebuilds.
 *
 * Subclasses:
 * - {@link DynamicText} — runtime Canvas 2D / SDF rasterization
 * - {@link BitmapText}  — offline pre-built atlas (BMFont / MSDF)
 */
export abstract class AbstractText extends Drawable {
  protected _text: string;

  public constructor(text: string) {
    super();
    this._text = text;
  }

  /** The string currently displayed by this node. */
  public get text(): string {
    return this._text;
  }

  /**
   * Advance the node by `dt` milliseconds. Call once per frame from the game
   * loop to apply deferred style changes without a full mesh rebuild.
   */
  public update(_dt: number): void {}
}
