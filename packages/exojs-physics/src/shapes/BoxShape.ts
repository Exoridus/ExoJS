import { PolygonShape } from './PolygonShape';

/**
 * Box of `width x height`, aligned to the collider's local axes and centred on
 * its local origin - a convenience over {@link PolygonShape}. The result is a
 * convex quad, so it participates in the polygon narrow phase like any other
 * convex shape.
 */
export class BoxShape extends PolygonShape {
  public readonly width: number;
  public readonly height: number;

  public constructor(width: number, height: number) {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new RangeError(`BoxShape: width and height must be positive finite numbers, received ${width} × ${height}.`);
    }

    const hw = width / 2;
    const hh = height / 2;

    super([
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ]);

    this.width = width;
    this.height = height;
  }
}
