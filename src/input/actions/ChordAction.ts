import { ButtonLikeAction } from './ButtonLikeAction';
import { type InputChord, normalizeSequence } from './pattern';
import type { ActionOptions } from './types';

/**
 * A binding accepted by {@link ChordAction}: a `'+'`-joined string of
 * case-insensitive {@link Keyboard} token names (`'Control+S'`), or an
 * {@link InputChord} array of channels required together directly.
 */
export type ChordBinding = string | InputChord;

/** Weakest absolute value across every entry, sign-preserving. */
function weakestOf(values: Float32Array): number {
  if (values.length === 0) {
    return 0;
  }

  let weakest = values[0] ?? 0;

  for (let i = 1; i < values.length; i++) {
    const value = values[i] ?? 0;

    if (Math.abs(value) < Math.abs(weakest)) {
      weakest = value;
    }
  }

  return weakest;
}

/**
 * Button-like action active while every channel in a chord is held at once —
 * `Control+S`, a modifier held alongside a gamepad button, and so on. Exposes
 * the same `active`/`pressed`/`released`/`value` quartet as {@link ButtonAction},
 * but the aggregate is the weakest of every bound channel instead of the
 * strongest of a set of alternatives: `min(|v|) > threshold` for every bound
 * channel holds if and only if every one of them individually exceeds
 * threshold, so a chord is only ever as "on" as its least-engaged member. For
 * an analog chord (a gamepad trigger held alongside a button, say), {@link value}
 * reports the trigger's pull limited by whether the button is engaged at all —
 * `0` the instant any member releases, never the button's own binary 0/1.
 *
 * A string binding resolves `+`-joined tokens as case-insensitive
 * {@link Keyboard} enum names (`'Control+S'`, `'control+s'`). This is a
 * shortcut list syntax for enum lookups, not text or IME input — it never
 * decodes typed characters, dead keys, or composed input, and rejects any
 * token that is not a known `Keyboard` member. Use an array of
 * {@link InputChannel}s directly to include pointer or gamepad channels, or
 * for a sequence with more than one step, use {@link SequenceAction}.
 *
 * @example
 * ```ts
 * const save = new ChordAction('Control+S');
 * const swap = new ChordAction([GamepadButton.LeftShoulder, GamepadButton.RightShoulder]);
 * ```
 */
export class ChordAction extends ButtonLikeAction {
  /**
   * @throws {Error} If a string binding contains a `>` step separator (use
   * {@link SequenceAction}), an unknown `Keyboard` token, an empty `+`
   * segment, or the same channel twice.
   */
  public constructor(binding: ChordBinding, options: ActionOptions = {}) {
    const steps = normalizeSequence(typeof binding === 'string' ? binding : [binding], options.gamepadSlot ?? 0, 'ChordAction');

    if (steps.length !== 1) {
      const patternText = typeof binding === 'string' ? ` ("${binding}")` : '';
      throw new Error(
        `ChordAction: a chord binding${patternText} must resolve to exactly one simultaneous step, not ${steps.length}. Use SequenceAction for '>' patterns.`,
      );
    }

    super(steps[0]!, options.threshold ?? 0);
  }

  protected override _aggregate(values: Float32Array): number {
    return weakestOf(values);
  }
}
