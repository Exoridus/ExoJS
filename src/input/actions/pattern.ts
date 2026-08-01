import type { InputChannel } from '#input/InputBinding';
import { Keyboard, resolveGamepadSlotChannel } from '#input/types';

/**
 * One {@link SequenceAction} step requiring every listed channel
 * simultaneously — the array-form equivalent of a `'+'`-joined chord token
 * group, and the whole binding a {@link ChordAction} accepts.
 */
export type InputChord = readonly InputChannel[];

/**
 * An ordered list of {@link SequenceAction} pattern steps. Each entry is
 * either a single {@link InputChannel} (a one-channel step) or a nested
 * {@link InputChord} (several channels required together for that one
 * step) — the array-form equivalent of a `'>'`-separated, `'+'`-joined
 * string pattern such as `'Down>Down+Right>Right'`.
 */
export type InputSequence = ReadonlyArray<InputChannel | InputChord>;

/** Which calling action kind {@link normalizeSequence} is parsing for, purely to word its error messages accurately. */
type PatternOwner = 'ChordAction' | 'SequenceAction';

const keyboardByName = new Map<string, number>(
  Object.entries(Keyboard)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([name, value]) => [name.toLowerCase(), value]),
);

/**
 * Shorthand aliases for a string pattern token, resolved on top of the
 * reflexive {@link Keyboard} member table above — `'Ctrl+K'` and
 * `'Control+K'` are equivalent. Array bindings are unaffected: an alias is a
 * string-pattern-only convenience, never a second {@link Keyboard} member.
 */
const keyboardAliases: ReadonlyArray<readonly [alias: string, canonical: keyof typeof Keyboard]> = [
  ['ctrl', 'Control'],
  ['cmd', 'Meta'],
  ['command', 'Meta'],
  ['super', 'Meta'],
  ['opt', 'Alt'],
  ['esc', 'Escape'],
];

for (const [alias, canonical] of keyboardAliases) {
  keyboardByName.set(alias, Keyboard[canonical]);
}

function resolveToken(token: string, owner: PatternOwner, patternText: string): number {
  const normalized = token
    .trim()
    .replace(/^Keyboard\./i, '')
    .toLowerCase();
  const channel = keyboardByName.get(normalized);

  if (channel === undefined) {
    throw new Error(`${owner}: unknown keyboard token "${token.trim()}" in pattern "${patternText}". Use a Keyboard enum name or pass numeric channels.`);
  }

  return channel;
}

/**
 * Parse and validate a string or array pattern into raw, gamepad-slot-resolved
 * channel steps. Shared by {@link ChordAction} (always exactly one resulting
 * step — enforced by its own constructor after this returns) and
 * {@link SequenceAction} (one or more). `owner` names the calling action kind
 * so every thrown message reads naturally for that caller — a `ChordAction`
 * has no user-facing notion of "step N", only "the chord".
 */
export function normalizeSequence(input: string | InputSequence, gamepadSlot: 0 | 1 | 2 | 3, owner: PatternOwner): ReadonlyArray<readonly number[]> {
  const chord = owner === 'ChordAction';

  const steps: ReadonlyArray<InputChannel | InputChord> =
    typeof input === 'string'
      ? input
          .trim()
          .split('>')
          .map((step, index) => {
            const tokens = step.split('+').map(token => token.trim());

            if (tokens.some(token => token.length === 0)) {
              const where = chord ? 'the chord' : `step ${index + 1}`;
              throw new Error(`${owner}: ${where} of pattern "${input}" contains an empty token.`);
            }

            return tokens.map(token => resolveToken(token, owner, input));
          })
      : input;

  if (steps.length === 0) {
    throw new Error(`${owner}: a pattern must contain at least one step.`);
  }

  return steps.map((step, index) => {
    const channels: readonly InputChannel[] = Array.isArray(step) ? step : [step as InputChannel];
    const where = chord ? 'the chord' : `step ${index + 1}`;

    if (channels.length === 0) {
      throw new Error(`${owner}: ${where} is empty.`);
    }

    const resolved = channels.map(channel => resolveGamepadSlotChannel(channel, gamepadSlot));

    if (new Set(resolved).size !== resolved.length) {
      throw new Error(`${owner}: ${where} contains the same channel more than once.`);
    }

    return resolved;
  });
}
