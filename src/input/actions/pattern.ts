import type { InputChannel } from '#input/InputBinding';
import { Keyboard } from '#input/types';

/**
 * One {@link SequenceAction} step requiring every listed channel
 * simultaneously - the array-form equivalent of a `'+'`-joined chord token
 * group, and the whole binding a {@link ChordAction} accepts.
 */
export type InputChord = readonly InputChannel[];

/**
 * One {@link SequenceAction} step (or the whole binding a {@link ChordAction}
 * accepts) satisfied by any ONE of several alternatives rather than
 * requiring all of them - the array-form equivalent of a `'|'`-separated
 * group of `'+'`-joined chord tokens, e.g. `'A+B|C'`.
 *
 * Every alternative is wrapped in its own array, even a single-channel one
 * (`[[A], [B, C]]`), so this shape is never ambiguous with a plain
 * {@link InputChord} (`[A, B]`, meaning "A and B required together", not "A
 * or B"): an {@link InputChord}'s entries are bare channels, an
 * {@link InputAlternation}'s are themselves channel arrays. Mixing the two
 * shapes within one step - some entries bare, some nested - is rejected.
 */
export type InputAlternation = readonly InputChord[];

/**
 * An ordered list of {@link SequenceAction} pattern steps. Each entry is a
 * single {@link InputChannel} (a one-channel step), a nested
 * {@link InputChord} (several channels required together for that one step),
 * or a nested {@link InputAlternation} (several alternatives, any one of
 * which satisfies that one step) - the array-form equivalent of a
 * `'>'`-separated, `'+'`-joined, `'|'`-alternated string pattern such as
 * `'Down>Down+Right>Right'` or `'A+B|C>D'`.
 */
export type InputSequence = ReadonlyArray<InputChannel | InputChord | InputAlternation>;

/** Which calling action kind {@link normalizeSequence} is parsing for, purely to word its error messages accurately. */
type PatternOwner = 'ChordAction' | 'SequenceAction';

/**
 * One normalized pattern step: one entry per alternative, each the slot-0
 * channel numbers that alternative's chord requires together. A step with no `'|'` (the common case) normalizes to exactly one
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

/**
 * Shorthand aliases for a string pattern token, resolved on top of the
 * reflexive {@link Keyboard} member table above - `'Ctrl+K'` and
 * `'Control+K'` are equivalent. Array bindings are unaffected: an alias is a
 * string-pattern-only convenience, never a second {@link Keyboard} member.
 */
const keyboardAliases = [
  ['ctrl', 'Control'],
  ['cmd', 'Meta'],
  ['command', 'Meta'],
  ['super', 'Meta'],
  ['opt', 'Alt'],
  ['esc', 'Escape'],
] as const satisfies ReadonlyArray<readonly [alias: string, canonical: keyof typeof Keyboard]>;

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
 * Parse one `'>'`-separated step's text into raw channel numbers - either a
 * flat list (no `'|'` present, one implicit alternative) or a nested list of
 * lists (one entry per `'|'`-separated alternative) - deciding the shape
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
 * checked for an empty or duplicate channel. A
 * step whose array entries are a mix of bare channels and nested arrays is
 * rejected - that shape can only ever be a copy/paste mistake, since neither
 * a chord nor an alternation is expressed that way.
 */
function normalizeStep(step: InputChannel | InputChord | InputAlternation, stepIndex: number, chord: boolean, owner: PatternOwner): NormalizedStep {
  const where = chord ? 'the chord' : `step ${stepIndex + 1}`;

  if (!Array.isArray(step)) {
    return [[step as InputChannel]];
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

    const channels = alternative.map(channel => channel);

    if (new Set(channels).size !== channels.length) {
      throw new Error(`${owner}: ${location} contains the same channel more than once.`);
    }

    return channels;
  });
}

/**
 * Parse and validate a string or array pattern into raw, slot-0 channel steps.
 * Rebasing onto a pad slot happens later, in the owning {@link ActionMap}.
 * Shared by {@link ChordAction} (always exactly one resulting
 * step - enforced by its own constructor after this returns) and
 * {@link SequenceAction} (one or more). `owner` names the calling action kind
 * so every thrown message reads naturally for that caller - a `ChordAction`
 * has no user-facing notion of "step N", only "the chord".
 *
 * Precedence, loosest to tightest: `'>'` separates sequence steps, `'|'`
 * separates alternatives within one step, `'+'` joins channels required
 * simultaneously within one alternative - `'A+B|C>D'` is "(A and B) or C,
 * then D".
 */
