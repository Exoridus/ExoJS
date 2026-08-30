import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import { getPreciseTime, stopEvent } from '#core/utils';
import { Flags } from '#math/Flags';
import type { PointLike } from '#math/PointLike';
import { Vector } from '#math/Vector';
import type {
  PlatformAdapter,
  PlatformKeyboardEvent,
  PlatformPointerEvent,
  PlatformPositionalEvent,
  PlatformSubscription,
  PlatformWheelEvent,
} from '#platform/PlatformAdapter';

import type { ActionMap, ActionRecord, AnyActionMap } from './actions/ActionMap';
import type { ActionSample, ChannelEvent, ChannelEventBatch } from './actions/types';
import type { ContextMenuRequest } from './ContextMenuRequest';
import { Gamepad } from './Gamepad';
import type { GamepadAxis } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { BrowserGamepad, GamepadDefinition } from './gamepadDefinitions';
import { builtInGamepadDefinitions, resolveGamepadDefinition } from './gamepadDefinitions';
import { type GestureJournalEvent, GestureRecognizer } from './GestureRecognizer';
import type { InputBindingOptions, InputChannel } from './InputBinding';
import { InputBinding } from './InputBinding';
import { keyboardChannelFromCode, keyboardModifierChannelInfo } from './keyboardCodes';
import { computeDesignPoint, Pointer, PointerState, PointerStateFlag } from './Pointer';
import { ChannelOffset, ChannelSize, maxPointers, pointerSlotSize, resolveGamepadSlotChannel } from './types';

const gamepadSlots = 4;

/**
 * A per-frame consumer that owns an ordered set of action maps of its own -
 * currently a {@link SceneInputs} and its input scope stack. @internal
 */
export interface ActionScopeHost {
  _updateScopes(sample: ActionSample): void;
}

// Approximate pixel-equivalents for `WheelEvent.deltaMode` units other than
// `DOM_DELTA_PIXEL`. Firefox defaults to `DOM_DELTA_LINE` while most other
// browsers default to `DOM_DELTA_PIXEL`, so without this conversion the
// same physical scroll gesture reports wildly different raw magnitudes
// depending on the browser. Values are round approximations (a typical line
// height / viewport size) rather than device-exact figures - the Gamepad
// API and DOM wheel spec don't expose a precise conversion factor.
const wheelLineHeightPx = 16;
const wheelPageSizePx = 800;

/** Convert a raw `WheelEvent` delta component to an approximate pixel-equivalent, based on its `deltaMode`. */
const normalizeWheelDelta = (delta: number, deltaMode: number): number => {
  switch (deltaMode) {
    case 1: // WheelEvent.DOM_DELTA_LINE
      return delta * wheelLineHeightPx;
    case 2: // WheelEvent.DOM_DELTA_PAGE
      return delta * wheelPageSizePx;
    default: // WheelEvent.DOM_DELTA_PIXEL
      return delta;
  }
};

/**
 * Strategy used by {@link InputSystem} when assigning physical gamepads to
 * slot indices in {@link InputSystem.gamepads}.
 *
 * - `'sticky'` (default): each physical pad keeps its slot until a new pad
 *   fills an empty slot. A disconnect leaves a gap; reconnect later fills
 *   the lowest empty slot. Best for player-stable-binding semantics.
 * - `'compact'`: on disconnect, higher-numbered slots shift down to keep
 *   `gamepads[0..N-1]` densely populated. Good for "the first N pads are
 *   the N players" workflows.
 */
export type GamepadSlotStrategy = 'sticky' | 'compact';

enum InputSystemFlag {
  None = 0,
  KeyChange = 1 << 0,
  MouseWheel = 1 << 1,
}

/** One keyboard channel transition, in the exact order it happened. */
interface KeyChannelEvent {
  readonly channel: number;
  readonly pressed: boolean;
}

/**
 * One pointer phase, recorded in the EXACT global arrival order across every
 * tracked pointer - not merely ordered within its own pointer's sub-sequence.
 * See {@link JournalEntry}'s doc comment for why this has to be a single flat
 * structure rather than one list per pointer.
 */
interface PointerJournalEntry {
  readonly kind: 'pointer';
  readonly pointer: Pointer;
  readonly flag: PointerStateFlag;
  readonly x: number;
  readonly y: number;
  /** `Up` only: whether this release closed an actual press (not a stray `pointerup`). */
  readonly closedPress: boolean;
  /** `Up` only: the press excursion accumulated during the press THIS release closed. */
  readonly maxDistance: number;
}

/** A context-menu request, recorded in the exact position it arrived relative to every pointer phase. */
interface ContextMenuJournalEntry {
  readonly kind: 'contextmenu';
  readonly request: ContextMenuRequest;
}

/**
 * One real-world pointer occurrence - a single pointer phase OR a single
 * context-menu request - in the exact chronological order the platform
 * raised it, spanning every tracked pointer AND every context-menu request
 * together in one flat sequence. Appended directly at the raw DOM handler
 * call sites (`handlePointerOver`/`handlePointerDown`/`handlePointerMove`/
 * `handlePointerUp`/`handlePointerLeave`/`handlePointerCancel`/
 * `handleContextMenu`) - the only place true arrival order across different
 * pointers (and interleaved with a context-menu request) is still
 * observable. Reconstructing it afterward from each {@link Pointer}'s own
 * per-pointer phase list cannot recover an interleaving like
 * `P1 Down -> P2 Down -> P1 Up`: per-pointer buffering, dispatched one
 * pointer's whole list at a time, would silently turn that into
 * `P1 Down, P1 Up, P2 Down`. Drained once per frame by
 * {@link InputSystem._drainJournal}, in this same order, then cleared -
 * mirroring {@link InputSystem.keyEvents}'s own append/drain/clear
 * lifecycle, just for pointers and context-menu requests together.
 */
type JournalEntry = PointerJournalEntry | ContextMenuJournalEntry | GestureJournalEvent;

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
 * (`onKeyDown`, `onPointerDown`, `onGamepadConnected`, `onAnyGamepadButtonDown`, ...).
 *
 * Driven each frame by {@link Application.update}'s internal prepare stage
 * (first, ahead of interaction/audio/tweens/rendering); constructed
 * automatically - you do not instantiate this class yourself.
 */
