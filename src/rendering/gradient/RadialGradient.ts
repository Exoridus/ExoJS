import { Gradient, type GradientStop } from './Gradient';

/**
 * Radial gradient in UV space around `center` with normalized radius.
 */
export class RadialGradient extends Gradient {
  private readonly _center: readonly [number, number];
  private readonly _radius: number;

  public constructor(stops: readonly GradientStop[], center: readonly [number, number] = [0.5, 0.5], radius = 0.5) {
    super(stops);

    this._center = [center[0], center[1]];
    this._radius = Math.max(0, radius);
  }

  protected override resolveT(u: number, v: number): number {
    if (this._radius <= 0.000001) {
      return 1;
    }

    const dx = u - this._center[0];
    const dy = v - this._center[1];

    return Math.sqrt(dx * dx + dy * dy) / this._radius;
  }
}
