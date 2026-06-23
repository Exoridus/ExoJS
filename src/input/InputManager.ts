import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { System } from '#core/System';
import type { Time } from '#core/Time';
import { stopEvent } from '#core/utils';
import { Flags } from '#math/Flags';
import { getDistance } from '#math/utils';
import { Vector } from '#math/Vector';

import { Gamepad } from './Gamepad';
import type { GamepadAxis } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { BrowserGamepad, GamepadDefinition } from './GamepadDefinitions';
import { builtInGamepadDefinitions, resolveGamepadDefinition } from './GamepadDefinitions';
import { GestureRecognizer } from './GestureRecognizer';
import type { InputBindingOptions, InputChannel } from './InputBinding';
import { InputBinding } from './InputBinding';
import { Pointer, PointerState, PointerStateFlag } from './Pointer';
import { ChannelOffset, ChannelSize, maxPointers } from './types';

const gamepadSlots = 4;

/**
 * Strategy used by {@link InputManager} when assigning physical gamepads to
 * slot indices in {@link InputManager.gamepads}.
 *
 * - `'sticky'` (default): each physical pad keeps its slot until a new pad
 *   fills an empty slot. A disconnect leaves a gap; reconnect later fills
 *   the lowest empty slot. Best for player-stable-binding semantics.
 * - `'compact'`: on disconnect, higher-numbered slots shift down to keep
 *   `gamepads[0..N-1]` densely populated. Good for "the first N pads are
 *   the N players" workflows.
 */
export type GamepadSlotStrategy = 'sticky' | 'compact';

enum InputManagerFlag {
  None = 0,
  KeyDown = 1 << 0,
  KeyUp = 1 << 1,
  MouseWheel = 1 << 2,
  PointerUpdate = 1 << 3,
}

/**
 * Owns the unified input pipeline for an {@link Application}: keyboard
 * events, pointer (mouse/touch/pen) events with multi-touch slot
 * management, gamepad polling with mapping detection, mouse-wheel events,
 * canvas-focus tracking, and high-level gesture recognition (pinch /
 * rotate / long-press).
 *
 * All raw inputs are written into a shared `Float32Array` channel buffer.
 * Bind input listeners via the {@link onTrigger} / {@link onActive} /
 * {@link onStart} / {@link onStop} factory methods (or via
 * {@link Gamepad.onTrigger}-style methods on individual pads), or
 * subscribe to the signal-style notifications
 * (`onKeyDown`, `onPointerDown`, `onGamepadConnected`, `onAnyGamepadButtonDown`, …).
 *
 * Driven each frame by {@link Application.update}; constructed
 * automatically — you do not instantiate this class yourself.
 */
export class InputManager implements System {
  /** App-systems tick band — input flushes first; see Application.systems. @internal */
  public readonly order = 100;
  private readonly _app: Application;
  private readonly canvas: HTMLCanvasElement;
  private readonly channels: Float32Array = new Float32Array(ChannelSize.Container);
  private readonly pointers = new Map<number, Pointer>();
  private readonly _gamepads: readonly [Gamepad, Gamepad, Gamepad, Gamepad];
  private readonly gamepadsByBrowserIndex = new Map<number, Gamepad>();
  private readonly bindings: Set<InputBinding> = new Set<InputBinding>();
  private readonly capturedKeyChannels = new Map<number, number>();
  private readonly bindingDetacher = {
    detach: (binding: InputBinding): void => {
      this.bindings.delete(binding);

      for (const channel of binding.channels) {
        if (channel < ChannelSize.Category) {
          const count = this.capturedKeyChannels.get(channel);

          if (count !== undefined) {
            if (count <= 1) {
              this.capturedKeyChannels.delete(channel);
            } else {
              this.capturedKeyChannels.set(channel, count - 1);
            }
          }
        }
      }
    },
  };
  private readonly wheelOffset = new Vector();
  private readonly flags = new Flags<InputManagerFlag>();
  private readonly channelsPressed: number[] = [];
  private readonly channelsReleased: number[] = [];
  private readonly gamepadDefinitions: GamepadDefinition[];
  private readonly slotStrategy: GamepadSlotStrategy;

