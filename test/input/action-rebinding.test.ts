/**
 * Rebinding, binding profiles and the map-level gamepad context: the
 * default-versus-override split, atomic and baseline-safe application, and
 * that nothing device-specific reaches the persisted form.
 */

import { ActionMap } from '#input/actions/ActionMap';
import { AxisAction } from '#input/actions/AxisAction';
import { BindingProfile } from '#input/actions/BindingProfile';
import { ButtonAction } from '#input/actions/ButtonAction';
import { ChordAction } from '#input/actions/ChordAction';
import { SequenceAction } from '#input/actions/SequenceAction';
import type { ActionSample, ChannelEvent } from '#input/actions/types';
import { VectorAction } from '#input/actions/VectorAction';
import { Gamepad } from '#input/Gamepad';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { ChannelSize, Keyboard, PointerButton, resolveGamepadSlotChannel } from '#input/types';

interface Driver {
  readonly sample: ActionSample;
  set(channel: number, value: number): void;
  frame(): void;
}

const createDriver = (): Driver => {
  const values = new Float32Array(ChannelSize.Container);
  const batches: Array<{ channels: ChannelEvent[]; sequence: number; timestamp: number }> = [];
  const sample: ActionSample = { values, batches, frameId: 1, timestamp: 0 };
  let sequence = 0;

  return {
    sample,
    set: (channel: number, value: number): void => {
      if (values[channel] === value) {
        return;
      }

      values[channel] = value;
      const next = ++sequence;

      batches.push({ channels: [{ channel, value }], sequence: next, timestamp: next });
    },
    frame: (): void => {
      batches.length = 0;
      sample.frameId++;
    },
  };
};

describe('ActionMap gamepad context', () => {
  test('resolves gamepad channels against the map, not the action', () => {
    const driver = createDriver();
    const jump = new ButtonAction(GamepadButton.South);
    const map = new ActionMap({ jump }, { gamepad: new Gamepad(1, driver.sample.values) });

    expect(map.gamepad?.slot).toBe(1);
    expect(jump.channels).toEqual([resolveGamepadSlotChannel(GamepadButton.South, 1)]);
  });

  test('two maps on two pads stay independent for the same semantic control', () => {
    const driver = createDriver();
    const p1 = new ActionMap({ jump: new ButtonAction(GamepadButton.South) }, { gamepad: new Gamepad(0, driver.sample.values) });
    const p2 = new ActionMap({ jump: new ButtonAction(GamepadButton.South) }, { gamepad: new Gamepad(1, driver.sample.values) });

    driver.set(resolveGamepadSlotChannel(GamepadButton.South, 1), 1);
    p1._update(driver.sample);
    p2._update(driver.sample);

    expect(p1.jump.active).toBe(false);
    expect(p2.jump.active).toBe(true);
  });

  test('non-gamepad channels in a pad-bound map are untouched', () => {
    const driver = createDriver();
    const map = new ActionMap(
      { fire: new ButtonAction([Keyboard.Space, PointerButton.Primary, GamepadButton.RightTrigger]) },
      { gamepad: new Gamepad(3, driver.sample.values) },
    );

    expect(map.fire.channels).toEqual([Keyboard.Space, PointerButton.Primary, resolveGamepadSlotChannel(GamepadButton.RightTrigger, 3)]);

    driver.set(Keyboard.Space, 1);
    map._update(driver.sample);
    expect(map.fire.active).toBe(true);
  });

  test('a keyboard map and a pad map coexist in the same gameplay scope', () => {
    const driver = createDriver();
    const keyboard = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const pad = new ActionMap({ jump: new ButtonAction(GamepadButton.South) }, { gamepad: new Gamepad(0, driver.sample.values) });

    driver.set(Keyboard.Space, 1);
    keyboard._update(driver.sample);
    pad._update(driver.sample);

    expect(keyboard.jump.active).toBe(true);
    expect(pad.jump.active).toBe(false);
  });
});

describe('ActionMap iteration and lookup', () => {
  test('exposes its actions by name in declaration order', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      move: new VectorAction({ up: Keyboard.W, down: Keyboard.S }),
    });

    expect(map.names).toEqual(['jump', 'move']);
    expect(map.get('jump')).toBe(map.jump);
    expect(map.get('nope')).toBeUndefined();
    expect([...map.entries()].map(([name]) => name)).toEqual(['jump', 'move']);
  });

  test('every action reports its kind and its resolved channels', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      steer: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
      move: new VectorAction({ up: Keyboard.W, down: Keyboard.S }),
      save: new ChordAction('Control+S'),
      konami: new SequenceAction('Up>Down'),
    });

    expect([...map.entries()].map(([, action]) => action.kind)).toEqual(['button', 'axis', 'vector', 'chord', 'sequence']);
    expect(map.steer.channels).toEqual([Keyboard.A, Keyboard.D]);
    expect(map.save.channels).toEqual([Keyboard.Control, Keyboard.S]);
    expect(map.konami.channels).toEqual([Keyboard.Up, Keyboard.Down]);
  });
});

