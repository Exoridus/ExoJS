import type { Application } from '#core/Application';
import { Size } from '#math/Size';
import { getDistance } from '#math/utils';
import { Vector } from '#math/Vector';
import type { PlatformAdapter } from '#platform/PlatformAdapter';

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
 * Identifies which platform phase a {@link PointerPhaseEntry} records. Also
 * used as a bitmask by the frame accessors ({@link Pointer.pressed},
 * {@link Pointer.moved}, {@link Pointer.released}, …), which only ask "did
 * this happen at all this frame" — order doesn't matter for that question,
 * only for dispatch (see {@link Pointer._phaseList}).
 *
 * @internal
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

/**
 * One platform phase recorded in the exact chronological position it
 * happened, with the coordinates and (for `Up`) the tap/swipe classification
 * data that belongs to THAT occurrence specifically — not whatever the
 * pointer's fields read later, after further phases in the same frame may
 * have overwritten them. `Move` phases immediately adjacent to one another
 * coalesce into the latest (see {@link Pointer._pushPhase}); every other
 * phase, and any run of moves separated by a non-move phase, is preserved
 * individually and in order.
 *
 * @internal
 */
export interface PointerPhaseEntry {
  readonly flag: PointerStateFlag;
  readonly x: number;
  readonly y: number;
  /** `Up` only: whether this release closed an actual press (not a stray `pointerup`). */
  readonly closedPress: boolean;
  /** `Up` only: the press excursion accumulated during the press THIS release closed. */
  readonly maxDistance: number;
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

  /**
   * Current position in design pixels — always the pointer's latest, live
   * position, never rewound to an earlier phase. A signal handler that needs
   * the coordinates a SPECIFIC phase happened at (press, move, release,
   * context menu) receives them as explicit arguments rather than reading
   * this property, and {@link InteractionEvent.x}/{@link InteractionEvent.y}
   * are the corresponding immutable per-phase snapshot at the interaction
   * layer — this is a deliberate choice over a temporary rewind-and-restore,
   * which could leave a handler reading a DIFFERENT phase's position if it
   * runs any code after the dispatch that called it returns.
   */
  public readonly position: Vector;

  /**
   * Position at the previous frame boundary. Together with {@link position} it
   * spans {@link delta}: `position - previousPosition === delta` on any frame
   * read outside a phase dispatch.
   */
  public readonly previousPosition: Vector = new Vector();

  /** Movement accumulated over the current frame — `position - previousPosition`. */
  public readonly delta: Vector = new Vector();

  /** Position of the most recent press. Retains its value after release so tap/drag logic can still read it. */
  public readonly pressPosition: Vector = new Vector(-1, -1);

  /**
   * Position of the most recent move. Several platform moves in one frame
   * collapse into this, their last one — the coordinates the frame's
   * {@link moved} phase is dispatched at. `(-1, -1)` until the pointer has
   * moved at least once.
   */
  public readonly movePosition: Vector = new Vector(-1, -1);

  /** Position of the most recent release. `(-1, -1)` until the pointer has been released at least once. */
  public readonly releasePosition: Vector = new Vector(-1, -1);

  /** Position the platform cancelled this pointer at. `(-1, -1)` until it has been cancelled at least once. */
  public readonly cancelPosition: Vector = new Vector(-1, -1);

  /**
   * Position of the most recent context-menu request. Set from the request
   * itself rather than from wherever the pointer has since moved, so a menu
   * opens where the user asked for it. `(-1, -1)` until one has been requested.
   */
  public readonly contextMenuPosition: Vector = new Vector(-1, -1);

  public readonly size: Size;
  public readonly tilt: Vector;

  private _app: Application | null;
  private _platform: PlatformAdapter | null;
  private _channels: Float32Array | null;
  private _slotIndex: number;
  private _channelBase: number;
  private _buttons: number;
  private _pressure: number;
  private _rotation: number;
  private _isPrimary: boolean;
  private _currentState: PointerState = PointerState.Unknown;

  /** Phases seen since the last frame boundary, in order; promoted to `_framePhases` by {@link Pointer._beginFrame}. */
  private _pendingPhases: PointerPhaseEntry[] = [];
  /** Phases belonging to the current frame, in order. Stable for the whole frame — reading it does not consume it. */
  private _framePhases: readonly PointerPhaseEntry[] = [];
  private _maxDistanceFromPress = 0;
  private _pressActive = false;
  /** Kept aside so {@link position} can stay the single always-live source of truth. */
  private readonly _latestPosition = new Vector();
  /**
   * Position {@link delta} is measured from — the pointer's coordinates at the
   * frame boundary before last. Kept apart from {@link previousPosition} so
   * that one can keep meaning "where the pointer was on the previous frame"
   * for readers, instead of being overwritten with the current position as a
   * side effect of computing the delta.
   */
  private readonly _frameBaseline = new Vector();

