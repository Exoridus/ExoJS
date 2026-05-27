import { Gradient, type GradientStop } from './Gradient';

/**
 * Linear gradient in UV space projected from `start` to `end`.
 */
export class LinearGradient extends Gradient {
  private readonly _start: readonly [number, number];
  private readonly _end: readonly [number, number];

  public constructor(stops: readonly GradientStop[], start: readonly [number, number] = [0, 0], end: readonly [number, number] = [1, 0]) {
    super(stops);

    this._start = [start[0], start[1]];
    this._end = [end[0], end[1]];
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
}
