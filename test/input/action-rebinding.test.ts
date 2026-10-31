/**
 * Rebinding, binding profiles and the map-level gamepad context: the
 * default-versus-override split, atomic and baseline-safe application, and
 * that nothing device-specific reaches the persisted form.
 */

import type { ActionBase } from '#input/actions/ActionBase';
import { type ActionBinding, ActionMap, type ActionMapOwner } from '#input/actions/ActionMap';
import { AxisAction } from '#input/actions/AxisAction';
import { BindingProfile } from '#input/actions/BindingProfile';
import { ButtonAction } from '#input/actions/ButtonAction';
import { ChordAction } from '#input/actions/ChordAction';
import { InputBindingError } from '#input/actions/InputBindingError';
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
    const map = new ActionMap(
      { jump: new ButtonAction([Keyboard.Space, GamepadButton.South]) },
      { gamepad: new Gamepad(2, driver.sample.values) },
    );

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

  test('reports every unreadable-save failure as InputBindingError, so a load can fall back to defaults', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    expect(() => BindingProfile.fromJSON(null)).toThrow(InputBindingError);
    expect(() => BindingProfile.fromJSON({ version: 2, overrides: {} })).toThrow(InputBindingError);
    expect(() => BindingProfile.fromJSON({ version: 1, overrides: null })).toThrow(InputBindingError);
    expect(() => map.applyProfile(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.hyperspace'] }))).toThrow(
      InputBindingError,
    );
    expect(() =>
      map.applyProfile(new BindingProfile().set('jump', { kind: 'axis', binding: [{ direct: 'gamepad.axis.left-stick-x' }] })),
    ).toThrow(InputBindingError);
    expect(() => map.applyProfile(new BindingProfile().set('crouch', { kind: 'button', binding: ['keyboard.key-c'] }))).toThrow(
      InputBindingError,
    );
  });

  test('leaves a programmer error a plain Error, so a catch around a profile load does not swallow it', () => {
    const shared = new ButtonAction(Keyboard.Space);
    const map = new ActionMap({ jump: shared });

    expect(() => (map as unknown as { rebind(name: string, binding: unknown): void }).rebind('nope', Keyboard.J)).not.toThrow(
      InputBindingError,
    );
    expect(() => new ActionMap({ other: shared })).not.toThrow(InputBindingError);
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
    const saved = BindingProfile.fromJSON(
      JSON.parse(JSON.stringify(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] }))),
    );

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
    expect(() => (map as unknown as { rebind(name: string, binding: unknown): void }).rebind('nope', Keyboard.J)).toThrow(
      /no action named/,
    );
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

    expect(map.conflicts()).toEqual([
      { token: 'gamepad.button.south', channel: resolveGamepadSlotChannel(GamepadButton.South, 2), actions: ['jump', 'fire'] },
    ]);
  });

  test('composite and chord members take part in conflict detection', () => {
    const map = new ActionMap({
      steer: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
      save: new ChordAction('Control+A'),
    });

    expect(map.conflicts()).toEqual([{ token: 'keyboard.key-a', channel: Keyboard.A, actions: ['steer', 'save'] }]);
  });
});

describe('structurally invalid profiles', () => {
  test.each([
    { kind: 'chord' as const, binding: [] },
    { kind: 'chord' as const, binding: [[]] },
    { kind: 'chord' as const, binding: [['keyboard.key-a', 'keyboard.key-a']] },
    { kind: 'sequence' as const, binding: [] },
    { kind: 'sequence' as const, binding: [[]] },
    { kind: 'sequence' as const, binding: [[[]]] },
    { kind: 'sequence' as const, binding: [[['keyboard.key-a', 'keyboard.key-a']]] },
  ])('rejects $kind $binding before touching bindings or sampled state', binding => {
    const driver = createDriver();
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      pattern: binding.kind === 'chord' ? new ChordAction('Control+S') : new SequenceAction('A>B'),
    });
    map.rebind('jump', Keyboard.K);
    driver.set(Keyboard.K, 1);
    map._update(driver.sample);
    const before = map.serializeBindings();
    const channels = map.jump.channels;
    const descriptor = map.jump.binding;
    const patternDescriptor = map.pattern.binding;
    const profile = new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.key-j'] }).set('pattern', binding);

    expect(() => map.applyProfile(profile)).toThrow(InputBindingError);
    expect(map.serializeBindings()).toEqual(before);
    expect(map.jump.channels).toBe(channels);
    expect(map.jump.binding).toBe(descriptor);
    expect(map.pattern.binding).toBe(patternDescriptor);
    expect(map.jump.active).toBe(true);
    driver.frame();
    driver.set(Keyboard.K, 0);
    map._update(driver.sample);
    expect(map.jump.released).toBe(true);
  });
});