  // Slot allocation for unified pointer tracking (mouse / touch / pen).
  private readonly pointerSlots = new Map<number, number>();
  private readonly freeSlots: number[] = Array.from({ length: maxPointers }, (_, i) => i);

  private readonly gestureRecognizer: GestureRecognizer;

  private canvasFocusedValue: boolean;
  private pointerDistanceThreshold: number;

  private readonly keyDownHandler = this.handleKeyDown.bind(this);
  private readonly keyUpHandler = this.handleKeyUp.bind(this);
  private readonly canvasFocusHandler = this.handleCanvasFocus.bind(this);
  private readonly canvasBlurHandler = this.handleCanvasBlur.bind(this);
  private readonly windowBlurHandler = this.handleWindowBlur.bind(this);
  private readonly mouseWheelHandler = this.handleMouseWheel.bind(this);
  private readonly pointerOverHandler = this.handlePointerOver.bind(this);
  private readonly pointerLeaveHandler = this.handlePointerLeave.bind(this);
  private readonly pointerDownHandler = this.handlePointerDown.bind(this);
  private readonly pointerMoveHandler = this.handlePointerMove.bind(this);
  private readonly pointerUpHandler = this.handlePointerUp.bind(this);
  private readonly pointerCancelHandler = this.handlePointerCancel.bind(this);

  public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
  public readonly onPointerEnter = new Signal<[Pointer]>();
  public readonly onPointerLeave = new Signal<[Pointer]>();
  public readonly onPointerDown = new Signal<[Pointer]>();
  public readonly onPointerMove = new Signal<[Pointer]>();
  public readonly onPointerUp = new Signal<[Pointer]>();
  public readonly onPointerTap = new Signal<[Pointer]>();
  public readonly onPointerSwipe = new Signal<[Pointer]>();
  public readonly onPointerCancel = new Signal<[Pointer]>();
  public readonly onMouseWheel = new Signal<[Vector]>();
  public readonly onKeyDown = new Signal<[number]>();
  public readonly onKeyUp = new Signal<[number]>();

  /** Fires when a physical pad connects to any slot. */
  public readonly onGamepadConnected = new Signal<[Gamepad]>();
  /** Fires when a physical pad disconnects from any slot. */
  public readonly onGamepadDisconnected = new Signal<[Gamepad]>();
  /**
   * Fires when a `'compact'`-strategy disconnect shifts a higher-numbered
   * slot's pad into a lower one. Dispatched once per moved pad with the
   * destination slot and the slot index it came from.
   */
  public readonly onAnyGamepadReassigned = new Signal<[Gamepad, fromSlot: 0 | 1 | 2 | 3]>();

  /** Fires whenever any pad reports a button press transition. */
  public readonly onAnyGamepadButtonDown = new Signal<[Gamepad, GamepadButton, number]>();
  /** Fires whenever any pad reports a button release transition. */
  public readonly onAnyGamepadButtonUp = new Signal<[Gamepad, GamepadButton, number]>();
  /** Fires whenever any pad reports an axis value change. */
  public readonly onAnyGamepadAxisChange = new Signal<[Gamepad, GamepadAxis, number]>();

  /** Fires on every two-touch-pointer move where the distance between them changed. `scale` > 1 = spreading, < 1 = pinching. */
  public readonly onPinch = new Signal<[scale: number, center: Vector]>();
  /** Fires on every two-touch-pointer move where the angle between them changed. `angleDelta` is in radians. */
  public readonly onRotate = new Signal<[angleDelta: number, center: Vector]>();
  /** Fires when a pointer has been held without significant movement for ≥ 500 ms. */
  public readonly onLongPress = new Signal<[pointer: Pointer]>();

