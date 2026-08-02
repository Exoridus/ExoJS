import type { ActionMapOwner } from '#input/actions/ActionMap';
import { ActionMap } from '#input/actions/ActionMap';
import { ChordAction } from '#input/actions/ChordAction';
import { SequenceAction } from '#input/actions/SequenceAction';
import type { ActionSample, ChannelEvent } from '#input/actions/types';
import { GamepadButton } from '#input/GamepadButton';
import { ChannelSize, Keyboard, resolveGamepadSlotChannel } from '#input/types';

interface SampleDriver {
  readonly sample: ActionSample;
  batch(timestamp: number, writes: ReadonlyArray<readonly [channel: number, value: number]>): void;
  frame(): void;
}

function createSample(): SampleDriver {
  const values = new Float32Array(ChannelSize.Container);
  const batches: Array<{ channels: ChannelEvent[]; sequence: number; timestamp: number }> = [];
  const sample: ActionSample = { values, batches, frameId: 1 };
  let sequence = 0;

  return {
    sample,
    batch(timestamp, writes): void {
      const channels: ChannelEvent[] = [];
      for (const [channel, value] of writes) {
        if (values[channel] === value) continue;
        values[channel] = value;
        channels.push({ channel, value });
      }
      if (channels.length > 0) batches.push({ channels, sequence: ++sequence, timestamp });
    },
    frame(): void {
      batches.length = 0;
      sample.frameId++;
    },
  };
}

/**
 * Presents a pattern the way a caller who assembled it at runtime does —
 * read from a key-binding config, joined from parts, or handed over from
 * JavaScript — by giving it the type such a caller has: plain `string`.
 *
 * The string parser is the ONLY guard those callers get, so the rejections
 * asserted below are exactly the ones that matter for them. As a literal, a
 * malformed pattern is rejected one layer earlier, by the compile-time check
 * in `ValidatedChordBinding`/`ValidatedSequenceBinding` (covered in
 * `test/type-tests/action-patterns.type-test.ts`), and would never reach the
 * parser at all — which is why these cases have to arrive as non-literals to
 * test anything. Keep this in place: without it the assertions still pass at
 * runtime, but the file no longer type-checks.
 */
const runtimePattern = (pattern: string): string => pattern;