describe('direct button rebind validation', () => {
  const mismatches: ReadonlyArray<{ name: string; binding: ActionBinding }> = [
    { name: 'axis composite', binding: { negative: Keyboard.A, positive: Keyboard.D } },
    { name: 'vector descriptor', binding: { x: GamepadAxis.LeftStickX } },
    { name: 'chord string', binding: 'Control+S' },
    { name: 'mixed alternatives', binding: [Keyboard.J, { positive: Keyboard.D }] },
  ];

  test.each(mismatches)('rejects $name without changing binding, sampling or ownership', ({ binding }) => {
    const driver = createDriver();
    const map = new ActionMap(
      { jump: new ButtonAction(Keyboard.Space), other: new ButtonAction(Keyboard.Control) },
      { gamepad: new Gamepad(2, driver.sample.values) },
    );
    const watermark = vi.fn(() => driver.sample.batches.at(-1)?.sequence ?? 0);
    const snapshot = vi.fn(() => driver.sample.values.slice());
    const refresh = vi.fn();
    const owner: ActionMapOwner = {
      _detachActionMap: vi.fn(),
      _currentBatchSequence: watermark,
      _snapshotActionChannels: snapshot,
      _refreshActionMapCapture: refresh,
    };
    map._attach(owner);

    try {
      map._update(driver.sample);
      driver.frame();
      driver.set(Keyboard.Space, 1);
      driver.set(Keyboard.Control, 1);
      map._update(driver.sample);
      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(true);
      const before = {
        binding: map.jump.binding,
        defaultBinding: map.jump.defaultBinding,
        channels: map.jump.channels,
        slot: map.jump._gamepadSlot,
        profile: map.serializeBindings(),
        value: map.jump.value,
        active: map.jump.active,
        pressed: map.jump.pressed,
        released: map.jump.released,
        ownerCalls: [watermark.mock.calls.length, snapshot.mock.calls.length, refresh.mock.calls.length],
      };

      expect(() => map.rebind('jump', binding)).toThrowError(
        expect.objectContaining({ constructor: Error, message: 'Input binding: channel groups must contain numeric input channels.' }),
      );
      expect(map.jump.binding).toBe(before.binding);
      expect(map.jump.defaultBinding).toBe(before.defaultBinding);
      expect(map.jump.channels).toBe(before.channels);
      expect(map.jump._gamepadSlot).toBe(before.slot);
      expect(map.serializeBindings()).toEqual(before.profile);
      expect([map.jump.value, map.jump.active, map.jump.pressed, map.jump.released]).toEqual([
        before.value,
        before.active,
        before.pressed,
        before.released,
      ]);
      expect([watermark.mock.calls.length, snapshot.mock.calls.length, refresh.mock.calls.length]).toEqual(before.ownerCalls);
      expect(map.other.active).toBe(true);
      expect(map.other.pressed).toBe(true);

      driver.frame();
      driver.set(Keyboard.Space, 0);
      map._update(driver.sample);
      expect(map.jump.active).toBe(false);
      expect(map.jump.released).toBe(true);
      expect(map.other.active).toBe(true);
      expect(map.other.pressed).toBe(false);

      map.rebind('jump', Keyboard.J);
      expect(map.jump.binding).toBe(Keyboard.J);
      expect(map.jump.channels).toEqual([Keyboard.J]);
      map.rebind('jump', null);
      expect(map.jump.binding).toBe(before.defaultBinding);
    } finally {
      map.detach();
    }
  });

  test('a rejected resolve preserves a different prior gamepad slot', () => {
    const button = new ButtonAction(GamepadButton.South);
    const action: ActionBase<unknown> = button;
    action._rebind(null, 1);
    const channels = action.channels;
    const descriptor = action.binding;

    expect(() => action._rebind({ negative: Keyboard.A }, 3)).toThrowError(
      expect.objectContaining({ constructor: Error, message: 'Input binding: channel groups must contain numeric input channels.' }),
    );
    expect(action._gamepadSlot).toBe(1);
    expect(action.channels).toBe(channels);
    expect(action.binding).toBe(descriptor);
    expect(button.serialize()).toEqual({ kind: 'button', binding: ['gamepad.button.south'] });
  });

  test('retains valid button alternatives, gamepad rebasing and an empty unbound list', () => {
    const driver = createDriver();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) }, { gamepad: new Gamepad(2, driver.sample.values) });
    map.rebind('jump', [Keyboard.J, PointerButton.Primary, GamepadButton.South]);
    expect(map.jump.channels).toEqual([Keyboard.J, PointerButton.Primary, resolveGamepadSlotChannel(GamepadButton.South, 2)]);
    expect(map.serializeBindings()).toEqual({
      jump: { kind: 'button', binding: ['keyboard.key-j', 'pointer.primary', 'gamepad.button.south'] },
    });

    map.rebind('jump', []);
    expect(map.jump.channels).toEqual([]);
    expect(map.serializeBindings()).toEqual({ jump: { kind: 'button', binding: [] } });
    map.rebind('jump', null);
    expect(map.jump.binding).toBe(Keyboard.Space);
  });

  test('reads each supplied array entry once before resolving its validated snapshot', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const binding = [Keyboard.J];
    let reads = 0;
    Object.defineProperty(binding, 0, {
      get: () => {
        reads++;

        return Keyboard.J;
      },
    });

    map.rebind('jump', binding);
    expect(reads).toBe(1);
    expect(map.jump.binding).toBe(binding);
    expect(map.jump.channels).toEqual([Keyboard.J]);
  });

  test('keeps omitted Axis and Vector fields valid during construction and rebind', () => {
    const map = new ActionMap({ steer: new AxisAction({ negative: Keyboard.A }), move: new VectorAction({ up: Keyboard.W }) });
    expect(map.steer.channels).toEqual([Keyboard.A]);
    expect(map.move.channels).toEqual([Keyboard.W]);

    map.rebind('steer', { positive: Keyboard.D });
    map.rebind('move', { y: GamepadAxis.LeftStickY });
    expect(map.steer.channels).toEqual([Keyboard.D]);
    expect(map.move.channels).toEqual([GamepadAxis.LeftStickY]);
    expect(() => map.serializeBindings()).not.toThrow();
  });
});