  public constructor(app: Application) {
    const inputOptions = app.options.input ?? {};
    const gamepadDefinitions = inputOptions.gamepadDefinitions ?? [];
    const pointerDistanceThreshold = inputOptions.pointerDistanceThreshold ?? 10;
    const gamepadSlotStrategy = inputOptions.gamepadSlotStrategy ?? 'sticky';

    this._app = app;
    this.canvas = app.canvas;
    this.canvasFocusedValue = document.activeElement === this.canvas;
    this.pointerDistanceThreshold = pointerDistanceThreshold;
    this.gamepadDefinitions = [...gamepadDefinitions, ...builtInGamepadDefinitions];
    this.slotStrategy = gamepadSlotStrategy;

    // Disable the browser's default pan/zoom/double-tap-zoom on touch devices so
    // pointer events reach the canvas without being swallowed by the browser's
    // native touch gestures.
    this.canvas.style.touchAction = 'none';

    this.gestureRecognizer = new GestureRecognizer(pointerDistanceThreshold, this.onPinch, this.onRotate, this.onLongPress);

    const slot0 = new Gamepad(0, this.channels);
    const slot1 = new Gamepad(1, this.channels);
    const slot2 = new Gamepad(2, this.channels);
    const slot3 = new Gamepad(3, this.channels);

    this._gamepads = [slot0, slot1, slot2, slot3];

    for (const pad of this._gamepads) {
      this.wireGamepadEvents(pad);
    }

    this.addEventListeners();
  }

  /**
   * Returns the canvas-relative position of the primary pointer (isPrimary = true),
   * or the first non-cancelled pointer if no primary is found. Returns null when
   * no active pointer is present. Used by debug layers to show cursor info.
   */
  public getPrimaryPointerPosition(): { x: number; y: number } | null {
    for (const pointer of this.pointers.values()) {
      if (pointer.isPrimary && pointer.currentState !== PointerState.Cancelled) {
        return { x: pointer.x, y: pointer.y };
      }
    }

    for (const pointer of this.pointers.values()) {
      if (pointer.currentState !== PointerState.Cancelled) {
        return { x: pointer.x, y: pointer.y };
      }
    }

    return null;
  }

  public get pointersInCanvas(): boolean {
    for (const pointer of this.pointers.values()) {
      if (pointer.currentState !== PointerState.OutsideCanvas && pointer.currentState !== PointerState.Cancelled) {
        return true;
      }
    }

    return false;
  }

  public get canvasFocused(): boolean {
    return this.canvasFocusedValue;
  }

  /**
   * Always-4 array of {@link Gamepad} slot mailboxes. Each entry exists for
   * the application's full lifetime; check `pad.connected` for hardware
   * presence. Listeners attached to a slot survive disconnect/reconnect.
   */
  public get gamepads(): readonly [Gamepad, Gamepad, Gamepad, Gamepad] {
    return this._gamepads;
  }

  /** The slot strategy active for this `InputManager`. */
  public get gamepadSlotStrategy(): GamepadSlotStrategy {
    return this.slotStrategy;
  }

  /**
   * Direct accessor for a single gamepad slot. Equivalent to
   * `app.input.gamepads[slot]` but reads more clearly at call sites.
   */
  public getGamepad(slot: 0 | 1 | 2 | 3): Gamepad {
    return this._gamepads[slot];
  }

  /** Subset of {@link gamepads} containing only currently connected pads, in slot order. */
  public get connectedGamepads(): readonly Gamepad[] {
    const result: Gamepad[] = [];

    for (const pad of this._gamepads) {
      if (pad.connected) {
        result.push(pad);
      }
    }

    return result;
  }

  /** Number of slots currently occupied by a physical gamepad. */
  public get connectedGamepadCount(): number {
    let count = 0;

    for (const pad of this._gamepads) {
      if (pad.connected) {
        count++;
      }
    }

    return count;
  }

  /** First connected gamepad in slot order, or `null` when no pads are attached. */
  public get firstConnectedGamepad(): Gamepad | null {
    for (const pad of this._gamepads) {
      if (pad.connected) {
        return pad;
      }
    }

    return null;
  }

  /** `true` when at least one slot is occupied by a physical gamepad. */
  public get hasGamepad(): boolean {
    for (const pad of this._gamepads) {
      if (pad.connected) {
        return true;
      }
    }

    return false;
  }

  /**
   * Register a callback fired once when any of `channels` becomes active.
   * Manual lifecycle — call `.unbind()` on the returned binding to detach.
   */
  public onStart(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    binding.onStart.add(callback);
    return binding;
  }

  /** Register a callback fired every frame while any of `channels` is active. */
  public onActive(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    binding.onActive.add(callback);
    return binding;
  }

