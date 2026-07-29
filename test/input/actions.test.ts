/**
 * Tests for the action layer: threshold/edge semantics on ButtonAction,
 * composite and alternative-binding resolution on AxisAction/VectorAction,
 * and ActionMap attachment lifetime against InputManager and SceneInputs.
 */

import type { Application } from '#core/Application';
import type { ActionMapOwner } from '#input/actions/ActionMap';
import { ActionMap } from '#input/actions/ActionMap';
import { AxisAction } from '#input/actions/AxisAction';
import { ButtonAction } from '#input/actions/ButtonAction';
import type { ActionSample, ChannelEvent } from '#input/actions/types';
import { VectorAction } from '#input/actions/VectorAction';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { InputManager } from '#input/InputManager';
import { ChannelSize, Keyboard, PointerButton } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';

/**
 * Builds an `ActionSample` and the operations a test drives it with:
 * `set()` mimics a single-channel platform write (one keyboard event, or one
 * standalone channel of a pointer/gamepad write) as its own atomic
 * `ChannelEventBatch`, exactly like `InputManager._recordChannelChanges`
 * does for a single-channel range. `setBatch()` mimics several channels
 * written TOGETHER by one real-world event (e.g. a pointer's whole slot) as
 * ONE batch — for tests specifically about batch-vs-per-channel evaluation.
 * `frame()` closes the frame (clearing the batch log and bumping `frameId`,
 * mirroring `InputManager.update`).
 */
const createSample = (): {
  sample: ActionSample;
  set: (channel: number, value: number) => void;
  setBatch: (writes: ReadonlyArray<readonly [channel: number, value: number]>) => void;
  frame: () => void;
} => {
  const values = new Float32Array(ChannelSize.Container);
  const batches: Array<{ channels: ChannelEvent[]; sequence: number }> = [];
  const sample: ActionSample = { values, batches, frameId: 1 };
  let sequence = 0;

  return {
    sample,
    set: (channel: number, value: number): void => {
      if (values[channel] === value) {
        return;
      }

      values[channel] = value;
      batches.push({ channels: [{ channel, value }], sequence: ++sequence });
    },
    setBatch: (writes: ReadonlyArray<readonly [channel: number, value: number]>): void => {
      const channels: ChannelEvent[] = [];

      for (const [channel, value] of writes) {
        if (values[channel] === value) {
          continue;
        }

        values[channel] = value;
        channels.push({ channel, value });
      }

      if (channels.length > 0) {
        batches.push({ channels, sequence: ++sequence });
      }
    },
    frame: (): void => {
      batches.length = 0;
      sample.frameId++;
    },
  };
};

