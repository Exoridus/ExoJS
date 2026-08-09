import type { Pointer } from './Pointer';

/** Long-press threshold in milliseconds. */
const longPressMs = 500;

/**
 * Distance from the focal point below which a pointer has no usable angle, in
 * pixels. Only guards the degenerate case of a pointer sitting on the focal
 * point (two coincident touches, or a middle finger at the exact centre).
 */
const angleEpsilon = 0.0001;

/** Immutable gesture occurrence queued onto InputManager's frame journal. @internal */
export type GestureJournalEvent =
  | { readonly kind: 'pinch'; readonly scale: number; readonly x: number; readonly y: number }
  | { readonly kind: 'rotate'; readonly angleDelta: number; readonly x: number; readonly y: number }
  | { readonly kind: 'longpress'; readonly pointer: Pointer };

interface LongPressEntry {
  pointerId: number;
  pointer: Pointer;
  timerId: ReturnType<typeof setTimeout>;
  startX: number;
  startY: number;
}

/**
 * Internal multi-touch gesture recognizer used by {@link InputManager}.
 * Tracks active touch pointers, derives pinch/rotate deltas from **all** of
 * them, and reports a long-press occurrence when a single pointer is held still
 * for {@link longPressMs} (500 ms). Long-press cancels if the pointer moves
 * beyond `distanceThreshold` pixels from the down position.
 *
 * Pinch and rotate are averaged over every active touch around their common
 * focal point, the way the platform gesture recognizers do — a third or fourth
 * finger widens the measurement instead of being ignored. See
 * {@link _processGestures} for the exact quantities.
 *
 * The gesture stays alive as long as at least two touches are down, across
 * changes to *which* touches those are. Every down/up/leave/cancel drops the
 * baseline, so the frame after a change re-seeds instead of emitting a delta:
 * adding two fingers and lifting the original two hands the gesture over
 * without a jump in `scale` or `angleDelta`. There is no start/end event —
 * deltas simply stop arriving below two touches and resume above it.
 *
 * Every occurrence (pinch, rotate, long-press) is handed to the `_enqueue`
 * callback supplied at construction rather than dispatched here — that
 * callback pushes it onto {@link InputManager}'s own frame journal, which
 * owns the actual `onPinch`/`onRotate`/`onLongPress` Signals and dispatches
 * them from there, in true chronological order relative to the pointer
 * phases that produced them. This class holds no Signal of its own.
 *
 * @internal
 */
export class GestureRecognizer {
  // Active touch pointers (only touch type; insertion order is arrival order).
  private readonly touchPointers = new Map<number, Pointer>();

  // Long-press state per pointer.
  private readonly longPressEntries = new Map<number, LongPressEntry>();

  // Previous spread (see _processGestures) for incremental pinch deltas.
  private prevSpread = -1;

  // Previous angle of each pointer around the focal point, for incremental
  // rotate deltas. Keyed by pointer id, cleared whenever the pointer set
  // changes so a new set never produces a delta against a stale baseline.
  private readonly prevAngles = new Map<number, number>();

  public constructor(
    _distanceThreshold: number,
    private readonly _enqueue: (event: GestureJournalEvent) => void,
  ) {}

  public onPointerDown(pointer: Pointer): void {
    if (pointer.type === 'touch') {
      this.touchPointers.set(pointer.id, pointer);
      this._resetGestureBaseline();
    }

    // Start long-press timer for every pointer type.
    const timerId = setTimeout(() => {
      this.longPressEntries.delete(pointer.id);
      this._enqueue({ kind: 'longpress', pointer });
    }, longPressMs);

    this.longPressEntries.set(pointer.id, {
      pointerId: pointer.id,
      pointer,
      timerId,
      startX: pointer.x,
      startY: pointer.y,
    });
  }

