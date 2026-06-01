import { Gradient, type GradientStop, type GradientType } from './Gradient';

/**
 * Radial gradient in UV space around `center` with normalized radius.
 */
export class RadialGradient extends Gradient {
  public readonly type: GradientType = 'radial';

  private _center: [number, number];
  private _radius: number;

  public constructor(stops: readonly GradientStop[], center: readonly [number, number] = [0.5, 0.5], radius = 0.5) {
    super(stops);

    this._center = [center[0], center[1]];
    this._radius = Math.max(0, radius);
  }

  /** Gradient center in UV space. */
  public get center(): readonly [number, number] {
    return [this._center[0], this._center[1]];
  }

  /** Normalized radius (UV units, clamped to be non-negative). */
  public get radius(): number {
    return this._radius;
  }

  public clone(): this {
    return new RadialGradient(this.stops, this._center, this._radius) as this;
  }

  protected override resolveT(u: number, v: number): number {
    if (this._radius <= 0.000001) {
      return 1;
    }

    const dx = u - this._center[0];
    const dy = v - this._center[1];

    return Math.sqrt(dx * dx + dy * dy) / this._radius;
  }

  protected override _copyGeometry(source: RadialGradient): void {
    this._center = [source._center[0], source._center[1]];
    this._radius = source._radius;
  }

  protected override _geometryEquals(other: Gradient): boolean {
    return other instanceof RadialGradient && this._center[0] === other._center[0] && this._center[1] === other._center[1] && this._radius === other._radius;
  }
}
