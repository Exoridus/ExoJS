import type { Rectangle } from '#math/Rectangle';

import type { AudioBus } from './AudioBus';

/** A circular zone footprint: a centre on the world plane plus a radius. */
export interface AudioZoneCircle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Where an {@link AudioZone} applies - an axis-aligned {@link Rectangle} or a circle. */
export type AudioZoneShape = Rectangle | AudioZoneCircle;

/** Construction options for {@link AudioZone}. */
export interface AudioZoneOptions {
  /** Footprint on the world plane. */
  readonly shape: AudioZoneShape;
  /**
   * Bus every voice's send is opened into while this zone is active. Not owned -
   * the caller builds it, hangs whatever effect chain the zone represents on it,
   * and destroys it.
   */
  readonly bus: AudioBus;
  /** Send level at full weight. Default `1`. */
  readonly send?: number;
  /** Distance outside the shape over which the weight ramps to zero. Default `0` - a hard edge. */
  readonly falloff?: number;
  /**
   * How far the zone reaches above and below the world plane, so `100` covers
   * `z` from `-100` to `100`. Default `Infinity` - the zone is a column.
   */
  readonly height?: number;
  /** Free label for diagnostics. */
  readonly name?: string;
}

const isCircle = (shape: AudioZoneShape): shape is AudioZoneCircle => (shape as AudioZoneCircle).radius !== undefined;

/**
 * A region of the world that contributes a parallel send while the listener is
 * inside it - a reverb zone, a muffled corridor, an underwater section.
 *
 * The zone owns geometry and a level, and nothing else: it does not route audio,
 * hold effects or touch a voice. {@link SpatialZones} reads
 * {@link AudioZone.weightAt} once per frame and maintains the sends. That split
 * is deliberate - it means a zone is a plain value a level file can describe, and
 * the effect chain behind it is an ordinary {@link AudioBus} the caller already
 * knows how to build.
 *
 * Reverb belongs to the environment the LISTENER is in, not to each source, which
 * is why the weight is sampled at the listener and applied to every audible
 * spatial voice.
 *
 * @example
 * ```ts
 * const cave = new AudioBus('cave-reverb');
 * cave.addEffect(myConvolver);
 *
 * app.audio.zones.add(new AudioZone({ shape: caveBounds, bus: cave, send: 0.6, falloff: 120 }));
 * ```
 * @stable
 */
export class AudioZone {
  public readonly bus: AudioBus;
  public readonly name: string;

  public shape: AudioZoneShape;
  /** Send level at full weight. */
  public send: number;
  /** Distance outside the shape over which the weight ramps from `1` to `0`. */
  public falloff: number;
  /** How far the zone reaches above and below the world plane; `100` covers `z` from `-100` to `100`. */
  public height: number;

  public constructor({ shape, bus, send = 1, falloff = 0, height = Number.POSITIVE_INFINITY, name = 'zone' }: AudioZoneOptions) {
    this.shape = shape;
    this.bus = bus;
    this.send = send;
    this.falloff = Math.max(falloff, 0);
    this.height = Math.max(height, 0);
    this.name = name;
  }

  /**
   * How strongly this zone applies at `(x, y, z)`: `1` inside the shape, `0`
   * beyond {@link AudioZone.falloff}, and a linear ramp between.
   *
   * The ramp is measured on the distance to the shape's boundary rather than to
   * its centre, so a long corridor fades over the same distance at its middle as
   * at its ends. A `z` beyond {@link AudioZone.height} is outside the zone
   * regardless of `(x, y)`.
   */
  public weightAt(x: number, y: number, z = 0): number {
    if (Math.abs(z) > this.height) {
      return 0;
    }

    const distance = this._distanceToEdge(x, y);

    if (distance <= 0) {
      return 1;
    }

    if (this.falloff === 0 || distance >= this.falloff) {
      return 0;
    }

    return 1 - distance / this.falloff;
  }

  /** Distance from `(x, y)` to the shape's boundary; `<= 0` inside. */
  private _distanceToEdge(x: number, y: number): number {
    const shape = this.shape;

    if (isCircle(shape)) {
      return Math.hypot(x - shape.x, y - shape.y) - shape.radius;
    }

    // Outside a rectangle the distance is the length of the componentwise
    // overshoot; inside, both components are negative and the closest edge is the
    // larger (least negative) of the two.
    const dx = Math.max(shape.left - x, x - shape.right);
    const dy = Math.max(shape.top - y, y - shape.bottom);

    if (dx <= 0 && dy <= 0) {
      return Math.max(dx, dy);
    }

    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  }
}
