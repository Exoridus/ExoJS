import type { Application } from '#core/Application';
import { SceneInputs } from '#core/scene/SceneInputs';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { InputBinding } from '#input/InputBinding';

interface StubBinding {
  onStart: Signal<[number]>;
  onActive: Signal<[number]>;
  onStop: Signal<[number]>;
  onTrigger: Signal<[number]>;
  unbind: ReturnType<typeof vi.fn>;
}

const makeStubBinding = (): StubBinding => ({
  onStart: new Signal<[number]>(),
  onActive: new Signal<[number]>(),
  onStop: new Signal<[number]>(),
  onTrigger: new Signal<[number]>(),
  unbind: vi.fn(),
});

interface AppStubResult {
  app: Application;
  /**
   * One entry per `SceneInputs.onXxx()` call, in call order. `SceneInputs`
   * always constructs its underlying binding via a single `app.input.onStart`
   * anchor call (see `SceneInputs.ts`'s `_bind()` doc comment) regardless of
   * which factory the caller used — so every stub binding's full four-signal
   * surface lives here, not split across per-kind arrays.
   */
  bindings: StubBinding[];
  transitionGateOpen: { value: boolean };
}

/**
 * Stubs `app.input.onStart` to hand back a fresh stub binding whose four
 * Signals the test drives directly (mirroring how the real InputBinding
 * dispatches onStart/onActive/onStop/onTrigger from raw channel samples) —
 * and stubs `app.scenes._transitionGateOpen`. `onActive`/`onStop`/
 * `onTrigger` are also stubbed (returning a fresh, unrelated binding) purely
 * so a direct, incorrect `app.input.onActive(...)`-style call from a future
 * regression would be visible as a *second* binding rather than a crash.
 */
const createAppStub = (): AppStubResult => {
  const bindings: StubBinding[] = [];
  const transitionGateOpen = { value: false };

  const app = {
    input: {
      onStart: vi.fn((_channel: unknown, callback: (value: number) => void) => {
        const b = makeStubBinding();
        b.onStart.add(callback);
        bindings.push(b);
        return b as unknown as InputBinding;
      }),
      onActive: vi.fn(() => makeStubBinding() as unknown as InputBinding),
      onStop: vi.fn(() => makeStubBinding() as unknown as InputBinding),
      onTrigger: vi.fn(() => makeStubBinding() as unknown as InputBinding),
    },
    scenes: {
      get _transitionGateOpen(): boolean {
        return transitionGateOpen.value;
      },
    },
  } as unknown as Application;

  return { app, bindings, transitionGateOpen };
};

describe('SceneInputs construction', () => {
  test('the state-reader callback is not called during construction (lazy)', () => {
    const { app } = createAppStub();
    const getState = vi.fn(() => SceneState.Active);

    new SceneInputs(app, getState);

    expect(getState).not.toHaveBeenCalled();
  });

  test('every SceneInputs.onXxx() call constructs exactly one underlying binding via a single app.input.onStart call', () => {
    const { app } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);

    inputs.onTrigger(1, () => undefined);

    expect(app.input.onStart).toHaveBeenCalledTimes(1);
    expect(app.input.onActive).not.toHaveBeenCalled();
    expect(app.input.onStop).not.toHaveBeenCalled();
    expect(app.input.onTrigger).not.toHaveBeenCalled();
  });
});

