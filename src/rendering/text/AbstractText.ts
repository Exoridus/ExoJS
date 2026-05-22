import { Drawable } from '@/rendering/Drawable';

import type { TextSize } from './types';

/**
 * Base class for all text rendering nodes. Provides the common `text`
 * property and the on-demand dirty protocol used by the renderer.
 *
 * Subclasses:
 * - {@link Text} — runtime Canvas 2D / SDF rasterization
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
   * Pixel dimensions of the laid-out text block in local space.
   * Used by the renderer to compute normalized gradient UVs.
   */
  public get textBounds(): TextSize {
    return { width: 0, height: 0 };
  }

  /**
   * Consume any pending style mutations and apply them synchronously.
   *
   * The renderer calls this automatically before each draw, so manual
   * calls are only needed when you require up-to-date geometry outside
   * of a render pass (e.g. to measure bounds right after a style change).
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op; subclasses override
  public syncDirty(): void {}

  /**
   * Advance the node by `dt` milliseconds.
   *
   * Delegates to {@link syncDirty} — kept for manual game-loop patterns,
   * but no longer required; the renderer applies pending changes automatically.
   */
  public update(_dt: number): void {
    this.syncDirty();
  }
}