describe('ChordAction', () => {
  test('presses only when every member is held and releases when one leaves', () => {
    const driver = createSample();
    const action = new ChordAction('Control+K');

    driver.batch(10, [[Keyboard.Control, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);
    expect(action.pressed).toBe(false);

    driver.frame();
    driver.batch(20, [[Keyboard.K, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
    expect(action.pressed).toBe(true);

    driver.frame();
    driver.batch(30, [[Keyboard.Control, 0]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);
    expect(action.released).toBe(true);
  });

  test('baselines an already-held chord without a synthetic press', () => {
    const driver = createSample();
    driver.sample.values[Keyboard.Control] = 1;
    driver.sample.values[Keyboard.K] = 1;
    const action = new ChordAction([Keyboard.Control, Keyboard.K]);

    action._update(driver.sample);
    expect(action.active).toBe(true);
    expect(action.pressed).toBe(false);
  });

  test('supports a three-channel chord built up across separate batches (Control+Shift+A)', () => {
    const driver = createSample();
    const action = new ChordAction('Control+Shift+A');

    driver.batch(10, [[Keyboard.Control, 1]]);
    driver.batch(20, [[Keyboard.Shift, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(false); // A is still up — the chord is not complete yet

    driver.frame();
    driver.batch(30, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
    expect(action.pressed).toBe(true);

    driver.frame();
    driver.batch(40, [[Keyboard.Shift, 0]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);
    expect(action.released).toBe(true);
  });

  test('gamepadSlot remaps every channel in an array-bound chord to the requested pad slot', () => {
    const driver = createSample();
    const action = new ChordAction([GamepadButton.South, GamepadButton.West], { gamepadSlot: 2 });

    const slot0South = resolveGamepadSlotChannel(GamepadButton.South, 0);
    const slot2South = resolveGamepadSlotChannel(GamepadButton.South, 2);
    const slot2West = resolveGamepadSlotChannel(GamepadButton.West, 2);

    // Activity on the default slot (0) must never reach a chord bound to slot 2.
    driver.batch(10, [[slot0South, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);

    driver.frame();
    driver.batch(20, [
      [slot2South, 1],
      [slot2West, 1],
    ]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
  });

  test('threshold gates an analog channel the same way ButtonAction does', () => {
    const driver = createSample();
    const action = new ChordAction([GamepadButton.RightTrigger], { threshold: 0.5 });

    driver.batch(10, [[GamepadButton.RightTrigger, 0.4]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);

    driver.frame();
    driver.batch(20, [[GamepadButton.RightTrigger, 0.6]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
  });

  test('value reports the weakest member for an analog chord, and 0 when any member is released', () => {
    const driver = createSample();
    const action = new ChordAction([GamepadButton.South, GamepadButton.RightTrigger]);

    // South is fully engaged (1); the trigger's own pull (0.6) is the
    // least-engaged member, so it — not South's binary 1 — is what value
    // reports for the chord as a whole.
    driver.batch(10, [
      [GamepadButton.South, 1],
      [GamepadButton.RightTrigger, 0.6],
    ]);
    action._update(driver.sample);
    expect(action.value).toBeCloseTo(0.6);

    driver.frame();
    driver.batch(20, [[GamepadButton.RightTrigger, 0]]);
    action._update(driver.sample);
    expect(action.value).toBe(0);
  });

  test('a member crossing threshold twice within one frame still sets pressed and released together', () => {
    const driver = createSample();
    const action = new ChordAction([GamepadButton.South, GamepadButton.RightTrigger], { threshold: 0.5 });

    driver.batch(10, [
      [GamepadButton.South, 1],
      [GamepadButton.RightTrigger, 0.4],
    ]);
    action._update(driver.sample);
    expect(action.active).toBe(false);

    driver.frame();
    driver.batch(20, [[GamepadButton.RightTrigger, 0.7]]);
    driver.batch(30, [[GamepadButton.RightTrigger, 0.4]]);
    action._update(driver.sample);

    expect(action.pressed).toBe(true);
    expect(action.released).toBe(true);
    expect(action.active).toBe(false);
  });

  test('tolerates whitespace around tokens (Control + Shift + A)', () => {
    const driver = createSample();
    const action = new ChordAction('Control + Shift + A');

    driver.batch(10, [
      [Keyboard.Control, 1],
      [Keyboard.Shift, 1],
      [Keyboard.A, 1],
    ]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
  });

  test('rejects a `>` step separator, naming SequenceAction as the alternative', () => {
    expect(() => new ChordAction(runtimePattern('A>B'))).toThrow(/ChordAction.*SequenceAction/);
  });

  test('rejects an unknown keyboard token with a ChordAction-labeled message', () => {
    expect(() => new ChordAction(runtimePattern('Control+Nope'))).toThrow(/ChordAction: unknown keyboard token/);
  });

  test.each([
    ['Ctrl', Keyboard.Control],
    ['Cmd', Keyboard.Meta],
    ['Command', Keyboard.Meta],
    ['Super', Keyboard.Meta],
    ['Opt', Keyboard.Alt],
    ['Esc', Keyboard.Escape],
  ])('alias token %s resolves to the same channel as its canonical spelling', (alias, canonical) => {
    const driver = createSample();
    const action = new ChordAction(alias);

    driver.batch(10, [[canonical, 1]]);
    action._update(driver.sample);

    expect(action.active).toBe(true);
  });
});

describe('ChordAction: `|` alternation', () => {
  test('activates via either alternative, and releases only once both go inactive', () => {
    const driver = createSample();
    const action = new ChordAction('Control+S|Meta+S');

    driver.batch(10, [
      [Keyboard.Control, 1],
      [Keyboard.S, 1],
    ]);
    action._update(driver.sample);
    expect(action.active).toBe(true);

    driver.frame();
    driver.batch(20, [[Keyboard.Control, 0]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);
    expect(action.released).toBe(true);

    // The other alternative satisfies it just as well — Control was never
    // part of this one, so its earlier release is irrelevant here.
    driver.frame();
    driver.batch(30, [[Keyboard.Meta, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
    expect(action.pressed).toBe(true);
  });

  test('neither alternative alone activates a `+`-joined one — precedence binds `+` tighter than `|`', () => {
    // 'A+B|C': (A and B) or C. Holding only A must never activate it — B is
    // still required for that alternative, and C (the other alternative) was
    // never touched.
    const driver = createSample();
    const action = new ChordAction('A+B|C');

    driver.batch(10, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(false);

    driver.frame();
    driver.batch(20, [[Keyboard.B, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);

    driver.frame();
    driver.batch(30, [
      [Keyboard.A, 0],
      [Keyboard.B, 0],
    ]);
    driver.batch(40, [[Keyboard.C, 1]]);
    action._update(driver.sample);
    expect(action.active).toBe(true);
  });

  test('an alternation of two analog sources reports the strongest, each alternative first reduced to its own weakest member', () => {
    const driver = createSample();
    // Array form: [[South, RightTrigger], [LeftTrigger]] is 'South+RightTrigger|LeftTrigger'.
    const action = new ChordAction([[GamepadButton.South, GamepadButton.RightTrigger], [GamepadButton.LeftTrigger]]);

    // First alternative: South is fully engaged (1) but the trigger only
    // pulled to 0.4 — the alternative's own value is limited by its weakest
    // member. The second alternative (LeftTrigger) pulled further (0.7), so
    // the chord as a whole reports the STRONGER of the two alternatives.
    driver.batch(10, [
      [GamepadButton.South, 1],
      [GamepadButton.RightTrigger, 0.4],
      [GamepadButton.LeftTrigger, 0.7],
    ]);
    action._update(driver.sample);
    expect(action.value).toBeCloseTo(0.7);

    driver.frame();
    driver.batch(20, [[GamepadButton.LeftTrigger, 0.2]]);
    action._update(driver.sample);
    // The second alternative dropped below the first's weakest member (0.4).
    expect(action.value).toBeCloseTo(0.4);
  });

  test('rejects an empty alternative in a string pattern', () => {
    expect(() => new ChordAction(runtimePattern('Control+S|'))).toThrow(/ChordAction:.*alternative.*empty/);
    expect(() => new ChordAction(runtimePattern('|Control+S'))).toThrow(/ChordAction:.*alternative.*empty/);
    expect(() => new ChordAction(runtimePattern('Control+S||Meta+S'))).toThrow(/ChordAction:.*alternative.*empty/);
  });

  test('rejects a single empty alternative in an array pattern, distinct from an entirely empty chord', () => {
    // `[[]]` is one alternative (itself empty) — not the same shape as `[]`
    // (an entirely empty chord, which throws the pre-existing "is empty").
    expect(() => new ChordAction([[]])).toThrow(/ChordAction:.*alternative 1 of the chord is empty/);
    expect(() => new ChordAction([])).toThrow(/ChordAction: the chord is empty/);
  });

  test('rejects a step mixing a bare channel with a nested alternative', () => {
    expect(() => new ChordAction([Keyboard.A, [Keyboard.B, Keyboard.C]])).toThrow(/ChordAction:.*mixes a bare channel/);
  });
});

describe('SequenceAction', () => {
  test('recognizes ordered and mixed chord sequences across same-frame batches', () => {
    const driver = createSample();
    const simple = new SequenceAction('A>B');
    const mixed = new SequenceAction('Control+K>C');

    driver.batch(10, [[Keyboard.A, 1]]);
    driver.batch(20, [[Keyboard.B, 1]]);
    simple._update(driver.sample);
    expect(simple.triggered).toBe(true);

    const mixedDriver = createSample();
    mixedDriver.batch(10, [
      [Keyboard.Control, 1],
      [Keyboard.K, 1],
    ]);
    mixedDriver.batch(20, [[Keyboard.C, 1]]);
    mixed._update(mixedDriver.sample);
    expect(mixed.triggered).toBe(true);
  });

  test('recognizes a five-step single-channel sequence spread across one frame (A>P>F>E>L)', () => {
    const driver = createSample();
    const action = new SequenceAction('A>P>F>E>L');

    driver.batch(10, [[Keyboard.A, 1]]);
    driver.batch(20, [[Keyboard.P, 1]]);
    driver.batch(30, [[Keyboard.F, 1]]);
    driver.batch(40, [[Keyboard.E, 1]]);
    driver.batch(50, [[Keyboard.L, 1]]);
    action._update(driver.sample);

    expect(action.triggered).toBe(true);
  });

  test('recognizes a chord-to-chord sequence, with a held modifier spanning both steps (Control+K>Control+C)', () => {
    const driver = createSample();
    const action = new SequenceAction('Control+K>Control+C');

    driver.batch(10, [[Keyboard.Control, 1]]);
    driver.batch(20, [[Keyboard.K, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(0.5);
    expect(action.triggered).toBe(false);

    driver.frame();
    driver.batch(30, [[Keyboard.K, 0]]); // release K; Control stays held across the gap
    driver.batch(40, [[Keyboard.C, 1]]);
    action._update(driver.sample);

    expect(action.triggered).toBe(true);
  });

  test('a repeated single-channel step (A>A) requires a fresh press, never a continuous hold', () => {
    const driver = createSample();
    const action = new SequenceAction('A>A');

    driver.batch(10, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(0.5); // first A accepted
    expect(action.triggered).toBe(false);

    // Holding A produces no further channel writes at all, so no new batch
    // ever arrives to (mis)evaluate — the pattern must stay parked on step 2
    // rather than free-run to completion from a single held key.
    driver.frame();
    action._update(driver.sample);
    expect(action.triggered).toBe(false);
    expect(action.progress).toBeCloseTo(0.5);

    driver.frame();
    driver.batch(20, [[Keyboard.A, 0]]);
    driver.batch(30, [[Keyboard.A, 1]]); // a genuine release + fresh press
    action._update(driver.sample);

    expect(action.triggered).toBe(true);
  });

  test('does not invent order inside one atomic batch', () => {
    const driver = createSample();
    const action = new SequenceAction('A>B');

    driver.batch(10, [
      [Keyboard.A, 1],
      [Keyboard.B, 1],
    ]);
    action._update(driver.sample);

    expect(action.triggered).toBe(false);
    expect(action.progress).toBe(0);
  });

  test('enforces maxGap and total timeout using source-event timestamps', () => {
    const gapDriver = createSample();
    const gap = new SequenceAction('A>B', { maxGap: 100 });
    gapDriver.batch(10, [[Keyboard.A, 1]]);
    gapDriver.batch(111, [[Keyboard.B, 1]]);
    gap._update(gapDriver.sample);
    expect(gap.triggered).toBe(false);

    const timeoutDriver = createSample();
    const timeout = new SequenceAction('A>B>C', { maxGap: 1_000, timeout: 150 });
    timeoutDriver.batch(10, [[Keyboard.A, 1]]);
    timeoutDriver.batch(100, [[Keyboard.B, 1]]);
    timeoutDriver.batch(161, [[Keyboard.C, 1]]);
    timeout._update(timeoutDriver.sample);
    expect(timeout.triggered).toBe(false);
  });

  test('resets on an unrelated tracked entry and can restart on a later first step', () => {
    const driver = createSample();
    const action = new SequenceAction('A>B>C');

    driver.batch(10, [[Keyboard.A, 1]]);
    driver.batch(20, [[Keyboard.C, 1]]);
    driver.batch(30, [[Keyboard.B, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(false);

    driver.frame();
    driver.batch(40, [[Keyboard.A, 0]]);
    driver.batch(50, [[Keyboard.A, 1]]);
    driver.batch(60, [[Keyboard.B, 0]]);
    driver.batch(70, [[Keyboard.B, 1]]);
    driver.batch(80, [[Keyboard.C, 0]]);
    driver.batch(90, [[Keyboard.C, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(true);
  });

  test('baselines held channels without advancing progress', () => {
    const driver = createSample();
    driver.sample.values[Keyboard.A] = 1;
    const action = new SequenceAction('A>B');

    action._update(driver.sample);
    expect(action.progress).toBe(0);
    expect(action.triggered).toBe(false);
  });

  test.each(['', 'A+', '+A', 'A++B', 'A>', '>A', 'NotAKeyboardKey'])('rejects malformed string pattern %j', pattern => {
    expect(() => new SequenceAction(pattern)).toThrow(/SequenceAction/);
  });

  test('rejects empty and duplicate array chords', () => {
    expect(() => new SequenceAction([[]])).toThrow(/empty/);
    expect(() => new SequenceAction([[Keyboard.A, Keyboard.A]])).toThrow(/same channel/);
  });

  test('string patterns intentionally accept Keyboard enum names, not text or IME input', () => {
    // ChordAction/SequenceAction string patterns are a shortcut list syntax
    // over the Keyboard enum, not a text-entry or IME surface: composed
    // characters and other non-enum tokens are always rejected, never
    // silently accepted as "whatever the user typed".
    expect(() => new SequenceAction(runtimePattern('é'))).toThrow(/unknown keyboard token/);
    expect(() => new SequenceAction(runtimePattern('あ'))).toThrow(/unknown keyboard token/);
  });

  test('tolerates whitespace around every token and separator', () => {
    const driver = createSample();
    const action = new SequenceAction(' A > Control + B > C ');

    driver.batch(10, [[Keyboard.A, 1]]);
    driver.batch(20, [
      [Keyboard.Control, 1],
      [Keyboard.B, 1],
    ]);
    driver.batch(30, [[Keyboard.C, 1]]);
    action._update(driver.sample);

    expect(action.triggered).toBe(true);
  });

  test('threshold gates an analog channel the same way ButtonAction does', () => {
    const driver = createSample();
    const action = new SequenceAction([GamepadButton.LeftTrigger, Keyboard.B], { threshold: 0.5 });

    driver.batch(10, [[GamepadButton.LeftTrigger, 0.4]]);
    action._update(driver.sample);
    expect(action.progress).toBe(0); // below threshold — not a real press

    driver.frame();
    driver.batch(20, [[GamepadButton.LeftTrigger, 0.6]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(0.5);
  });

  test('gamepadSlot remaps every channel in an array-bound sequence to the requested pad slot', () => {
    const driver = createSample();
    const action = new SequenceAction([GamepadButton.South, GamepadButton.West], { gamepadSlot: 2 });

    const slot0South = resolveGamepadSlotChannel(GamepadButton.South, 0);
    const slot2South = resolveGamepadSlotChannel(GamepadButton.South, 2);
    const slot2West = resolveGamepadSlotChannel(GamepadButton.West, 2);

    // Activity on the default slot (0) must never reach a sequence bound to slot 2.
    driver.batch(10, [[slot0South, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBe(0);

    driver.frame();
    driver.batch(20, [[slot2South, 1]]);
    driver.batch(30, [[slot2West, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(true);
  });

  test('resetOnMismatch: false lets an unrelated tracked channel pass through without discarding progress', () => {
    const driver = createSample();
    const action = new SequenceAction('A>B>C', { resetOnMismatch: false });

    driver.batch(10, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(1 / 3);

    // C arrives out of order — with the default (true), this would reset
    // progress to 0. With resetOnMismatch: false, step 1 (still waiting on
    // B) is left untouched instead.
    driver.frame();
    driver.batch(20, [[Keyboard.C, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(1 / 3);
    expect(action.triggered).toBe(false);

    driver.frame();
    driver.batch(30, [[Keyboard.B, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(false);
    expect(action.progress).toBeCloseTo(2 / 3);
  });
});

describe('SequenceAction: `|` alternation', () => {
  test('either alternative advances a step within a multi-step sequence', () => {
    const viaA = createSample();
    const first = new SequenceAction('A|B>C');

    viaA.batch(10, [[Keyboard.A, 1]]);
    first._update(viaA.sample);
    expect(first.progress).toBeCloseTo(0.5);

    viaA.frame();
    viaA.batch(20, [[Keyboard.C, 1]]);
    first._update(viaA.sample);
    expect(first.triggered).toBe(true);

    const viaB = createSample();
    const second = new SequenceAction('A|B>C');

    viaB.batch(10, [[Keyboard.B, 1]]);
    second._update(viaB.sample);
    expect(second.progress).toBeCloseTo(0.5);

    viaB.frame();
    viaB.batch(20, [[Keyboard.C, 1]]);
    second._update(viaB.sample);
    expect(second.triggered).toBe(true);
  });

  test('neither alternative alone advances a `+`-joined one — precedence binds `+` tighter than `|`', () => {
    // 'A+B|C>D': ((A and B) or C), then D.
    const driver = createSample();
    const action = new SequenceAction('A+B|C>D');

    driver.batch(10, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBe(0);

    driver.frame();
    driver.batch(20, [[Keyboard.A, 0]]);
    driver.batch(30, [[Keyboard.A, 1]]); // fresh press, now paired with B below
    driver.batch(40, [[Keyboard.B, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(0.5);

    driver.frame();
    driver.batch(50, [[Keyboard.D, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(true);
  });

  test("completing one alternative's own chord satisfies the step without either alternative interfering with the other", () => {
    // 'A+B|C+D>E': touching the OTHER alternative's member first must not
    // reset progress (it still belongs to this step's expected channel set),
    // and completing the alternative actually being attempted (C+D) must
    // satisfy the step regardless of A's unrelated, incomplete engagement.
    const driver = createSample();
    const action = new SequenceAction('A+B|C+D>E');

    driver.batch(10, [[Keyboard.A, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBe(0);

    driver.frame();
    driver.batch(20, [[Keyboard.C, 1]]);
    driver.batch(30, [[Keyboard.D, 1]]);
    action._update(driver.sample);
    expect(action.progress).toBeCloseTo(0.5);

    driver.frame();
    driver.batch(40, [[Keyboard.E, 1]]);
    action._update(driver.sample);
    expect(action.triggered).toBe(true);
  });

  test('rejects an empty alternative in a string pattern, naming the correct step', () => {
    expect(() => new SequenceAction(runtimePattern('A>B|'))).toThrow(/SequenceAction:.*alternative.*step 2.*empty/);
  });

  test('rejects a single empty alternative in an array pattern step', () => {
    expect(() => new SequenceAction([[[]]])).toThrow(/SequenceAction:.*alternative 1 of step 1 is empty/);
  });

  test('rejects a step mixing a bare channel with a nested alternative', () => {
    expect(() => new SequenceAction([Keyboard.A, [Keyboard.B, [Keyboard.C, Keyboard.D]]])).toThrow(/SequenceAction:.*step 2.*mixes a bare channel/);
  });
});

describe('ChordAction/SequenceAction composed with an ActionMap owner', () => {
  test("an owner's attach/resume baseline seeds an already-held first step without advancing progress", () => {
    const driver = createSample();
    driver.sample.values[Keyboard.A] = 1; // physically held before this map ever attaches

    const owner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => 0,
      _snapshotActionChannels: (): Float32Array => driver.sample.values.slice(),
    };

    const map = new ActionMap({ combo: new SequenceAction('A>B') });
    map._attach(owner);
    map._update(driver.sample);

    expect(map.combo.progress).toBe(0);
    expect(map.combo.triggered).toBe(false);

    // B arriving afterwards must not complete the pattern: the baseline seed
    // is not a fresh press of A, so step 0 was never actually accepted.
    driver.frame();
    driver.batch(10, [[Keyboard.B, 1]]);
    map._update(driver.sample);

    expect(map.combo.triggered).toBe(false);
    expect(map.combo.progress).toBe(0);
  });

  test('losing availability mid-pattern resets progress, and regaining it re-arms from the live channel state without a synthetic trigger', () => {
    const driver = createSample();
    let available = true;

    const owner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => driver.sample.batches.at(-1)?.sequence ?? 0,
      _snapshotActionChannels: (): Float32Array => driver.sample.values.slice(),
    };

    const map = new ActionMap({ combo: new SequenceAction('A>B') });
    map._attach(owner, () => available);

    driver.batch(10, [[Keyboard.A, 1]]);
    map._update(driver.sample);
    expect(map.combo.progress).toBeCloseTo(0.5);

    // Availability lost mid-pattern (e.g. a scene pause under a `when: 'active'`
    // policy — see SceneInputs.attach): the map forces a reset, discarding the
    // half-completed sequence rather than leaving it armed while unobserved.
    available = false;
    map._update(driver.sample);
    expect(map.combo.progress).toBe(0);
    expect(map.combo.triggered).toBe(false);

    // Regaining availability re-arms against the CURRENT channel snapshot
    // instead of replaying old batches. A is still physically held across the
    // gap, but that must never be read as a fresh press that instantly
    // re-satisfies step 0 the moment B arrives.
    available = true;
    driver.frame();
    driver.batch(20, [[Keyboard.B, 1]]); // only B changes; A stays 1 throughout
    map._update(driver.sample);

    expect(map.combo.triggered).toBe(false);
    expect(map.combo.progress).toBe(0);
  });
});
