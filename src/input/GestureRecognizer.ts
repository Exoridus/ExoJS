import { Vector } from '@/math/Vector';

import type { Signal } from '@/core/Signal';
import type { Pointer } from './Pointer';

/** Long-press threshold in milliseconds. */
const longPressMs = 500;

interface LongPressEntry {
    pointerId: number;
    pointer: Pointer;
    timerId: ReturnType<typeof setTimeout>;
    startX: number;
    startY: number;
}

/**
 * Internal gesture recognizer — NOT exported publicly.
 * Receives pointer lifecycle events from InputManager and fires gesture signals.
 */
export class GestureRecognizer {
    public readonly onPinch: Signal<[scale: number, center: Vector]>;
    public readonly onRotate: Signal<[angleDelta: number, center: Vector]>;
    public readonly onLongPress: Signal<[pointer: Pointer]>;

    private readonly distanceThreshold: number;

    // Active touch pointers (only touch type; index in order of arrival).
    private readonly touchPointers: Map<number, Pointer> = new Map();

    // Long-press state per pointer.
    private readonly longPressEntries: Map<number, LongPressEntry> = new Map();

    // Previous two-touch distance and angle for incremental deltas.
    private prevDistance = -1;
    private prevAngle = 0;

    // Reusable Vector for center dispatches (avoids heap churn).
    private readonly centerVec = new Vector();

    public constructor(
        distanceThreshold: number,
        onPinch: Signal<[scale: number, center: Vector]>,
        onRotate: Signal<[angleDelta: number, center: Vector]>,
        onLongPress: Signal<[pointer: Pointer]>,
    ) {
        this.distanceThreshold = distanceThreshold;
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
            this.onLongPress.dispatch(pointer);
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
        const pA = iter.next().value as Pointer;
        const pB = iter.next().value as Pointer;

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
                this.onPinch.dispatch(scale, this.centerVec);
            }

            const angleDelta = currentAngle - this.prevAngle;

            if (Math.abs(angleDelta) > 0.0001) {
                this.onRotate.dispatch(angleDelta, this.centerVec);
            }
        }

        this.prevDistance = currentDistance;
        this.prevAngle = currentAngle;
    }
}