  /** Register a callback fired once when all of `channels` become inactive. */
  public onStop(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    binding.onStop.add(callback);
    return binding;
  }

  /**
   * Register a callback fired when the input is released within
   * {@link InputBindingOptions.threshold} ms of activation (a "tap").
   */
  public onTrigger(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    binding.onTrigger.add(callback);
    return binding;
  }

  /**
   * Per-frame entry point invoked by {@link Application.update}. Polls
   * the gamepad API, drains queued keyboard/pointer/wheel deltas into
   * the channel buffer, fires the corresponding Signals, then evaluates
   * each registered binding.
   */
  public update(_delta: Time): void {
    this.updateGamepads();

    for (const binding of this.bindings) {
      binding.update(this.channels);
    }

    if (this.flags.value !== InputManagerFlag.None) {
      this.updateEvents();
    }
  }

  public destroy(): void {
    this.removeEventListeners();
    this.gestureRecognizer.destroy();

    for (const pointer of this.pointers.values()) {
      pointer.destroy();
    }

    this.pointers.clear();

    for (const pad of this._gamepads) {
      pad.destroy();
    }

    for (const binding of [...this.bindings]) {
      binding.unbind();
    }

    this.bindings.clear();
    this.capturedKeyChannels.clear();
    this.gamepadsByBrowserIndex.clear();
    this.channelsPressed.length = 0;
    this.channelsReleased.length = 0;
    this.pointerSlots.clear();
    this.freeSlots.length = 0;
    this.wheelOffset.destroy();
    this.flags.destroy();

    this.onPointerEnter.destroy();
    this.onPointerLeave.destroy();
    this.onPointerDown.destroy();
    this.onPointerMove.destroy();
    this.onPointerUp.destroy();
    this.onPointerTap.destroy();
    this.onPointerSwipe.destroy();
    this.onPointerCancel.destroy();
    this.onMouseWheel.destroy();
    this.onKeyDown.destroy();
    this.onKeyUp.destroy();
    this.onGamepadConnected.destroy();
    this.onGamepadDisconnected.destroy();
    this.onAnyGamepadReassigned.destroy();
    this.onAnyGamepadButtonDown.destroy();
    this.onAnyGamepadButtonUp.destroy();
    this.onAnyGamepadAxisChange.destroy();
    this.onPinch.destroy();
    this.onRotate.destroy();
    this.onLongPress.destroy();
    this.onCanvasFocusChange.destroy();
  }

  private createBinding(channel: InputChannel | readonly InputChannel[], options: InputBindingOptions = {}): InputBinding {
    // `Array.isArray` narrows `readonly T[] | T` to `any[]`, dropping the element
    // type; annotate `list` so the element type is restored for `.map`.
    const list: readonly InputChannel[] = Array.isArray(channel) ? channel : [channel];
    const slot = options.gamepadSlot ?? 0;
    const resolved = list.map(c => this.resolveExternalChannel(c, slot));
    const binding = new InputBinding(resolved, options, this.bindingDetacher);
    this.bindings.add(binding);

    for (const ch of resolved) {
      if (ch < ChannelSize.Category) {
        this.capturedKeyChannels.set(ch, (this.capturedKeyChannels.get(ch) ?? 0) + 1);
      }
    }

    return binding;
  }

  private resolveExternalChannel(channel: InputChannel, slot: 0 | 1 | 2 | 3): number {
    if (channel >= ChannelOffset.Gamepads && channel < ChannelOffset.Gamepads + ChannelSize.Category) {
      return ChannelOffset.Gamepads + slot * ChannelSize.Gamepad + (channel ^ ChannelOffset.Gamepads);
    }

    return channel;
  }

  private wireGamepadEvents(pad: Gamepad): void {
    pad.onButtonDown.add((button, value) => {
      this.onAnyGamepadButtonDown.dispatch(pad, button, value);
    });
    pad.onButtonUp.add((button, value) => {
      this.onAnyGamepadButtonUp.dispatch(pad, button, value);
    });
    pad.onAxisChange.add((axis, value) => {
      this.onAnyGamepadAxisChange.dispatch(pad, axis, value);
    });
  }

