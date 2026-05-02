import { Vector } from '@/math/Vector';
import { Size } from '@/math/Size';
import { Flags } from '@/math/Flags';
import { ChannelOffset, PointerChannel, pointerSlotSize } from '@/input/types';

export enum PointerStateFlag {
    None = 0,
    Over = 1 << 0,
    Leave = 1 << 1,
    Down = 1 << 2,
    Move = 1 << 3,
    Up = 1 << 4,
    Cancel = 1 << 5,
}

export enum PointerState {
    Unknown,
    InsideCanvas,
    OutsideCanvas,
    Pressed,
    Moving,
    Released,
    Cancelled,
}

export class Pointer {
    public readonly id: number;
    public readonly type: string;
    public readonly position: Vector;
    public readonly startPos: Vector = new Vector(-1, -1);
    public readonly size: Size;
    public readonly tilt: Vector;
    public readonly stateFlags: Flags<PointerStateFlag> = new Flags<PointerStateFlag>();

    private _canvas: HTMLCanvasElement | null;
    private _channels: Float32Array | null;
    private _slotIndex: number;
    private _channelBase: number;
    private _buttons: number;
    private _pressure: number;
    private _rotation: number;
    private _isPrimary: boolean;
    private _currentState: PointerState = PointerState.Unknown;

    public constructor(event: PointerEvent, canvas: HTMLCanvasElement, channels: Float32Array, slotIndex: number) {
        const { pointerId, pointerType, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;
        const { left, top } = canvas.getBoundingClientRect();

        this._canvas = canvas;
        this._channels = channels;
        this._slotIndex = slotIndex;
        this._channelBase = ChannelOffset.Pointers + slotIndex * pointerSlotSize;

        this.id = pointerId;
        this.type = pointerType;
        this.position = new Vector(clientX - left, clientY - top);
        this.size = new Size(width, height);
        this.tilt = new Vector(tiltX, tiltY);
        this._buttons = buttons;
        this._pressure = pressure;
        this._rotation = twist;
        this._isPrimary = isPrimary;

        this.stateFlags.push(PointerStateFlag.Over);
        this._writeChannels(true);
    }

    public get x(): number {
        return this.position.x;
    }

    public get y(): number {
        return this.position.y;
    }

    public get width(): number {
        return this.size.width;
    }

    public get height(): number {
        return this.size.height;
    }

    public get buttons(): number {
        return this._buttons;
    }

    public get pressure(): number {
        return this._pressure;
    }

    public get rotation(): number {
        return this._rotation;
    }

    public get twist(): number {
        return this._rotation;
    }

    public get tiltX(): number {
        return this.tilt.x;
    }

    public get tiltY(): number {
        return this.tilt.y;
    }

    public get isPrimary(): boolean {
        return this._isPrimary;
    }

    public get slotIndex(): number {
        return this._slotIndex;
    }

    public get currentState(): PointerState {
        return this._currentState;
    }

    public handleEnter(event: PointerEvent): void {
        this.handleEvent(event);
        this._currentState = PointerState.InsideCanvas;
        this._writeChannels(true);
    }

    public handleLeave(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.Leave);
        this._currentState = PointerState.OutsideCanvas;
        this._writeChannels(false);
    }

    public handlePress(event: PointerEvent): void {
        this.handleEvent(event);
        this.startPos.copy(this.position);
        this.stateFlags.push(PointerStateFlag.Down);
        this._currentState = PointerState.Pressed;
        this._writeChannels(true);
    }

    public handleMove(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.Move);
        this._currentState = PointerState.Moving;
        this._writeChannels(true);
    }

    public handleRelease(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.Up);
        this._currentState = PointerState.Released;
        this._writeChannels(true);
    }

    public handleCancel(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.Cancel);
        this._currentState = PointerState.Cancelled;
        this._writeChannels(false);
    }

    public destroy(): void {
        this._clearChannels();
        this.position.destroy();
        this.startPos.destroy();
        this.size.destroy();
        this.tilt.destroy();
        this._canvas = null;
        this._channels = null;
    }

    private handleEvent(event: PointerEvent): this {
        const { clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;
        const { left, top } = this._canvas!.getBoundingClientRect();

        this.position.set(clientX - left, clientY - top);
        this.size.set(width, height);
        this.tilt.set(tiltX, tiltY);
        this._buttons = buttons;
        this._pressure = pressure;
        this._rotation = twist;
        this._isPrimary = isPrimary;

        return this;
    }

    /** Write the full 16-channel per-pointer state into the shared channel buffer. */
    private _writeChannels(active: boolean): void {
        const ch = this._channels;
        const canvas = this._canvas;

        if (!ch || !canvas) {
            return;
        }

        const base = this._channelBase;
        const w = canvas.width || 1;
        const h = canvas.height || 1;

        if (!active) {
            // Zero the entire slot for a clean release.
            for (let i = 0; i < pointerSlotSize; i++) {
                ch[base + i] = 0;
            }

            return;
        }

        const x = Math.min(1, Math.max(0, this.position.x / w));
        const y = Math.min(1, Math.max(0, this.position.y / h));

        ch[base + 0]  = 1;                                                  // active
        ch[base + 1]  = x;                                                   // x (normalized)
        ch[base + 2]  = y;                                                   // y (normalized)
        ch[base + 3]  = this._pressure;                                      // pressure
        ch[base + 4]  = Math.min(1, this.size.width / w);                   // width (normalized)
        ch[base + 5]  = Math.min(1, this.size.height / h);                  // height (normalized)
        ch[base + 6]  = this._rotation / 359;                               // twist (0..359 → 0..1)
        ch[base + 7]  = (this.tilt.x + 90) / 180;                          // tiltX (-90..90 → 0..1)
        ch[base + 8]  = (this.tilt.y + 90) / 180;                          // tiltY (-90..90 → 0..1)
        ch[base + 9]  = (this._buttons & 1) ? 1 : 0;                        // button.left
        ch[base + 10] = (this._buttons & 2) ? 1 : 0;                        // button.right
        ch[base + 11] = (this._buttons & 4) ? 1 : 0;                        // button.middle
        ch[base + 12] = this.type === 'mouse' ? 1 : 0;                      // isMouse
        ch[base + 13] = this.type === 'touch' ? 1 : 0;                      // isTouch
        ch[base + 14] = this.type === 'pen' ? 1 : 0;                        // isPen
        ch[base + 15] = this._isPrimary ? 1 : 0;                            // isPrimary
    }

    /** Zero the slot when this pointer is fully released/destroyed. */
    private _clearChannels(): void {
        const ch = this._channels;

        if (!ch) {
            return;
        }

        const base = this._channelBase;

        for (let i = 0; i < pointerSlotSize; i++) {
            ch[base + i] = 0;
        }
    }
}

