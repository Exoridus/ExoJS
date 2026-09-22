import type { Light } from '../lights/Light';

export interface ShadowRowState {
  row: number;
  x: number;
  y: number;
  axisX: number;
  axisY: number;
  radius: number;
  geometryRevision: number;
  epoch: number;
}

export interface SunShadowRowState {
  row: number;
  alongX: number;
  alongY: number;
  spanMin: number;
  spanSize: number;
  depthMin: number;
  depthSpan: number;
  geometryRevision: number;
  epoch: number;
}

export const removeStaleShadowRows = <T extends { epoch: number }>(rows: Map<Light, T>, epoch: number): void => {
  for (const [light, state] of rows) {
    if (state.epoch !== epoch) {
      rows.delete(light);
    }
  }
};

export class ShadowGeometryRevision {
  private _segments = new Float32Array(0);
  private _segmentCount = -1;
  private _revision = 0;

  public get current(): number {
    return this._revision;
  }

  public update(segments: Float32Array, count: number): number {
    const length = count * 4;
    let changed = count !== this._segmentCount;

    if (!changed) {
      for (let index = 0; index < length; index++) {
        if (this._segments[index] !== segments[index]) {
          changed = true;

          break;
        }
      }
    }

    if (!changed) {
      return this._revision;
    }

    if (this._segments.length < length) {
      this._segments = new Float32Array(Math.max(length, this._segments.length * 2, 256 * 4));
    }

    this._segments.set(segments.subarray(0, length));
    this._segmentCount = count;
    this._revision++;

    return this._revision;
  }

  public clear(): void {
    this._segments = new Float32Array(0);
    this._segmentCount = -1;
    this._revision = 0;
  }
}