  private _assignSlot(pointerId: number): number | null {
    if (this.pointerSlots.has(pointerId)) {
      return this.pointerSlots.get(pointerId)!;
    }

    if (this.freeSlots.length === 0) {
      return null;
    }

    const slot = this.freeSlots.shift()!;

    this.pointerSlots.set(pointerId, slot);

    return slot;
  }

  private _releaseSlot(pointerId: number): void {
    const slot = this.pointerSlots.get(pointerId);

    if (slot !== undefined) {
      this.pointerSlots.delete(pointerId);
      this.freeSlots.unshift(slot);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    const channel = ChannelOffset.Keyboard + event.keyCode;

    this.channels[channel] = 1;
    this.channelsPressed.push(channel);
    this.flags.push(InputManagerFlag.KeyDown);

    if (this.capturedKeyChannels.has(channel)) {
      stopEvent(event);
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    const channel = ChannelOffset.Keyboard + event.keyCode;

    this.channels[channel] = 0;
    this.channelsReleased.push(channel);
    this.flags.push(InputManagerFlag.KeyUp);

    if (this.capturedKeyChannels.has(channel)) {
      stopEvent(event);
    }
  }

  private handlePointerOver(event: PointerEvent): void {
    const slot = this._assignSlot(event.pointerId);

    if (slot === null) {
      return;
    }

    this.pointers.set(event.pointerId, new Pointer(event, this._app, this.canvas, this.channels, slot));
    this.flags.push(InputManagerFlag.PointerUpdate);
  }

  private handlePointerLeave(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleLeave(event);
    this.gestureRecognizer.onPointerLeave(pointer);
    this._releaseSlot(event.pointerId);
    this.flags.push(InputManagerFlag.PointerUpdate);
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvas.focus();
    this.canvasFocusedValue = true;

    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handlePress(event);
    this.gestureRecognizer.onPointerDown(pointer);
    this.flags.push(InputManagerFlag.PointerUpdate);

    stopEvent(event);
  }

  private handlePointerMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleMove(event);
    this.gestureRecognizer.onPointerMove(pointer, this.pointerDistanceThreshold);
    this.flags.push(InputManagerFlag.PointerUpdate);
  }

  private handlePointerUp(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleRelease(event);
    this.gestureRecognizer.onPointerUp(pointer);
    this.flags.push(InputManagerFlag.PointerUpdate);

    stopEvent(event);
  }

  private handlePointerCancel(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleCancel(event);
    this.gestureRecognizer.onPointerCancel(pointer);
    this._releaseSlot(event.pointerId);
    this.flags.push(InputManagerFlag.PointerUpdate);
  }

  private handleMouseWheel(event: WheelEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    this.wheelOffset.set(event.deltaX, event.deltaY);
    this.flags.push(InputManagerFlag.MouseWheel);

    stopEvent(event);
  }

  private handleCanvasFocus(): void {
    if (!this.canvasFocusedValue) {
      this.canvasFocusedValue = true;
      this.onCanvasFocusChange.dispatch(true);
    }
  }

  private handleCanvasBlur(): void {
    if (this.canvasFocusedValue) {
      this.canvasFocusedValue = false;
      this.releaseAllKeyboardChannels();
      this.onCanvasFocusChange.dispatch(false);
    }
  }

  private handleWindowBlur(): void {
    if (this.canvasFocusedValue) {
      this.canvasFocusedValue = false;
      this.releaseAllKeyboardChannels();
      this.onCanvasFocusChange.dispatch(false);
    }
  }

  private releaseAllKeyboardChannels(): void {
    for (let offset = 0; offset < ChannelSize.Category; offset++) {
      const channel = ChannelOffset.Keyboard + offset;

      if (this.channels[channel] !== 0) {
        this.channels[channel] = 0;
        this.channelsReleased.push(channel);
        this.flags.push(InputManagerFlag.KeyUp);
      }
    }
  }

  private addEventListeners(): void {
    const activeWindow = window;
    const activeListenerOption = { capture: true, passive: false };
    const passiveListenerOption = { capture: true, passive: true };

    activeWindow.addEventListener('keydown', this.keyDownHandler, true);
    activeWindow.addEventListener('keyup', this.keyUpHandler, true);
    activeWindow.addEventListener('blur', this.windowBlurHandler, true);
    this.canvas.addEventListener('focus', this.canvasFocusHandler, true);
    this.canvas.addEventListener('blur', this.canvasBlurHandler, true);
    this.canvas.addEventListener('wheel', this.mouseWheelHandler, activeListenerOption);
    this.canvas.addEventListener('pointerover', this.pointerOverHandler, passiveListenerOption);
    this.canvas.addEventListener('pointerleave', this.pointerLeaveHandler, passiveListenerOption);
    this.canvas.addEventListener('pointerdown', this.pointerDownHandler, activeListenerOption);
    this.canvas.addEventListener('pointermove', this.pointerMoveHandler, passiveListenerOption);
    this.canvas.addEventListener('pointerup', this.pointerUpHandler, activeListenerOption);
    this.canvas.addEventListener('pointercancel', this.pointerCancelHandler, passiveListenerOption);
    this.canvas.addEventListener('contextmenu', stopEvent, activeListenerOption);
    this.canvas.addEventListener('selectstart', stopEvent, activeListenerOption);
  }

  private removeEventListeners(): void {
    const activeListenerOption = { capture: true, passive: false };
    const passiveListenerOption = { capture: true, passive: true };

    window.removeEventListener('keydown', this.keyDownHandler, true);
    window.removeEventListener('keyup', this.keyUpHandler, true);
    window.removeEventListener('blur', this.windowBlurHandler, true);
    this.canvas.removeEventListener('focus', this.canvasFocusHandler, true);
    this.canvas.removeEventListener('blur', this.canvasBlurHandler, true);
    this.canvas.removeEventListener('wheel', this.mouseWheelHandler, activeListenerOption);
    this.canvas.removeEventListener('pointerover', this.pointerOverHandler, passiveListenerOption);
    this.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler, passiveListenerOption);
    this.canvas.removeEventListener('pointerdown', this.pointerDownHandler, activeListenerOption);
    this.canvas.removeEventListener('pointermove', this.pointerMoveHandler, passiveListenerOption);
    this.canvas.removeEventListener('pointerup', this.pointerUpHandler, activeListenerOption);
    this.canvas.removeEventListener('pointercancel', this.pointerCancelHandler, passiveListenerOption);
    this.canvas.removeEventListener('contextmenu', stopEvent, activeListenerOption);
    this.canvas.removeEventListener('selectstart', stopEvent, activeListenerOption);
  }