  public onPointerMove(pointer: Pointer, distanceThreshold: number): void {
    // Cancel long-press if moved beyond threshold.
    const entry = this.longPressEntries.get(pointer.id);

    if (entry) {
      const dx = pointer.x - entry.startX;
      const dy = pointer.y - entry.startY;

      if (Math.sqrt(dx * dx + dy * dy) > distanceThreshold) {
        clearTimeout(entry.timerId);
        this.longPressEntries.delete(pointer.id);
      }
    }

    if (pointer.type !== 'touch') {
      return;
    }

    // Update the stored pointer reference's position via the live object.
    // (We store the actual Pointer object so position is already updated by the caller.)
    if (this.touchPointers.size < 2) {
      return;
    }

    this._processGestures();
  }

  public onPointerUp(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetGestureBaseline();
    }
  }

  public onPointerLeave(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetGestureBaseline();
    }
  }

  public onPointerCancel(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetGestureBaseline();
    }
  }

  public destroy(): void {
    for (const entry of this.longPressEntries.values()) {
      clearTimeout(entry.timerId);
    }

    this.longPressEntries.clear();
    this.touchPointers.clear();
  }

  private _cancelLongPress(pointerId: number): void {
    const entry = this.longPressEntries.get(pointerId);

    if (entry) {
      clearTimeout(entry.timerId);
      this.longPressEntries.delete(pointerId);
    }
  }

  private _resetGestureBaseline(): void {
    this.prevSpread = -1;
    this.prevAngles.clear();
  }

  /**
   * Derive pinch and rotate deltas from **every** active touch pointer.
   *
   * The focal point is the arithmetic mean of the pointer positions, and the
   * spread is twice their mean distance from it. For two pointers those reduce
   * to the midpoint and the distance between them, so the two-finger case is the
   * same computation it has always been — three or more fingers simply widen the
   * average instead of being ignored.
   *
   * Rotation is the mean of the per-pointer angle deltas around the focal point.
   * A pointer sitting exactly on the focal point has no defined angle and is
   * left out of that mean; a pointer without a baseline angle (the frame after
   * the set changed) contributes nothing either.
   */
  private _processGestures(): void {
    const pointers = [...this.touchPointers.values()];
    let focusX = 0;
    let focusY = 0;

    for (const pointer of pointers) {
      focusX += pointer.x;
      focusY += pointer.y;
    }

    focusX /= pointers.length;
    focusY /= pointers.length;

    let deviationSum = 0;
    let angleDeltaSum = 0;
    let angleSamples = 0;

    for (const pointer of pointers) {
      const dx = pointer.x - focusX;
      const dy = pointer.y - focusY;
      const deviation = Math.sqrt(dx * dx + dy * dy);

      deviationSum += deviation;

      if (deviation <= angleEpsilon) {
        // On the focal point: no defined angle, so it cannot contribute a delta
        // and must not seed one for the next frame either.
        this.prevAngles.delete(pointer.id);
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const previous = this.prevAngles.get(pointer.id);

      if (previous !== undefined) {
        let delta = angle - previous;

        if (delta > Math.PI) {
          delta -= Math.PI * 2;
        } else if (delta < -Math.PI) {
          delta += Math.PI * 2;
        }

        angleDeltaSum += delta;
        angleSamples++;
      }

      this.prevAngles.set(pointer.id, angle);
    }

    const spread = (2 * deviationSum) / pointers.length;

    if (this.prevSpread > 0) {
      const scale = spread / this.prevSpread;

      // Only fire if there's a meaningful spread change.
      if (Math.abs(scale - 1) > 0.0001) {
        this._enqueue({ kind: 'pinch', scale, x: focusX, y: focusY });
      }

      if (angleSamples > 0) {
        const angleDelta = angleDeltaSum / angleSamples;

        if (Math.abs(angleDelta) > 0.0001) {
          this._enqueue({ kind: 'rotate', angleDelta, x: focusX, y: focusY });
        }
      }
    }

    this.prevSpread = spread;
  }
}