  public constructor(event: PointerEvent, app: Application, platform: PlatformAdapter, channels: Float32Array, slotIndex: number) {
    const { pointerId, pointerType, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;

    this._app = app;
    this._platform = platform;
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

    this.previousPosition.set(geometry.x, geometry.y);
    this._latestPosition.set(geometry.x, geometry.y);
    this._frameBaseline.set(geometry.x, geometry.y);
    this._writeChannels(true);
    this._pushPhase(PointerStateFlag.Over);
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

  /** `true` while at least one button is held. Reflects the live button state, not a frame phase. */
  public get down(): boolean {
    return this._buttons !== 0;
  }

  /**
   * `true` when the pointer was pressed during this frame. A press and release
   * that both land between two frames set {@link pressed} *and*
   * {@link released} on the same frame — the phases are not lost.
   */
  public get pressed(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Down);
  }

  /** `true` when the pointer moved during this frame. Several platform moves collapse into one. */
  public get moved(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Move);
  }

  /** `true` when the pointer was released during this frame. */
  public get released(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Up);
  }

  /** `true` when the platform cancelled this pointer during this frame (system gesture, focus loss, …). */
  public get cancelled(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Cancel);
  }

  /** `true` when the pointer entered the canvas during this frame. */
  public get entered(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Over);
  }

  /** `true` when the pointer left the canvas during this frame. */
  public get exited(): boolean {
    return this._framePhases.some(phase => phase.flag === PointerStateFlag.Leave);
  }

  /**
   * Largest distance the pointer reached from {@link pressPosition} during the
   * current press, in design pixels. Accumulated from every platform move, so
   * a pointer that travels far and returns to its press position does *not*
   * read as a tap. Resets on the next press.
   */
  public get maxDistanceFromPress(): number {
    return this._maxDistanceFromPress;
  }

  public handleEnter(event: PointerEvent): void {
    this.handleEvent(event);
    this._currentState = PointerState.InsideCanvas;
    this._writeChannels(true);
    this._pushPhase(PointerStateFlag.Over);
  }

  public handleLeave(event: PointerEvent): void {
    this.handleEvent(event);
    this._currentState = PointerState.OutsideCanvas;
    this._writeChannels(false);
    this._pushPhase(PointerStateFlag.Leave);
  }

  public handlePress(event: PointerEvent): void {
    this.handleEvent(event);
    this.pressPosition.copy(this.position);
    this._maxDistanceFromPress = 0;
    this._pressActive = true;
    this._currentState = PointerState.Pressed;
    this._writeChannels(true);
    this._pushPhase(PointerStateFlag.Down);
  }

  public handleMove(event: PointerEvent): void {
    this.handleEvent(event);
    this.movePosition.copy(this.position);
    this._currentState = PointerState.Moving;
    this._writeChannels(true);
    this._pushPhase(PointerStateFlag.Move);
  }

  public handleRelease(event: PointerEvent): void {
    this.handleEvent(event);
    this.releasePosition.copy(this.position);

    const closedPress = this._pressActive;
    const maxDistance = this._maxDistanceFromPress;

    this._pressActive = false;
    this._currentState = PointerState.Released;
    this._writeChannels(true);
    this._pushPhase(PointerStateFlag.Up, closedPress, maxDistance);
  }

  public handleCancel(event: PointerEvent): void {
    this.handleEvent(event);
    this.cancelPosition.copy(this.position);
    this._pressActive = false;
    this._currentState = PointerState.Cancelled;
    this._writeChannels(false);
    this._pushPhase(PointerStateFlag.Cancel);
  }

  /**
   * Note where a context-menu request happened. The request arrives as a plain
   * platform mouse event with no pointer id of its own, so the manager
   * attributes it to a pointer and hands the coordinates here.
   *
   * @internal
   */
  public _noteContextMenu(clientX: number, clientY: number): void {
    const geometry = this._computeDesignGeometry(clientX, clientY, 0, 0);

    this.contextMenuPosition.set(geometry.x, geometry.y);
  }

  /**
   * Promote the phases accumulated since the last boundary into this frame's
   * snapshot and recompute {@link delta}. Called once per frame by the
   * {@link InputManager} before anything reads the pointer.
   *
   * @internal
   */
  public _beginFrame(): void {
    this._framePhases = this._pendingPhases;
    this._pendingPhases = [];

    const { x, y } = this._latestPosition;
    const baseX = this._frameBaseline.x;
    const baseY = this._frameBaseline.y;

    this.previousPosition.set(baseX, baseY);
    this.position.set(x, y);
    this.delta.set(x - baseX, y - baseY);
    this._frameBaseline.set(x, y);
  }

  /**
   * This frame's phases, in the exact order they happened — the
   * {@link InputManager}'s signal dispatch iterates this directly instead of
   * checking a bitmask in a fixed order, so an Up followed by a Down within
   * one frame dispatches in that same order, and two discrete presses in one
   * frame each get their own `onPointerDown`.
   *
   * @internal
   */
  public get _phaseList(): readonly PointerPhaseEntry[] {
    return this._framePhases;
  }

  /**
   * Record `flag` as having happened, at the pointer's current (post-event)
   * position. A `Move` immediately following another pending `Move` replaces
   * it in place rather than appending — intermediate positions of a fast
   * drag are never individually meaningful, only the latest is, so runs of
   * moves stay coalesced exactly as before. Any other phase, or a `Move` that
   * is not adjacent to a prior one (a Down or Up happened in between), is
   * always its own entry.
   */
  private _pushPhase(flag: PointerStateFlag, closedPress = false, maxDistance = 0): void {
    const { x, y } = this.position;

    if (flag === PointerStateFlag.Move) {
      const lastIndex = this._pendingPhases.length - 1;
      const last = this._pendingPhases[lastIndex];

      if (last !== undefined && last.flag === PointerStateFlag.Move) {
        this._pendingPhases[lastIndex] = { flag, x, y, closedPress: false, maxDistance: 0 };

        return;
      }
    }

    this._pendingPhases.push({ flag, x, y, closedPress, maxDistance });
  }

  public destroy(): void {
    this._clearChannels();
    this.position.destroy();
    this.previousPosition.destroy();
    this.delta.destroy();
    this.pressPosition.destroy();
    this.movePosition.destroy();
    this.releasePosition.destroy();
    this.cancelPosition.destroy();
    this.contextMenuPosition.destroy();
    this._latestPosition.destroy();
    this._frameBaseline.destroy();
    this.size.destroy();
    this.tilt.destroy();
    this._app = null;
    this._platform = null;
    this._channels = null;
  }

  private handleEvent(event: PointerEvent): this {
    const { clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist, isPrimary } = event;
    const geometry = this._computeDesignGeometry(clientX, clientY, width, height);

    this.position.set(geometry.x, geometry.y);
    this._latestPosition.set(geometry.x, geometry.y);

    // Track the press excursion as it happens: keeping only the release
    // position would read "out and back" as a tap.
    if (this._pressActive) {
      const distance = getDistance(this.pressPosition.x, this.pressPosition.y, geometry.x, geometry.y);

      if (distance > this._maxDistanceFromPress) {
        this._maxDistanceFromPress = distance;
      }
    }

    this.size.set(geometry.width, geometry.height);
    this.tilt.set(tiltX, tiltY);
    this._buttons = buttons;
    this._pressure = pressure;
    this._rotation = twist;
    this._isPrimary = isPrimary;

    return this;
  }

  /**
   * Map a host-pixel pointer event into design space. The event point is first
   * expressed as a fraction of the surface's display rect, scaled to
   * backing-store pixels, then routed through
   * {@link Application._backingStoreToDesign} (which folds in `pixelRatio` and
   * any letterbox content viewport). The contact size is mapped as a delta
   * through the same transform.
   */
  private _computeDesignGeometry(clientX: number, clientY: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
    const app = this._app;
    const platform = this._platform;

    if (!app || !platform) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const rect = platform.getSurfaceMetrics();
    const u = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const v = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    const backingStoreX = u * rect.backingWidth;
    const backingStoreY = v * rect.backingHeight;
    const backingStoreW = rect.width > 0 ? (width / rect.width) * rect.backingWidth : 0;
    const backingStoreH = rect.height > 0 ? (height / rect.height) * rect.backingHeight : 0;
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
    const app = this._app;

    if (!ch || !app) {
      return;
    }

    const base = this._channelBase;
    // position/size are in design pixels (0..app.width × 0..app.height), so
    // normalize by the design size for a scale-invariant 0..1 channel value.
    const w = app.width || 1;
    const h = app.height || 1;

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
  // Fields 9..11 are the buttons — addressed through `PointerButton`.
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
