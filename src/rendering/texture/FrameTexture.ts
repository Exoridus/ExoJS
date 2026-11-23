import type { FrameSource } from './FrameSource';
import { Texture } from './Texture';
import type { TextureOptions } from './TextureOptions';

/**
 * A texture whose pixels come from a {@link FrameSource} and follow it frame by
 * frame. Use it wherever a texture is accepted: a `Sprite`, a `Mesh`, a custom
 * material, a render pass input.
 *
 * The texture keeps one GPU texture for its whole life. A new source revision
 * is uploaded once, the next time a renderer binds the texture, however many
 * consumers draw it that frame; an unchanged revision uploads nothing. A size
 * change reallocates the GPU texture at the new size.
 *
 * The texture does not own its source unless constructed with
 * `{ ownsSource: true }`; destroying the texture frees its GPU memory and, when
 * it owns the source, destroys the source too.
 */
export class FrameTexture extends Texture {
  private readonly _frameSource: FrameSource;
  private readonly _ownsFrameSource: boolean;
  private _seenRevision: number;

  public constructor(source: FrameSource, options?: Partial<TextureOptions> & { readonly ownsSource?: boolean }) {
    super(null, options);
    this._frameSource = source;
    this._ownsFrameSource = options?.ownsSource ?? false;
    this._seenRevision = Number.NaN;
    this._sync();
  }

  /** The source this texture follows. */
  public get frameSource(): FrameSource {
    return this._frameSource;
  }

  /** Reading the version syncs with the source first, which is how a renderer picks up a new frame. */
  public override get version(): number {
    this._sync();

    return super.version;
  }

  /**
   * Picks up the source's current frame and size now instead of at the next
   * bind, for code that needs the new {@link width} and {@link height} before
   * rendering. The upload still happens at the next bind.
   */
  public sync(): this {
    this._sync();

    return this;
  }

  public override destroy(): void {
    if (this.destroyed) {
      return;
    }

    super.destroy();

    if (this._ownsFrameSource) {
      this._frameSource.destroy();
    }
  }

  private _sync(): void {
    // The base constructor may read the version before this class has a source.
    if ((this._frameSource as FrameSource | undefined) === undefined || this.destroyed) {
      return;
    }

    const revision = this._frameSource.revision;

    if (revision === this._seenRevision) {
      return;
    }

    this._seenRevision = revision;

    const image = this._frameSource.image;

    if (this.source !== image) {
      this.setSource(image);
    } else if (image !== null) {
      this.updateSource();
    }
  }
}