  private updateGamepads(): this {
    const browserGamepads = window.navigator.getGamepads();
    const seenBrowserIndices = new Set<number>();

    for (const browserGamepad of browserGamepads) {
      if (!browserGamepad) {
        continue;
      }

      const browserIndex = browserGamepad.index;

      if (browserIndex < 0) {
        continue;
      }

      seenBrowserIndices.add(browserIndex);

      const existing = this.gamepadsByBrowserIndex.get(browserIndex);

      if (existing === undefined) {
        const pad = this.assignSlotForNewPad(browserGamepad);

        if (pad === null) {
          continue;
        }

        this.gamepadsByBrowserIndex.set(browserIndex, pad);
        this.onGamepadConnected.dispatch(pad);
      }
    }

    for (const [browserIndex, pad] of [...this.gamepadsByBrowserIndex.entries()]) {
      if (!seenBrowserIndices.has(browserIndex)) {
        this.gamepadsByBrowserIndex.delete(browserIndex);
        this.handleGamepadDisconnect(pad);
      }
    }

    for (const pad of this._gamepads) {
      pad.update();
    }

    return this;
  }

  private assignSlotForNewPad(browserGamepad: BrowserGamepad): Gamepad | null {
    const definition = resolveGamepadDefinition(browserGamepad, this.gamepadDefinitions);

    for (const pad of this._gamepads) {
      if (!pad.connected) {
        pad._bind(browserGamepad, definition);
        return pad;
      }
    }

    return null;
  }

