// Type contract for `ChordAction`/`SequenceAction` pattern bindings.
//
// String LITERAL patterns are validated at compile time by the same grammar
// the runtime parser implements: `>` separates sequence steps, `|` separates
// alternatives within a step, `+` joins channels required together, and every
// token must resolve to a `Keyboard` member (case-insensitively, whitespace
// tolerated, with an optional `Keyboard.` prefix and the shorthand aliases).
// Anything the compiler cannot see as a literal — a pattern read from a config
// file, assembled at runtime, or handed over from JavaScript — must still
// compile and is left to the runtime parser alone.
//
// `pnpm typecheck:type-tests` compiles this file under all three lanes, so
// every assertion below must hold identically in all of them.

import {
  ActionMap,
  ChordAction,
  type ChordBinding,
  type InputAlternation,
  type InputSequence,
  Keyboard,
  SequenceAction,
  type ValidatedChordBinding,
  type ValidatedSequenceBinding,
} from '../../src/index';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// Array bindings — unchanged by the compile-time string validation
// ---------------------------------------------------------------------------

const chord: ChordBinding = [Keyboard.Control, Keyboard.K];
const sequence: InputSequence = [Keyboard.A, [Keyboard.B, Keyboard.C]];

// Alternation: [[Control, K], [Meta, K]] is the array form of 'Control+K|Meta+K'.
const alternation: InputAlternation = [
  [Keyboard.Control, Keyboard.K],
  [Keyboard.Meta, Keyboard.K],
];
const alternatingChord: ChordBinding = alternation;
const alternatingSequence: InputSequence = [alternation, Keyboard.Enter];
void alternatingChord;
void alternatingSequence;

const actions = new ActionMap({
  shortcut: new ChordAction(chord),
  combo: new SequenceAction(sequence),
});

const shortcutPressed: boolean = actions.shortcut.pressed;
const comboTriggered: boolean = actions.combo.triggered;
void shortcutPressed;
void comboTriggered;

// Array literals keep working in every shape the runtime accepts.
void new ChordAction([Keyboard.Control, Keyboard.K]);
void new ChordAction([
  [Keyboard.Control, Keyboard.K],
  [Keyboard.Meta, Keyboard.K],
]);
void new ChordAction(alternation);
void new SequenceAction([Keyboard.A, [Keyboard.B, Keyboard.C]]);
void new SequenceAction([alternation, Keyboard.Enter]);

// @ts-expect-error ChordAction array bindings contain input channels, not arbitrary values.
new ChordAction([{}]);
// @ts-expect-error SequenceAction does not accept an arbitrary object pattern.
new SequenceAction({});

// ---------------------------------------------------------------------------
// Non-literal patterns bail out — the runtime parser stays the only judge
// ---------------------------------------------------------------------------

declare function readPatternFromConfig(): string;

const configuredChord = readPatternFromConfig();
const configuredSequence = readPatternFromConfig();
void new ChordAction(configuredChord);
void new SequenceAction(configuredSequence);

// A widened `string` passes through untouched rather than being rejected.
type _PlainStringChordPasses = Expect<Equal<ValidatedChordBinding<string>, string>>;
type _PlainStringSequencePasses = Expect<Equal<ValidatedSequenceBinding<string>, string>>;

// The declared binding unions (which contain `string`) pass through too.
const declaredChord: ChordBinding = 'Control+S';
const declaredSequence: string | InputSequence = 'A>B';
void new ChordAction(declaredChord);
void new SequenceAction(declaredSequence);

// A valid literal types as itself, so nothing about inference changes.
type _ValidChordIsItself = Expect<Equal<ValidatedChordBinding<'Control+S'>, 'Control+S'>>;
type _ValidSequenceIsItself = Expect<Equal<ValidatedSequenceBinding<'A>B'>, 'A>B'>>;

// A union of literals is checked member by member — every member must hold.
declare const platformIsApple: boolean;
void new ChordAction(platformIsApple ? 'Meta+S' : 'Control+S');
// @ts-expect-error only one member of the union is a valid pattern.
new ChordAction(platformIsApple ? 'Meta+S' : 'Control+Sv');

