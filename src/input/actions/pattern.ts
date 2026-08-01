import type { InputChannel } from '#input/InputBinding';
import { Keyboard, resolveGamepadSlotChannel } from '#input/types';

/**
 * One {@link SequenceAction} step requiring every listed channel
 * simultaneously — the array-form equivalent of a `'+'`-joined chord token
 * group, and the whole binding a {@link ChordAction} accepts.
 */
export type InputChord = readonly InputChannel[];

/**
 * One {@link SequenceAction} step (or the whole binding a {@link ChordAction}
 * accepts) satisfied by any ONE of several alternatives rather than
 * requiring all of them — the array-form equivalent of a `'|'`-separated
 * group of `'+'`-joined chord tokens, e.g. `'A+B|C'`.
 *
 * Every alternative is wrapped in its own array, even a single-channel one
 * (`[[A], [B, C]]`), so this shape is never ambiguous with a plain
 * {@link InputChord} (`[A, B]`, meaning "A and B required together", not "A
 * or B"): an {@link InputChord}'s entries are bare channels, an
 * {@link InputAlternation}'s are themselves channel arrays. Mixing the two
 * shapes within one step — some entries bare, some nested — is rejected.
 */
export type InputAlternation = readonly InputChord[];

/**
 * An ordered list of {@link SequenceAction} pattern steps. Each entry is a
 * single {@link InputChannel} (a one-channel step), a nested
 * {@link InputChord} (several channels required together for that one step),
 * or a nested {@link InputAlternation} (several alternatives, any one of
 * which satisfies that one step) — the array-form equivalent of a
 * `'>'`-separated, `'+'`-joined, `'|'`-alternated string pattern such as
 * `'Down>Down+Right>Right'` or `'A+B|C>D'`.
 */
export type InputSequence = ReadonlyArray<InputChannel | InputChord | InputAlternation>;

/** Which calling action kind {@link normalizeSequence} is parsing for, purely to word its error messages accurately. */
type PatternOwner = 'ChordAction' | 'SequenceAction';

/**
 * One normalized pattern step: one entry per alternative, each the resolved,
 * gamepad-slot-adjusted channel numbers that alternative's chord requires
 * together. A step with no `'|'` (the common case) normalizes to exactly one
 * entry, so the aggregate reduction below composes with the pre-alternation
 * behavior without a separate code path: strongest-of-one-alternative is
 * that alternative itself.
 */
export type NormalizedStep = ReadonlyArray<readonly number[]>;

const keyboardByName = new Map<string, number>(
  Object.entries(Keyboard)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([name, value]) => [name.toLowerCase(), value]),
);

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
 * Parse one `'>'`-separated step's text into raw channel numbers — either a
 * flat list (no `'|'` present, one implicit alternative) or a nested list of
 * lists (one entry per `'|'`-separated alternative) — deciding the shape
 * `normalizeStep` below reduces uniformly for both string and array-form
 * input. Throws with the full pattern text quoted, matching this file's
 * existing string-parsing errors, for an empty `'|'`-separated alternative
 * or an empty `'+'`-joined token.
 */
function parseStepText(stepText: string, stepIndex: number, chord: boolean, owner: PatternOwner, patternText: string): number[] | number[][] {
  const where = chord ? 'the chord' : `step ${stepIndex + 1}`;
  const alternativesText = stepText.split('|');
  const isAlternation = alternativesText.length > 1;

  const alternatives = alternativesText.map((alternativeText, alternativeIndex) => {
    const location = isAlternation ? `alternative ${alternativeIndex + 1} of ${where}` : where;

    if (isAlternation && alternativeText.trim().length === 0) {
      throw new Error(`${owner}: ${location} of pattern "${patternText}" is empty — remove the stray '|'.`);
    }

    const tokens = alternativeText.split('+').map(token => token.trim());

    if (tokens.some(token => token.length === 0)) {
      throw new Error(`${owner}: ${location} of pattern "${patternText}" contains an empty token.`);
    }

    return tokens.map(token => resolveToken(token, owner, patternText));
  });

  return isAlternation ? alternatives : alternatives[0]!;
}

/**
 * Reduce one already-parsed step (a bare channel, an {@link InputChord}, an
 * {@link InputAlternation}, or one of `parseStepText`'s raw-number
 * equivalents) to a {@link NormalizedStep}: one entry per alternative, each
 * gamepad-slot-resolved and checked for an empty or duplicate channel. A
 * step whose array entries are a mix of bare channels and nested arrays is
 * rejected — that shape can only ever be a copy/paste mistake, since neither
 * a chord nor an alternation is expressed that way.
 */
function normalizeStep(
  step: InputChannel | InputChord | InputAlternation,
  stepIndex: number,
  chord: boolean,
  gamepadSlot: 0 | 1 | 2 | 3,
  owner: PatternOwner,
): NormalizedStep {
  const where = chord ? 'the chord' : `step ${stepIndex + 1}`;

  if (!Array.isArray(step)) {
    return [[resolveGamepadSlotChannel(step as InputChannel, gamepadSlot)]];
  }

  if (step.length === 0) {
    throw new Error(`${owner}: ${where} is empty.`);
  }

  const nestedEntries = step.filter(entry => Array.isArray(entry)).length;

  if (nestedEntries > 0 && nestedEntries < step.length) {
    throw new Error(
      `${owner}: ${where} mixes a bare channel with a nested alternative — wrap every alternative in its own array, even a single-channel one (e.g. [[A], [B, C]]), or drop the nesting for a single chord.`,
    );
  }

  const isAlternation = nestedEntries > 0;
  const alternatives: readonly InputChord[] = isAlternation ? (step as InputAlternation) : [step as InputChord];

  return alternatives.map((alternative, alternativeIndex) => {
    const location = isAlternation ? `alternative ${alternativeIndex + 1} of ${where}` : where;

    if (alternative.length === 0) {
      throw new Error(`${owner}: ${location} is empty.`);
    }

    const resolved = alternative.map(channel => resolveGamepadSlotChannel(channel, gamepadSlot));

    if (new Set(resolved).size !== resolved.length) {
      throw new Error(`${owner}: ${location} contains the same channel more than once.`);
    }

    return resolved;
  });
}

/**
 * Parse and validate a string or array pattern into raw, gamepad-slot-resolved
 * channel steps. Shared by {@link ChordAction} (always exactly one resulting
 * step — enforced by its own constructor after this returns) and
 * {@link SequenceAction} (one or more). `owner` names the calling action kind
 * so every thrown message reads naturally for that caller — a `ChordAction`
 * has no user-facing notion of "step N", only "the chord".
 *
 * Precedence, loosest to tightest: `'>'` separates sequence steps, `'|'`
 * separates alternatives within one step, `'+'` joins channels required
 * simultaneously within one alternative — `'A+B|C>D'` is "(A and B) or C,
 * then D".
 */
export function normalizeSequence(input: string | InputSequence, gamepadSlot: 0 | 1 | 2 | 3, owner: PatternOwner): readonly NormalizedStep[] {
  const chord = owner === 'ChordAction';

  const rawSteps: ReadonlyArray<InputChannel | InputChord | InputAlternation> =
    typeof input === 'string'
      ? input
          .trim()
          .split('>')
          .map((stepText, stepIndex) => parseStepText(stepText, stepIndex, chord, owner, input))
      : input;

  if (rawSteps.length === 0) {
    throw new Error(`${owner}: a pattern must contain at least one step.`);
  }

  return rawSteps.map((step, index) => normalizeStep(step, index, chord, gamepadSlot, owner));
}