export class InputSystem {
  private readonly _app: Application;
  /** The one seam between this system and its host: events, focus, gamepads, capture. */
  private readonly platform: PlatformAdapter;
  private readonly channels: Float32Array = new Float32Array(ChannelSize.Container);
  /**
   * Channel values as of the last change check - compared against the live
   * buffer to detect an actual change and avoid logging a redundant repeat.
   */
  private readonly channelsLast: Float32Array = new Float32Array(ChannelSize.Container);
  /**
   * Every atomic channel-write batch since the frame closed, in true
   * chronological order - one entry per real-world source event (one
   * keyboard key, one pointer event's co-written slot, one gamepad poll's
   * changed channels), never one entry per individual channel. Set as
   * platform events arrive, read by actions once per frame, and cleared only
   * when the frame closes - the ordered record that lets an action replay
   * its bound channels' real transition sequence, whole batch by whole
   * batch, instead of reconstructing it from independent, unordered
   * per-channel bits. See {@link ActionSample}'s doc comment.
   */
  private readonly frameBatches: ChannelEventBatch[] = [];
  /**
   * Monotonic counter stamped onto every {@link ChannelEventBatch} pushed
   * into {@link frameBatches} - unlike `frameBatches` itself, NEVER reset
   * once a frame closes. The watermark an {@link ActionMapBase._attach} (or
   * `InputBinding`'s own constructor) snapshots the CURRENT value of to tell
   * a batch that predates the moment it started observing - still sitting in
   * the shared log from earlier in the same real frame - apart from one that
   * arrived after. See {@link ChannelEventBatch}'s doc comment.
   */
  private _batchSequence = 0;
  private readonly pointers = new Map<number, Pointer>();
  /**
   * Terminal (Leave/Cancelled) pointers this flush identified, held back from
   * {@link _retirePointer} until {@link _finishInteractionFrame} runs. See
   * that method's doc comment for why retirement itself must wait.
   */
  private readonly pendingPointerRetirements = new Set<Pointer>();
  private readonly _gamepads: readonly [Gamepad, Gamepad, Gamepad, Gamepad];
  private readonly gamepadsByBrowserIndex = new Map<number, Gamepad>();
  private readonly bindings: Set<InputBinding> = new Set<InputBinding>();
  private readonly actionMaps = new Set<ActionMap>();
  private readonly scopeHosts = new Set<ActionScopeHost>();
  /**
   * Reused view over the channel buffers, handed to action maps each frame.
   * `frameId` is bumped once per {@link InputSystem.update} - the mechanism an
   * action shared by two attached maps uses to sample itself only once per
   * real frame no matter how many owners reach it.
   */
  private readonly actionSample: ActionSample;
  private _actionFrameId = 0;
  /**
   * How many live owners bind each captured keyboard channel. A refcount
   * rather than a set because one key can be bound by several bindings and
   * several action maps at once, and its browser default must stay suppressed
   * until the last of them goes away.
   */
  private readonly capturedKeyChannels = new Map<number, number>();
  /**
   * The keyboard channels each attached action map currently holds. Kept per
   * map so a rebind can be applied as a difference: the map is the only thing
   * that knows which channels it used to claim.
   */
  private readonly actionMapCaptures = new Map<AnyActionMap, Set<number>>();
  private readonly bindingDetacher = {
    detach: (binding: InputBinding): void => {
      this.bindings.delete(binding);
      this.releaseCapture(binding.channels);
    },
  };
  private readonly wheelOffset = new Vector();
  private readonly flags = new Flags<InputSystemFlag>();
  /** Keyboard transitions since the last flush, in true chronological order (see updateEvents). */
  private readonly keyEvents: KeyChannelEvent[] = [];
  private readonly gamepadDefinitions: GamepadDefinition[];
  private readonly slotStrategy: GamepadSlotStrategy;

  // Slot allocation for unified pointer tracking (mouse / touch / pen).
  private readonly pointerSlots = new Map<number, number>();
  private readonly freeSlots: number[] = Array.from({ length: maxPointers }, (_, i) => i);

  private readonly gestureRecognizer: GestureRecognizer;

  private canvasFocusedValue: boolean;
  private pointerDistanceThreshold: number;
  private readonly allowNativeContextMenu: boolean;
  private readonly allowTextSelection: boolean;
  /**
   * Every pointer phase and context-menu request since the last flush, in
   * true global chronological arrival order - see {@link JournalEntry}'s doc
   * comment.
   */
  private readonly journal: JournalEntry[] = [];

  /** Platform subscriptions held for the system's lifetime, undone on destroy. */
  private readonly listeners: PlatformSubscription[] = [];