// ---------------------------------------------------------------------------
// Valid string literals
// ---------------------------------------------------------------------------

void new ChordAction('Control+S');
void new ChordAction('Ctrl+S');
void new ChordAction('Control+S|Meta+S');
void new ChordAction('Cmd+S|Ctrl+S');
void new ChordAction('Ctrl+Alt+Shift+Meta+S');
// Case-insensitive and whitespace tolerant, exactly like the runtime parser.
void new ChordAction('ctrl+a');
void new ChordAction('CTRL+A');
void new ChordAction(' Control + A ');
void new ChordAction('  ctrl  |  meta  ');
// The optional `Keyboard.` prefix is stripped, case-insensitively.
void new ChordAction('Keyboard.A');
void new ChordAction('keyboard.control+Keyboard.S');
// Every alias resolves.
void new ChordAction('Cmd+K');
void new ChordAction('Command+K');
void new ChordAction('Super+K');
void new ChordAction('Opt+K');
void new ChordAction('Esc');
// Non-alphabetic member names resolve too.
void new ChordAction('NumPadAdd');
void new ChordAction('IntlBackslash');
void new ChordAction('F12');

void new SequenceAction('A>B|C');
void new SequenceAction('Down>Down+Right>Right');
void new SequenceAction('Control+K|Meta+K>S');
void new SequenceAction('Up>Up>Down>Down>Left>Right>Left>Right>B>A', { maxGap: 800 });
// A realistically long pattern — eight steps of three tokens each — must stay
// well inside the compiler's instantiation limits.
void new SequenceAction('A+B+C>D+E+F>G+H+I>J+K+L>M+N+O>P+Q+R>S+T+U>V+W+X');
void new SequenceAction('   Up  >  Down   >  Left + Right  |  Ctrl + Alt  >  A   ');

// ---------------------------------------------------------------------------
// Rejected string literals — unknown tokens
// ---------------------------------------------------------------------------

// @ts-expect-error 'Sv' is not a Keyboard member.
new ChordAction('Ctrl+Sv');
// @ts-expect-error 'KeyA' is not a Keyboard member — the member is named 'A'.
new ChordAction('Keyboard.KeyA');
// @ts-expect-error the alias table has no 'meta.' prefix, only 'Keyboard.'.
new ChordAction('Meta.S');
// @ts-expect-error a bare 'Keyboard.' prefix leaves nothing to resolve.
new ChordAction('Keyboard.');
// @ts-expect-error typo deep inside a long sequence.
new SequenceAction('Up>Up>Down>Down>Left>Right>Left>Right>B>Av');
// @ts-expect-error unknown token inside one alternative of a step.
new SequenceAction('A>Ctrl+Sv|B');

// The rejection message names the offending token and quotes the pattern.
type _UnknownTokenMessage = Expect<
  Equal<ValidatedChordBinding<'Ctrl+Sv'>, 'ChordAction: unknown keyboard token "Sv" in pattern "Ctrl+Sv". Use a Keyboard enum name or pass numeric channels.'>
>;

// ---------------------------------------------------------------------------
// Rejected string literals — empty tokens, alternatives and patterns
// ---------------------------------------------------------------------------

// @ts-expect-error trailing '+' leaves an empty token.
new ChordAction('A+');
// @ts-expect-error leading '+' leaves an empty token.
new ChordAction('+A');
// @ts-expect-error doubled '+' leaves an empty token.
new ChordAction('A++B');
// @ts-expect-error whitespace is not a token.
new ChordAction('A+ +B');
// @ts-expect-error trailing '|' leaves an empty alternative.
new ChordAction('A|');
// @ts-expect-error leading '|' leaves an empty alternative.
new ChordAction('|A');
// @ts-expect-error doubled '|' leaves an empty alternative.
new ChordAction('A||B');
// @ts-expect-error an empty pattern has nothing to bind.
new ChordAction('');
// @ts-expect-error a whitespace-only pattern has nothing to bind.
new ChordAction('   ');
// @ts-expect-error an empty pattern has nothing to bind.
new SequenceAction('');
// @ts-expect-error doubled '>' leaves an empty step.
new SequenceAction('A>>B');
// @ts-expect-error a whitespace-only step has nothing to bind.
new SequenceAction('A> >B');
// @ts-expect-error a trailing '>' leaves an empty final step.
new SequenceAction('A>B>');

