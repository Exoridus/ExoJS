import { Gradient, type GradientStop, type GradientType } from './Gradient';

/**
 * Linear gradient in UV space projected from `start` to `end`.
 */
export class LinearGradient extends Gradient {
  public readonly type: GradientType = 'linear';

  private _start: [number, number];
  private _end: [number, number];

  public constructor(stops: readonly GradientStop[], start: readonly [number, number] = [0, 0], end: readonly [number, number] = [1, 0]) {
    super(stops);

    this._start = [start[0], start[1]];
    this._end = [end[0], end[1]];
  }

  /** Projection axis start point in UV space. */
  public get start(): readonly [number, number] {
    return [this._start[0], this._start[1]];
  }

  /** Projection axis end point in UV space. */
  public get end(): readonly [number, number] {
    return [this._end[0], this._end[1]];
  }

  public clone(): this {
    return new LinearGradient(this.stops, this._start, this._end) as this;
  }

  protected override resolveT(u: number, v: number): number {
    const axisX = this._end[0] - this._start[0];
    const axisY = this._end[1] - this._start[1];
    const lengthSquared = axisX * axisX + axisY * axisY;

    if (lengthSquared <= 0.000001) {
      return 0;
    }

    return ((u - this._start[0]) * axisX + (v - this._start[1]) * axisY) / lengthSquared;
  }

  protected override _copyGeometry(source: LinearGradient): void {
    this._start = [source._start[0], source._start[1]];
    this._end = [source._end[0], source._end[1]];
  }

  protected override _geometryEquals(other: Gradient): boolean {
    return (
      other instanceof LinearGradient &&
      this._start[0] === other._start[0] &&
      this._start[1] === other._start[1] &&
      this._end[0] === other._end[0] &&
      this._end[1] === other._end[1]
    );
  }
}