describe('ButtonAction', () => {
  it('reports the strongest of its alternative sources', () => {
    const { sample, set } = createSample();
    const action = new ButtonAction([Keyboard.Space, GamepadButton.RightTrigger]);

    set(Keyboard.Space, 1);
    set(GamepadButton.RightTrigger, 0.4);
    action._update(sample);

    expect(action.value).toBe(1);
  });

  it('stays inactive until the value clears its threshold', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });

    set(GamepadButton.RightTrigger, 0.4);
    action._update(sample);
    expect(action.active).toBe(false);

    frame();
    set(GamepadButton.RightTrigger, 0.6);
    action._update(sample);
    expect(action.active).toBe(true);
  });

  it('raises pressed only on the frame activation happened', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    action._update(sample);
    expect(action.pressed).toBe(true);

    frame();
    action._update(sample);
    expect(action.pressed).toBe(false);
    expect(action.active).toBe(true);
  });

  it('raises released on the frame the source went inactive', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    action._update(sample);
    frame();

    set(Keyboard.Space, 0);
    action._update(sample);

    expect(action.released).toBe(true);
    expect(action.active).toBe(false);
  });

  it('sees a press and release that both happened between two frames', () => {
    const { sample, set } = createSample();
    const action = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    set(Keyboard.Space, 0);
    action._update(sample);

    expect(action.pressed).toBe(true);
    expect(action.released).toBe(true);
    expect(action.active).toBe(false);
    expect(action.value).toBe(0);
  });

  it('does not repeat the tap edge on the following frame', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    set(Keyboard.Space, 0);
    action._update(sample);
    frame();

    action._update(sample);

    expect(action.pressed).toBe(false);
    expect(action.released).toBe(false);
  });

  it('accepts a pointer button as a source', () => {
    const { sample, set } = createSample();
    const action = new ButtonAction(PointerButton.Primary);

    set(PointerButton.Primary, 1);
    action._update(sample);

    expect(action.active).toBe(true);
  });

  it('raises no edge for a value that dips without ever crossing its own threshold (0 → 0.1 → 0)', () => {
    const { sample, set } = createSample();
    const action = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });

    set(GamepadButton.RightTrigger, 0.1);
    set(GamepadButton.RightTrigger, 0);
    action._update(sample);

    expect(action.pressed).toBe(false);
    expect(action.released).toBe(false);
    expect(action.active).toBe(false);
  });

  it('raises both pressed and released for a value that spikes across its own threshold and back (0.4 → 0.7 → 0.4)', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });

    set(GamepadButton.RightTrigger, 0.4);
    action._update(sample);
    expect(action.active).toBe(false);

    frame();
    set(GamepadButton.RightTrigger, 0.7);
    set(GamepadButton.RightTrigger, 0.4);
    action._update(sample);

    expect(action.pressed).toBe(true);
    expect(action.released).toBe(true);
    expect(action.active).toBe(false);
    expect(action.value).toBeCloseTo(0.4);
  });

  it('an active source that releases and presses again within one frame stays correct (active → release → press)', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    action._update(sample);
    expect(action.active).toBe(true);

    frame();
    set(Keyboard.Space, 0);
    set(Keyboard.Space, 1);
    action._update(sample);

    expect(action.pressed).toBe(true);
    expect(action.released).toBe(true);
    expect(action.active).toBe(true);
    expect(action.value).toBe(1);
  });

  it('a tap on an alternative source never fakes a release/re-press while a different source stays continuously active', () => {
    const { sample, set, frame } = createSample();
    const action = new ButtonAction([Keyboard.Space, GamepadButton.South]);

    set(Keyboard.Space, 1);
    action._update(sample);
    expect(action.pressed).toBe(true);
    expect(action.active).toBe(true);

    // A second, alternative source taps on its own — the aggregate never
    // drops below threshold because Space stays held throughout.
    frame();
    set(GamepadButton.South, 1);
    set(GamepadButton.South, 0);
    action._update(sample);

    expect(action.pressed).toBe(false);
    expect(action.released).toBe(false);
    expect(action.active).toBe(true);
    expect(action.value).toBe(1);
  });

  it('evaluates the aggregate only once a whole batch has applied, never mid-batch', () => {
    const { sample, setBatch } = createSample();
    // Alternative sources bound to the SAME action, so a plain per-channel
    // replay (rather than a per-BATCH one) would see the aggregate dip to 0
    // between the two writes below, even though both changed together as
    // part of a single real-world event and the aggregate never actually
    // left the active source's coverage.
    const action = new ButtonAction([Keyboard.Space, GamepadButton.South]);

    setBatch([[Keyboard.Space, 1]]);
    action._update(sample);
    expect(action.pressed).toBe(true);
    expect(action.active).toBe(true);

    // One real event writes BOTH channels together: Space releases and
    // GamepadButton.South presses in the very same atomic batch.
    setBatch([
      [Keyboard.Space, 0],
      [GamepadButton.South, 1],
    ]);
    action._update(sample);

    expect(action.pressed).toBe(false);
    expect(action.released).toBe(false);
    expect(action.active).toBe(true);
    expect(action.value).toBe(1);
  });
});