// An empty token is worded per position, like the runtime message.
type _EmptyChordTokenMessage = Expect<Equal<ValidatedChordBinding<'A+'>, 'ChordAction: the chord of pattern "A+" contains an empty token.'>>;
type _EmptySequenceTokenMessage = Expect<Equal<ValidatedSequenceBinding<'A>B+'>, 'SequenceAction: step 2 of pattern "A>B+" contains an empty token.'>>;
type _EmptyAlternativeMessage = Expect<
  Equal<ValidatedSequenceBinding<'A>B|'>, 'SequenceAction: alternative 2 of step 2 of pattern "A>B|" is empty — remove the stray \'|\'.'>
>;

// ---------------------------------------------------------------------------
// Rejected string literals — repeated channels within one alternative
// ---------------------------------------------------------------------------

// @ts-expect-error the same channel twice within one chord.
new ChordAction('A+A');
// @ts-expect-error an alias and its canonical name are the same channel.
new ChordAction('Ctrl+Control');
// @ts-expect-error case and the 'Keyboard.' prefix do not make a second channel.
new ChordAction('keyboard.a+A');
// @ts-expect-error two aliases for Meta are still one channel.
new ChordAction('Cmd+Super');
// @ts-expect-error a repeat inside one alternative of a sequence step.
new SequenceAction('A>Ctrl+Control|B');

// A repeat across STEPS or across ALTERNATIVES is legitimate, not a duplicate.
void new SequenceAction('A>A');
void new ChordAction('Ctrl+S|Ctrl+K');

type _RepeatedChannelMessage = Expect<Equal<ValidatedChordBinding<'Ctrl+Control'>, 'ChordAction: the chord contains the same channel more than once.'>>;

// ---------------------------------------------------------------------------
// Rejected string literals — ChordAction forbids '>'
// ---------------------------------------------------------------------------

// @ts-expect-error a chord is a single simultaneous step; use SequenceAction.
new ChordAction('A>B');
// @ts-expect-error even a valid multi-step pattern is not a chord.
new ChordAction('Control+K>S');

type _ChordRejectsStepsMessage = Expect<
  Equal<
    ValidatedChordBinding<'A>B'>,
    'ChordAction: a chord binding ("A>B") must resolve to exactly one simultaneous step, not 2. Use SequenceAction for \'>\' patterns.'
  >
>;

// An unknown token is reported before the step count, matching the order the
// runtime reaches the two checks.
type _ChordReportsTokenFirst = Expect<
  Equal<ValidatedChordBinding<'A>Sv'>, 'ChordAction: unknown keyboard token "Sv" in pattern "A>Sv". Use a Keyboard enum name or pass numeric channels.'>
>;

// ---------------------------------------------------------------------------
// Instances stay interchangeable regardless of the binding they were built from
// ---------------------------------------------------------------------------

declare function takesChord(action: ChordAction): void;
declare function takesSequence(action: SequenceAction): void;

takesChord(new ChordAction('Control+S'));
takesChord(new ChordAction([Keyboard.Control, Keyboard.K]));
takesChord(new ChordAction(configuredChord));
takesSequence(new SequenceAction('A>B'));
takesSequence(new SequenceAction([Keyboard.A, Keyboard.B]));

const literalActions = new ActionMap({
  save: new ChordAction('Control+S|Meta+S'),
  konami: new SequenceAction('Up>Up>Down>Down>Left>Right>Left>Right>B>A'),
});

type _SaveIsChordAction = Expect<Equal<typeof literalActions.save, ChordAction>>;
type _KonamiIsSequenceAction = Expect<Equal<typeof literalActions.konami, SequenceAction>>;
type _SavePressed = Expect<Equal<typeof literalActions.save.pressed, boolean>>;
type _KonamiTriggered = Expect<Equal<typeof literalActions.konami.triggered, boolean>>;
