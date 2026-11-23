import type { TextureSource } from '#core/types';

import type { FrameSource } from './FrameSource';

/**
 * A canvas you draw into, as a {@link FrameSource}.
 *
 * Drawing into a canvas cannot be observed, so call {@link invalidate} after
 * drawing a new frame. A size change is picked up on its own.
 *
 * @example
 * ```ts
 * const source = new CanvasFrameSource(canvas);
 * const sprite = new Sprite(new FrameTexture(source));
 *
 * drawMinimap(canvas.getContext('2d')!);
 * source.invalidate(); // uploaded once, the next time the sprite renders
 * ```
 */
export class CanvasFrameSource implements FrameSource {
  private readonly _canvas: HTMLCanvasElement | OffscreenCanvas;
  private _revision = 0;
  private _width: number;
  private _height: number;
  private _destroyed = false;

  public constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this._canvas = canvas;
    this._width = canvas.width;
    this._height = canvas.height;
  }

  public get canvas(): HTMLCanvasElement | OffscreenCanvas {
    return this._canvas;
  }

  public get width(): number {
    return this._destroyed ? 0 : this._canvas.width;
  }

  public get height(): number {
    return this._destroyed ? 0 : this._canvas.height;
  }

  public get image(): TextureSource {
    return this._destroyed ? null : this._canvas;
  }

  public get revision(): number {
    if (!this._destroyed && (this._canvas.width !== this._width || this._canvas.height !== this._height)) {
      this._width = this._canvas.width;
      this._height = this._canvas.height;
      this._revision++;
    }

    return this._revision;
  }

  /** Marks the canvas content as changed. Does nothing after {@link destroy}. */
  public invalidate(): void {
    if (!this._destroyed) {
      this._revision++;
    }
  }

  public destroy(): void {
    this._destroyed = true;
  }
}