  public readonly onCanvasFocusChange = new Signal<[focused: boolean]>();
  /**
   * Every pointer signal below carries the phase's own `(x, y)` explicitly,
   * in design pixels, alongside the pointer - an immutable snapshot rather
   * than a temporary rewind of {@link Pointer.position}. `pointer.x`/
   * `pointer.y` always read the pointer's live, current position instead
   * (see {@link Pointer.position}'s doc comment); use the `x`/`y` parameters
   * for the position a specific phase actually happened at.
   */
  public readonly onPointerEnter = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerLeave = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerDown = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerMove = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerUp = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerTap = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerSwipe = new Signal<[pointer: Pointer, x: number, y: number]>();
  public readonly onPointerCancel = new Signal<[pointer: Pointer, x: number, y: number]>();
  /**
   * Fires once per frame in which the wheel moved, with the accumulated
   * offset for that frame. `deltaY` is the usual scroll axis; `deltaX`
   * carries horizontal wheels and trackpad swipes. Both are normalized out
   * of the event's `deltaMode`, so a line- or page-mode wheel arrives in the
   * same units as a pixel-mode one.
   *
   * The values are plain numbers rather than a `Vector` on purpose: the
   * offset is reset to zero right after dispatch, so a shared instance would
   * be stale by the time a listener that kept it read it again.
   */
  public readonly onMouseWheel = new Signal<[deltaX: number, deltaY: number]>();
  /**
   * Fires once per physical key press with the key's channel. OS auto-repeat
   * while a key is held does not fire again, so this matches the down
   * transition an action's `pressed` reports rather than diverging from it.
   * Read the channel buffer (or an action) to know a key is still held.
   */
  public readonly onKeyDown = new Signal<[number]>();
  public readonly onKeyUp = new Signal<[number]>();
  /**
   * Fires whenever the platform's single native `contextmenu` event fires -
   * right-click, the keyboard context-menu key, Shift+F10, and (on most
   * touch browsers) a long-press all funnel through that one event, so there
   * is exactly one source to listen to here regardless of which of them the
   * user used. Independent of whether the browser's own menu was suppressed
   * - see {@link InputApplicationOptions.allowNativeContextMenu}.
   *
   * This is the engine-wide fallback: it fires unconditionally, with no
   * regard for the scene graph, so it is the right place for an
   * application-level menu that should appear no matter what - or nothing -
   * was under the pointer. Fires even when the request has no pointer to
   * attribute itself to (a keyboard-only session that has never moved a
   * mouse) - see {@link ContextMenuRequest}'s doc comment for why the request
   * carries its own coordinates instead of forcing the contract onto a
   * {@link Pointer}. A request over a specific interactive node additionally
   * bubbles as a scene-graph `contextmenu` {@link InteractionEvent} (see
   * {@link InteractionSystem}), which only fires when a node is actually hit
   * and can be stopped with {@link InteractionEvent.stopPropagation}; use that
   * one for a per-node menu instead. Do not confuse either with
   * {@link GestureRecognizer.onLongPress} - a separate, purely informational
   * touch/mouse-hold signal that never triggers this one on its own.
   */
  public readonly onContextMenu = new Signal<[ContextMenuRequest]>();

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

  /**
   * Fires on every two-touch-pointer move where the distance between them
   * changed. `scale` > 1 = spreading, < 1 = pinching; the center is the
   * midpoint between the two pointers, in the same coordinate space as
   * {@link Pointer.position}.
   *
   * The center arrives as two numbers rather than a `Vector` on purpose - a
   * shared instance would be overwritten by the next gesture entry in the
   * same frame.
   */
  public readonly onPinch = new Signal<[scale: number, centerX: number, centerY: number]>();
  /**
   * Fires on every two-touch-pointer move where the angle between them
   * changed. `angleDelta` is in radians; the center is the midpoint between
   * the two pointers - see {@link onPinch} for why it is not a `Vector`.
   */
  public readonly onRotate = new Signal<[angleDelta: number, centerX: number, centerY: number]>();
  /**
   * Fires when a pointer has been held without significant movement for
   * ≥ 500 ms of ENGINE time - frame deltas summed across the frames this
   * system actually ran, not wall-clock time. A hold therefore freezes while
   * the active scene is paused and while the application is stopped, and
   * resumes from where it left off; it never completes in the background.
   */
  public readonly onLongPress = new Signal<[pointer: Pointer]>();

