import type { Signal } from '#core/Signal';
import { Vector } from '#math/Vector';

import type { Pointer } from './Pointer';

/** Long-press threshold in milliseconds. */
const longPressMs = 500;

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
 * Tracks active touch pointers, derives pinch/rotate deltas from the two
 * primary touches, and fires long-press signals when a single pointer is
 * held still for {@link longPressMs} (500 ms). Long-press cancels if the
 * pointer moves beyond `distanceThreshold` pixels from the down position.
 *
 * The associated Signals (`onPinch`, `onRotate`, `onLongPress`) are owned
 * by {@link InputManager} and re-exposed there as part of the public API;
 * the recognizer just dispatches into them.
 *
 * @internal
 */
export class GestureRecognizer {
  public readonly onPinch: Signal<[scale: number, center: Vector]>;
  public readonly onRotate: Signal<[angleDelta: number, center: Vector]>;
  public readonly onLongPress: Signal<[pointer: Pointer]>;

  // Active touch pointers (only touch type; index in order of arrival).
  private readonly touchPointers = new Map<number, Pointer>();

  // Long-press state per pointer.
  private readonly longPressEntries = new Map<number, LongPressEntry>();

  // Previous two-touch distance and angle for incremental deltas.
  private prevDistance = -1;
  private prevAngle = 0;

  // Reusable Vector for center dispatches (avoids heap churn).
  private readonly centerVec = new Vector();

  public constructor(
    _distanceThreshold: number,
    onPinch: Signal<[scale: number, center: Vector]>,
    onRotate: Signal<[angleDelta: number, center: Vector]>,
    onLongPress: Signal<[pointer: Pointer]>,
    private readonly _enqueue: ((event: GestureJournalEvent) => void) | null = null,
  ) {
    this.onPinch = onPinch;
    this.onRotate = onRotate;
    this.onLongPress = onLongPress;
  }

  public onPointerDown(pointer: Pointer): void {
    if (pointer.type === 'touch') {
      this.touchPointers.set(pointer.id, pointer);
      this._resetTwoTouchBaseline();
    }

    // Start long-press timer for every pointer type.
    const timerId = setTimeout(() => {
      this.longPressEntries.delete(pointer.id);
      this._emit({ kind: 'longpress', pointer });
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

    this._processTwoTouchGestures();
  }

  public onPointerUp(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetTwoTouchBaseline();
    }
  }

  public onPointerLeave(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetTwoTouchBaseline();
    }
  }

  public onPointerCancel(pointer: Pointer): void {
    this._cancelLongPress(pointer.id);

    if (pointer.type === 'touch') {
      this.touchPointers.delete(pointer.id);
      this._resetTwoTouchBaseline();
    }
  }

  public destroy(): void {
    for (const entry of this.longPressEntries.values()) {
      clearTimeout(entry.timerId);
    }

    this.longPressEntries.clear();
    this.touchPointers.clear();
    this.centerVec.destroy();
  }

  private _cancelLongPress(pointerId: number): void {
    const entry = this.longPressEntries.get(pointerId);

    if (entry) {
      clearTimeout(entry.timerId);
      this.longPressEntries.delete(pointerId);
    }
  }

  private _resetTwoTouchBaseline(): void {
    this.prevDistance = -1;
    this.prevAngle = 0;
  }

  private _processTwoTouchGestures(): void {
    const iter = this.touchPointers.values();
    const pA = iter.next().value!;
    const pB = iter.next().value!;

    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    const currentAngle = Math.atan2(dy, dx);

    const centerX = (pA.x + pB.x) / 2;
    const centerY = (pA.y + pB.y) / 2;

    this.centerVec.set(centerX, centerY);

    if (this.prevDistance > 0) {
      const scale = currentDistance / this.prevDistance;

      // Only fire if there's a meaningful distance change.
      if (Math.abs(scale - 1) > 0.0001) {
        this._emit({ kind: 'pinch', scale, x: centerX, y: centerY });
      }

      let angleDelta = currentAngle - this.prevAngle;

      if (angleDelta > Math.PI) {
        angleDelta -= Math.PI * 2;
      } else if (angleDelta < -Math.PI) {
        angleDelta += Math.PI * 2;
      }

      if (Math.abs(angleDelta) > 0.0001) {
        this._emit({ kind: 'rotate', angleDelta, x: centerX, y: centerY });
      }
    }

    this.prevDistance = currentDistance;
    this.prevAngle = currentAngle;
  }

  private _emit(event: GestureJournalEvent): void {
    if (this._enqueue !== null) {
      this._enqueue(event);
      return;
    }

    switch (event.kind) {
      case 'pinch':
        this.centerVec.set(event.x, event.y);
        this.onPinch.dispatch(event.scale, this.centerVec);
        break;
      case 'rotate':
        this.centerVec.set(event.x, event.y);
        this.onRotate.dispatch(event.angleDelta, this.centerVec);
        break;
      case 'longpress':
        this.onLongPress.dispatch(event.pointer);
        break;
    }
  }
}
