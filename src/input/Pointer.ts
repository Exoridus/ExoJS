import type { Application } from '#core/Application';
import { Flags } from '#math/Flags';
import { Size } from '#math/Size';
import { Vector } from '#math/Vector';

import { ChannelOffset, pointerSlotSize } from './types';

declare const pointerChannelBrand: unique symbol;

/**
 * Branded numeric type identifying a canonical pointer-state input channel.
 * Values are absolute offsets into the engine's shared {@link Float32Array}
 * input channel buffer; the brand keeps the type system from confusing
 * pointer channels with other channel kinds.
 *
 * User code reads channel constants from the {@link Pointer} namespace
 * (`Pointer.X`, `Pointer.Active`, `Pointer.Slot1X`, ...).
 *
 * @internal
 */
export type PointerChannel = number & { readonly [pointerChannelBrand]: void };

const pointerCh = (offset: number): PointerChannel => (ChannelOffset.Pointers + offset) as PointerChannel;
const slot = (s: number, field: 0 | 1 | 2): PointerChannel => pointerCh(s * pointerSlotSize + field);

/**
 * Bit flags accumulated on a {@link Pointer} between frames so consumers can
 * detect transient events (entered the canvas, was released, was cancelled)
 * even if the pointer's `currentState` has already moved on. Cleared each
 * frame by the {@link InteractionManager}.
 */
export enum PointerStateFlag {
  None = 0,
  Over = 1 << 0,
  Leave = 1 << 1,
  Down = 1 << 2,
  Move = 1 << 3,
  Up = 1 << 4,
  Cancel = 1 << 5,
}

/** High-level lifecycle state of a {@link Pointer}. */
export enum PointerState {
  Unknown,
  InsideCanvas,
  OutsideCanvas,
  Pressed,
  Moving,
  Released,
  Cancelled,
}

/**
 * Unified mouse / touch / pen pointer. Wraps a single browser
 * `PointerEvent.pointerId` and writes its state (position, buttons,
 * pressure, tilt, etc.) into the engine's shared channels buffer so it can
 * be polled by {@link Input} bindings or read directly by interaction-aware
 * scene nodes.
 *
 * Coordinates are stored in logical/design pixel space — i.e. `app.width`/
 * `app.height` units (`0..app.width` × `0..app.height`), matching node
 * positions, the 2-argument {@link View.screenToWorld}, and the active camera.
 * The CSS-pixel event coordinates are mapped through the application's content
 * viewport, so the value is independent of {@link Application.pixelRatio} and of
 * however the canvas is displayed (sizingMode `'fit'`/`'shrink'`/`'letterbox'`,
 * or a CSS transform): a click at the right edge always reads `app.width`. In
 * `'letterbox'` mode the letterbox bars map outside `0..app.width`. The channel
 * writes are normalized to 0..1 (position, size, twist, tilt) for
 * backend-agnostic sampling.
 *
 * Pointers are owned by the {@link InputManager}, which assigns them a slot
 * index in 0..15 (see {@link maxPointers}) and exposes their per-slot
 * channel offsets via the {@link Pointer} class namespace constants.
 */
export class Pointer {
  public readonly id: number;
  public readonly type: string;
  public readonly position: Vector;
  public readonly startPos: Vector = new Vector(-1, -1);
  public readonly size: Size;
  public readonly tilt: Vector;
  public readonly stateFlags: Flags<PointerStateFlag> = new Flags<PointerStateFlag>();

  private _app: Application | null;
  private _canvas: HTMLCanvasElement | null;
  private _channels: Float32Array | null;
  private _slotIndex: number;
  private _channelBase: number;
  private _buttons: number;
  private _pressure: number;
  private _rotation: number;
  private _isPrimary: boolean;
  private _currentState: PointerState = PointerState.Unknown;