  private handleGamepadDisconnect(pad: Gamepad): void {
    if (this.slotStrategy !== 'compact') {
      // Sticky: pad's slot becomes empty in place; fire onDisconnect
      // on that slot directly.
      pad._unbind();
      this.onGamepadDisconnected.dispatch(pad);

      return;
    }

    // Compact: in semantic terms the user lost a player, and the trailing
    // (highest-numbered) occupied slot is the one that becomes empty.
    // 1. Snapshot the highest occupied slot before any state change.
    // 2. Silently vacate the disconnecting pad (no onDisconnect yet).
    // 3. Shift higher-numbered occupied slots down to fill any gaps,
    //    firing onPadReassigned for each slot that received a new pad.
    // 4. Fire onDisconnect on the slot that ended up empty (the one
    //    snapshotted in step 1).
    let lastOccupiedSlot = -1;

    for (let i = gamepadSlots - 1; i >= 0; i--) {
      const slotPad = this._gamepads[i];
      if (slotPad !== undefined && slotPad.connected) {
        lastOccupiedSlot = i;
        break;
      }
    }

    pad._silentUnbind();

    for (let target = 0; target < gamepadSlots; target++) {
      const targetPad = this._gamepads[target];
      if (targetPad === undefined || targetPad.connected) {
        continue;
      }

      for (let source = target + 1; source < gamepadSlots; source++) {
        const sourcePad = this._gamepads[source];

        if (sourcePad === undefined || !sourcePad.connected) {
          continue;
        }

        const browserIndex = sourcePad.browserGamepad?.index;
        const sourceSlot = sourcePad.slot;

        targetPad._rebindFrom(sourcePad);

        if (browserIndex !== undefined) {
          this.gamepadsByBrowserIndex.set(browserIndex, targetPad);
        }

        targetPad.onPadReassigned.dispatch(sourceSlot);
        this.onAnyGamepadReassigned.dispatch(targetPad, sourceSlot);
        break;
      }
    }

    if (lastOccupiedSlot >= 0) {
      const emptiedSlot = this._gamepads[lastOccupiedSlot];
      if (emptiedSlot !== undefined) {
        emptiedSlot._dispatchDisconnect();
        this.onGamepadDisconnected.dispatch(emptiedSlot);
      }
    }
  }

  private updateEvents(): this {
    if (this.flags.pop(InputManagerFlag.KeyDown)) {
      for (const channel of this.channelsPressed) {
        this.onKeyDown.dispatch(channel);
      }

      this.channelsPressed.length = 0;
    }

    if (this.flags.pop(InputManagerFlag.KeyUp)) {
      for (const channel of this.channelsReleased) {
        this.onKeyUp.dispatch(channel);
      }

      this.channelsReleased.length = 0;
    }

    if (this.flags.pop(InputManagerFlag.MouseWheel)) {
      this.onMouseWheel.dispatch(this.wheelOffset);
      this.wheelOffset.set(0, 0);
    }

    if (this.flags.pop(InputManagerFlag.PointerUpdate)) {
      this.updatePointerEvents();
    }

    return this;
  }

  private updatePointerEvents(): void {
    for (const pointer of this.pointers.values()) {
      const { stateFlags } = pointer;

      if (stateFlags.value === PointerStateFlag.None) {
        continue;
      }

      if (stateFlags.pop(PointerStateFlag.Over)) {
        this.onPointerEnter.dispatch(pointer);
      }

      if (stateFlags.pop(PointerStateFlag.Down)) {
        this.onPointerDown.dispatch(pointer);
      }

      if (stateFlags.pop(PointerStateFlag.Move)) {
        this.onPointerMove.dispatch(pointer);
      }

      if (stateFlags.pop(PointerStateFlag.Up)) {
        const { x: startX, y: startY } = pointer.startPos;

        this.onPointerUp.dispatch(pointer);

        if (startX >= 0 && startY >= 0) {
          if (getDistance(startX, startY, pointer.x, pointer.y) < this.pointerDistanceThreshold) {
            this.onPointerTap.dispatch(pointer);
          } else {
            this.onPointerSwipe.dispatch(pointer);
          }
        }

        pointer.startPos.set(-1, -1);
      }

      if (stateFlags.pop(PointerStateFlag.Cancel)) {
        this.onPointerCancel.dispatch(pointer);
      }

      if (stateFlags.pop(PointerStateFlag.Leave)) {
        this.onPointerLeave.dispatch(pointer);
        this.pointers.delete(pointer.id);
      }
    }
  }
}
