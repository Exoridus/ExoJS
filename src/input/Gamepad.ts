import { Signal } from '#core/Signal';

import type { GamepadAxis } from './GamepadAxis';
import type { GamepadAxisChannel } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { GamepadButtonChannel } from './GamepadButton';
import type { BrowserGamepad, ResolvedGamepadDefinition } from './GamepadDefinitions';
import type { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';
import type { InputBindingOptions, InputChannel } from './InputBinding';
import { InputBinding } from './InputBinding';
import { ChannelOffset, ChannelSize } from './types';

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
 * lifetime even when no physical pad is attached — a "mailbox" that
 * physical hardware moves into and out of.
 *
 * Subscribe to {@link onConnect} / {@link onDisconnect} for hardware
 * lifecycle, {@link onButtonDown} / {@link onButtonUp} / {@link onAxisChange}
 * for granular per-event notifications, or call {@link onTrigger} /
 * {@link onActive} / {@link onStart} / {@link onStop} to register
 * stateful {@link InputBinding}s pinned to this slot.
 *
 * Listeners survive disconnect/reconnect cycles — a binding registered when
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

  /** The {@link GamepadMappingFamily}, or `null` when disconnected. */
  public get mappingFamily(): GamepadMappingFamily | null {
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
   * solo lacks a right stick — `pad.hasChannel(GamepadAxis.RightStickX)`
   * returns `false`).
   */
  public hasChannel(channel: GamepadButtonChannel | GamepadAxisChannel): boolean {
    return this._mapping?.hasChannel(channel) ?? false;
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
   */
  public onStart(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this._createBinding(channel, options);
    binding.onStart.add(callback);
    return binding;
  }

  /**
   * Register a callback fired every frame while any of `channels` is active.
   * Receives the channel value (0..1 for buttons, -1..1 for bipolar axes).
   */
  public onActive(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this._createBinding(channel, options);
    binding.onActive.add(callback);
    return binding;
  }

  /** Register a callback fired once when all of `channels` become inactive. */
  public onStop(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this._createBinding(channel, options);
    binding.onStop.add(callback);
    return binding;
  }

  /**
   * Register a callback fired when the input is released within
   * {@link InputBindingOptions.threshold} ms of activation (a "tap").
   */
  public onTrigger(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    const binding = this._createBinding(channel, options);
    binding.onTrigger.add(callback);
    return binding;
  }

  /**
   * Attach a physical browser gamepad to this slot. Called by
   * {@link InputManager} on connect.
   *
   * @internal
   */
  public _bind(gamepad: BrowserGamepad, definition: ResolvedGamepadDefinition): void {
    this._browserGamepad = gamepad;
    this._mapping = definition.mapping;
    this._info = {
      name: definition.name,
      label: definition.descriptor.label,
      vendorId: definition.descriptor.vendorId,
      productId: definition.descriptor.productId,
      productKey: definition.descriptor.productKey,
    };
    this.onConnect.dispatch();
  }

  /**
   * Detach the physical gamepad and clear its channels.
   *
   * @internal
   */
  public _unbind(): void {
    if (this._browserGamepad === null) {
      return;
    }

    this._clearMappedChannels();
    this._browserGamepad = null;
    this._mapping = null;
    this._info = null;
    this.onDisconnect.dispatch();
  }

  /**
   * Detach the physical gamepad and clear channels without firing
   * {@link onDisconnect}. Used by {@link InputManager} during the compact
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
   * state. Used by {@link InputManager} after a compact-mode shift, when a
   * slot has already been emptied by {@link _rebindFrom} and now needs to
   * notify subscribers that its mailbox is no longer occupied.
   *
   * @internal
   */
  public _dispatchDisconnect(): void {
    this.onDisconnect.dispatch();
  }

  /**
   * Reassign this slot to take over another slot's physical gamepad without
   * firing the full disconnect / connect cycle. Used by {@link InputManager}
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
   * Sample the browser gamepad's current state and write transformed values
   * into the shared channel buffer, dispatching transition events when
   * channel activity crosses thresholds. Called once per frame by the
   * engine's input loop. No-op when disconnected.
   *
   * @internal
   */
  public update(): void {
    if (this._browserGamepad === null || this._mapping === null) {
      this._updateBindings();
      return;
    }

    const channels = this._channels;
    const { buttons: rawButtons, axes: rawAxes } = this._browserGamepad;

    for (const button of this._mapping.buttons) {
      if (button.index >= rawButtons.length) {
        continue;
      }

      const offset = this._resolveOffset(button.channel);
      const previous = channels[offset];
      const value = button.transformValue(rawButtons[button.index].value) || 0;

      if (previous === value) {
        continue;
      }

      channels[offset] = value;

      if (previous === 0 && value !== 0) {
        this.onButtonDown.dispatch(button, value);
      } else if (previous !== 0 && value === 0) {
        this.onButtonUp.dispatch(button, value);
      }
    }

    for (const axis of this._mapping.axes) {
      if (axis.index >= rawAxes.length) {
        continue;
      }

      const offset = this._resolveOffset(axis.channel);
      const previous = channels[offset];
      const value = axis.transformValue(rawAxes[axis.index]) || 0;

      if (previous === value) {
        continue;
      }

      channels[offset] = value;
      this.onAxisChange.dispatch(axis, value);
    }

    this._updateBindings();
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
   * Static counterpart to {@link Gamepad.resolveChannelOffset} — resolves
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

  private _createBinding(channel: InputChannel | readonly InputChannel[], options: InputBindingOptions = {}): InputBinding {
    // `Array.isArray` narrows `readonly T[] | T` to `any[]`, dropping the element
    // type; annotate `list` so the element type is restored for `.map`.
    const list: readonly InputChannel[] = Array.isArray(channel) ? channel : [channel];
    const resolved = list.map(c => this._resolveExternalChannel(c));
    const binding = new InputBinding(resolved, options, this._detacher);
    this._bindings.add(binding);
    return binding;
  }

  private _resolveExternalChannel(channel: InputChannel): number {
    // Keyboard channels are global (no slot offset). Gamepad channels
    // need slot-aware translation. Any channel value within the
    // gamepad-section maps through this pad's slot offset; others
    // (Keyboard, Pointer) pass through as-is.
    if (channel >= ChannelOffset.Gamepads && channel < ChannelOffset.Gamepads + ChannelSize.Category) {
      return this._resolveOffset(channel as GamepadButtonChannel | GamepadAxisChannel);
    }

    return channel;
  }

  private _updateBindings(): void {
    for (const binding of this._bindings) {
      binding.update(this._channels);
    }
  }
}