describe('rejected rebinds leave the map untouched', () => {
  test('an axis or vector rejects a pattern string and keeps its channels', () => {
    const map = new ActionMap({
      move: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
      look: new VectorAction({ up: Keyboard.W, down: Keyboard.S }),
    });
    const moveChannels = [...map.move.channels];
    const lookChannels = [...map.look.channels];
    const moveBinding = map.move.binding;

    expect(() => (map as unknown as { rebind(name: string, binding: unknown): void }).rebind('move', 'ctrl+k')).toThrow(InputBindingError);
    expect(() => (map as unknown as { rebind(name: string, binding: unknown): void }).rebind('look', 'ctrl+k')).toThrow(InputBindingError);
    expect(map.move.binding).toBe(moveBinding);
    expect([...map.move.channels]).toEqual(moveChannels);
    expect([...map.look.channels]).toEqual(lookChannels);
  });

  test('a batch whose later entry is rejected restores the earlier ones', () => {
    const map = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      move: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
    });
    const jumpBinding = map.jump.binding;
    const jumpChannels = [...map.jump.channels];
    const apply = (map as unknown as { _applyAtomically(changes: ReadonlyArray<readonly [unknown, unknown]>): void })._applyAtomically.bind(
      map,
    );

    expect(() =>
      apply([
        [map.jump, Keyboard.J],
        [map.move, 'ctrl+k'],
      ]),
    ).toThrow(InputBindingError);
    expect(map.jump.binding).toBe(jumpBinding);
    expect([...map.jump.channels]).toEqual(jumpChannels);
  });
});