export function normalizeSequence(input: string | InputSequence, owner: PatternOwner): readonly NormalizedStep[] {
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

  return rawSteps.map((step, index) => normalizeStep(step, index, chord, owner));
}

/*
 * Type-level mirror of the string parser above.
 *
 * Everything below is a compile-time SECOND opinion, never a replacement: it
 * only ever sees string LITERALS, so a pattern read from a config file, built
 * at runtime, or passed from JavaScript still reaches the parser above and
 * still throws the same errors. The two layers are kept in step by deriving
 * from the same sources - the `Keyboard` enum itself and the one
 * `keyboardAliases` table - and by wording each rejection like the runtime
 * message it stands for, so a compile error and the throw it prevents read
 * the same.
 *
 * The recursion is bounded by the pattern's `'>'` step count, not by its
 * token count: forty steps of three tokens each still validate, while a
 * pattern of roughly a hundred steps exhausts the compiler's instantiation
 * depth (TS2589). A pattern that long is not a keyboard shortcut, and it is
 * still parsed and validated at runtime - but if one is ever needed, widening
 * it to `string` (or reaching for the array form) sidesteps this layer
 * entirely.
 */

/** Whitespace `String.prototype.trim` strips, for {@link PatternTrim}. */
type PatternWhitespace = ' ' | '\t' | '\n' | '\r' | '\f' | '\v';

type PatternTrimStart<S extends string> = S extends `${PatternWhitespace}${infer Rest}` ? PatternTrimStart<Rest> : S;
type PatternTrimEnd<S extends string> = S extends `${infer Rest}${PatternWhitespace}` ? PatternTrimEnd<Rest> : S;

/**
 * Type-level `String.prototype.trim`, mirroring the `.trim()` calls in
 * `normalizeSequence`/`parseStepText`/`resolveToken` - `' Control + A '` must
 * validate exactly like `'Control+A'`.
 */
type PatternTrim<S extends string> = PatternTrimEnd<PatternTrimStart<S>>;

/**
 * Alias name to the canonical lowercase {@link Keyboard} member name it stands
 * for, derived from the one runtime {@link keyboardAliases} table so the two
 * can never drift apart.
 */
type KeyboardAliasMap = { [Entry in (typeof keyboardAliases)[number] as Entry[0]]: Lowercase<Entry[1]> };

/** Every lowercase name `resolveToken`'s lookup map holds: the reflexive {@link Keyboard} members plus the aliases. */
type KeyboardTokenName = Lowercase<keyof typeof Keyboard> | keyof KeyboardAliasMap;

/** One token reduced to `resolveToken`'s lookup key: trimmed, lowercased, optional `Keyboard.` prefix stripped. */
type TokenLookupKey<S extends string> = Lowercase<PatternTrim<S>> extends `keyboard.${infer Rest}` ? Rest : Lowercase<PatternTrim<S>>;

/**
 * {@link TokenLookupKey} with an alias folded onto the member it resolves to,
 * so `'ctrl'` and `'Control'` compare equal - the type-level stand-in for
 * comparing the resolved channel NUMBERS, which is what `normalizeStep`'s
 * duplicate check actually does. Sound because no two {@link Keyboard} members
 * share a channel, so equal channels and equal canonical names coincide.
 */
type CanonicalToken<S extends string> = TokenLookupKey<S> extends infer Key extends keyof KeyboardAliasMap ? KeyboardAliasMap[Key] : TokenLookupKey<S>;

/** The first of two checks that found something, or `never` when neither did. Encodes the runtime's left-to-right, throw-on-first-problem order. */
type FirstPatternError<First, Second> = [First] extends [never] ? Second : First;

/** `resolveToken`'s rejection. */
type CheckToken<Token extends string, Pattern extends string, Owner extends PatternOwner> =
  CanonicalToken<Token> extends KeyboardTokenName
    ? never
    : `${Owner}: unknown keyboard token "${PatternTrim<Token>}" in pattern "${Pattern}". Use a Keyboard enum name or pass numeric channels.`;

/** `parseStepText`'s empty-`'+'`-segment rejection, for one token. */
type CheckEmptyToken<Token extends string, Pattern extends string, Owner extends PatternOwner, Where extends string> =
  PatternTrim<Token> extends '' ? `${Owner}: ${Where} of pattern "${Pattern}" contains an empty token.` : never;

