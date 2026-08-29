/**
 * Scope-stack semantics: a higher scope claims the controls its maps bind,
 * lower levels stop seeing them through BOTH the live values and this frame's
 * batch log, and everything unbound still falls through.
 */

import type { Application } from '#core/Application';
import { SceneInputs } from '#core/scene/SceneInputs';
import { SceneState } from '#core/SceneState';
import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import { InputScope } from '#input/actions/InputScope';
import type { ActionSample, ChannelEvent, ChannelEventBatch } from '#input/actions/types';
import { VectorAction } from '#input/actions/VectorAction';
import type { ActionScopeHost } from '#input/InputSystem';
import { ChannelSize, Keyboard } from '#input/types';

interface Harness {
  readonly inputs: SceneInputs;
  readonly sample: ActionSample;
  set(channel: number, value: number): void;
  /** One tick of the input clock: close nothing, just let every host sample. */
  frame(): void;
  /** Close the frame - clears the batch log and bumps the frame id. */
  next(): void;
}

const createHarness = (): Harness => {
  const values = new Float32Array(ChannelSize.Container);
  const batches: ChannelEventBatch[] = [];
  const sample: ActionSample = { values, batches, frameId: 1, timestamp: 0 };
  const hosts = new Set<ActionScopeHost>();
  let sequence = 0;

  const app = {
    input: {
      _trackScopeHost: (host: ActionScopeHost): void => void hosts.add(host),
      _detachScopeHost: (host: ActionScopeHost): void => void hosts.delete(host),
      _detachActionMap: (): void => undefined,
      _retainActionMapCapture: (): void => undefined,
      _refreshActionMapCapture: (): void => undefined,
      _releaseActionMapCapture: (): void => undefined,
      _actionSample: (): ActionSample => sample,
      _currentBatchSequence: (): number => sequence,
      _snapshotActionChannels: (): Float32Array => values.slice(),
    },
    scenes: {
      get _transitionGateOpen(): boolean {
        return false;
      },
    },
  } as unknown as Application;

  return {
    inputs: new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    ),
    sample,
    set: (channel: number, value: number): void => {
      if (values[channel] === value) {
        return;
      }

      values[channel] = value;
      const next = ++sequence;
      const event: ChannelEvent = { channel, value };

      batches.push({ channels: [event], sequence: next, timestamp: next });
    },
    frame: (): void => {
      for (const host of hosts) {
        host._updateScopes(sample);
      }
    },
    next: (): void => {
      batches.length = 0;
      sample.frameId++;
    },
  };
};

describe('InputScope', () => {
  test('collects maps and reports them in insertion order', () => {
    const a = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const b = new ActionMap({ fire: new ButtonAction(Keyboard.Control) });
    const scope = new InputScope([a, b]);

    expect(scope.maps).toEqual([a, b]);

    scope.remove(a);
    expect(scope.maps).toEqual([b]);
  });

  test('adding the same map twice is a no-op, and a second scope is refused', () => {
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const first = new InputScope(map);
    const second = new InputScope();

    first.add(map);
    expect(first.maps).toEqual([map]);
    expect(() => second.add(map)).toThrow(/already belongs to another InputScope/);

    first.remove(map);
    expect(() => second.add(map)).not.toThrow();
  });
});

