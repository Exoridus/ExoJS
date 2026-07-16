import { Container, RepeatingSprite } from '@codexo/exojs';
import type { PixelSnapMode, RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';

import type { ImageLayer } from './ImageLayer';
import { assertPixelSnapMode } from './pixelSnap';

/**
 * A scene node that renders one Tiled {@link ImageLayer} as a single
 * {@link RepeatingSprite} wrapped in a {@link Container}.
 *
 * The layer's pixel `offset` becomes this node's position; `parallax` is
 * resolved per frame in {@link _collectContent} by patching the node position
 * against the camera centre (exactly like {@link import('./TileLayerNode').TileLayerNode}),
 * then restoring it. When `repeatX`/`repeatY` is set the wrapped sprite is
 * grown each frame to cover the visible view with a period-aligned origin, so
 * the pattern tiles seamlessly and scrolls with parallax. A repeat axis or a
 * `parallax` factor other than `1` both make this node's rendered position
 * and/or size camera-dependent at collect time, so its static bounds cannot be
 * culled against — such a node opts out of view culling (`cullable = false`).
 *
 * `visible`, `opacity`, and `tintColor` are applied **once at construction**:
 * {@link ImageLayer} is immutable, so there is nothing to re-sync per frame.
 * A layer whose `texture` is `null` (image failed to load / not yet available)
 * produces an empty node with no children — it occupies its offset in the
 * scene graph but draws nothing.
 *
 * The node references — but never owns — the {@link ImageLayer} and its
 * Loader-owned texture: {@link destroy} frees the wrapped sprite but leaves the
 * layer and texture intact. Image-layer nodes are **not** band-selectable; an
 * application parents them into the scene directly wherever the image belongs
 * in draw order.
 *
 * For a `repeatX`/`repeatY` node, bounds and hit-test queries reflect the
 * coverage geometry computed by the last {@link _collectContent} call (since
 * that geometry is recomputed per collect, not maintained incrementally),
 * which is also why such a node force-disables `cullable`. A repeating or
 * parallax node also re-sizes its wrapped sprite as the camera crosses period
 * boundaries, which content-dirties an enclosing retained group the same way
 * a streamed layer does — give it the same treatment (its own
 * `RetainedContainer`, or none).
 *
 * @advanced
 */
export class ImageLayerNode extends Container {
  private readonly _layer: ImageLayer;
  private readonly _sprite: RepeatingSprite | null;
  private readonly _baseOffsetX: number;
  private readonly _baseOffsetY: number;
  private readonly _imageWidth: number;
  private readonly _imageHeight: number;
  private _pixelSnapMode: PixelSnapMode = 'none';

  // Repeat-coverage cache: the view span and patched origin that last drove a
  // resize. A static camera pays one comparison per frame and skips the rebuild.
  private _covViewX = Number.NaN;
  private _covViewY = Number.NaN;
  private _covViewWidth = Number.NaN;
  private _covViewHeight = Number.NaN;
  private _covOriginX = Number.NaN;
  private _covOriginY = Number.NaN;

  public constructor(layer: ImageLayer) {
    super();

    this._layer = layer;
    this._baseOffsetX = layer.offsetX;
    this._baseOffsetY = layer.offsetY;

    this.setPosition(layer.offsetX, layer.offsetY);
    this.visible = layer.visible;

    const texture = layer.texture;

    if (texture === null) {
      this._sprite = null;
      this._imageWidth = 0;
      this._imageHeight = 0;

      return;
    }

    this._imageWidth = texture.width;
    this._imageHeight = texture.height;

    // Non-repeating axes use `'stretch'` so the axis shows exactly one un-tiled
    // copy at its natural size; repeating axes use `'repeat'` and are grown to
    // cover the view in `_collectContent`.
    const sprite = new RepeatingSprite(texture, {
      modeX: layer.repeatX ? 'repeat' : 'stretch',
      modeY: layer.repeatY ? 'repeat' : 'stretch',
      width: texture.width,
      height: texture.height,
    });

    const tintColor = layer.tintColor;
    const r = tintColor === null ? 255 : (tintColor >> 16) & 0xff;
    const g = tintColor === null ? 255 : (tintColor >> 8) & 0xff;
    const b = tintColor === null ? 255 : tintColor & 0xff;

    sprite.tint.set(r, g, b, layer.opacity);

    this._sprite = sprite;
    this.addChild(sprite);

    if (layer.repeatX || layer.repeatY || layer.parallaxX !== 1 || layer.parallaxY !== 1) {
      this.cullable = false;
    }
  }

  /** The runtime layer this node renders. */
  public get layer(): ImageLayer {
    return this._layer;
  }

  /**
   * Render-only pixel-snap mode forwarded to the wrapped {@link RepeatingSprite}
   * (which snaps its rendered origin, and — in `'geometry'` mode for
   * axis-aligned transforms — its repeat-segment boundaries, to the render
   * target's device-pixel grid). Purely visual: the layer offset, parallax, and
   * repeat coverage are never changed.
   *
   * For a `null`-texture layer there is no drawable to forward to, so the mode
   * is simply stored. Setting the current value is a no-op; an invalid value
   * throws and leaves the prior mode unchanged.
   *
   * @default 'none'
   * @stable
   */
  public get pixelSnapMode(): PixelSnapMode {
    return this._pixelSnapMode;
  }

  public set pixelSnapMode(mode: PixelSnapMode) {
    if (mode === this._pixelSnapMode) {
      return;
    }

    assertPixelSnapMode(mode);
    this._pixelSnapMode = mode;

    if (this._sprite !== null) {
      this._sprite.pixelSnapMode = mode;
    }
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (this._sprite === null) {
      super._collectContent(builder);

      return;
    }

    const layer = this._layer;

    if (layer.parallaxX !== 1 || layer.parallaxY !== 1) {
      const camCenter = builder.view.center;
      const prevX = this.x;
      const prevY = this.y;

      this.x = this._baseOffsetX + camCenter.x * (1 - layer.parallaxX);
      this.y = this._baseOffsetY + camCenter.y * (1 - layer.parallaxY);

      this._updateRepeatCoverage(builder);
      super._collectContent(builder);

      this.x = prevX;
      this.y = prevY;
    } else {
      this._updateRepeatCoverage(builder);
      super._collectContent(builder);
    }
  }

  public override destroy(): void {
    const sprite = this._sprite;

    super.destroy();

    sprite?.destroy();
  }

  /**
   * Grow the wrapped sprite along each repeating axis so it covers the visible
   * view, with a period-aligned local origin so the pattern offset stays zero
   * (seamless tiling). Non-repeating axes keep the natural image size at local
   * `0`. Reads `this.x`/`this.y` after the parallax patch, so the pattern anchor
   * follows the parallax-shifted origin. Skips the rebuild when neither the view
   * span nor the patched origin changed since the last frame.
   */
  private _updateRepeatCoverage(builder: RenderPlanBuilder): void {
    const layer = this._layer;
    const sprite = this._sprite;

    if (sprite === null || (!layer.repeatX && !layer.repeatY)) {
      return;
    }

    const bounds = builder.view.getBounds();
    const originX = this.x;
    const originY = this.y;

    if (
      bounds.x === this._covViewX
      && bounds.y === this._covViewY
      && bounds.width === this._covViewWidth
      && bounds.height === this._covViewHeight
      && originX === this._covOriginX
      && originY === this._covOriginY
    ) {
      return;
    }

    this._covViewX = bounds.x;
    this._covViewY = bounds.y;
    this._covViewWidth = bounds.width;
    this._covViewHeight = bounds.height;
    this._covOriginX = originX;
    this._covOriginY = originY;

    let childX = 0;
    let childY = 0;
    let childWidth = this._imageWidth;
    let childHeight = this._imageHeight;

    if (layer.repeatX) {
      const imgW = this._imageWidth;
      const localViewMin = bounds.x - originX;
      const startLocal = Math.floor(localViewMin / imgW) * imgW;
      const periods = Math.ceil((localViewMin + bounds.width - startLocal) / imgW);

      childX = startLocal;
      childWidth = periods * imgW;
    }

    if (layer.repeatY) {
      const imgH = this._imageHeight;
      const localViewMin = bounds.y - originY;
      const startLocal = Math.floor(localViewMin / imgH) * imgH;
      const periods = Math.ceil((localViewMin + bounds.height - startLocal) / imgH);

      childY = startLocal;
      childHeight = periods * imgH;
    }

    sprite.setPosition(childX, childY);
    sprite.setSize(childWidth, childHeight);
  }
}
