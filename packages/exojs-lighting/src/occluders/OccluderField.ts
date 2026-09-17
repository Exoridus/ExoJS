import { type ReadonlyRectangle, Rectangle } from '@codexo/exojs';

import type { OccluderSink, OccluderSource } from './OccluderSource';

/** Floats per segment: `(x1, y1, x2, y2)`. */
const stride = 4;

/**
 * This frame's occluding edges, gathered from every registered source.
 *
 * One flat buffer for the whole scene rather than one per light: sources are
 * asked for the region the lights jointly reach, and each light then filters
 * the result against its own circle. A source is therefore walked once per
 * frame however many lights are on screen.
 *
 * The buffer grows to the largest frame seen and is reused afterwards, so a
 * steady scene collects without allocating.
 * @internal
 */
export class OccluderField implements OccluderSink {
  private _segments = new Float32Array(256 * stride);
  private _count = 0;
  private readonly _bounds = new Rectangle();

  /** Segments as `(x1, y1, x2, y2)` quadruples; only the first `count * 4` entries are valid. */
  public get segments(): Float32Array {
    return this._segments;
  }

  /** Segments collected by the last {@link collect}. */
  public get count(): number {
    return this._count;
  }

  /** The region the last {@link collect} asked for. */
  public get bounds(): ReadonlyRectangle {
    return this._bounds;
  }

  /**
   * Refill from `sources` for `bounds`. Discards whatever the previous frame
   * collected: an occluder field is a frame value, not a scene one.
   */
  public collect(sources: readonly OccluderSource[], bounds: ReadonlyRectangle): void {
    this._count = 0;
    this._bounds.set(bounds.x, bounds.y, bounds.width, bounds.height);

    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    for (const source of sources) {
      source.collect(this._bounds, this);
    }
  }

  public addSegment(x1: number, y1: number, x2: number, y2: number): void {
    // A degenerate segment subtends no angle, so it can never shadow anything
    // and would only cost a division in the shadow pass.
    if (x1 === x2 && y1 === y2) {
      return;
    }

    const offset = this._count * stride;

    if (offset + stride > this._segments.length) {
      this._grow();
    }

    this._segments[offset] = x1;
    this._segments[offset + 1] = y1;
    this._segments[offset + 2] = x2;
    this._segments[offset + 3] = y2;
    this._count++;
  }

  public addPolyline(points: ArrayLike<number>, closed: boolean): void {
    const count = points.length >> 1;

    if (count < 2) {
      return;
    }

    for (let index = 1; index < count; index++) {
      this.addSegment(points[index * 2 - 2]!, points[index * 2 - 1]!, points[index * 2]!, points[index * 2 + 1]!);
    }

    if (closed) {
      this.addSegment(points[count * 2 - 2]!, points[count * 2 - 1]!, points[0]!, points[1]!);
    }
  }

  /** Drop the collected segments without releasing the buffer. */
  public clear(): void {
    this._count = 0;
  }

  private _grow(): void {
    const grown = new Float32Array(this._segments.length * 2);

    grown.set(this._segments);
    this._segments = grown;
  }
}
