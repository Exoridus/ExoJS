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
    expect(() => new SequenceAction(pattern)).toThrow(/Input pattern|Input sequence/);
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
    expect(() => new SequenceAction('é')).toThrow(/unknown keyboard token/);
    expect(() => new SequenceAction('あ')).toThrow(/unknown keyboard token/);
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