/**
 * Namespace merged onto the `Pointer` class to expose channel-offset constants.
 * All members mirror `PointerChannel` so callers can write `Pointer.Active`, `Pointer.X`, etc.
 *
 * The un-prefixed members (Active, X, Y, …) address slot 0 (the primary pointer).
 * For multi-touch access use `Pointer.Slot{N}Active / Slot{N}X / Slot{N}Y`, or compute:
 * `Pointer.X + slotIndex * pointerSlotSize + channelOffset`.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Pointer {
    /* eslint-disable @typescript-eslint/naming-convention */
    // --- Primary-pointer convenience aliases (slot 0) ---
    export const Active    = PointerChannel.Active;
    export const X         = PointerChannel.X;
    export const Y         = PointerChannel.Y;
    export const Pressure  = PointerChannel.Pressure;
    export const Width     = PointerChannel.Width;
    export const Height    = PointerChannel.Height;
    export const Twist     = PointerChannel.Twist;
    export const TiltX     = PointerChannel.TiltX;
    export const TiltY     = PointerChannel.TiltY;
    export const Left      = PointerChannel.Left;
    export const Right     = PointerChannel.Right;
    export const Middle    = PointerChannel.Middle;
    export const IsMouse   = PointerChannel.IsMouse;
    export const IsTouch   = PointerChannel.IsTouch;
    export const IsPen     = PointerChannel.IsPen;
    export const IsPrimary = PointerChannel.IsPrimary;

    // --- Per-slot Active/X/Y for multi-pointer access ---
    export const Slot0Active  = PointerChannel.Slot0Active;
    export const Slot0X       = PointerChannel.Slot0X;
    export const Slot0Y       = PointerChannel.Slot0Y;
    export const Slot1Active  = PointerChannel.Slot1Active;
    export const Slot1X       = PointerChannel.Slot1X;
    export const Slot1Y       = PointerChannel.Slot1Y;
    export const Slot2Active  = PointerChannel.Slot2Active;
    export const Slot2X       = PointerChannel.Slot2X;
    export const Slot2Y       = PointerChannel.Slot2Y;
    export const Slot3Active  = PointerChannel.Slot3Active;
    export const Slot3X       = PointerChannel.Slot3X;
    export const Slot3Y       = PointerChannel.Slot3Y;
    export const Slot4Active  = PointerChannel.Slot4Active;
    export const Slot4X       = PointerChannel.Slot4X;
    export const Slot4Y       = PointerChannel.Slot4Y;
    export const Slot5Active  = PointerChannel.Slot5Active;
    export const Slot5X       = PointerChannel.Slot5X;
    export const Slot5Y       = PointerChannel.Slot5Y;
    export const Slot6Active  = PointerChannel.Slot6Active;
    export const Slot6X       = PointerChannel.Slot6X;
    export const Slot6Y       = PointerChannel.Slot6Y;
    export const Slot7Active  = PointerChannel.Slot7Active;
    export const Slot7X       = PointerChannel.Slot7X;
    export const Slot7Y       = PointerChannel.Slot7Y;
    export const Slot8Active  = PointerChannel.Slot8Active;
    export const Slot8X       = PointerChannel.Slot8X;
    export const Slot8Y       = PointerChannel.Slot8Y;
    export const Slot9Active  = PointerChannel.Slot9Active;
    export const Slot9X       = PointerChannel.Slot9X;
    export const Slot9Y       = PointerChannel.Slot9Y;
    export const Slot10Active = PointerChannel.Slot10Active;
    export const Slot10X      = PointerChannel.Slot10X;
    export const Slot10Y      = PointerChannel.Slot10Y;
    export const Slot11Active = PointerChannel.Slot11Active;
    export const Slot11X      = PointerChannel.Slot11X;
    export const Slot11Y      = PointerChannel.Slot11Y;
    export const Slot12Active = PointerChannel.Slot12Active;
    export const Slot12X      = PointerChannel.Slot12X;
    export const Slot12Y      = PointerChannel.Slot12Y;
    export const Slot13Active = PointerChannel.Slot13Active;
    export const Slot13X      = PointerChannel.Slot13X;
    export const Slot13Y      = PointerChannel.Slot13Y;
    export const Slot14Active = PointerChannel.Slot14Active;
    export const Slot14X      = PointerChannel.Slot14X;
    export const Slot14Y      = PointerChannel.Slot14Y;
    export const Slot15Active = PointerChannel.Slot15Active;
    export const Slot15X      = PointerChannel.Slot15X;
    export const Slot15Y      = PointerChannel.Slot15Y;
    /* eslint-enable @typescript-eslint/naming-convention */
}