describe('binding serialization', () => {
  test('round-trips every action kind through a profile', () => {
    const map = new ActionMap({
      jump: new ButtonAction([Keyboard.Space, GamepadButton.South]),
      steer: new AxisAction([GamepadAxis.LeftStickX, { negative: Keyboard.A, positive: Keyboard.D }]),
      move: new VectorAction({ x: GamepadAxis.LeftStickX, up: Keyboard.W, down: Keyboard.S }),
      save: new ChordAction('Control+S|Meta+S'),
      konami: new SequenceAction('Up>Down+Left'),
    });

    const serialized = map.serializeBindings();
    const restored = new ActionMap({
      jump: new ButtonAction(Keyboard.Escape),
      steer: new AxisAction(Keyboard.Escape),
      move: new VectorAction({ up: Keyboard.Escape }),
      save: new ChordAction('Escape'),
      konami: new SequenceAction('Escape'),
    });

    const profile = new BindingProfile();

    for (const [name, binding] of Object.entries(serialized)) {
      profile.set(name, binding);
    }

    restored.applyProfile(profile);

    expect(restored.serializeBindings()).toEqual(serialized);
    expect(restored.jump.channels).toEqual(map.jump.channels);
    expect(restored.save.channels).toEqual(map.save.channels);
    expect(restored.konami.channels).toEqual(map.konami.channels);
  });

  test('serializes to lowercase tokens and never to a gamepad slot', () => {
    const driver = createDriver();
    const map = new ActionMap({ jump: new ButtonAction([Keyboard.Space, GamepadButton.South]) }, { gamepad: new Gamepad(2, driver.sample.values) });

    const json = JSON.stringify(map.serializeBindings());

    expect(JSON.parse(json)).toEqual({ jump: { kind: 'button', binding: ['keyboard.space', 'gamepad.button.south'] } });
    expect(json).toBe(json.toLowerCase());
    expect(json).not.toMatch(/slot|gamepad\.\d/);
  });

  test('a profile survives JSON.stringify / JSON.parse', () => {
    const profile = new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] });
    const restored = BindingProfile.fromJSON(JSON.parse(JSON.stringify(profile)));

    expect(restored.get('jump')).toEqual({ kind: 'button', binding: ['keyboard.key-j'] });
  });

  test('rejects an unknown token instead of binding a neighbouring control', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const profile = new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.hyperspace'] });

    expect(() => map.applyProfile(profile)).toThrow(/not a known input token/);
    expect(map.jump.channels).toEqual([Keyboard.Space]);
  });

  test('rejects a profile whose kind no longer matches the action', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const profile = new BindingProfile().set('jump', { kind: 'axis', binding: [{ direct: 'gamepad.axis.left-stick-x' }] });

    expect(() => map.applyProfile(profile)).toThrow(/cannot apply an? "axis" binding/);
  });

  test('rejects a profile version this build does not understand', () => {
    expect(() => BindingProfile.fromJSON({ version: 2, overrides: {} })).toThrow(/unsupported profile version/);
    expect(() => BindingProfile.fromJSON({ overrides: {} })).toThrow(/unsupported profile version/);
    expect(() => BindingProfile.fromJSON(null)).toThrow(/expected a serialized profile/);
  });

  test('rejects an override for an action the map does not declare', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const profile = new BindingProfile().set('crouch', { kind: 'button', binding: ['keyboard.key-c'] });

    expect(() => map.applyProfile(profile)).toThrow(/does not declare/);
  });
});