describe('SceneInputs — when policy availability matrix', () => {
  test.each([
    ['active', SceneState.Active, true],
    ['active', SceneState.Paused, false],
    ['paused', SceneState.Active, false],
    ['paused', SceneState.Paused, true],
    ['always', SceneState.Active, true],
    ['always', SceneState.Paused, true],
    ['active', SceneState.Preparing, false],
    ['always', SceneState.Preparing, false],
    ['active', SceneState.Suspended, false],
    ['always', SceneState.Suspended, false],
  ] as const)('when: "%s" at state %s allows onActive dispatch: %s', (when, state, expected) => {
    const currentState = state;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => currentState);
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when });

    // Real InputBinding always fires onStart before onActive on the same
    // hold — prime the edge state the same way before asserting.
    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onActive.dispatch(1);

    expect(onActive).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  test('when option defaults to "active" and is stripped before forwarding to app.input', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Paused);
    const onStart = vi.fn();

    inputs.onStart(1, onStart, { when: 'active', threshold: 500 });

    // The `when` key must never reach app.input — only InputBindingOptions fields do.
    expect(app.input.onStart).toHaveBeenCalledWith(1, expect.any(Function), { threshold: 500 });

    bindings[0]!.onStart.dispatch(1);
    expect(onStart).not.toHaveBeenCalled(); // Paused, when: 'active' -> disallowed
  });

  test('the transition gate suppresses dispatch even for when: "always"', () => {
    const { app, bindings, transitionGateOpen } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: 'always' });
    bindings[0]!.onStart.dispatch(1);
    transitionGateOpen.value = true;

    bindings[0]!.onActive.dispatch(1);

    expect(onActive).not.toHaveBeenCalled();
  });
});

describe('SceneInputs — edge rules', () => {
  test('press while Active, release while Paused: no trigger', () => {
    let currentState: SceneState = SceneState.Active;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => currentState);
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: 'active' });

    bindings[0]!.onStart.dispatch(1);

    currentState = SceneState.Paused;

    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  test('press while Paused (when: "active"), resume, release while Active: no trigger (press edge was disallowed)', () => {
    let currentState: SceneState = SceneState.Paused;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => currentState);
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: 'active' });

    bindings[0]!.onStart.dispatch(1); // press edge disallowed

    currentState = SceneState.Active;
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled(); // press edge never primed
  });

  test('press while Active, pause mid-hold before release: no trigger (reset on the first disallowed onActive tick), even if resumed before release', () => {
    let currentState: SceneState = SceneState.Active;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => currentState);
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: 'active' });

    bindings[0]!.onStart.dispatch(1);

    currentState = SceneState.Paused;
    bindings[0]!.onActive.dispatch(1); // one held-tick while paused -> primed resets

    currentState = SceneState.Active; // resumes before release
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled(); // primed was already reset; resuming doesn't re-arm it
  });

  test('press and release both while Active: onTrigger fires normally', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: 'active' });

    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  test('onStop fires when both press and release are in an allowed state', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);
    const onStop = vi.fn();

    inputs.onStop(1, onStop, { when: 'active' });

    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onStop.dispatch(0);

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('a binding with no when option behaves exactly like "active" (the default)', () => {
    let currentState: SceneState = SceneState.Paused;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => currentState);
    const onStart = vi.fn();

    inputs.onStart(1, onStart);

    bindings[0]!.onStart.dispatch(1);
    expect(onStart).not.toHaveBeenCalled();

    currentState = SceneState.Active;
    bindings[0]!.onStart.dispatch(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('SceneInputs — suspend()/resume()', () => {
  test('suspend() disables dispatch regardless of when', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: 'always' });
    bindings[0]!.onStart.dispatch(1);

    inputs.suspend();
    bindings[0]!.onActive.dispatch(1);
    expect(onActive).not.toHaveBeenCalled();
  });

  test('resume() restores dispatch for a fresh press/release cycle', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: 'always' });
    inputs.suspend();
    inputs.resume();

    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onActive.dispatch(1);

    expect(onActive).toHaveBeenCalledTimes(1);
  });
});

describe('SceneInputs — destroy()', () => {
  test('unbinds every tracked binding', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(app, () => SceneState.Active);

    inputs.onStart(1, () => undefined);
    inputs.onTrigger(1, () => undefined);

    inputs.destroy();

    expect(bindings[0]!.unbind).toHaveBeenCalledTimes(1);
    expect(bindings[1]!.unbind).toHaveBeenCalledTimes(1);
  });
});
