import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { GamepadSlot } from './ActionBase';
import { ActionBase, channelFromToken, channelsFromTokens, tokensFromChannels } from './ActionBase';
import type { SerializedActionBinding, SerializedAxisEntry } from './serialization';
import type { ActionOptions, ActionSample, AtLeastOne, OneOrMany } from './types';
import { sampleStrongest, toChannels } from './types';

/**
 * Two opposing groups of sources forming one signed axis. `negative` and
 * `positive` are the generic one-dimensional terms - use them for left/right,
 * down/up, brake/throttle alike. Either side may be omitted for a one-sided
 * axis.
 */
export interface AxisCompositeBinding {
  readonly negative?: OneOrMany<InputChannel>;
  readonly positive?: OneOrMany<InputChannel>;
}

/** A directly signed source (a stick axis) or a composite built from two button groups. */
export type AxisBinding = InputChannel | AtLeastOne<AxisCompositeBinding>;

interface ResolvedAxisBinding {
  readonly direct: readonly number[];
  readonly negative: readonly number[];
  readonly positive: readonly number[];
}

const resolveAxisBinding = (binding: AxisBinding, slot: GamepadSlot): ResolvedAxisBinding => {
  const rebase = (channels: readonly number[]): readonly number[] => channels.map(channel => resolveGamepadSlotChannel(channel, slot));

  if (typeof binding === 'number') {
    return { direct: rebase([binding]), negative: [], positive: [] };
  }

  return {
    direct: [],
    negative: rebase(toChannels(binding.negative)),
    positive: rebase(toChannels(binding.positive)),
  };
};

const evaluateAxis = (buffer: Float32Array, binding: ResolvedAxisBinding): number => {
  if (binding.direct.length > 0) {
    return sampleStrongest(buffer, binding.direct);
  }

  const positive = Math.abs(sampleStrongest(buffer, binding.positive));
  const negative = Math.abs(sampleStrongest(buffer, binding.negative));

  return positive - negative;
};

const serializeEntry = (binding: ResolvedAxisBinding): SerializedAxisEntry => {
  if (binding.direct.length > 0) {
    return { direct: tokensFromChannels(binding.direct)[0]! };
  }

  return { negative: tokensFromChannels(binding.negative), positive: tokensFromChannels(binding.positive) };
};

const deserializeEntry = (entry: unknown): AxisBinding => {
  if (entry === null || typeof entry !== 'object') {
    throw new Error('AxisAction: every serialized binding entry must be an object.');
  }

  const { direct, negative, positive } = entry as SerializedAxisEntry;

  if (direct !== undefined) {
    return channelFromToken(direct);
  }

  const composite: AxisCompositeBinding = {
    ...(negative !== undefined && { negative: channelsFromTokens(negative, 'an axis "negative" group') }),
    ...(positive !== undefined && { positive: channelsFromTokens(positive, 'an axis "positive" group') }),
  };

  if (composite.negative === undefined && composite.positive === undefined) {
    throw new Error('AxisAction: a serialized binding entry needs a "direct" token or a "negative"/"positive" group.');
  }

  return composite as AxisBinding;
};

/**
 * A named signed axis in -1..1, fed by a stick, by two opposing button groups,
 * or by several such bindings at once.
 *
 * Alternative bindings are never summed. Each is evaluated on its own and the
 * one with the largest absolute deflection wins; on an exact tie the binding
 * listed first wins, so the outcome does not depend on device iteration order.
 *
 * @example
 * ```ts
 * const steer = new AxisAction([
 *   GamepadAxis.LeftStickX,
 *   { negative: [Keyboard.A, Keyboard.Left], positive: [Keyboard.D, Keyboard.Right] },
 * ]);
 * ```
 */
export class AxisAction extends ActionBase<OneOrMany<AxisBinding>> {
  public override readonly kind = 'axis' as const;

  private _bindings: readonly ResolvedAxisBinding[] = [];
  private readonly _threshold: number;
  private _value = 0;

  public constructor(binding: OneOrMany<AxisBinding>, options: ActionOptions = {}) {
    super(binding);
    this._threshold = options.threshold ?? 0;
    this._rebind(null, 0);
  }

  /** Current axis value, clamped to -1..1. */
  public get value(): number {
    return this._value;
  }

  /** `true` while the axis magnitude exceeds the action's threshold. */
  public get active(): boolean {
    return Math.abs(this._value) > this._threshold;
  }

  public override serialize(): SerializedActionBinding {
    return { kind: 'axis', binding: this._bindings.map(serializeEntry) };
  }

  /** @internal */
  public override _deserialize(data: SerializedActionBinding): OneOrMany<AxisBinding> {
    if (data.kind !== 'axis') {
      throw new Error(`AxisAction: cannot apply a "${data.kind}" binding.`);
    }

    if (!Array.isArray(data.binding)) {
      throw new Error('AxisAction: a serialized axis binding must be an array of entries.');
    }

    return (data.binding as readonly unknown[]).map(deserializeEntry);
  }

  protected override _resolve(binding: OneOrMany<AxisBinding>, slot: GamepadSlot): void {
    const list = Array.isArray(binding) ? (binding as readonly AxisBinding[]) : [binding as AxisBinding];

    this._bindings = list.map(entry => resolveAxisBinding(entry, slot));
    this._channels = [...new Set(this._bindings.flatMap(entry => [...entry.direct, ...entry.negative, ...entry.positive]))];
  }

  /**
   * Sample the channel buffers for this frame. An axis has no frame-to-frame
   * edge memory to protect, unlike {@link ButtonAction} - a suspend/resume
   * cycle or an ownership handoff is just a normal sample, so there is
   * nothing more to decide here.
   *
   * @internal
   */
  public override _update(sample: ActionSample): void {
    let winner = 0;

    for (const binding of this._bindings) {
      const value = evaluateAxis(sample.values, binding);

      if (Math.abs(value) > Math.abs(winner)) {
        winner = value;
      }
    }

    this._value = Math.min(1, Math.max(-1, winner));
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public override _reset(): void {
    this._value = 0;
  }
}