describe('scope stack priority', () => {
  test('a pushed scope takes an overlapping control away from the base level', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(new InputScope(menu));

    h.set(Keyboard.Space, 1);
    h.frame();

    expect(menu.confirm.active).toBe(true);
    expect(gameplay.jump.active).toBe(false);
    expect(gameplay.jump.pressed).toBe(false);
  });

  test('a control the higher scope does not bind still reaches the level below', () => {
    const h = createHarness();
    const gameplay = new ActionMap({
      jump: new ButtonAction(Keyboard.Space),
      move: new VectorAction({ up: Keyboard.W, down: Keyboard.S }),
    });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(new InputScope(menu));

    h.set(Keyboard.W, 1);
    h.frame();

    // Screen-space y grows downwards, so "up" deflects negative.
    expect(gameplay.move.value.y).toBe(-1);
    expect(menu.confirm.active).toBe(false);
  });

  test('a lower level cannot reconstruct a claimed edge from this frame batch log', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(new InputScope(menu));

    // A full press AND release inside one frame: the live value is 0 again by
    // the time the frame is sampled, so only the batch log could still leak it.
    h.set(Keyboard.Space, 1);
    h.set(Keyboard.Space, 0);
    h.frame();

    expect(menu.confirm.pressed).toBe(true);
    expect(menu.confirm.released).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);
    expect(gameplay.jump.released).toBe(false);
  });

  test('maps in the same scope are peers and both see a shared control', () => {
    const h = createHarness();
    const first = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const second = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.pushScope(new InputScope([first, second]));

    h.set(Keyboard.Space, 1);
    h.frame();

    expect(first.jump.active).toBe(true);
    expect(second.confirm.active).toBe(true);
  });

  test('three levels: only the topmost claimant sees a control every level binds', () => {
    const h = createHarness();
    const base = new ActionMap({ a: new ButtonAction(Keyboard.Space) });
    const middle = new ActionMap({ b: new ButtonAction(Keyboard.Space) });
    const top = new ActionMap({ c: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(base);
    h.inputs.pushScope(new InputScope(middle));
    h.inputs.pushScope(new InputScope(top));

    h.set(Keyboard.Space, 1);
    h.frame();

    expect(top.c.active).toBe(true);
    expect(middle.b.active).toBe(false);
    expect(base.a.active).toBe(false);
  });

  test('popping a scope hands the control back without a synthetic press', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });
    const scope = new InputScope(menu);

    h.inputs.attach(gameplay);
    h.inputs.pushScope(scope);

    h.set(Keyboard.Space, 1);
    h.frame();
    expect(gameplay.jump.active).toBe(false);

    h.next();
    expect(h.inputs.popScope(scope)).toBe(scope);
    h.frame();

    // The key never came up, so the gameplay action reads it as held - but the
    // press edge happened while the menu owned it and must not resurface.
    expect(gameplay.jump.active).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);
  });

  test('pushing a scope over a held control does not manufacture a release for the level below', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(gameplay);
    h.set(Keyboard.Space, 1);
    h.frame();
    expect(gameplay.jump.pressed).toBe(true);

    h.next();
    h.inputs.pushScope(new InputScope(menu));
    h.frame();

    expect(gameplay.jump.active).toBe(false);
    expect(gameplay.jump.released).toBe(false);
  });

  test('popScope with no argument removes the topmost scope, and returns null on an empty stack', () => {
    const h = createHarness();
    const first = new InputScope(new ActionMap({ a: new ButtonAction(Keyboard.Space) }));
    const second = new InputScope(new ActionMap({ b: new ButtonAction(Keyboard.Escape) }));

    h.inputs.pushScope(first);
    h.inputs.pushScope(second);

    expect(h.inputs.scopes).toEqual([first, second]);
    expect(h.inputs.popScope()).toBe(second);
    expect(h.inputs.popScope()).toBe(first);
    expect(h.inputs.popScope()).toBeNull();
  });

  test('pushing the same scope twice throws', () => {
    const h = createHarness();
    const scope = new InputScope(new ActionMap({ a: new ButtonAction(Keyboard.Space) }));

    h.inputs.pushScope(scope);
    expect(() => h.inputs.pushScope(scope)).toThrow(/already on the stack/);
  });

  test('a scope attaches its maps on push and detaches them on pop', () => {
    const h = createHarness();
    const map = new ActionMap({ a: new ButtonAction(Keyboard.Space) });
    const scope = new InputScope(map);

    expect(map.attached).toBe(false);
    h.inputs.pushScope(scope);
    expect(map.attached).toBe(true);

    h.inputs.popScope(scope);
    expect(map.attached).toBe(false);
  });

  test('a map added to a pushed scope starts claiming on the next frame', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const scope = new InputScope();
    const late = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(scope);

    h.set(Keyboard.Space, 1);
    h.frame();
    expect(gameplay.jump.active).toBe(true);

    h.next();
    scope.add(late);
    h.frame();

    expect(late.confirm.active).toBe(true);
    expect(gameplay.jump.active).toBe(false);
  });

  test('a rebind inside a scope changes what it claims', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Escape) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(new InputScope(menu));

    h.set(Keyboard.Space, 1);
    h.frame();
    expect(gameplay.jump.active).toBe(true);

    h.next();
    menu.rebind('confirm', Keyboard.Space);
    h.frame();

    expect(gameplay.jump.active).toBe(false);
  });

  test('suspend and resume restore the stack without a synthetic press', () => {
    const h = createHarness();
    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Escape) });

    h.inputs.attach(gameplay);
    h.inputs.pushScope(new InputScope(menu));

    h.set(Keyboard.Space, 1);
    h.frame();
    expect(gameplay.jump.pressed).toBe(true);

    h.inputs.suspend();
    expect(gameplay.jump.active).toBe(false);

    h.next();
    h.inputs.resume();

    expect(gameplay.jump.active).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);

    h.frame();
    expect(gameplay.jump.pressed).toBe(false);
  });

  test('a scope claims nothing while its availability policy disallows sampling', () => {
    const values = new Float32Array(ChannelSize.Container);
    const batches: ChannelEventBatch[] = [];
    const sample: ActionSample = { values, batches, frameId: 1, timestamp: 0 };
    const hosts = new Set<ActionScopeHost>();
    const paused = { value: false };
    let sequence = 0;

    const app = {
      input: {
        _trackScopeHost: (host: ActionScopeHost): void => void hosts.add(host),
        _detachScopeHost: (host: ActionScopeHost): void => void hosts.delete(host),
        _detachActionMap: (): void => undefined,
        _retainActionMapCapture: (): void => undefined,
        _refreshActionMapCapture: (): void => undefined,
        _releaseActionMapCapture: (): void => undefined,
        _actionSample: (): ActionSample => sample,
        _currentBatchSequence: (): number => sequence,
        _snapshotActionChannels: (): Float32Array => values.slice(),
      },
      scenes: {
        get _transitionGateOpen(): boolean {
          return false;
        },
      },
    } as unknown as Application;

    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => paused.value,
    );

    const gameplay = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const menu = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });

    inputs.attach(gameplay);
    // The menu scope only samples while the scene is paused, so it claims
    // nothing while gameplay is running.
    inputs.pushScope(new InputScope(menu), { when: 'paused' as never });

    values[Keyboard.Space] = 1;
    batches.push({ channels: [{ channel: Keyboard.Space, value: 1 }], sequence: ++sequence, timestamp: sequence });

    for (const host of hosts) {
      host._updateScopes(sample);
    }

    expect(gameplay.jump.active).toBe(true);
    expect(menu.confirm.active).toBe(false);
  });
});

describe('a map lives on exactly one level', () => {
  test('attaching a map that belongs to a scope is refused', () => {
    const h = createHarness();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    h.inputs.pushScope(new InputScope(map));

    expect(() => h.inputs.attach(map)).toThrow(/belongs to an InputScope/);
  });

  test('pushing a scope holding an already-attached map is refused', () => {
    const h = createHarness();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    h.inputs.attach(map);

    expect(() => h.inputs.pushScope(new InputScope(map))).toThrow(/already attached directly/);
  });

  test('a map freed from its scope can be attached directly afterwards', () => {
    const h = createHarness();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const scope = new InputScope(map);

    h.inputs.pushScope(scope);
    h.inputs.popScope(scope);
    scope.remove(map);

    expect(() => h.inputs.attach(map)).not.toThrow();
  });
});
