import { Signal } from '#core/Signal';

import type { GamepadAxis } from './GamepadAxis';
import type { GamepadAxisChannel } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { GamepadButtonChannel } from './GamepadButton';
import type { BrowserGamepad, ResolvedGamepadDefinition } from './gamepadDefinitions';
import type { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';
import type { GamepadPromptControl } from './GamepadPromptLayouts';
import { GamepadPromptLayouts } from './GamepadPromptLayouts';
import type { InputBindingOptions, InputChannel } from './InputBinding';
import { InputBinding } from './InputBinding';
import { ChannelOffset, ChannelSize } from './types';

type ListenerErrorSink = (error: unknown) => void;

/** Kinds of the control notifications a sample leaves for {@link Gamepad._publish}. */
const enum PendingControl {
  ButtonDown = 0,
  ButtonUp = 1,
  Axis = 2,
}

/** Dispatch a slot-lifecycle signal; with `onError`, a throwing listener neither stops the others nor the caller. */
const emitLifecycle = (signal: Signal, onError: ListenerErrorSink | undefined): void => {
  if (onError === undefined) {
    signal.dispatch();
  } else {
    signal.dispatchIsolated(onError);
  }
};

/** Identity metadata for a connected gamepad. Populated from a {@link ResolvedGamepadDefinition}. */
export interface GamepadInfo {
  name: string;
  label: string;
  vendorId: string | null;
  productId: string | null;
  productKey: string | null;
}

/** Effect parameters for {@link Gamepad.vibrate}. */
export interface GamepadVibrationOptions {
  /** Duration in milliseconds. */
  duration: number;
  /** Low-frequency rumble intensity 0..1. Default 1. */
  weakMagnitude?: number;
  /** High-frequency rumble intensity 0..1. Default 1. */
  strongMagnitude?: number;
  /** Delay before rumble starts in ms. Default 0. */
  startDelay?: number;
}

/**
 * One of four stable gamepad slots. Lives for the entire `Application`
 * lifetime even when no physical pad is attached - a "mailbox" that
 * physical hardware moves into and out of.
 *
 * Subscribe to {@link onConnect} / {@link onDisconnect} for hardware
 * lifecycle, {@link onButtonDown} / {@link onButtonUp} / {@link onAxisChange}
 * for granular per-event notifications, or call {@link onTrigger} /
 * {@link onActive} / {@link onStart} / {@link onStop} to register
 * stateful {@link InputBinding}s pinned to this slot.
 *
 * Listeners survive disconnect/reconnect cycles - a binding registered when
 * the slot was empty will automatically activate when a pad connects.
 */
export class Gamepad {
  /** Fires when a physical pad connects to this slot. */
  public readonly onConnect = new Signal();
  /** Fires when the physical pad in this slot disconnects. */
  public readonly onDisconnect = new Signal();
  /** Fires for every button transition from inactive to active. */
  public readonly onButtonDown = new Signal<[GamepadButton, number]>();
  /** Fires for every button transition from active to inactive. */
  public readonly onButtonUp = new Signal<[GamepadButton, number]>();
  /** Fires whenever an axis crosses its activation threshold. */
  public readonly onAxisChange = new Signal<[GamepadAxis, number]>();
  /**
   * Fires when this slot's physical pad has been replaced by a previously
   * higher-numbered slot's pad, after a `'compact'`-strategy disconnect.
   * Dispatched with the source slot index the pad came from. Listeners
   * remain attached and the channel buffer is preserved across the move.
   */
  public readonly onPadReassigned = new Signal<[fromSlot: 0 | 1 | 2 | 3]>();

  private readonly _slot: 0 | 1 | 2 | 3;
  private readonly _channels: Float32Array;
  private readonly _bindings: Set<InputBinding> = new Set<InputBinding>();
  private readonly _detacher = {
    detach: (binding: InputBinding): void => {
      this._bindings.delete(binding);
    },
  };

  private readonly _channelOffset: number;
  private _mapping: GamepadMapping | null = null;
  private _info: GamepadInfo | null = null;
  private _browserGamepad: BrowserGamepad | null = null;
  /**
   * Control transitions the last {@link _sample} found, as parallel entries
   * waiting for {@link _publish}. Written by index against
   * {@link _pendingLength} so the storage is reused frame after frame.
   */
  private readonly _pendingKinds: PendingControl[] = [];
  private readonly _pendingControls: Array<GamepadButton | GamepadAxis> = [];
  private readonly _pendingValues: number[] = [];
  private _pendingLength = 0;

  public constructor(slot: 0 | 1 | 2 | 3, channels: Float32Array) {
    this._slot = slot;
    this._channels = channels;
    this._channelOffset = ChannelOffset.Gamepads + slot * ChannelSize.Gamepad;
  }

  /** This pad's stable slot (0..3). */
  public get slot(): 0 | 1 | 2 | 3 {
    return this._slot;
  }

  /** `true` while a physical pad is attached to this slot. */
  public get connected(): boolean {
    return this._browserGamepad !== null;
  }

  /** The active mapping, or `null` when disconnected. */
  public get mapping(): GamepadMapping | null {
    return this._mapping;
  }

  /**
   * Device family of the connected pad, or `null` when the slot is empty.
   *
   * The value to key a game's own button-glyph or controller artwork on; ExoJS
   * ships no glyph assets of its own.
   *
   * @example
   * ```ts
   * const set = pad.family === null ? icons.keyboard : icons[pad.family];
   * ```
   */
  public get family(): GamepadMappingFamily | null {
    return this._mapping?.family ?? null;
  }

  /** Identity metadata, or `null` when disconnected. */
  public get info(): GamepadInfo | null {
    return this._info;
  }

  /** The underlying browser gamepad object, or `null` when disconnected. */
  public get browserGamepad(): BrowserGamepad | null {
    return this._browserGamepad;
  }

  /**
   * Browser-assigned hardware index from `navigator.getGamepads()` (i.e.
   * `Gamepad.index`), or `null` when no pad is attached. Stable for the
   * lifetime of a single physical connection but may change across
   * disconnect/reconnect. Low-level escape hatch for advanced consumers
   * that need to correlate slots with the raw browser API; prefer
   * {@link slot} for stable per-application pad identity.
   */
  public get internalIndex(): number | null {
    return this._browserGamepad?.index ?? null;
  }

  /** `true` when the connected pad supports rumble via the Web Gamepad API. */
  public get canVibrate(): boolean {
    return this._browserGamepad?.vibrationActuator != null;
  }

  /**
   * Returns `true` when this pad's mapping declares the requested channel.
   * Use to gate listener registration on optional hardware (e.g. Joy-Con
   * solo lacks a right stick - `pad.hasChannel(GamepadAxis.RightStickX)`
   * returns `false`).
   */
  public hasChannel(channel: GamepadButtonChannel | GamepadAxisChannel): boolean {
    return this._mapping?.hasChannel(channel) ?? false;
  }

  /**
   * Name this device prints on `control` - "A" on an Xbox pad, "Cross" on a
   * PlayStation one, "B" on a Switch one - or `undefined` when the slot is
   * empty or this family does not label that control.
   *
   * Resolved against the connected pad's own mapping, so a generation that
   * deviates from its family default is honoured: the PlayStation `Select`
   * control reads "Share" on a DualShock 4 and "Create" on a DualSense.
   *
   * @example
   * ```ts
   * hint.text = `Press ${pad.getLabel('ButtonSouth') ?? 'Jump'} to jump`;
   * ```
   */
  public getLabel(control: GamepadPromptControl): string | undefined {
    const mapping = this._mapping;

    return mapping === null ? undefined : GamepadPromptLayouts.getControlLabels(mapping).get(control);
  }

  /**
   * Trigger a rumble effect on this pad. Resolves when the effect finishes.
   * Silent no-op when the pad is disconnected or the platform does not
   * support haptic feedback. Use {@link canVibrate} to detect support.
   */
  public async vibrate(options: GamepadVibrationOptions): Promise<void> {
    const actuator = this._browserGamepad?.vibrationActuator;

    if (!actuator?.playEffect) {
      return;
    }

    await actuator.playEffect('dual-rumble', {
      duration: options.duration,
      weakMagnitude: options.weakMagnitude ?? 1,
      strongMagnitude: options.strongMagnitude ?? 1,
      startDelay: options.startDelay ?? 0,
    });
  }

  /** Stop any active rumble on this pad. Silent no-op when unsupported. */
  public stopVibration(): void {
    void this._browserGamepad?.vibrationActuator?.reset?.();
  }

  /**
   * Register a callback fired once when any of `channels` becomes active.
   * Listener survives disconnect/reconnect; call `.unbind()` on the
   * returned {@link InputBinding} to detach.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link onActive}.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   */
  public onStart(
    channel: InputChannel | readonly InputChannel[],
    callback?: (value: number) => void,
    options?: InputBindingOptions,
  ): InputBinding {
    const binding = this._createBinding(channel, options);

    if (callback) {
      binding.onStart.add(callback);
    }

    return binding;
  }

  /**
   * Register a callback fired every frame while any of `channels` is active.
   * Receives the channel value (0..1 for buttons, -1..1 for bipolar axes).
   *
   * The callback is optional: with none, this just creates a binding, which is
   * the idiomatic way to poll a stick or trigger per frame - read
   * {@link InputBinding.active} / {@link InputBinding.value} in your own
   * `update()` instead of tracking held-state in a callback.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value, once per frame while active.
   * @param options - Binding options.
   * @returns The binding, so it can be polled or unbound.
   */
  public onActive(
    channel: InputChannel | readonly InputChannel[],
    callback?: (value: number) => void,
    options?: InputBindingOptions,
  ): InputBinding {
    const binding = this._createBinding(channel, options);

    if (callback) {
      binding.onActive.add(callback);
    }

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
  public onStop(
    channel: InputChannel | readonly InputChannel[],
    callback?: (value: number) => void,
    options?: InputBindingOptions,
  ): InputBinding {
    const binding = this._createBinding(channel, options);

    if (callback) {
      binding.onStop.add(callback);
    }

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
  public onTrigger(
    channel: InputChannel | readonly InputChannel[],
    callback?: (value: number) => void,
    options?: InputBindingOptions,
  ): InputBinding {
    const binding = this._createBinding(channel, options);

    if (callback) {
      binding.onTrigger.add(callback);
    }

    return binding;
  }

  /**
   * Attach a physical browser gamepad to this slot. Called by
   * {@link InputSystem} on connect.
   *
   * @internal
   */
  public _bind(gamepad: BrowserGamepad, definition: ResolvedGamepadDefinition, onError?: ListenerErrorSink): void {
    this._browserGamepad = gamepad;
    this._mapping = definition.mapping;
    this._info = {
      name: definition.name,
      label: definition.descriptor.label,
      vendorId: definition.descriptor.vendorId,
      productId: definition.descriptor.productId,
      productKey: definition.descriptor.productKey,
    };
    emitLifecycle(this.onConnect, onError);
  }

  /**
   * Re-point this slot at the latest browser gamepad snapshot. The Web Gamepad
   * API hands back a fresh, immutable snapshot object on every
   * `navigator.getGamepads()` poll, so a slot that keeps the object captured at
   * connect time would freeze its button/axis state. {@link InputSystem} calls
   * this each frame for already-connected pads; no signals fire.
   *
   * @internal
   */
  public _refreshBrowserGamepad(gamepad: BrowserGamepad): void {
    this._browserGamepad = gamepad;
  }

  /**
   * Detach the physical gamepad and clear its channels.
   *
   * @internal
   */
  public _unbind(onError?: ListenerErrorSink): void {
    if (this._browserGamepad === null) {
      return;
    }

    this._clearMappedChannels();
    this._browserGamepad = null;
    this._mapping = null;
    this._info = null;
    emitLifecycle(this.onDisconnect, onError);
  }

  /**
   * Detach the physical gamepad and clear channels without firing
   * {@link onDisconnect}. Used by {@link InputSystem} during the compact
   * slot-shift to silently vacate a slot before another pad shifts into
   * its place; the disconnect signal is fired separately on the slot that
   * ends up empty after compaction.
   *
   * @internal
   */
  public _silentUnbind(): void {
    if (this._browserGamepad === null) {
      return;
    }

    this._clearMappedChannels();
    this._browserGamepad = null;
    this._mapping = null;
    this._info = null;
  }

  /**
   * Dispatch this slot's {@link onDisconnect} signal without altering its
   * state. Used by {@link InputSystem} after a compact-mode shift, when a
   * slot has already been emptied by {@link _rebindFrom} and now needs to
   * notify subscribers that its mailbox is no longer occupied.
   *
   * @internal
   */
  public _dispatchDisconnect(onError?: ListenerErrorSink): void {
    emitLifecycle(this.onDisconnect, onError);
  }

  /**
   * Reassign this slot to take over another slot's physical gamepad without
   * firing the full disconnect / connect cycle. Used by {@link InputSystem}
   * when the `'compact'` slot strategy shuffles pads after a disconnect.
   *
   * @internal
   */
  public _rebindFrom(other: Gamepad): void {
    const gamepad = other._browserGamepad;
    const mapping = other._mapping;
    const info = other._info;

    this._clearMappedChannels();
    other._clearMappedChannels();
    other._browserGamepad = null;
    other._mapping = null;
    other._info = null;

    this._browserGamepad = gamepad;
    this._mapping = mapping;
    this._info = info;
  }

  /**
   * Sample the browser gamepad's current state and dispatch the resulting
   * notifications - a {@link _sample} immediately followed by its
   * {@link _publish}, with listener exceptions propagating.
   *
   * @internal
   */
  public update(): void {
    this._sample();
    this._publish();
  }

  /**
   * Write the browser gamepad's current, transformed values into the shared
   * channel buffer and advance this slot's bindings, without notifying
   * anyone: every button and axis transition is held for {@link _publish}.
   * Bindings advance even while disconnected, so a release caused by the
   * disconnect still reaches them.
   *
   * @internal
   */
  public _sample(): void {
    // Notifications a skipped publish left behind belong to a frame that is
    // over; delivering them now would replay it.
    this._pendingLength = 0;

    if (this._browserGamepad !== null && this._mapping !== null) {
      this._sampleControls(this._browserGamepad, this._mapping);
    }

    for (const binding of this._bindings) {
      binding._sample(this._channels);
    }
  }

  /**
   * Deliver what the last {@link _sample} found: button and axis transitions
   * in mapping order, then this slot's bindings. With `onError`, every
   * listener runs even when an earlier one throws, and each exception goes to
   * `onError` instead of propagating. Either way nothing is delivered twice.
   *
   * @internal
   */
  public _publish(onError?: ListenerErrorSink): void {
    const length = this._pendingLength;

    // Spent before the first listener runs, so one that throws (without
    // `onError`) cannot leave the rest to be delivered by a later publish.
    this._pendingLength = 0;

    for (let i = 0; i < length; i++) {
      const kind = this._pendingKinds[i]!;
      const value = this._pendingValues[i]!;

      if (kind === PendingControl.Axis) {
        const axis = this._pendingControls[i] as GamepadAxis;

        if (onError === undefined) {
          this.onAxisChange.dispatch(axis, value);
        } else {
          this.onAxisChange.dispatchIsolated(onError, axis, value);
        }

        continue;
      }

      const button = this._pendingControls[i] as GamepadButton;
      const signal = kind === PendingControl.ButtonDown ? this.onButtonDown : this.onButtonUp;

      if (onError === undefined) {
        signal.dispatch(button, value);
      } else {
        signal.dispatchIsolated(onError, button, value);
      }
    }

    for (const binding of this._bindings) {
      binding._publish(onError);
    }
  }

  private _sampleControls(browserGamepad: BrowserGamepad, mapping: GamepadMapping): void {
    const channels = this._channels;
    const { buttons: rawButtons, axes: rawAxes } = browserGamepad;

    for (const button of mapping.buttons) {
      const rawButton = rawButtons[button.index];

      if (rawButton === undefined) {
        continue;
      }

      const offset = this._resolveOffset(button.channel);
      const previous = channels[offset];
      const value = button.transformValue(rawButton.value) || 0;

      if (previous === value) {
        continue;
      }

      channels[offset] = value;

      if (previous === 0 && value !== 0) {
        this._queue(PendingControl.ButtonDown, button, value);
      } else if (previous !== 0 && value === 0) {
        this._queue(PendingControl.ButtonUp, button, value);
      }
    }

    for (const axis of mapping.axes) {
      const rawAxis = rawAxes[axis.index];

      if (rawAxis === undefined) {
        continue;
      }

      const offset = this._resolveOffset(axis.channel);
      const previous = channels[offset];
      // A stick axis is deadzoned on its pair's radius, so its partner's raw
      // value from THIS same poll has to travel with it - see
      // `GamepadAxis.transformValue`. A partner index the hardware does not
      // report degrades to 0, i.e. to the axis's own magnitude.
      const value = axis.transformValue(rawAxis, axis.pair === null ? 0 : (rawAxes[axis.pair] ?? 0)) || 0;

      if (previous === value) {
        continue;
      }

      channels[offset] = value;
      this._queue(PendingControl.Axis, axis, value);
    }
  }

  private _queue(kind: PendingControl, control: GamepadButton | GamepadAxis, value: number): void {
    const index = this._pendingLength++;

    this._pendingKinds[index] = kind;
    this._pendingControls[index] = control;
    this._pendingValues[index] = value;
  }

  /**
   * Tear down this gamepad slot. Called on application shutdown.
   */
  public destroy(): void {
    for (const binding of [...this._bindings]) {
      binding.unbind();
    }

    this._bindings.clear();
    this._unbind();
    this.onConnect.destroy();
    this.onDisconnect.destroy();
    this.onButtonDown.destroy();
    this.onButtonUp.destroy();
    this.onAxisChange.destroy();
    this.onPadReassigned.destroy();
  }

  /**
   * Convert a slot-relative channel value to its absolute index in the
   * shared channel buffer for this slot.
   */
  public resolveChannelOffset(channel: GamepadButtonChannel | GamepadAxisChannel): number {
    return this._resolveOffset(channel);
  }

  /**
   * Static counterpart to {@link Gamepad.resolveChannelOffset} - resolves
   * an absolute channel-buffer offset for a given slot index without
   * requiring a Gamepad instance.
   */
  public static resolveChannelOffset(slot: number, channel: GamepadButtonChannel | GamepadAxisChannel): number {
    return ChannelOffset.Gamepads + slot * ChannelSize.Gamepad + (channel ^ ChannelOffset.Gamepads);
  }

  private _resolveOffset(channel: GamepadButtonChannel | GamepadAxisChannel): number {
    return this._channelOffset + (channel ^ ChannelOffset.Gamepads);
  }

  private _clearMappedChannels(): void {
    if (this._mapping === null) {
      return;
    }

    for (const button of this._mapping.buttons) {
      this._channels[this._resolveOffset(button.channel)] = 0;
    }

    for (const axis of this._mapping.axes) {
      this._channels[this._resolveOffset(axis.channel)] = 0;
    }
  }

  /**
   * @throws {Error} If `channel` (or any element, for a channel list) is not
   * a {@link GamepadButtonChannel} or {@link GamepadAxisChannel}. A binding
   * created here only ever watches THIS pad's slot, so a Keyboard/Pointer
   * channel would silently skip the construction-baseline watermark and
   * keyboard-capture bookkeeping `InputSystem`'s own `onTrigger`/`onActive`/
   * `onStart`/`onStop` apply - it would type-check and appear to work while
   * behaving differently from the same channel bound through `app.input`.
   */
  private _createBinding(channel: InputChannel | readonly InputChannel[], options: InputBindingOptions = {}): InputBinding {
    // `Array.isArray` narrows `readonly T[] | T` to `any[]`, dropping the element
    // type; annotate `list` so the element type is restored for `.map`.
    const list: readonly InputChannel[] = Array.isArray(channel) ? channel : [channel];
    const resolved = list.map(c => this._resolveGamepadChannel(c));
    const binding = new InputBinding(resolved, options, this._detacher);
    this._bindings.add(binding);

    return binding;
  }

  /** Slot-aware translation for a channel that must address THIS pad - see {@link _createBinding}'s `@throws`. */
  private _resolveGamepadChannel(channel: InputChannel): number {
    if (channel < ChannelOffset.Gamepads || channel >= ChannelOffset.Gamepads + ChannelSize.Category) {
      throw new Error(
        `Gamepad: channel ${String(channel)} is not a gamepad button or axis channel. Bind Keyboard/Pointer channels through Application.input instead.`,
      );
    }

    return this._resolveOffset(channel as GamepadButtonChannel | GamepadAxisChannel);
  }
}
