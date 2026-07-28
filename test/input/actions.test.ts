/**
 * Tests for the action layer: threshold/edge semantics on ButtonAction,
 * composite and alternative-binding resolution on AxisAction/VectorAction,
 * and ActionMap attachment lifetime against InputManager and SceneInputs.
 */

import type { Application } from '#core/Application';
import { ActionMap } from '#input/actions/ActionMap';
import { AxisAction } from '#input/actions/AxisAction';
import { ButtonAction } from '#input/actions/ButtonAction';
import type { ActionSample } from '#input/actions/types';
import { VectorAction } from '#input/actions/VectorAction';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { InputManager } from '#input/InputManager';
import { ChannelSize, Keyboard, PointerButton } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';

/**
 * Builds an `ActionSample` and the two operations a test drives it with:
 * `set()` mimics a platform write mid-frame (folding the edge latches the
 * same way `InputManager._trackEdges` does), and `frame()` closes the frame
 * (clearing the latches and bumping `frameId`, mirroring `InputManager.update`).
 */
const createSample = (): { sample: ActionSample; set: (channel: number, value: number) => void; frame: () => void } => {
  const values = new Float32Array(ChannelSize.Container);
  const pressed = new Uint8Array(ChannelSize.Container);
  const released = new Uint8Array(ChannelSize.Container);
  const last = new Float32Array(ChannelSize.Container);
  const sample: ActionSample = { values, pressed, released, frameId: 1 };

  return {
    sample,
    set: (channel: number, value: number): void => {
      const previous = last[channel] ?? 0;

      if (previous === 0) {
        if (value !== 0) {
          pressed[channel] = 1;
        }
      } else if (value === 0) {
        released[channel] = 1;
      }

      last[channel] = value;
      values[channel] = value;
    },
    frame: (): void => {
      pressed.fill(0);
      released.fill(0);
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
    const { sample, set } = createSample();
    const action = new AxisAction({ negative: Keyboard.A, positive: Keyboard.D });

    set(Keyboard.D, 1);
    action._update(sample);
    expect(action.value).toBe(1);

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
    const { sample, set } = createSample();
    const action = new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D });

    set(Keyboard.D, 1);
    action._update(sample);
    expect([action.value.x, action.value.y]).toEqual([1, 0]);

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

  it.each(['actions', 'attached', 'detach', '_owner', '_attach', '_update', '_resync', '_reset'])('rejects a reserved action name: "%s"', name => {
    expect(() => new ActionMap({ [name]: new ButtonAction(Keyboard.Space) })).toThrow(/reserved/i);
  });

  it('does not update the same action instance twice in one frame across two maps', () => {
    const { sample, set } = createSample();
    const jump = new ButtonAction(Keyboard.Space);
    const first = new ActionMap({ jump });
    const second = new ActionMap({ jump });

    set(Keyboard.Space, 1);
    first._update(sample);
    // A second map sharing the same underlying action, reached within the
    // same real frame — must not re-derive `pressed` off its own just-written
    // `active` state and erase the edge it correctly saw a moment ago.
    second._update(sample);

    expect(jump.pressed).toBe(true);
    expect(jump.active).toBe(true);
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
    jump._resync(sample); // scene resume: key is still 1 in the sample

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
    jump._resync(sample); // still held, active=true, no edge

    frame();
    set(Keyboard.Space, 0);
    jump._update(sample);

    expect(jump.released).toBe(true);
    expect(jump.active).toBe(false);
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

    const channels = (im as unknown as { channels: Float32Array }).channels;

    channels[Keyboard.Space] = 1;
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
