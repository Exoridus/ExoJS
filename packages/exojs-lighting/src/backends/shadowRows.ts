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

/**
 * Drop every light that was not written in pass `epoch`. A light's samples are
 * all claimed in the same pass, so its first one dates them all.
 */
export const removeStaleShadowRows = <T extends { epoch: number }>(rows: Map<Light, T | readonly T[]>, epoch: number): void => {
  for (const [light, state] of rows) {
    const first = Array.isArray(state) ? (state[0] as T | undefined) : (state as T);

    if (first?.epoch !== epoch) {
      rows.delete(light);
    }
  }
};

/**
 * Record `states[sample]` as built for this row, origin, axis, reach and
 * geometry in pass `epoch`, and answer whether the row has to be rebuilt:
 * `false` only when that same row was last built from exactly those inputs.
 */
export const claimShadowRow = (
  states: ShadowRowState[],
  sample: number,
  row: number,
  x: number,
  y: number,
  axisX: number,
  axisY: number,
  radius: number,
  geometryRevision: number,
  epoch: number,
): boolean => {
  const state = states[sample];

  if (state === undefined) {
    states[sample] = { row, x, y, axisX, axisY, radius, geometryRevision, epoch };

    return true;
  }

  state.epoch = epoch;

  if (
    state.row === row &&
    state.x === x &&
    state.y === y &&
    state.axisX === axisX &&
    state.axisY === axisY &&
    state.radius === radius &&
    state.geometryRevision === geometryRevision
  ) {
    return false;
  }

  state.row = row;
  state.x = x;
  state.y = y;
  state.axisX = axisX;
  state.axisY = axisY;
  state.radius = radius;
  state.geometryRevision = geometryRevision;

  return true;
};

/**
 * The revision of a segment buffer's contents: it stays put while the count
 * and the first `count * 4` floats match the previous call, and increments
 * when either differs. `clear` drops the retained capacity and resets it.
 */
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
