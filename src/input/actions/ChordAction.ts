import { resolveGamepadSlotChannel } from '#input/types';

import type { GamepadSlot } from './ActionBase';
import { channelsFromTokens, tokensFromChannels } from './ActionBase';
import { ButtonLikeAction } from './ButtonLikeAction';
import { InputBindingError } from './InputBindingError';
import { type InputAlternation, type InputChord, normalizeSequence, type ValidatedChordBinding } from './pattern';
import type { SerializedActionBinding } from './serialization';
import type { ActionOptions } from './types';

/**
 * A binding accepted by {@link ChordAction}: a `'+'`/`'|'` string of
 * case-insensitive {@link Keyboard} token names (`'Control+S'`,
 * `'Control+S|Meta+S'`), an {@link InputChord} array of channels required
 * together directly, or an {@link InputAlternation} array of such chords -
 * any one of which satisfies the binding.
 */
export type ChordBinding = string | InputChord | InputAlternation;

/** Weakest absolute value among `values` at `indices`, sign-preserving. `0` for an empty group. */
const weakestAt = (values: Float32Array, indices: readonly number[]): number => {
  if (indices.length === 0) {
    return 0;
  }

  let weakest = values[indices[0]!] ?? 0;

  for (let i = 1; i < indices.length; i++) {
    const value = values[indices[i]!] ?? 0;

    if (Math.abs(value) < Math.abs(weakest)) {
      weakest = value;
    }
  }

  return weakest;
};

/**
 * Button-like action active while every channel in a chord is held at once -
 * `Control+S`, a modifier held alongside a gamepad button, and so on. Exposes
 * the same `active`/`pressed`/`released`/`value` quartet as {@link ButtonAction},
 * but the aggregate is the weakest of every bound channel instead of the
 * strongest of a set of alternatives: `min(|v|) > threshold` for every bound
 * channel holds if and only if every one of them individually exceeds
 * threshold, so a chord is only ever as "on" as its least-engaged member. For
 * an analog chord (a gamepad trigger held alongside a button, say), {@link value}
 * reports the trigger's pull limited by whether the button is engaged at all -
 * `0` the instant any member releases, never the button's own binary 0/1.
 *
 * `'|'` alternates between whole chords - `'Control+S|Meta+S'` is active
 * while EITHER modifier is held alongside `S`. This composes the same
 * strongest/weakest reduction one level deeper: each alternative reports its
 * own weakest member as above, and the action reports the strongest of those
 * alternatives, so an analog alternative's `value` still reflects its own
 * least-engaged member rather than collapsing to a plain boolean.
 *
 * A string binding resolves `+`/`|`-joined tokens as case-insensitive
 * {@link Keyboard} enum names (`'Control+S'`, `'control+s'`). This is a
 * shortcut list syntax for enum lookups, not text or IME input - it never
 * decodes typed characters, dead keys, or composed input, and rejects any
 * token that is not a known `Keyboard` member. Use an array of
 * {@link InputChannel}s directly to include pointer or gamepad channels, or
 * for a sequence with more than one step, use {@link SequenceAction}.
 *
 * A string LITERAL is additionally checked at compile time, so a typo
 * (`'Ctrl+Sv'`), a stray separator (`'A++B'`) or a `'>'` that belongs to
 * {@link SequenceAction} is a type error naming the reason rather than a throw
 * on the first frame that constructs the action. A pattern that is only known
 * at runtime - read from a config file, assembled from parts, or passed in
 * from JavaScript - types as plain `string` and is checked by the parser
 * alone, exactly as before.
 *
 * @example
 * ```ts
 * const save = new ChordAction('Control+S|Meta+S');
 * const swap = new ChordAction([GamepadButton.LeftShoulder, GamepadButton.RightShoulder]);
 * ```
 */
export class ChordAction<const Binding extends ChordBinding = ChordBinding> extends ButtonLikeAction<ChordBinding> {
  public override readonly kind = 'chord' as const;

  /** One entry per alternative; each lists that alternative's channels as indices into {@link ButtonLikeAction._values}. */
  private _alternativeIndices: ReadonlyArray<readonly number[]> = [];

  /**
   * @throws {Error} If a string binding contains a `>` step separator (use
   * {@link SequenceAction}), an unknown `Keyboard` token, an empty `+`/`|`
   * segment, a mix of a bare channel and a nested alternative within the
   * same binding, or the same channel twice within one alternative. A string
   * literal is rejected at compile time for the same reasons - see
   * {@link ValidatedChordBinding}.
   */
  public constructor(binding: ValidatedChordBinding<Binding>, options: ActionOptions = {}) {
    super(binding, options.threshold ?? 0);
    this._rebind(null, 0);
  }

  public override serialize(): SerializedActionBinding {
    return {
      kind: 'chord',
      binding: this._alternativeIndices.map(indices => tokensFromChannels(indices.map(index => this._channels[index]!))),
    };
  }

  /** @internal */
  public override _deserialize(data: SerializedActionBinding): ChordBinding {
    if (data.kind !== 'chord') {
      throw new InputBindingError(`ChordAction: cannot apply a "${data.kind}" binding.`);
    }

    if (!Array.isArray(data.binding)) {
      throw new InputBindingError('ChordAction: a serialized chord binding must be an array of alternatives.');
    }

    return (data.binding as readonly unknown[]).map(alternative => channelsFromTokens(alternative, 'a chord alternative'));
  }

  protected override _resolve(binding: ChordBinding, slot: GamepadSlot): void {
    const steps = normalizeSequence(typeof binding === 'string' ? binding : [binding], 'ChordAction');

    if (steps.length !== 1) {
      const patternText = typeof binding === 'string' ? ` ("${binding}")` : '';
      throw new Error(
        `ChordAction: a chord binding${patternText} must resolve to exactly one simultaneous step, not ${steps.length}. Use SequenceAction for '>' patterns.`,
      );
    }

    const alternatives = steps[0]!.map(alternative => alternative.map(channel => resolveGamepadSlotChannel(channel, slot)));
    const channels = [...new Set(alternatives.flat())];

    this._channels = channels;
    this._alternativeIndices = alternatives.map(alternative => alternative.map(channel => channels.indexOf(channel)));
    this._allocateValues();
  }

  protected override _aggregate(values: Float32Array): number {
    let strongestAlternative = 0;

    for (const indices of this._alternativeIndices) {
      const value = weakestAt(values, indices);

      if (Math.abs(value) > Math.abs(strongestAlternative)) {
        strongestAlternative = value;
      }
    }

    return strongestAlternative;
  }
}
