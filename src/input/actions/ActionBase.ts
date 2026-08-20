import type { InputChannel } from '#input/InputBinding';
import type { InputToken } from '#input/InputToken';
import { inputChannelFromToken, inputToken } from '#input/InputToken';
import { slotZeroGamepadChannel } from '#input/types';

import type { ActionKind, SerializedActionBinding } from './serialization';
import type { ActionSample } from './types';

/**
 * Slot a gamepad channel is resolved against. Runtime context supplied by the
 * owning {@link ActionMap}, never part of a binding or of persisted data.
 */
export type GamepadSlot = 0 | 1 | 2 | 3;

/**
 * Resolve `token` to the slot-0 channel it names.
 *
 * The result is a BINDING descriptor value, so it is deliberately not rebased
 * onto a pad slot - that happens later, in the owning map's resolve pass, and
 * doing it twice would land on the wrong device.
 *
 * @throws {Error} If no control carries `token`. Deserialization never falls
 * back to a nearby control - see {@link inputChannelFromToken}.
 */
export function channelFromToken(token: string): InputChannel {
  const channel = inputChannelFromToken(token);

  if (channel === null) {
    throw new Error(`Input binding: "${token}" is not a known input token. Bindings saved by a newer build cannot be applied to this one.`);
  }

  return channel;
}

/** {@link channelFromToken} over a list, rejecting a non-array or non-string entry outright. */
export function channelsFromTokens(tokens: unknown, what: string): readonly InputChannel[] {
  if (!Array.isArray(tokens)) {
    throw new Error(`Input binding: ${what} must be an array of input tokens.`);
  }

  return (tokens as readonly unknown[]).map(token => {
    if (typeof token !== 'string') {
      throw new Error(`Input binding: ${what} must contain input tokens (strings), not ${typeof token}.`);
    }

    return channelFromToken(token);
  });
}

/**
 * Canonical token for every channel in `channels`.
 *
 * Gamepad channels are rebased back to slot 0 first: a binding is stored and
 * displayed by the control it names, never by the runtime pad slot the owning
 * map happens to sit on.
 */
export function tokensFromChannels(channels: readonly number[]): readonly InputToken[] {
  return channels.map(channel => inputToken(slotZeroGamepadChannel(channel)));
}

/**
 * Shared contract of every action kind.
 *
 * An action owns a BINDING DESCRIPTOR (what the developer declared, or what a
 * player later rebound it to) and, separately, the absolute channel indices
 * that descriptor currently resolves to. The two are kept apart because the
 * descriptor is stable and serializable while the channels depend on runtime
 * context: which gamepad slot the owning {@link ActionMap} was given.
 *
 * An action never resolves a gamepad slot on its own. The owning map drives
 * {@link _rebind}, which is also how a rebind or a profile application reaches
 * an action - so the map can apply a whole set of changes and re-arm every
 * action's baseline in one transaction rather than leaving intermediate states
 * visible.
 */
export abstract class ActionBase<Binding> {
  /** Which action kind this is - the discriminant a serialized binding is validated against. */
  public abstract readonly kind: ActionKind;

  /** Absolute channel indices this action currently reads, after slot resolution. */
  protected _channels: readonly number[] = [];

  private readonly _defaultBinding: Binding;
  private _binding: Binding;
  private _slot: GamepadSlot = 0;

  protected constructor(binding: Binding) {
    this._defaultBinding = binding;
    this._binding = binding;
  }

  /** The binding this action was constructed with - what a `null` rebind restores. */
  public get defaultBinding(): Binding {
    return this._defaultBinding;
  }

  /** The binding currently in effect: the default, or whatever last replaced it. */
  public get binding(): Binding {
    return this._binding;
  }

  /**
   * Absolute channel indices this action reads right now.
   *
   * Reflects the effective binding and the owning map's gamepad slot, and is
   * what an {@link InputScope} claims on this action's behalf. The array is
   * replaced, not mutated, on every rebind - do not retain it across one.
   */
  public get channels(): readonly number[] {
    return this._channels;
  }

  /** This action's effective binding in persistable form. */
  public abstract serialize(): SerializedActionBinding;

  /**
   * Turn a persisted binding back into this kind's descriptor.
   *
   * @throws {Error} On an unknown token or a structurally invalid entry. A
   * profile is applied all-or-nothing, so throwing here aborts the whole
   * application before any action has been touched.
   *
   * @internal
   */
  public abstract _deserialize(data: SerializedActionBinding): Binding;

  /**
   * Replace this action's binding, or restore its default with `null`, and
   * resolve it against `slot`.
   *
   * Leaves the action fully reset: the caller (an {@link ActionMap}) re-arms
   * the shared baseline afterwards, so a source held across the rebind seeds
   * from its true current value instead of surfacing as a fresh press.
   *
   * @internal
   */
  public _rebind(binding: Binding | null, slot: GamepadSlot): void {
    this._binding = binding ?? this._defaultBinding;
    this._slot = slot;
    this._resolve(this._binding, slot);
    this._reset();
  }

  /** The slot this action's channels are currently resolved against. @internal */
  public get _gamepadSlot(): GamepadSlot {
    return this._slot;
  }

  /** Rebuild the resolved channel state from `binding`. @internal */
  protected abstract _resolve(binding: Binding, slot: GamepadSlot): void;

  /** Sample this frame's channel state. @internal */
  public abstract _update(sample: ActionSample): void;

  /** Clear all state, as if no source had ever been touched. @internal */
  public abstract _reset(): void;
}
