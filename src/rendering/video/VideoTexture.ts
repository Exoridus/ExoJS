import { FrameTexture } from '#rendering/texture/FrameTexture';
import type { TextureOptions } from '#rendering/texture/TextureOptions';
import { VideoFrameSource } from '#rendering/texture/VideoFrameSource';

/**
 * The current frame of an `HTMLVideoElement` as an ordinary dynamic texture,
 * for a `Sprite`, a `Mesh` or a custom material.
 *
 * Presented frames are uploaded once each, when a renderer next binds the
 * texture; a paused video uploads nothing. The texture owns its
 * {@link VideoFrameSource} but not the element: playback, audio and the
 * element's lifetime stay with whoever created it. Use {@link Video} for a
 * scene node with playback controls.
 *
 * @example
 * ```ts
 * const element = document.querySelector('video')!;
 * const screen = new Mesh({ geometry, texture: new VideoTexture(element) });
 * ```
 */
export class VideoTexture extends FrameTexture {
  public constructor(video: HTMLVideoElement, options?: Partial<TextureOptions>) {
    super(new VideoFrameSource(video), { ...options, ownsSource: true });
  }

  /** The source this texture follows. */
  public override get frameSource(): VideoFrameSource {
    return super.frameSource as VideoFrameSource;
  }

  public get videoElement(): HTMLVideoElement {
    return this.frameSource.video;
  }
}