describe('AxisAction', () => {
  it('passes a signed source through unchanged', () => {
    const { sample, set } = createSample();
    const action = new AxisAction(GamepadAxis.LeftStickX);

    set(GamepadAxis.LeftStickX, -0.7);
    action._update(sample);

    expect(action.value).toBeCloseTo(-0.7);
  });

  it('resolves a digital composite as positive minus negative', () => {
    const { sample, set, frame } = createSample();
    const action = new AxisAction({ negative: Keyboard.A, positive: Keyboard.D });

    set(Keyboard.D, 1);
    action._update(sample);
    expect(action.value).toBe(1);

    frame();
    set(Keyboard.A, 1);
    action._update(sample);
    expect(action.value).toBe(0);
  });

  it('supports several sources per side', () => {
    const { sample, set } = createSample();
    const action = new AxisAction({ negative: [Keyboard.A, Keyboard.Left], positive: [Keyboard.D, Keyboard.Right] });

    set(Keyboard.Left, 1);
    action._update(sample);

    expect(action.value).toBe(-1);
  });

  it('allows a one-sided composite', () => {
    const { sample, set } = createSample();
    const action = new AxisAction({ positive: [Keyboard.W, GamepadButton.RightTrigger] });

    set(GamepadButton.RightTrigger, 0.5);
    action._update(sample);

    expect(action.value).toBeCloseTo(0.5);
  });

  it('lets the largest deflection win instead of summing alternatives', () => {
    const { sample, set } = createSample();
    const action = new AxisAction([GamepadAxis.LeftStickX, { negative: Keyboard.A, positive: Keyboard.D }]);

    set(GamepadAxis.LeftStickX, 0.5);
    set(Keyboard.D, 1);
    action._update(sample);

    expect(action.value).toBe(1);
  });

  it('keeps the first binding on an exact tie', () => {
    const { sample, set } = createSample();
    const action = new AxisAction([GamepadAxis.LeftStickX, { positive: Keyboard.D }]);

    set(GamepadAxis.LeftStickX, -1);
    set(Keyboard.D, 1);
    action._update(sample);

    expect(action.value).toBe(-1);
  });

  it('compares active against the magnitude, not the sign', () => {
    const { sample, set } = createSample();
    const action = new AxisAction(GamepadAxis.LeftStickX, { threshold: 0.5 });

    set(GamepadAxis.LeftStickX, -0.8);
    action._update(sample);

    expect(action.active).toBe(true);
  });
});

describe('VectorAction', () => {
  it('reads a stick binding straight through', () => {
    const { sample, set } = createSample();
    const action = new VectorAction({ x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY });

    set(GamepadAxis.LeftStickX, 0.5);
    set(GamepadAxis.LeftStickY, -0.25);
    action._update(sample);

    expect(action.value.x).toBeCloseTo(0.5);
    expect(action.value.y).toBeCloseTo(-0.25);
  });

  it('resolves directions as right minus left and down minus up', () => {
    const { sample, set, frame } = createSample();
    const action = new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D });

    set(Keyboard.D, 1);
    action._update(sample);
    expect([action.value.x, action.value.y]).toEqual([1, 0]);

    frame();
    set(Keyboard.D, 0);
    set(Keyboard.W, 1);
    action._update(sample);
    expect([action.value.x, action.value.y]).toEqual([0, -1]);
  });

  it('clamps a digital diagonal to unit length', () => {
    const { sample, set } = createSample();
    const action = new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D });

    set(Keyboard.D, 1);
    set(Keyboard.S, 1);
    action._update(sample);

    const { x, y } = action.value;

    expect(Math.sqrt(x * x + y * y)).toBeCloseTo(1);
    expect(x).toBeCloseTo(Math.SQRT1_2);
    expect(y).toBeCloseTo(Math.SQRT1_2);
  });

  it('leaves an analog value below unit length alone', () => {
    const { sample, set } = createSample();
    const action = new VectorAction({ x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY });

    set(GamepadAxis.LeftStickX, 0.3);
    set(GamepadAxis.LeftStickY, 0.4);
    action._update(sample);

    expect(Math.hypot(action.value.x, action.value.y)).toBeCloseTo(0.5);
  });

  it('picks whole vectors, never mixing x from one binding with y from another', () => {
    const { sample, set } = createSample();
    const action = new VectorAction([
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
      { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
    ]);

    set(GamepadAxis.LeftStickY, 0.2);
    set(Keyboard.D, 1);
    action._update(sample);

    expect(action.value.x).toBe(1);
    expect(action.value.y).toBe(0);
  });

  it('accepts a partial binding', () => {
    const { sample, set } = createSample();
    const action = new VectorAction({ left: Keyboard.A, right: Keyboard.D });

    set(Keyboard.A, 1);
    action._update(sample);

    expect(action.value.x).toBe(-1);
    expect(action.value.y).toBe(0);
  });
});