/** {@link CheckEmptyToken} across one alternative's `'+'`-joined tokens - a whole pass of its own, because the runtime checks every token for emptiness before resolving any of them. */
type CheckEmptyTokens<
  Rest extends string,
  Pattern extends string,
  Owner extends PatternOwner,
  Where extends string,
> = Rest extends `${infer Head}+${infer Tail}`
  ? FirstPatternError<CheckEmptyToken<Head, Pattern, Owner, Where>, CheckEmptyTokens<Tail, Pattern, Owner, Where>>
  : CheckEmptyToken<Rest, Pattern, Owner, Where>;

/** {@link CheckToken} across one alternative's `'+'`-joined tokens. */
type CheckTokens<Rest extends string, Pattern extends string, Owner extends PatternOwner> = Rest extends `${infer Head}+${infer Tail}`
  ? FirstPatternError<CheckToken<Head, Pattern, Owner>, CheckTokens<Tail, Pattern, Owner>>
  : CheckToken<Rest, Pattern, Owner>;

/** One `'+'`-joined alternative: empty tokens first, then unknown ones, matching `parseStepText`. */
type CheckAlternative<Text extends string, Pattern extends string, Owner extends PatternOwner, Where extends string> = FirstPatternError<
  CheckEmptyTokens<Text, Pattern, Owner, Where>,
  CheckTokens<Text, Pattern, Owner>
>;

/** One alternative of a step that DOES contain `'|'`, where an empty alternative is its own error rather than an empty token. */
type CheckNamedAlternative<Text extends string, Pattern extends string, Owner extends PatternOwner, Where extends string> =
  PatternTrim<Text> extends '' ? `${Owner}: ${Where} of pattern "${Pattern}" is empty — remove the stray '|'.` : CheckAlternative<Text, Pattern, Owner, Where>;

/** Position label for the n-th `'|'`-separated alternative of a step, worded like `parseStepText`'s `location`. */
type AlternativeWhere<Where extends string, Index extends readonly unknown[]> = `alternative ${[...Index, unknown]['length']} of ${Where}`;

/** {@link CheckNamedAlternative} across a step's `'|'`-separated alternatives. */
type CheckAlternatives<
  Rest extends string,
  Pattern extends string,
  Owner extends PatternOwner,
  Where extends string,
  Index extends readonly unknown[],
> = Rest extends `${infer Head}|${infer Tail}`
  ? FirstPatternError<
      CheckNamedAlternative<Head, Pattern, Owner, AlternativeWhere<Where, Index>>,
      CheckAlternatives<Tail, Pattern, Owner, Where, [...Index, unknown]>
    >
  : CheckNamedAlternative<Rest, Pattern, Owner, AlternativeWhere<Where, Index>>;

/** One `'>'`-separated step. A step with no `'|'` is one implicit alternative and is never described as one, exactly as `parseStepText` words it. */
type CheckStep<Step extends string, Pattern extends string, Owner extends PatternOwner, Where extends string> = Step extends `${string}|${string}`
  ? CheckAlternatives<Step, Pattern, Owner, Where, []>
  : CheckAlternative<Step, Pattern, Owner, Where>;

/** Position label for the n-th step - a {@link ChordAction} has no user-facing notion of "step N", only "the chord". */
type StepWhere<Owner extends PatternOwner, Index extends readonly unknown[]> = Owner extends 'ChordAction'
  ? 'the chord'
  : `step ${[...Index, unknown]['length']}`;

/** {@link CheckStep} across a pattern's `'>'`-separated steps. */
type CheckSteps<
  Rest extends string,
  Pattern extends string,
  Owner extends PatternOwner,
  Index extends readonly unknown[],
> = Rest extends `${infer Head}>${infer Tail}`
  ? FirstPatternError<CheckStep<Head, Pattern, Owner, StepWhere<Owner, Index>>, CheckSteps<Tail, Pattern, Owner, [...Index, unknown]>>
  : CheckStep<Rest, Pattern, Owner, StepWhere<Owner, Index>>;

/** One alternative's tokens as canonical names, for {@link HasRepeatedToken}. */
type TokenNames<Rest extends string> = Rest extends `${infer Head}+${infer Tail}` ? [CanonicalToken<Head>, ...TokenNames<Tail>] : [CanonicalToken<Rest>];

type HasRepeatedToken<Names extends readonly string[]> = Names extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? Head extends Tail[number]
    ? true
    : HasRepeatedToken<Tail>
  : false;

/** `normalizeStep`'s duplicate-channel rejection for one alternative. Unlike the parse errors above it does not quote the pattern, matching the runtime message. */
type CheckDuplicates<Text extends string, Owner extends PatternOwner, Where extends string> =
  HasRepeatedToken<TokenNames<Text>> extends true ? `${Owner}: ${Where} contains the same channel more than once.` : never;