describe('defaults versus overrides', () => {
  test('an override replaces only the action it names', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      fire: new ButtonAction(Keyboard.Control),
    });

    map.applyProfile(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] }));

    expect(map.jump.channels).toEqual([Keyboard.J]);
    expect(map.fire.channels).toEqual([Keyboard.Control]);
  });

  test('an action a stored profile never mentioned keeps the default a later build gave it', () => {
    const saved = BindingProfile.fromJSON(JSON.parse(JSON.stringify(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] }))));

    // The build that reads the save has grown a second action with its own
    // default. A full-snapshot profile would have frozen it at "unbound".
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      crouch: new ButtonAction(Keyboard.ControlLeft),
    });

    map.applyProfile(saved);

    expect(map.jump.channels).toEqual([Keyboard.J]);
    expect(map.crouch.channels).toEqual([Keyboard.ControlLeft]);
  });

  test('applying null, or a profile that no longer overrides an action, restores its default', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    map.applyProfile(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] }));
    expect(map.jump.channels).toEqual([Keyboard.J]);

    map.applyProfile(new BindingProfile());
    expect(map.jump.channels).toEqual([Keyboard.Space]);

    map.rebind('jump', Keyboard.J);
    map.applyProfile(null);
    expect(map.jump.channels).toEqual([Keyboard.Space]);
  });

  test('defaultBinding keeps reporting what the developer declared', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    map.rebind('jump', [Keyboard.J, Keyboard.K]);

    expect(map.jump.defaultBinding).toBe(Keyboard.Space);
    expect(map.jump.binding).toEqual([Keyboard.J, Keyboard.K]);
    expect(map.jump.channels).toEqual([Keyboard.J, Keyboard.K]);
  });

  test('reset drops one override, clear drops them all', () => {
    const profile = new BindingProfile()
      .set('jump', { kind: 'button', binding: ['keyboard.key-j'] })
      .set('fire', { kind: 'button', binding: ['keyboard.key-f'] });

    expect(profile.size).toBe(2);

    profile.reset('jump');
    expect(profile.names).toEqual(['fire']);

    profile.clear();
    expect(profile.size).toBe(0);
  });

  test('rebinding an unknown action name throws', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    expect(() => map.rebind('jump' as never, Keyboard.J)).not.toThrow();
    expect(() => (map as unknown as { rebind(name: string, binding: unknown): void }).rebind('nope', Keyboard.J)).toThrow(/no action named/);
  });
});

describe('rebinding is atomic and baseline-safe', () => {
  test('a key held across a rebind onto that same key does not read as a fresh press', () => {
    const driver = createDriver();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space), other: new ButtonAction(Keyboard.J) });

    driver.set(Keyboard.J, 1);
    map._update(driver.sample);
    expect(map.other.active).toBe(true);

    driver.frame();
    map.rebind('jump', Keyboard.J);
    map._update(driver.sample);

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false);
  });

  test('releasing a key after a rebind still reports the release', () => {
    const driver = createDriver();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    driver.set(Keyboard.J, 1);
    map._update(driver.sample);

    driver.frame();
    map.rebind('jump', Keyboard.J);
    map._update(driver.sample);
    expect(map.jump.active).toBe(true);

    driver.frame();
    driver.set(Keyboard.J, 0);
    map._update(driver.sample);

    expect(map.jump.active).toBe(false);
    expect(map.jump.released).toBe(true);
  });

  test('a rebind away from a held key clears the action instead of leaving it stuck', () => {
    const driver = createDriver();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    driver.set(Keyboard.Space, 1);
    map._update(driver.sample);
    expect(map.jump.active).toBe(true);

    driver.frame();
    map.rebind('jump', Keyboard.J);
    map._update(driver.sample);

    expect(map.jump.active).toBe(false);
    expect(map.jump.released).toBe(false);
  });

  test('a profile with one bad entry leaves every action untouched', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      fire: new ButtonAction(Keyboard.Control),
    });

    const profile = new BindingProfile()
      .set('jump', { kind: 'button', binding: ['keyboard.key-j'] })
      .set('fire', { kind: 'button', binding: ['keyboard.not-a-key'] });

    expect(() => map.applyProfile(profile)).toThrow();
    expect(map.jump.channels).toEqual([Keyboard.Space]);
    expect(map.fire.channels).toEqual([Keyboard.Control]);
  });
});

describe('conflict detection', () => {
  test('reports a channel two actions of the same map bind', () => {
    const map = new ActionMap({
      jump: new ButtonAction([Keyboard.Space, Keyboard.W]),
      fire: new ButtonAction(Keyboard.Space),
      steer: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
    });

    expect(map.conflicts()).toEqual([{ token: 'keyboard.space', channel: Keyboard.Space, actions: ['jump', 'fire'] }]);
  });

  test('reports nothing when every action binds its own controls', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      fire: new ButtonAction(Keyboard.Control),
    });

    expect(map.conflicts()).toEqual([]);
  });

  test('a conflict introduced by a rebind is reported, and names the control rather than the pad slot', () => {
    const driver = createDriver();
    const map = new ActionMap(
      {
        jump: new ButtonAction(GamepadButton.South),
        fire: new ButtonAction(GamepadButton.East),
      },
      { gamepad: new Gamepad(2, driver.sample.values) },
    );

    expect(map.conflicts()).toEqual([]);

    map.rebind('fire', GamepadButton.South);

    expect(map.conflicts()).toEqual([{ token: 'gamepad.button.south', channel: resolveGamepadSlotChannel(GamepadButton.South, 2), actions: ['jump', 'fire'] }]);
  });

  test('composite and chord members take part in conflict detection', () => {
    const map = new ActionMap({
      steer: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
      save: new ChordAction('Control+A'),
    });

    expect(map.conflicts()).toEqual([{ token: 'keyboard.key-a', channel: Keyboard.A, actions: ['steer', 'save'] }]);
  });
});
