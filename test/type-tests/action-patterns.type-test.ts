import { ActionMap, ChordAction, type ChordBinding, type InputAlternation, type InputSequence, Keyboard, SequenceAction } from '../../src/index';

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

// @ts-expect-error ChordAction array bindings contain input channels, not arbitrary values.
new ChordAction([{}]);
// @ts-expect-error SequenceAction does not accept an arbitrary object pattern.
new SequenceAction({});
