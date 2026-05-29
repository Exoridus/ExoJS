import type { Rectangle } from '@/math/Rectangle';
import { View } from '@/rendering/View';

export interface CameraOptions {
  center?: { x: number; y: number };
  size?: { width: number; height: number };
  viewport?: Rectangle;
  rotation?: number;
  zoom?: number;
}

/**
 * User-facing camera abstraction. Extends {@link View} with ergonomic
 * construction defaults. Use as the default camera owned by
 * {@link RenderingContext} or pass custom instances to
 * `context.render(node, { view: myCamera })`.
 *
 * Defaults: center `(0, 0)`, size `(0, 0)`, full viewport `(0,0,1,1)`,
 * rotation `0`, zoom `1`.
 *
 * @stable
 */
export class Camera extends View {
  public constructor(options: CameraOptions = {}) {
    const centerX = options.center?.x ?? 0;
    const centerY = options.center?.y ?? 0;
    const width = options.size?.width ?? 0;
    const height = options.size?.height ?? 0;

    super(centerX, centerY, width, height);

    if (options.viewport) {
      this.viewport = options.viewport;
    }

    if (options.rotation && options.rotation !== 0) {
      this.rotation = options.rotation;
    }

    if (options.zoom !== undefined && options.zoom !== 1) {
      this.setZoom(options.zoom);
    }
  }
}