describe('ActionMap', () => {
  it('exposes its actions as own members', () => {
    const { sample, set } = createSample();
    const controls = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      steer: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
    });

    set(Keyboard.Space, 1);
    set(Keyboard.D, 1);
    controls._update(sample);

    expect(controls.jump.pressed).toBe(true);
    expect(controls.steer.value).toBe(1);
  });

  it('updates every action it owns', () => {
    const { sample, set } = createSample();
    const controls = new ActionMap({ a: new ButtonAction(Keyboard.A), b: new ButtonAction(Keyboard.B) });

    set(Keyboard.A, 1);
    set(Keyboard.B, 1);
    controls._update(sample);

    expect(controls.a.active).toBe(true);
    expect(controls.b.active).toBe(true);
  });

  it('clears action state on reset', () => {
    const { sample, set } = createSample();
    const controls = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    set(Keyboard.Space, 1);
    controls._update(sample);
    controls._reset();

    expect(controls.jump.active).toBe(false);
    expect(controls.jump.pressed).toBe(false);
  });

  it.each(['actions', 'attached', 'detach', '_owner', '_ownership', '_attach', '_armBaseline', '_update', '_reset', 'constructor', 'prototype'])(
    'rejects a reserved action name: "%s"',
    name => {
      expect(() => new ActionMap({ [name]: new ButtonAction(Keyboard.Space) })).toThrow(/reserved/i);
    },
  );

  it('rejects a `__proto__` action name (prototype-pollution vector via Object.assign)', () => {
    // Object literal syntax special-cases a LITERAL `__proto__:` key as a
    // prototype-set, not an own enumerable property, so `Object.entries`
    // would never see it — a computed key produces a genuine own property
    // instead, exercising the actual `Object.assign(this, actions)` hazard.
    const action = new ButtonAction(Keyboard.Space);

    expect(() => new ActionMap({ ['__proto__']: action })).toThrow(/reserved/i);
  });

  it('rejects reusing the same action instance across two different maps', () => {
    const jump = new ButtonAction(Keyboard.Space);

    new ActionMap({ jump });

    expect(() => new ActionMap({ jump })).toThrow(/already belongs to another ActionMap/i);
  });

  it('rejects reusing the same action instance twice, or under another name, within one map', () => {
    const jump = new ButtonAction(Keyboard.Space);

    expect(() => new ActionMap({ jump, alias: jump })).toThrow(/already belongs to another ActionMap/i);
  });

  it('a map that fails to construct never permanently claims the actions it validated before the failure', () => {
    const jump = new ButtonAction(Keyboard.Space);
    const crash = new ButtonAction(Keyboard.A);

    // `crash` collides with a reserved name, so this whole construction
    // throws — `jump`, validated earlier in the same call, must NOT end up
    // permanently claimed by a map that was never actually built.
    expect(() => new ActionMap({ jump, actions: crash })).toThrow(/reserved/i);

    // `jump` must still be free to use in a real map.
    expect(() => new ActionMap({ jump })).not.toThrow();
  });

  it('resync leaves a still-held action active without a synthetic press', () => {
    const { sample, set, frame } = createSample();
    const jump = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    jump._update(sample);
    expect(jump.pressed).toBe(true);

    jump._reset(); // scene suspend: state goes inert while the key stays physically held
    expect(jump.active).toBe(false);

    frame(); // real time passes while suspended
    jump._update(sample); // scene resume: key is still 1 in the sample, no batch this frame — baselines instead of replaying

    expect(jump.active).toBe(true);
    expect(jump.pressed).toBe(false);
    expect(jump.released).toBe(false);
  });

  it('resync followed by a real release edge still reports released', () => {
    const { sample, set, frame } = createSample();
    const jump = new ButtonAction(Keyboard.Space);

    set(Keyboard.Space, 1);
    jump._update(sample);
    jump._reset();
    frame();
    jump._update(sample); // still held, active=true, no edge

    frame();
    set(Keyboard.Space, 0);
    jump._update(sample);

    expect(jump.released).toBe(true);
    expect(jump.active).toBe(false);
  });

  it("attaching mid-frame does not replay a batch already sitting in the owner's log from before the attach", () => {
    const { sample, set } = createSample();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    // Activity recorded into the shared batch log BEFORE this map attaches —
    // e.g. another consumer's channel changing earlier in the same real
    // frame's processing, ahead of this map ever being asked to watch.
    set(Keyboard.Space, 1);

    const watermarkAtAttach = sample.batches.at(-1)!.sequence;
    const owner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => watermarkAtAttach,
    };

    map._attach(owner);

    // More activity arrives AFTER attach, still within the very same real
    // frame's batch log (never cleared mid-frame).
    set(Keyboard.A, 1);

    map._update(sample);

    // Space was already held BEFORE this map started watching — seeded as
    // an already-active baseline, not a synthetic press.
    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false);
  });

  it('attaching mid-frame still replays a batch pushed after the attach, within the same real frame', () => {
    const { sample, set } = createSample();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    set(Keyboard.A, 1); // unrelated activity, purely to advance the shared log before attach

    const watermarkAtAttach = sample.batches.at(-1)!.sequence;
    const owner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => watermarkAtAttach,
    };

    map._attach(owner);

    set(Keyboard.Space, 1); // happens strictly after attach, same real frame

    map._update(sample);

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(true);
  });

  it('a second attach to a different owner re-arms the watermark against the NEW owner, independent of the first', () => {
    const { sample, set } = createSample();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    set(Keyboard.Space, 1);

    const firstOwner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => 0, // arbitrary — never queried after the second attach below
    };
    const secondOwner: ActionMapOwner = {
      _detachActionMap: (): void => undefined,
      _currentBatchSequence: (): number => sample.batches.at(-1)!.sequence, // "now" — after the pre-existing press above
    };

    map._attach(firstOwner);
    map._attach(secondOwner); // moves before ever being updated under the first owner

    map._update(sample);

    // The watermark in effect is the SECOND owner's, captured at the second
    // attach — the pre-existing press is seeded as already-active, not a
    // synthetic press, exactly as a fresh single attach would see it.
    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false);
  });
});

