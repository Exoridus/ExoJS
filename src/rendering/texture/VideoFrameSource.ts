import { Signal } from '#core/Signal';
import type { TextureSource } from '#core/types';

import type { FrameSource } from './FrameSource';

type FrameCallbackVideoElement = HTMLVideoElement &
  Partial<{
    requestVideoFrameCallback: (callback: (now: number, metadata: unknown) => void) => number;
    cancelVideoFrameCallback: (handle: number) => void;
  }>;

const HAVE_CURRENT_DATA = 2;

/**
 * An `HTMLVideoElement` as a {@link FrameSource}.
 *
 * Where the browser supports `requestVideoFrameCallback`, every presented frame
 * advances {@link revision}, so a paused video uploads nothing. Elsewhere the
 * revision follows the playback position, polled when it is read. Metadata,
 * resize and seek events advance it as well, so dimension changes and seeks
 * while paused reach the texture.
 *
 * The source does not own the element: destroying it removes its listeners and
 * callbacks, and leaves playback alone.
 */
export class VideoFrameSource implements FrameSource {
  /** Dispatched when the source advances its revision on its own, so a cached render can redraw. */
  public readonly onFrame = new Signal();

  private readonly _video: FrameCallbackVideoElement;
  private _revision = 0;
  private _handle: number | null = null;
  private _presentedFrame = false;
  private _lastTime = Number.NaN;
  private _lastWidth = 0;
  private _lastHeight = 0;
  private _destroyed = false;

  private readonly _onPresented = (): void => {
    this._handle = null;
    this._presentedFrame = true;
    this._advance();
    this._requestFrame();
  };

  private readonly _onChange = (): void => {
    this._advance();
  };

  private readonly _onEmptied = (): void => {
    // The next source may not present frames through the callback until it
    // plays, so fall back to the playback position until it does.
    this._presentedFrame = false;
  };

  public constructor(video: HTMLVideoElement) {
    this._video = video;
    video.addEventListener('loadedmetadata', this._onChange);
    video.addEventListener('loadeddata', this._onChange);
    video.addEventListener('resize', this._onChange);
    video.addEventListener('seeked', this._onChange);
    video.addEventListener('timeupdate', this._onChange);
    video.addEventListener('emptied', this._onEmptied);
    this._requestFrame();
  }

  public get video(): HTMLVideoElement {
    return this._video;
  }

  /** `true` once the element has decoded data for its current position. */
  public get ready(): boolean {
    return !this._destroyed && this._video.readyState >= HAVE_CURRENT_DATA && this._video.videoWidth > 0;
  }

  public get width(): number {
    return this._destroyed ? 0 : this._video.videoWidth;
  }

  public get height(): number {
    return this._destroyed ? 0 : this._video.videoHeight;
  }

  public get image(): TextureSource {
    return this._destroyed ? null : this._video;
  }

  public get revision(): number {
    if (this._destroyed) {
      return this._revision;
    }

    const video = this._video;

    // A size change is a new frame even when no event announced it.
    if (video.videoWidth !== this._lastWidth || video.videoHeight !== this._lastHeight) {
      this._lastWidth = video.videoWidth;
      this._lastHeight = video.videoHeight;
      this._revision++;
    }

    // Without presented-frame callbacks the playback position is the only signal;
    // it is stable within one task, so every bind of one frame reads the same value.
    if (!this._presentedFrame && video.currentTime !== this._lastTime) {
      this._lastTime = video.currentTime;
      this._revision++;
    }

    return this._revision;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    const video = this._video;

    video.removeEventListener('loadedmetadata', this._onChange);
    video.removeEventListener('loadeddata', this._onChange);
    video.removeEventListener('resize', this._onChange);
    video.removeEventListener('seeked', this._onChange);
    video.removeEventListener('timeupdate', this._onChange);
    video.removeEventListener('emptied', this._onEmptied);

    if (this._handle !== null) {
      video.cancelVideoFrameCallback?.(this._handle);
      this._handle = null;
    }

    this.onFrame.destroy();
  }

  private _advance(): void {
    if (!this._destroyed) {
      this._revision++;
      this.onFrame.dispatch();
    }
  }

  private _requestFrame(): void {
    if (!this._destroyed && this._handle === null && this._video.requestVideoFrameCallback !== undefined) {
      this._handle = this._video.requestVideoFrameCallback(this._onPresented);
    }
  }
}
