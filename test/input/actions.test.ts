/**
 * Tests for the action layer: threshold/edge semantics on ButtonAction,
 * composite and alternative-binding resolution on AxisAction/VectorAction,
 * and ActionMap attachment lifetime against InputManager and SceneInputs.
 */

import { ActionMap } from '#input/actions/ActionMap';
import { AxisAction } from '#input/actions/AxisAction';
import { ButtonAction } from '#input/actions/ButtonAction';
import type { ActionSample } from '#input/actions/types';
import { VectorAction } from '#input/actions/VectorAction';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { ChannelSize, Keyboard, PointerButton } from '#input/types';

const createSample = (): { sample: ActionSample; set: (channel: number, value: number) => void; frame: () => void } => {
  const values = new Float32Array(ChannelSize.Container);
  const peaks = new Float32Array(ChannelSize.Container);

  return {
    sample: { values, peaks },
    // Writing a channel folds into the peak buffer the same way InputManager does.
    set: (channel: number, value: number): void => {
      values[channel] = value;

      if (Math.abs(value) > Math.abs(peaks[channel] ?? 0)) {
        peaks[channel] = value;
      }
    },
    frame: (): void => void peaks.set(values),
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
    const { sample, set } = createSample();
    const action = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });

    set(GamepadButton.RightTrigger, 0.4);
    action._update(sample);
    expect(action.active).toBe(false);

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
});
