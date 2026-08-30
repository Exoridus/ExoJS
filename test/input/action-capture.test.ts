/**
 * Browser-default capture for controls reached through an `ActionMap`.
 *
 * The system suppresses a keyboard default for exactly those channels
 * something has bound, tracked as a refcount so two owners of one key release
 * it only when the last of them goes away. These tests pin that an action map
 * feeds that same ledger - directly attached, scene-attached, or inside an
 * `InputScope` - and that nothing a map does while detached reaches it.
 */

import type { Application } from '#core/Application';
import { SceneInputs } from '#core/scene/SceneInputs';
import { SceneState } from '#core/scene/SceneState';
import { ActionMap } from '#input/actions/ActionMap';
import { BindingProfile } from '#input/actions/BindingProfile';
import { ButtonAction } from '#input/actions/ButtonAction';
import { InputScope } from '#input/actions/InputScope';
import { InputSystem } from '#input/InputSystem';
import { Keyboard } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';

interface Harness {
  readonly input: InputSystem;
  /** A scene facade over the same system, for the scope and availability cases. */
  scene(state?: () => SceneState): SceneInputs;
  /** Dispatch a cancelable keydown and report whether the default was suppressed. */
  captured(code: string): boolean;
  destroy(): void;
}

const createHarness = (): Harness => {
  const canvas = document.createElement('canvas');

  canvas.width = 800;
  canvas.height = 600;

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    pixelRatio: 1,
    options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10 } },
    scenes: {
      get paused(): boolean {
        return false;
      },
      get _transitionGateOpen(): boolean {
        return false;
      },
    },
  } as unknown as { input: InputSystem } & Application;

  const input = new InputSystem(app);

  app.input = input;
  canvas.dispatchEvent(new FocusEvent('focus'));

  const scenes: SceneInputs[] = [];

  return {
    input,
    scene: (state = (): SceneState => SceneState.Active): SceneInputs => {
      const inputs = new SceneInputs(app, state, () => false);

      scenes.push(inputs);

      return inputs;
    },
    captured: (code: string): boolean => {
      const event = new KeyboardEvent('keydown', { code, cancelable: true });

      window.dispatchEvent(event);
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));

      return event.defaultPrevented;
    },
    destroy: (): void => {
      for (const inputs of scenes) {
        inputs.destroy();
      }

      input.destroy();
    },
  };
};

describe('ActionMap browser-default capture', () => {
  test('an attached map captures the keys its actions bind', () => {
    const h = createHarness();

    h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    expect(h.captured('Space')).toBe(true);

    h.destroy();
  });

  test('the arrow keys and the browser quick-find key are captured like any other', () => {
    const h = createHarness();

    h.input.attach(
      new ActionMap({
        up: new ButtonAction(Keyboard.Up),
        down: new ButtonAction(Keyboard.Down),
        find: new ButtonAction(Keyboard.QuestionMark),
      }),
    );

    expect(h.captured('ArrowUp')).toBe(true);
    expect(h.captured('ArrowDown')).toBe(true);
    expect(h.captured('Slash')).toBe(true);

    h.destroy();
  });

  test('a key nothing binds keeps its browser default', () => {
    const h = createHarness();

    h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    expect(h.captured('KeyQ')).toBe(false);

    h.destroy();
  });

  test('rebinding moves the capture off the old key and onto the new one', () => {
    const h = createHarness();
    const map = h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    map.rebind('jump', Keyboard.Up);

    expect(h.captured('Space')).toBe(false);
    expect(h.captured('ArrowUp')).toBe(true);

    h.destroy();
  });

  test('a binding profile moves capture with it, and restoring defaults moves it back', () => {
    const h = createHarness();
    const map = h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    map.applyProfile(new BindingProfile().set('jump', { kind: 'button', binding: ['keyboard.arrow-up'] }));

    expect(h.captured('Space')).toBe(false);
    expect(h.captured('ArrowUp')).toBe(true);

    map.applyProfile(null);

    expect(h.captured('ArrowUp')).toBe(false);
    expect(h.captured('Space')).toBe(true);

    h.destroy();
  });

  test('two maps on one key hold the capture until the last of them detaches', () => {
    const h = createHarness();
    const first = h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));
    const second = h.input.attach(new ActionMap({ confirm: new ButtonAction(Keyboard.Space) }));

    first.detach();
    expect(h.captured('Space')).toBe(true);

    second.detach();
    expect(h.captured('Space')).toBe(false);

    h.destroy();
  });

  test('detaching a map releases the keys it held', () => {
    const h = createHarness();
    const map = h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    map.detach();

    expect(h.captured('Space')).toBe(false);

    h.destroy();
  });

  test('a detached map may be rebound freely and only reaches the ledger on reattach', () => {
    const h = createHarness();
    const map = h.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    map.detach();
    map.rebind('jump', Keyboard.Up);

    expect(h.captured('Space')).toBe(false);
    expect(h.captured('ArrowUp')).toBe(false);

    h.input.attach(map);

    expect(h.captured('Space')).toBe(false);
    expect(h.captured('ArrowUp')).toBe(true);

    h.destroy();
  });

  test('a scene-attached map captures, and destroying the scene releases', () => {
    const h = createHarness();
    const inputs = h.scene();

    inputs.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));
    expect(h.captured('Space')).toBe(true);

    inputs.destroy();

    expect(h.captured('Space')).toBe(false);

    h.destroy();
  });

  test('a scope holds capture while pushed and leaves nothing behind when popped', () => {
    const h = createHarness();
    const inputs = h.scene();

    inputs.pushScope(new InputScope(new ActionMap({ confirm: new ButtonAction(Keyboard.Space) })));
    expect(h.captured('Space')).toBe(true);

    inputs.popScope();

    expect(h.captured('Space')).toBe(false);

    h.destroy();
  });

  test('capture follows binding lifetime, not whether the action is sampled this frame', () => {
    const h = createHarness();
    // The map stays attached while its availability policy stops it from
    // consuming anything, which must not disturb the ledger.
    const inputs = h.scene(() => SceneState.Suspended);

    inputs.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    expect(h.captured('Space')).toBe(true);

    h.destroy();
  });

  test('a direct InputBinding is unaffected', () => {
    const h = createHarness();
    const binding = h.input.onStart(Keyboard.Space, () => {});

    expect(h.captured('Space')).toBe(true);

    binding.unbind();

    expect(h.captured('Space')).toBe(false);

    h.destroy();
  });
});