type CheckDuplicateAlternatives<
  Rest extends string,
  Owner extends PatternOwner,
  Where extends string,
  Index extends readonly unknown[],
> = Rest extends `${infer Head}|${infer Tail}`
  ? FirstPatternError<CheckDuplicates<Head, Owner, AlternativeWhere<Where, Index>>, CheckDuplicateAlternatives<Tail, Owner, Where, [...Index, unknown]>>
  : CheckDuplicates<Rest, Owner, AlternativeWhere<Where, Index>>;

type CheckDuplicateStep<Step extends string, Owner extends PatternOwner, Where extends string> = Step extends `${string}|${string}`
  ? CheckDuplicateAlternatives<Step, Owner, Where, []>
  : CheckDuplicates<Step, Owner, Where>;

/** {@link CheckDuplicateStep} across every step - a pass of its own, because `normalizeSequence` parses every step before it normalizes any of them. */
type CheckDuplicateSteps<Rest extends string, Owner extends PatternOwner, Index extends readonly unknown[]> = Rest extends `${infer Head}>${infer Tail}`
  ? FirstPatternError<CheckDuplicateStep<Head, Owner, StepWhere<Owner, Index>>, CheckDuplicateSteps<Tail, Owner, [...Index, unknown]>>
  : CheckDuplicateStep<Rest, Owner, StepWhere<Owner, Index>>;

type CountSteps<Rest extends string, Counted extends readonly unknown[] = [unknown]> = Rest extends `${string}>${infer Tail}`
  ? CountSteps<Tail, [...Counted, unknown]>
  : Counted['length'];

/** Every rejection `normalizeSequence` can reach for a string pattern, in the order it reaches them. */
type PatternTextError<Pattern extends string, Owner extends PatternOwner> = FirstPatternError<
  CheckSteps<PatternTrim<Pattern>, Pattern, Owner, []>,
  CheckDuplicateSteps<PatternTrim<Pattern>, Owner, []>
>;

/** {@link PatternTextError} plus `ChordAction`'s own one-step rule, checked last because its constructor checks it only after `normalizeSequence` returns. */
type ChordTextError<Pattern extends string> = FirstPatternError<
  PatternTextError<Pattern, 'ChordAction'>,
  PatternTrim<Pattern> extends `${string}>${string}`
    ? `ChordAction: a chord binding ("${Pattern}") must resolve to exactly one simultaneous step, not ${CountSteps<PatternTrim<Pattern>>}. Use SequenceAction for '>' patterns.`
    : never
>;

/** The binding itself when it passes, the rejection message when it does not. */
type OrPatternError<Binding, Error> = [Error] extends [never] ? Binding : Error;

/**
 * A {@link ChordAction} binding, checked at compile time when it is a string
 * LITERAL. A valid pattern types as itself, an invalid one as the message
 * explaining why - so `new ChordAction('Ctrl+Sv')` fails to compile with
 * `Argument of type '"Ctrl+Sv"' is not assignable to parameter of type
 * '"ChordAction: unknown keyboard token \"Sv\" ..."'`.
 *
 * A plain `string` (a pattern read from a config file, built at runtime, or
 * handed over from JavaScript) bails out and passes through untouched: only
 * the parser above can judge it, and it still does. Array bindings pass
 * through untouched as well, constrained by `ChordAction`'s own type
 * parameter.
 */
export type ValidatedChordBinding<P> = P extends string ? (string extends P ? P : OrPatternError<P, ChordTextError<P>>) : P;

/** {@link ValidatedChordBinding} for {@link SequenceAction}, which allows `'>'` and therefore more than one step. */
export type ValidatedSequenceBinding<P> = P extends string ? (string extends P ? P : OrPatternError<P, PatternTextError<P, 'SequenceAction'>>) : P;

// Compile-time guard: every alias is lowercase and none shadows a real member,
// so the lowercased key `resolveToken` builds reaches exactly one entry.
type AssertAliasesAreUsableKeys =
  keyof KeyboardAliasMap extends Lowercase<keyof KeyboardAliasMap>
    ? [keyof KeyboardAliasMap & Lowercase<keyof typeof Keyboard>] extends [never]
      ? true
      : never
    : never;
const _keyboardAliasesAreUsableKeys: AssertAliasesAreUsableKeys = true;
void _keyboardAliasesAreUsableKeys;