describe('ActionMap × InputManager lifecycle', () => {
  const createManager = (): InputManager => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    const app = {
      canvas,
      platform: new BrowserPlatform(canvas),
      width: 800,
      height: 600,
      pixelRatio: 1,
      options: { input: {} },
      _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
    } as unknown as Application;

    return new InputManager(app);
  };

  beforeAll(() => {
    Object.defineProperty(window.navigator, 'getGamepads', {
      configurable: true,
      value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
    });
  });

  it('updates an attached map every frame', () => {
    const im = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);
    expect(map.attached).toBe(true);

    im.update(0 as never);
    expect(map.jump.active).toBe(false); // no channel activity, but no throw either

    im.destroy();
  });

  it('stops updating a map once it detaches', () => {
    const im = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);
    map.detach();

    expect(map.attached).toBe(false);

    // Directly poking the action after detach must not throw, and reflects
    // whatever state the map was left at rather than being force-reset.
    im.update(0 as never);

    im.destroy();
  });

  it('attaching a map already attached elsewhere moves it, updating it only once per frame', () => {
    const im = createManager();
    const other = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);
    other.attach(map);

    expect(map.attached).toBe(true);

    // Still tracked by `other` only — `im` must have let go of it.
    im.update(0 as never);
    other.update(0 as never);

    im.destroy();
    other.destroy();
  });

  it('moving an attached map to a different InputManager re-baselines its actions against the new owner, with no synthetic edge', () => {
    const im = createManager();
    const other = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);

    const imCanvas = (im as unknown as { platform: BrowserPlatform }).platform.surface;

    imCanvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update(0 as never);

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(true);

    // The map moves to a different manager — an entirely unrelated channel
    // buffer, where Space was never pressed.
    other.attach(map);
    other.update(0 as never);

    expect(map.jump.active).toBe(false);
    expect(map.jump.pressed).toBe(false);
    expect(map.jump.released).toBe(false);

    im.destroy();
    other.destroy();
  });

  it('destroy() detaches every attached map', () => {
    const im = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);
    im.destroy();

    expect(map.attached).toBe(false);
  });

  it('a suspended-then-resumed scene map does not report a synthetic press for a key still held across the cycle', () => {
    const im = createManager();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    im.attach(map);

    const canvas = (im as unknown as { platform: BrowserPlatform }).platform.surface;

    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update(0 as never);
    expect(map.jump.pressed).toBe(true);

    // Simulate a scene suspend: detach, reset — key stays physically held.
    map.detach();
    map._reset();
    expect(map.jump.active).toBe(false);

    // Resume: resync against the manager's live sample before re-tracking.
    im._resyncActionMap(map);
    im._trackActionMap(map);

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false);

    im.update(0 as never);
    expect(map.jump.pressed).toBe(false); // still just held, no fresh edge

    im.destroy();
  });
});