  public constructor(app: Application) {
    const inputOptions = app.options.input ?? {};
    const gamepadDefinitions = inputOptions.gamepadDefinitions ?? [];
    const pointerDistanceThreshold = inputOptions.pointerDistanceThreshold ?? 10;
    const gamepadSlotStrategy = inputOptions.gamepadSlotStrategy ?? 'sticky';

    this._app = app;
    this.platform = app.platform;
    this.canvasFocusedValue = this.platform.surfaceFocused;
    this.pointerDistanceThreshold = pointerDistanceThreshold;
    this.allowNativeContextMenu = inputOptions.allowNativeContextMenu ?? false;
    this.allowTextSelection = inputOptions.allowTextSelection ?? false;
    this.gamepadDefinitions = [...gamepadDefinitions, ...builtInGamepadDefinitions];
    this.slotStrategy = gamepadSlotStrategy;

    // Disable the host's default pan/zoom/double-tap-zoom on touch devices so
    // pointer events reach the surface without being swallowed by native touch
    // gestures.
    this.platform.setTouchAction('none');

    this.actionSample = {
      values: this.channels,
      batches: this.frameBatches,
      frameId: 0,
      timestamp: 0,
    };
    this.gestureRecognizer = new GestureRecognizer(pointerDistanceThreshold, event => this.journal.push(event));

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
  public getPrimaryPointerPosition(): PointLike | null {
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

  /** The slot strategy active for this `InputSystem`. */
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
   * Start updating `map` every frame for the application's lifetime. Attaching
   * a map that is already attached elsewhere moves it here. Call
   * {@link ActionMap.detach} to stop, or use `scene.inputs.attach` for a map
   * that should die with its scene.
   *
   * While attached, the keyboard controls the map's actions bind have their
   * browser default suppressed, exactly as a direct `on*` binding does, and
   * rebinding moves that suppression with them. Reading a key without binding
   * it leaves its default alone.
   */
  public attach<T extends ActionRecord>(map: ActionMap<T>): ActionMap<T> {
    map._attach(this);
    this.actionMaps.add(map);

    return map;
  }

  /** Stop updating `map`. Called by {@link ActionMap.detach}. @internal */
  public _detachActionMap(map: ActionMap): void {
    this.actionMaps.delete(map);
  }

  /**
   * Add a scope host - a {@link SceneInputs} - to the per-frame update set.
   *
   * A host drives its own maps rather than registering each of them here,
   * because a scope stack has to update its levels in priority order and mask
   * each one with what the levels above it claim. This system stays the one
   * input clock: it owns the channel buffer, the batch log and the frame id,
   * and simply hands them to each host once per frame.
   *
   * @internal
   */
  public _trackScopeHost(host: ActionScopeHost): void {
    this.scopeHosts.add(host);
  }

  /** Stop driving `host`. @internal */
  public _detachScopeHost(host: ActionScopeHost): void {
    this.scopeHosts.delete(host);
  }

  /**
   * The live per-frame sample, for a host that needs to re-seed its maps
   * outside the normal update pass (a scene resume). @internal
   */
  public _actionSample(): ActionSample {
    return this.actionSample;
  }

  /**
   * Current value of the monotonic batch-sequence counter - the watermark an
   * {@link ActionMapOwner} hands to an {@link ActionMapBase} on `_attach`.
   * See {@link _batchSequence}'s doc comment.
   *
   * @internal
   */
  public _currentBatchSequence(): number {
    return this._batchSequence;
  }

  /**
   * Immutable snapshot of every live channel right now - the attach-moment
   * truth an {@link ActionOwnership} seeds every action from before it
   * replays any watermark-filtered batches on top. See
   * {@link ActionMapOwner._snapshotActionChannels}'s doc comment.
   *
   * @internal
   */
  public _snapshotActionChannels(): Float32Array {
    // Constructing from the source copies it and states the result type in the
    // code. A spread would yield a plain `number[]`, which is why the rule's
    // suggestion does not apply to a typed array.
    return new Float32Array(this.channels);
  }

  /**
   * Register a callback fired once when any of `channels` becomes active.
   * Manual lifecycle - call `.unbind()` on the returned binding to detach.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Omit to only create the
   *   binding and poll {@link InputBinding.active} / {@link InputBinding.value}
   *   yourself - see {@link onActive}.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   */
  public onStart(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    if (callback) binding.onStart.add(callback);
    return binding;
  }

  /**
   * Register a callback fired every frame while any of `channels` is active.
   *
   * The callback is optional: with none, this just creates a binding, which is
   * the idiomatic way to poll an input per frame - read
   * {@link InputBinding.active} / {@link InputBinding.value} in your own
   * `update()` instead of tracking held-state in a callback.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value, once per frame while active.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   *
   * @example
   * ```ts
   * const right = this.inputs.onActive([Keyboard.D, Keyboard.Right]);
   * // later, in update():
   * if (right.active) this.x += speed * delta;
   * ```
   */
  public onActive(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    if (callback) binding.onActive.add(callback);
    return binding;
  }

  /**
   * Register a callback fired once when all of `channels` become inactive.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link onActive}.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   */
  public onStop(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    if (callback) binding.onStop.add(callback);
    return binding;
  }

  /**
   * Register a callback fired when the input is released within
   * {@link InputBindingOptions.threshold} ms of activation (a "tap").
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link onActive}.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   */
  public onTrigger(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this.createBinding(channel, options);
    if (callback) binding.onTrigger.add(callback);
    return binding;
  }

  /**
   * {@link SystemMethods.preUpdate} phase, registered on `app.systems` by the
   * {@link Application} at {@link SystemOrder.CoreInput} - ahead of every other
   * core system, so this frame's snapshot is current before anything
   * simulates. Polls the gamepad API, drains queued keyboard/pointer/wheel
   * deltas into the channel buffer, fires the corresponding Signals, then
   * evaluates each registered binding.
   *
   * `delta` is also the clock a pending long-press matures on - see
   * {@link GestureRecognizer.update}.
   */
  public preUpdate(delta: Seconds): void {
    for (const pointer of this.pointers.values()) {
      pointer._beginFrame();
    }

    this.updateGamepads();
    this._recordChannelChanges(ChannelOffset.Gamepads, ChannelSize.Category);

    for (const binding of this.bindings) {
      binding.update(this.channels, this.frameBatches);
    }

    // A fresh id per real frame - the guard an action shared by two attached
    // maps uses to sample itself only once, however many owners reach it. The
    // timestamp travels with it so a timing-dependent action can notice that
    // time passed with no events at all (see ActionSample.timestamp).
    this.actionSample.frameId = ++this._actionFrameId;
    this.actionSample.timestamp = getPreciseTime();

    for (const map of this.actionMaps) {
      map._update(this.actionSample);
    }

    for (const host of this.scopeHosts) {
      host._updateScopes(this.actionSample);
    }

    // Mature a pending long-press on ENGINE time, before the journal drains,
    // so an occurrence that comes due this frame dispatches with it rather
    // than waiting for the next one. A paused scene freezes the hold instead
    // of letting it finish behind the pause: a finger resting on the screen
    // while a pause menu is up must not fire a long-press into the scene under
    // it. Nothing is held on the overwhelming majority of frames, so the
    // pending check comes first and keeps the common path free.
    if (this.gestureRecognizer.hasPendingLongPress && !this._app.scenes.paused) {
      this.gestureRecognizer.update(delta);
    }

    if (this.flags.value !== InputSystemFlag.None || this.journal.length > 0) {
      this.updateEvents();
    }

    // Close the frame: the ordered batch log is cleared here rather than
    // where it is read - every action within the frame must see the same
    // sequence, and the next frame starts from an empty log.
    this.frameBatches.length = 0;
  }

  public destroy(): void {
    this.removeEventListeners();
    this.gestureRecognizer.destroy();

    for (const pointer of this.pointers.values()) {
      pointer.destroy();
    }

    this.pointers.clear();
    this.pendingPointerRetirements.clear();

    for (const pad of this._gamepads) {
      pad.destroy();
    }

    for (const binding of [...this.bindings]) {
      binding.unbind();
    }

    for (const map of [...this.actionMaps]) {
      map.detach();
    }

    this.bindings.clear();
    this.actionMaps.clear();
    this.capturedKeyChannels.clear();
    this.actionMapCaptures.clear();
    this.gamepadsByBrowserIndex.clear();
    this.keyEvents.length = 0;
    this.frameBatches.length = 0;
    this.journal.length = 0;
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
    this.onContextMenu.destroy();
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
    const resolved = list.map(c => resolveGamepadSlotChannel(c, slot));
    const constructionBaseline = new Float32Array(resolved.length);

    for (let i = 0; i < resolved.length; i++) {
      constructionBaseline[i] = this.channels[resolved[i]!] ?? 0;
    }

    const binding = new InputBinding(resolved, options, this.bindingDetacher, this._batchSequence, constructionBaseline);
    this.bindings.add(binding);
    this.retainCapture(resolved);

    return binding;
  }

  /** Claim the browser default of every keyboard channel in `channels`. */
  private retainCapture(channels: Iterable<number>): void {
    for (const channel of channels) {
      if (channel < ChannelSize.Category) {
        this.capturedKeyChannels.set(channel, (this.capturedKeyChannels.get(channel) ?? 0) + 1);
      }
    }
  }

  /** Give back one claim per keyboard channel in `channels`. */
  private releaseCapture(channels: Iterable<number>): void {
    for (const channel of channels) {
      if (channel >= ChannelSize.Category) {
        continue;
      }

      const count = this.capturedKeyChannels.get(channel);

      if (count === undefined) {
        continue;
      }

      if (count <= 1) {
        this.capturedKeyChannels.delete(channel);
      } else {
        this.capturedKeyChannels.set(channel, count - 1);
      }
    }
  }

  /** The keyboard channels `map` binds right now. */
  private claimedKeyChannels(map: AnyActionMap): Set<number> {
    const channels = new Set<number>();

    map._claimChannels(channels);

    for (const channel of channels) {
      if (channel >= ChannelSize.Category) {
        channels.delete(channel);
      }
    }

    return channels;
  }

  /**
   * Start suppressing the browser defaults of everything `map` binds. Called
   * when a map attaches, whether directly here or through a scene facade.
   *
   * @internal
   */
  public _retainActionMapCapture(map: AnyActionMap): void {
    this._releaseActionMapCapture(map);

    const channels = this.claimedKeyChannels(map);

    this.actionMapCaptures.set(map, channels);
    this.retainCapture(channels);
  }

  /**
   * Re-read what `map` binds after a rebind and move the capture accordingly.
   * Applied as a difference so a key that survives the change never drops to
   * zero in between, which would hand one frame's default back to the browser.
   *
   * @internal
   */
  public _refreshActionMapCapture(map: AnyActionMap): void {
    const previous = this.actionMapCaptures.get(map);

    if (previous === undefined) {
      return;
    }

    const next = this.claimedKeyChannels(map);

    for (const channel of next) {
      if (!previous.has(channel)) {
        this.retainCapture([channel]);
      }
    }

    for (const channel of previous) {
      if (!next.has(channel)) {
        this.releaseCapture([channel]);
      }
    }

    this.actionMapCaptures.set(map, next);
  }

  /** Give back everything `map` held. Idempotent. @internal */
  public _releaseActionMapCapture(map: AnyActionMap): void {
    const channels = this.actionMapCaptures.get(map);

    if (channels === undefined) {
      return;
    }

    this.actionMapCaptures.delete(map);
    this.releaseCapture(channels);
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

  /**
   * Append ONE atomic batch covering every channel in `[base, base + length)`
   * that actually changed since the last check - never one entry per
   * individual channel, so co-written channels from a SINGLE real-world
   * event (a pointer's whole slot, one gamepad poll) are applied together
   * before any action/binding evaluates its aggregate state, rather than as
   * a sequence of independent steps with a transient, never-actually-true
   * state in between. Called right after a platform handler wrote into
   * those channels, which is the only moment a sub-frame change is still
   * observable - a frame-boundary diff could not tell true order or
   * intermediate values apart from a single net change. No batch is
   * appended at all when nothing in the range changed.
   */
  private _recordChannelChanges(base: number, length: number): void {
    const { channels, channelsLast, frameBatches } = this;
    let batch: ChannelEvent[] | null = null;

    for (let i = base, end = base + length; i < end; i++) {
      const value = channels[i] ?? 0;

      if ((channelsLast[i] ?? 0) !== value) {
        channelsLast[i] = value;
        (batch ??= []).push({ channel: i, value });
      }
    }

    if (batch !== null) {
      frameBatches.push({ channels: batch, sequence: ++this._batchSequence, timestamp: getPreciseTime() });
    }
  }

  /** Fold a pointer's whole 16-channel slot into ONE atomic batch - every field a single real-world pointer event wrote together. */
  private _recordPointerChanges(pointer: Pointer): void {
    this._recordChannelChanges(ChannelOffset.Pointers + pointer.slotIndex * pointerSlotSize, pointerSlotSize);
  }

  private _releaseSlot(pointerId: number): void {
    const slot = this.pointerSlots.get(pointerId);

    if (slot !== undefined) {
      this.pointerSlots.delete(pointerId);
      this.freeSlots.unshift(slot);
    }
  }

  /**
   * Fully retire a pointer whose FINAL state this flush is terminal (left
   * the canvas, or was cancelled): drop its map entry and slot TOGETHER, and
   * `destroy()` it. Checked once per pointer, after the WHOLE global journal
   * has dispatched (see {@link _drainJournal}) - never mid-dispatch, and
   * never at the raw platform-event handler that first observed the
   * Leave/Cancel. Releasing the slot any earlier would let a DIFFERENT
   * pointerId's `pointerover` claim it later the SAME flush while this
   * pointer's own Leave/Cancel entry is still sitting undispatched in the
   * journal - corrupting the shared channel slot both would then be
   * writing into. A same-flush re-entry (see {@link handlePointerOver}'s doc
   * comment) leaves this pointer's final state something other than
   * terminal, so it is correctly skipped here rather than retired out from
   * under its own fresh `Over` phase.
   */
  private _retirePointer(pointer: Pointer): void {
    this.pointers.delete(pointer.id);
    this._releaseSlot(pointer.id);
    pointer.destroy();
  }

  /**
   * Keys are identified by PHYSICAL position (`KeyboardEvent.code`), never by
   * the layout-dependent `keyCode` - see {@link keyboardChannelFromCode}. A
   * key with no channel of its own (media and IME/language keys, and the empty
   * `code` a soft keyboard reports) is ignored outright rather than writing
   * into an arbitrary slot.
   *
   * For a modifier, `channel` is the SIDE-SPECIFIC channel and this also
   * writes the aggregate channel (`ShiftLeft` -> also sets `Shift`) - see
   * {@link keyboardModifierChannelInfo}. `keyEvents`/`onKeyDown` only ever see
   * the side channel: the aggregate is buffer state an action reads, not a
   * signal of its own, keeping one physical event equal to one dispatch.
   *
   * An OS auto-repeat (`KeyboardEvent.repeat`) is not a physical down
   * transition and produces no channel write and no `onKeyDown` dispatch -
   * `onKeyDown` means exactly what `ButtonAction.pressed` means, one dispatch
   * per real press. A captured key is still consumed on every repeat, since a
   * held key whose browser default is suppressed on the first event must stay
   * suppressed while it is held.
   */
  private handleKeyDown(event: PlatformKeyboardEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    const channel = keyboardChannelFromCode(event.code);

    if (channel === undefined) {
      return;
    }

    const modifier = keyboardModifierChannelInfo(channel);
    const capturedByAggregate = modifier !== undefined && this.capturedKeyChannels.has(modifier.aggregate);

    if (capturedByAggregate || this.capturedKeyChannels.has(channel)) {
      stopEvent(event);
    }

    if (event.repeat) {
      return;
    }

    this.channels[channel] = 1;
    this._recordChannelChanges(channel, 1);

    if (modifier !== undefined) {
      this.channels[modifier.aggregate] = 1;
      this._recordChannelChanges(modifier.aggregate, 1);
    }

    this.keyEvents.push({ channel, pressed: true });
    this.flags.addMask(InputSystemFlag.KeyChange);
  }

  /**
   * Physical-key resolution and unmapped-key handling exactly as in
   * {@link handleKeyDown}. For a modifier, the aggregate channel is set to
   * the SIBLING side's current value rather than unconditionally cleared -
   * releasing left `Control` while right `Control` is still held must not
   * clear {@link Keyboard.Control} - see {@link keyboardModifierChannelInfo}.
   */
  private handleKeyUp(event: PlatformKeyboardEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    const channel = keyboardChannelFromCode(event.code);

    if (channel === undefined) {
      return;
    }

    this.channels[channel] = 0;
    this._recordChannelChanges(channel, 1);

    const modifier = keyboardModifierChannelInfo(channel);
    let capturedByAggregate = false;

    if (modifier !== undefined) {
      this.channels[modifier.aggregate] = this.channels[modifier.sibling] ?? 0;
      this._recordChannelChanges(modifier.aggregate, 1);
      capturedByAggregate = this.capturedKeyChannels.has(modifier.aggregate);
    }

    this.keyEvents.push({ channel, pressed: false });
    this.flags.addMask(InputSystemFlag.KeyChange);

    if (capturedByAggregate || this.capturedKeyChannels.has(channel)) {
      stopEvent(event);
    }
  }

  /**
   * A pointer that left or was cancelled earlier THIS SAME flush stays fully
   * alive - map entry, slot, and channel data - until its own Leave/Cancel
   * phase has actually dispatched (see {@link _retirePointer}'s doc
   * comment), specifically so a re-entry arriving before that dispatch has
   * an existing, still-tracked pointer to reuse instead of one silently
   * discarded mid-flush. Re-entry with the same `pointerId` (routine for a
   * mouse leaving and re-entering the canvas) therefore extends that SAME
   * pointer's own ordered phase list with a fresh `Over` entry rather than
   * constructing a new object and overwriting the map entry out from under
   * the old one's still-undispatched phases - which would both lose the
   * pending Leave/Cancel phase and leak the discarded `Pointer` (nothing else
   * ever reaches or destroys it once the map no longer points to it).
   */
  private handlePointerOver(event: PlatformPointerEvent): void {
    const existing = this.pointers.get(event.pointerId);

    if (existing !== undefined) {
      existing.handleEnter(event);
      this._recordPointerChanges(existing);
      this._pushPointerPhase(existing, PointerStateFlag.Over, existing.x, existing.y);

      return;
    }

    const slot = this._assignSlot(event.pointerId);

    if (slot === null) {
      return;
    }

    const pointer = new Pointer(event, this._app, this.platform, this.channels, slot);

    this.pointers.set(event.pointerId, pointer);
    this._recordPointerChanges(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Over, pointer.x, pointer.y);
  }

  private handlePointerLeave(event: PlatformPointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleLeave(event);
    this._recordPointerChanges(pointer);
    this.gestureRecognizer.onPointerLeave(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Leave, pointer.x, pointer.y);
  }

  private handlePointerDown(event: PlatformPointerEvent): void {
    this.platform.focusSurface();
    this.canvasFocusedValue = true;

    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handlePress(event);
    this._recordPointerChanges(pointer);
    this.gestureRecognizer.onPointerDown(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Down, pointer.x, pointer.y);

    stopEvent(event);
  }

  private handlePointerMove(event: PlatformPointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleMove(event);
    this._recordPointerChanges(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Move, pointer.x, pointer.y);
    this.gestureRecognizer.onPointerMove(pointer, this.pointerDistanceThreshold);
  }

  private handlePointerUp(event: PlatformPointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    const { closedPress, maxDistance } = pointer.handleRelease(event);

    this._recordPointerChanges(pointer);
    this.gestureRecognizer.onPointerUp(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Up, pointer.x, pointer.y, closedPress, maxDistance);

    stopEvent(event);
  }

  private handlePointerCancel(event: PlatformPointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    pointer.handleCancel(event);
    this._recordPointerChanges(pointer);
    this.gestureRecognizer.onPointerCancel(pointer);
    this._pushPointerPhase(pointer, PointerStateFlag.Cancel, pointer.x, pointer.y);
  }

  /**
   * Append one pointer phase to the global journal in the exact order it
   * arrived - see {@link JournalEntry}'s doc comment. Two `Move` entries
   * coalesce ONLY when they are immediately adjacent in this GLOBAL order for
   * the SAME pointer: `P1 Move, P2 Move, P1 Move` stays three entries (a `P2`
   * entry sits between the two `P1` moves), while `P1 Move, P1 Move` collapses
   * into the latest - several platform moves in a row for one pointer are
   * never individually meaningful.
   */
  private _pushPointerPhase(pointer: Pointer, flag: PointerStateFlag, x: number, y: number, closedPress = false, maxDistance = 0): void {
    const { journal } = this;
    const lastIndex = journal.length - 1;
    const last = journal[lastIndex];

    if (flag === PointerStateFlag.Move && last !== undefined && last.kind === 'pointer' && last.flag === PointerStateFlag.Move && last.pointer === pointer) {
      journal[lastIndex] = { kind: 'pointer', pointer, flag, x, y, closedPress: false, maxDistance: 0 };

      return;
    }

    journal.push({ kind: 'pointer', pointer, flag, x, y, closedPress, maxDistance });
  }

  /**
   * Suppress the browser's own menu unless the application opted in - that
   * decision must happen synchronously, here - and separately queue a
   * semantic engine event for the frame boundary, where it is routed through
   * the scene graph. The two are independent: an application may want its own
   * in-game menu and the native one, or neither.
   *
   * The request's coordinates are computed directly, not read off a
   * `Pointer` - the keyboard context-menu key and Shift+F10 fire this same
   * native event with no pointer ever having touched the surface, so a
   * missing pointer must not suppress the request itself. `_primaryPointer()`
   * is still attached when one exists, as best-effort attribution only.
   *
   * Appended to the SAME global journal every pointer phase goes through
   * (never a single overwritable slot - see {@link JournalEntry}'s doc
   * comment), so two requests arriving in one frame both survive as separate
   * entries, and this request's position relative to any pointer phase
   * already queued this flush reflects the platform's true arrival order
   * rather than a fixed type-order.
   */
  private handleContextMenu(event: PlatformPositionalEvent): void {
    if (!this.allowNativeContextMenu) {
      stopEvent(event);
    }

    const { x, y } = computeDesignPoint(this._app, this.platform, event.clientX, event.clientY);
    const request: ContextMenuRequest = { x, y, pointer: this._primaryPointer() };

    this.journal.push({ kind: 'contextmenu', request });
  }

  /** The pointer a canvas-level event without a pointerId should be attributed to. */
  private _primaryPointer(): Pointer | null {
    for (const pointer of this.pointers.values()) {
      if (pointer.isPrimary && pointer.currentState !== PointerState.Cancelled) {
        return pointer;
      }
    }

    for (const pointer of this.pointers.values()) {
      if (pointer.currentState !== PointerState.Cancelled) {
        return pointer;
      }
    }

    return null;
  }

  private handleMouseWheel(event: PlatformWheelEvent): void {
    if (!this.canvasFocusedValue) {
      return;
    }

    // Fast/high-precision scrolling routinely fires several `wheel` events
    // within one engine frame - accumulate them here (mirroring the
    // journal's accumulate-then-flush-per-frame pattern for other input
    // signals) rather than overwriting, or all but the last sub-frame event
    // would be silently lost. `updateEvents` resets this to zero once the
    // accumulated total has been dispatched for the frame.
    this.wheelOffset.add(normalizeWheelDelta(event.deltaX, event.deltaMode), normalizeWheelDelta(event.deltaY, event.deltaMode));
    this.flags.addMask(InputSystemFlag.MouseWheel);

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
        this._recordChannelChanges(channel, 1);
        this.keyEvents.push({ channel, pressed: false });
        this.flags.addMask(InputSystemFlag.KeyChange);
      }
    }
  }

  /**
   * Subscribe to every platform event this system consumes. Which events are
   * listened for, and which are suppressed, stays here rather than in the
   * platform: that is input policy, not host mechanics.
   */
  private addEventListeners(): void {
    const active = { capture: true, passive: false };
    const passive = { capture: true, passive: true };
    const { platform, listeners } = this;

    listeners.push(
      platform.onWindowEvent('keydown', event => this.handleKeyDown(event), active),
      platform.onWindowEvent('keyup', event => this.handleKeyUp(event), active),
      platform.onWindowEvent('blur', () => this.handleWindowBlur(), active),
      platform.onSurfaceEvent('focus', () => this.handleCanvasFocus(), active),
      platform.onSurfaceEvent('blur', () => this.handleCanvasBlur(), active),
      platform.onSurfaceEvent('wheel', event => this.handleMouseWheel(event), active),
      platform.onSurfaceEvent('pointerover', event => this.handlePointerOver(event), passive),
      platform.onSurfaceEvent('pointerleave', event => this.handlePointerLeave(event), passive),
      platform.onSurfaceEvent('pointerdown', event => this.handlePointerDown(event), active),
      platform.onSurfaceEvent('pointermove', event => this.handlePointerMove(event), passive),
      platform.onSurfaceEvent('pointerup', event => this.handlePointerUp(event), active),
      platform.onSurfaceEvent('pointercancel', event => this.handlePointerCancel(event), passive),
      platform.onSurfaceEvent('contextmenu', event => this.handleContextMenu(event), active),
    );

    if (!this.allowTextSelection) {
      listeners.push(platform.onSurfaceEvent('selectstart', event => stopEvent(event), active));
    }
  }

  private removeEventListeners(): void {
    for (const unsubscribe of this.listeners) {
      unsubscribe();
    }

    this.listeners.length = 0;
  }

  private updateGamepads(): this {
    const browserGamepads = this.platform.pollGamepads();
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
      } else {
        // The browser hands back a fresh snapshot object each poll; re-point the
        // slot at it so button/axis state doesn't freeze at connect-time values.
        existing._refreshBrowserGamepad(browserGamepad);
      }
    }

