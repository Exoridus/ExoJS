import { type InputChord, normalizeSequence } from './pattern';
import type { ActionOptions, ActionSample } from './types';

/**
 * A binding accepted by {@link ChordAction}: a `'+'`-joined string of
 * case-insensitive {@link Keyboard} token names (`'Control+S'`), or an
 * {@link InputChord} array of channels required together directly.
 */
export type ChordBinding = string | InputChord;

/**
 * Button-like action active while every channel in a chord is held at once —
 * `Control+S`, a modifier held alongside a gamepad button, and so on. Exposes
 * the same `active`/`pressed`/`released` triad as {@link ButtonAction}, but
 * the aggregate is the AND of every bound channel instead of the strongest of
 * a set of alternatives.
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
export class ChordAction {
  private readonly _channels: readonly number[];
  private readonly _threshold: number;
  private readonly _values: Float32Array;
  private _seeded = false;
  private _active = false;
  private _pressed = false;
  private _released = false;

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

    this._channels = steps[0]!;
    this._threshold = options.threshold ?? 0;
    this._values = new Float32Array(this._channels.length);
  }

  public get active(): boolean {
    return this._active;
  }

  public get pressed(): boolean {
    return this._pressed;
  }

  public get released(): boolean {
    return this._released;
  }

  public _update(sample: ActionSample): void {
    if (!this._seeded) {
      this._seeded = true;
      this._seed(sample);
      this._active = this._isActive();
    }

    this._pressed = false;
    this._released = false;
    let wasActive = this._active;

    for (const batch of sample.batches) {
      let touched = false;

      for (const event of batch.channels) {
        const index = this._channels.indexOf(event.channel);
        if (index === -1) continue;
        this._values[index] = event.value;
        touched = true;
      }

      if (!touched) continue;

      const active = this._isActive();
      this._pressed ||= !wasActive && active;
      this._released ||= wasActive && !active;
      wasActive = active;
    }

    this._active = wasActive;
  }

  public _reset(): void {
    this._values.fill(0);
    this._seeded = false;
    this._active = false;
    this._pressed = false;
    this._released = false;
  }

  private _isActive(): boolean {
    return this._channels.length > 0 && this._values.every(value => Math.abs(value) > this._threshold);
  }

  private _seed(sample: ActionSample): void {
    const touched = new Set<number>();

    for (const batch of sample.batches) {
      for (const event of batch.channels) touched.add(event.channel);
    }

    for (let i = 0; i < this._channels.length; i++) {
      const channel = this._channels[i]!;
      if (!touched.has(channel)) this._values[i] = sample.values[channel] ?? 0;
    }
  }
}