  public constructor(event: PointerEvent, app: Application, canvas: HTMLCanvasElement, channels: Float32Array, slotIndex: number) {
    const { pointerId, pointerType, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;

    this._app = app;
    this._canvas = canvas;
    this._channels = channels;
    this._slotIndex = slotIndex;
    this._channelBase = ChannelOffset.Pointers + slotIndex * pointerSlotSize;

    const geometry = this._computeDesignGeometry(clientX, clientY, width, height);

    this.id = pointerId;
    this.type = pointerType;
    this.position = new Vector(geometry.x, geometry.y);
    this.size = new Size(geometry.width, geometry.height);
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
    this._app = null;
    this._canvas = null;
    this._channels = null;
  }

  private handleEvent(event: PointerEvent): this {
    const { clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;
    const geometry = this._computeDesignGeometry(clientX, clientY, width, height);

    this.position.set(geometry.x, geometry.y);
    this.size.set(geometry.width, geometry.height);
    this.tilt.set(tiltX, tiltY);
    this._buttons = buttons;
    this._pressure = pressure;
    this._rotation = twist;
    this._isPrimary = isPrimary;

    return this;
  }

  /**
   * Map a CSS-pixel pointer event into design space. The event point is first
   * expressed as a fraction of the canvas display rect, scaled to backing-store
   * pixels, then routed through {@link Application._backingStoreToDesign} (which
   * folds in `pixelRatio` and any letterbox content viewport). The contact
   * size is mapped as a delta through the same transform.
   */
  private _computeDesignGeometry(clientX: number, clientY: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
    const app = this._app;
    const canvas = this._canvas;

    if (!app || !canvas) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const u = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const v = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    const backingStoreX = u * canvas.width;
    const backingStoreY = v * canvas.height;
    const backingStoreW = rect.width > 0 ? (width / rect.width) * canvas.width : 0;
    const backingStoreH = rect.height > 0 ? (height / rect.height) * canvas.height : 0;
    const origin = app._backingStoreToDesign(backingStoreX, backingStoreY);
    const corner = app._backingStoreToDesign(backingStoreX + backingStoreW, backingStoreY + backingStoreH);

    return {
      x: origin.x,
      y: origin.y,
      width: Math.abs(corner.x - origin.x),
      height: Math.abs(corner.y - origin.y),
    };
  }

  /** Write the full 16-channel per-pointer state into the shared channel buffer. */
  private _writeChannels(active: boolean): void {
    const ch = this._channels;
    const canvas = this._canvas;

    if (!ch || !canvas) {
      return;
    }

    const base = this._channelBase;
    // position/size are in design pixels (0..app.width × 0..app.height), so
    // normalize by the design size for a scale-invariant 0..1 channel value.
    const app = this._app;
    const w = (app ? app.width : canvas.width) || 1;
    const h = (app ? app.height : canvas.height) || 1;

    if (!active) {
      // Zero the entire slot for a clean release.
      for (let i = 0; i < pointerSlotSize; i++) {
        ch[base + i] = 0;
      }

      return;
    }

    const x = Math.min(1, Math.max(0, this.position.x / w));
    const y = Math.min(1, Math.max(0, this.position.y / h));

    ch[base + 0] = 1; // active
    ch[base + 1] = x; // x (normalized)
    ch[base + 2] = y; // y (normalized)
    ch[base + 3] = this._pressure; // pressure
    ch[base + 4] = Math.min(1, this.size.width / w); // width (normalized)
    ch[base + 5] = Math.min(1, this.size.height / h); // height (normalized)
    ch[base + 6] = this._rotation / 359; // twist (0..359 → 0..1)
    ch[base + 7] = (this.tilt.x + 90) / 180; // tiltX (-90..90 → 0..1)
    ch[base + 8] = (this.tilt.y + 90) / 180; // tiltY (-90..90 → 0..1)
    ch[base + 9] = this._buttons & 1 ? 1 : 0; // button.left
    ch[base + 10] = this._buttons & 2 ? 1 : 0; // button.right
    ch[base + 11] = this._buttons & 4 ? 1 : 0; // button.middle
    ch[base + 12] = this.type === 'mouse' ? 1 : 0; // isMouse
    ch[base + 13] = this.type === 'touch' ? 1 : 0; // isTouch
    ch[base + 14] = this.type === 'pen' ? 1 : 0; // isPen
    ch[base + 15] = this._isPrimary ? 1 : 0; // isPrimary
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
 * Channel-identifier constants merged onto the `Pointer` class. The
 * un-prefixed members (Active, X, Y, …) address slot 0 (the primary
 * pointer). For multi-touch access use `Pointer.Slot{N}Active /
 * Slot{N}X / Slot{N}Y`.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Pointer {
  // --- Primary-pointer convenience aliases (slot 0) ---
  export const Active = pointerCh(0);
  export const X = pointerCh(1);
  export const Y = pointerCh(2);
  export const Pressure = pointerCh(3);
  export const Width = pointerCh(4);
  export const Height = pointerCh(5);
  export const Twist = pointerCh(6);
  export const TiltX = pointerCh(7);
  export const TiltY = pointerCh(8);
  export const Left = pointerCh(9);
  export const Right = pointerCh(10);
  export const Middle = pointerCh(11);
  export const IsMouse = pointerCh(12);
  export const IsTouch = pointerCh(13);
  export const IsPen = pointerCh(14);
  export const IsPrimary = pointerCh(15);

  // --- Per-slot Active/X/Y for multi-pointer access ---
  export const Slot0Active = slot(0, 0);
  export const Slot0X = slot(0, 1);
  export const Slot0Y = slot(0, 2);
  export const Slot1Active = slot(1, 0);
  export const Slot1X = slot(1, 1);
  export const Slot1Y = slot(1, 2);
  export const Slot2Active = slot(2, 0);
  export const Slot2X = slot(2, 1);
  export const Slot2Y = slot(2, 2);
  export const Slot3Active = slot(3, 0);
  export const Slot3X = slot(3, 1);
  export const Slot3Y = slot(3, 2);
  export const Slot4Active = slot(4, 0);
  export const Slot4X = slot(4, 1);
  export const Slot4Y = slot(4, 2);
  export const Slot5Active = slot(5, 0);
  export const Slot5X = slot(5, 1);
  export const Slot5Y = slot(5, 2);
  export const Slot6Active = slot(6, 0);
  export const Slot6X = slot(6, 1);
  export const Slot6Y = slot(6, 2);
  export const Slot7Active = slot(7, 0);
  export const Slot7X = slot(7, 1);
  export const Slot7Y = slot(7, 2);
  export const Slot8Active = slot(8, 0);
  export const Slot8X = slot(8, 1);
  export const Slot8Y = slot(8, 2);
  export const Slot9Active = slot(9, 0);
  export const Slot9X = slot(9, 1);
  export const Slot9Y = slot(9, 2);
  export const Slot10Active = slot(10, 0);
  export const Slot10X = slot(10, 1);
  export const Slot10Y = slot(10, 2);
  export const Slot11Active = slot(11, 0);
  export const Slot11X = slot(11, 1);
  export const Slot11Y = slot(11, 2);
  export const Slot12Active = slot(12, 0);
  export const Slot12X = slot(12, 1);
  export const Slot12Y = slot(12, 2);
  export const Slot13Active = slot(13, 0);
  export const Slot13X = slot(13, 1);
  export const Slot13Y = slot(13, 2);
  export const Slot14Active = slot(14, 0);
  export const Slot14X = slot(14, 1);
  export const Slot14Y = slot(14, 2);
  export const Slot15Active = slot(15, 0);
  export const Slot15X = slot(15, 1);
  export const Slot15Y = slot(15, 2);
}