    // Two pads can vanish in the same poll, and the compact strategy's shift
    // re-points map entries while this loop runs - so resolve each browser
    // index against the LIVE map at dispatch time instead of a pre-loop
    // entries snapshot (a stale pad reference would disconnect the wrong,
    // already-repurposed slot and leave a ghost `connected` pad behind).
    for (const browserIndex of [...this.gamepadsByBrowserIndex.keys()]) {
      if (seenBrowserIndices.has(browserIndex)) {
        continue;
      }

      const pad = this.gamepadsByBrowserIndex.get(browserIndex);

      this.gamepadsByBrowserIndex.delete(browserIndex);

      if (pad !== undefined) {
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
    if (this.flags.popMask(InputSystemFlag.KeyChange)) {
      // In true arrival order - a Shift-up followed by a Tab-down must
      // dispatch in that same order, or FocusController would still see
      // Shift held when Tab's handler runs and misread it as Shift+Tab.
      for (const event of this.keyEvents) {
        if (event.pressed) {
          this.onKeyDown.dispatch(event.channel);
        } else {
          this.onKeyUp.dispatch(event.channel);
        }
      }

      this.keyEvents.length = 0;
    }

    if (this.flags.popMask(InputSystemFlag.MouseWheel)) {
      this.onMouseWheel.dispatch(this.wheelOffset.x, this.wheelOffset.y);
      this.wheelOffset.set(0, 0);
    }

    if (this.journal.length > 0) {
      this._drainJournal();
    }

    return this;
  }

  /**
   * Dispatch this frame's pointer phases AND context-menu requests in the
   * exact global chronological order {@link journal} recorded them - not a
   * fixed type order, and not grouped per pointer - so `P1 Down -> P2 Down ->
   * P1 Up` dispatches in exactly that order, an Up followed by a Down within
   * one frame dispatches in that same order rather than always
   * Down-before-Up, two discrete presses in one frame each get their own
   * `onPointerDown` instead of collapsing into one, and a context-menu
   * request dispatches relative to whichever pointer phases it actually
   * arrived between rather than always after every pointer phase.
   *
   * Retirement (see {@link _retirePointer}'s doc comment) is checked in a
   * SEPARATE pass afterward, once per pointer, keyed on that pointer's FINAL
   * state for the flush - never mid-journal. A Leave entry sitting anywhere
   * but last for its pointer (a same-flush re-entry followed it) must not
   * have its object/slot torn down while a later `Over` entry for that SAME
   * pointer, or a context-menu request attributed to it, is still waiting to
   * dispatch - and a request attributed to a pointer that left/was cancelled
   * earlier this SAME flush is guaranteed to see that still-live Pointer
   * object here, never an already-retired one.
   */
  private _drainJournal(): void {
    const { journal } = this;

    for (const entry of journal) {
      if (entry.kind === 'contextmenu') {
        // Fires regardless of `request.pointer` - see this signal's own doc
        // comment for why a missing pointer must not swallow the request.
        this.onContextMenu.dispatch(entry.request);
        continue;
      }

      if (entry.kind === 'pinch') {
        this.onPinch.dispatch(entry.scale, entry.x, entry.y);
        continue;
      }

      if (entry.kind === 'rotate') {
        this.onRotate.dispatch(entry.angleDelta, entry.x, entry.y);
        continue;
      }

      if (entry.kind === 'longpress') {
        this.onLongPress.dispatch(entry.pointer);
        continue;
      }

      const { pointer, x, y } = entry;

      switch (entry.flag) {
        case PointerStateFlag.Over:
          this.onPointerEnter.dispatch(pointer, x, y);
          break;

        case PointerStateFlag.Down:
          this.onPointerDown.dispatch(pointer, x, y);
          break;

        case PointerStateFlag.Move:
          this.onPointerMove.dispatch(pointer, x, y);
          break;

        case PointerStateFlag.Up:
          this.onPointerUp.dispatch(pointer, x, y);

          // A press that travelled far and came back is a swipe, not a tap -
          // hence THIS press's own accumulated maximum, not the release distance.
          if (entry.closedPress) {
            if (entry.maxDistance < this.pointerDistanceThreshold) {
              this.onPointerTap.dispatch(pointer, x, y);
            } else {
              this.onPointerSwipe.dispatch(pointer, x, y);
            }
          }
          break;

        case PointerStateFlag.Cancel:
          this.onPointerCancel.dispatch(pointer, x, y);
          break;

        case PointerStateFlag.Leave:
          this.onPointerLeave.dispatch(pointer, x, y);
          break;

        default:
          break;
      }
    }

    journal.length = 0;

    for (const pointer of [...this.pointers.values()]) {
      if (pointer.currentState === PointerState.OutsideCanvas || pointer.currentState === PointerState.Cancelled) {
        this.pendingPointerRetirements.add(pointer);
      }
    }
  }

  /**
   * Finalize retirement of every pointer {@link _drainJournal} identified as
   * terminal this flush, once `InteractionSystem` has fully drained its own
   * node-level dispatch for the frame. `InputSystem._drainJournal` only
   * flags a terminal pointer as PENDING - it must not destroy it itself,
   * because `InteractionSystem._prepareFrame` (a separate top-level call the
   * app's frame loop makes right after `InputSystem._prepareFrame` returns)
   * still has queued node-level events - e.g. a `contextmenu` request - that
   * reference that same `Pointer` object and dispatch only during ITS OWN
   * pass. Destroying the pointer any earlier would hand a node handler an
   * already-destroyed `Pointer`.
   *
   * Called from `Application`'s frame loop in a `finally` block around
   * `interaction._prepareFrame()`, so retirement still runs even if a node
   * handler throws.
   *
   * Re-validates BOTH that a pending pointer is still genuinely terminal AND
   * that it's still the live map entry for its id before destroying it - a
   * node handler running during `InteractionSystem._prepareFrame` can
   * synchronously drive a same-`pointerId` re-entry (see
   * {@link handlePointerOver}'s doc comment) that replaces the map entry with
   * a fresh, non-terminal `Pointer` for that same id; that new object must
   * never be torn down here.
   *
   * @internal
   */
  public _finishInteractionFrame(): void {
    for (const pointer of this.pendingPointerRetirements) {
      const stillTerminal = pointer.currentState === PointerState.OutsideCanvas || pointer.currentState === PointerState.Cancelled;

      if (stillTerminal && this.pointers.get(pointer.id) === pointer) {
        this._retirePointer(pointer);
      }
    }

    this.pendingPointerRetirements.clear();
  }
}
