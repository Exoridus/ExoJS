import type { TextureSource } from '#core/types';

/**
 * A source of image frames that change over time - a playing video, a canvas
 * drawn every frame - for a {@link FrameTexture} to upload.
 *
 * A frame source is not a renderer and owns no GPU resource. It answers what
 * the current frame is ({@link image}, {@link width}, {@link height}) and
 * whether it changed ({@link revision}); the texture uploads a new revision once
 * when a renderer next binds it, however many consumers draw it.
 */
export interface FrameSource {
  /** Width of the current frame in pixels; `0` while no frame is available. */
  readonly width: number;
  /** Height of the current frame in pixels; `0` while no frame is available. */
  readonly height: number;
  /** The browser image a renderer uploads, or `null` when there is none. */
  readonly image: TextureSource;
  /**
   * Increases whenever a new frame or a new size is available. Reading it may
   * poll the underlying source, and is cheap enough to do on every bind.
   */
  readonly revision: number;
  /** Releases listeners and callbacks the source registered. Its revision stops changing. */
  destroy(): void;
}
