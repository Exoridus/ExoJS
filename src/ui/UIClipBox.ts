import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';

/**
 * A container that reports a declared rectangle as its bounds instead of the
 * union of its children, so enabling {@link Container.clip} on it cuts its
 * content to that rectangle rather than to whatever the content happens to
 * cover.
 *
 * @internal
 */
export class UIClipBox extends Container {
  private _clipWidth = 0;
  private _clipHeight = 0;
  private readonly _clipRect = new Rectangle();

  /** Visible width in pixels. */
  public get clipWidth(): number {
    return this._clipWidth;
  }

  /** Visible height in pixels. */
  public get clipHeight(): number {
    return this._clipHeight;
  }

  /** Resize the visible rectangle, invalidating the bounds it is derived from. */
  public setClipSize(width: number, height: number): this {
    if (this._clipWidth !== width || this._clipHeight !== height) {
      this._clipWidth = width;
      this._clipHeight = height;
      this._invalidateBoundsCascade();
    }

    return this;
  }

  public override updateBounds(): this {
    this._clipRect.set(0, 0, this._clipWidth, this._clipHeight);
    this._bounds.reset().addRect(this._clipRect, this.getGlobalTransform());

    return this;
  }
}
