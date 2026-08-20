import type { Application } from '#core/Application';
import { SceneInputs } from '#core/scene/SceneInputs';
import { SceneAvailability } from '#core/SceneAvailability';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import type { ActionSample, ChannelEventBatch } from '#input/actions/types';
import type { InputBinding } from '#input/InputBinding';
import type { ActionScopeHost } from '#input/InputManager';
import { ChannelSize, Keyboard } from '#input/types';

/** A zeroed sample with a mutable `frameId`/`timestamp`, for tests that only need a valid shape. */
const createEmptySample = (): ActionSample => ({
  values: new Float32Array(ChannelSize.Container),
  batches: [],
  frameId: 1,
  timestamp: 0,
});

/**
 * Write `value` to `channel` on `sample`, also logging it as its own atomic
 * `ChannelEventBatch` - mirrors what `InputManager._recordChannelChanges`
 * does for a single-channel real write. A bare `sample.values[channel] =
 * value` is not enough: `ButtonAction._update` replays `sample.batches`, not
 * `values`, to detect its threshold-crossing edges in true order.
 */
let nextSequence = 1;
const setChannel = (sample: ActionSample, channel: number, value: number): void => {
  sample.values[channel] = value;
  const sequence = nextSequence++;
  (sample.batches as ChannelEventBatch[]).push({ channels: [{ channel, value }], sequence, timestamp: sequence });
};

/** Close the frame on `sample` - clears its batch log and bumps `frameId`, mirroring `InputManager.update()`. */
const advanceFrame = (sample: ActionSample): void => {
  (sample.batches as ChannelEventBatch[]).length = 0;
  sample.frameId++;
};

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
   * which factory the caller used - so every stub binding's full four-signal
   * surface lives here, not split across per-kind arrays.
   */
  bindings: StubBinding[];
  transitionGateOpen: { value: boolean };
}

/**
 * Stubs `app.input.onStart` to hand back a fresh stub binding whose four
 * Signals the test drives directly (mirroring how the real InputBinding
 * dispatches onStart/onActive/onStop/onTrigger from raw channel samples) -
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
  test('the state-reader and paused-reader callbacks are not called during construction (lazy)', () => {
    const { app } = createAppStub();
    const getState = vi.fn(() => SceneState.Active);
    const getPaused = vi.fn(() => false);

    new SceneInputs(app, getState, getPaused);

    expect(getState).not.toHaveBeenCalled();
    expect(getPaused).not.toHaveBeenCalled();
  });

  test('every SceneInputs.onXxx() call constructs exactly one underlying binding via a single app.input.onStart call', () => {
    const { app } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );

    inputs.onTrigger(1, () => undefined);

    expect(app.input.onStart).toHaveBeenCalledTimes(1);
    expect(app.input.onActive).not.toHaveBeenCalled();
    expect(app.input.onStop).not.toHaveBeenCalled();
    expect(app.input.onTrigger).not.toHaveBeenCalled();
  });
});

describe('SceneInputs — when policy availability matrix', () => {
  test.each([
    ['active', SceneState.Active, false, true],
    ['active', SceneState.Active, true, false],
    ['paused', SceneState.Active, false, false],
    ['paused', SceneState.Active, true, true],
    ['always', SceneState.Active, false, true],
    ['always', SceneState.Active, true, true],
    ['active', SceneState.Preparing, false, false],
    ['always', SceneState.Preparing, false, false],
    ['active', SceneState.Ready, false, false],
    ['always', SceneState.Ready, false, false],
    ['active', SceneState.Suspended, false, false],
    ['always', SceneState.Suspended, false, false],
  ] as const)('when: "%s" at state %s, paused %s allows onActive dispatch: %s', (when, state, paused, expected) => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => state,
      () => paused,
    );
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when });

    // Real InputBinding always fires onStart before onActive on the same
    // hold - prime the edge state the same way before asserting.
    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onActive.dispatch(1);

    expect(onActive).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  test('when option defaults to "active" and is stripped before forwarding to app.input', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => true,
    );
    const onStart = vi.fn();

    inputs.onStart(1, onStart, { when: SceneAvailability.Active, threshold: 500 });

    // The `when` key must never reach app.input - only InputBindingOptions fields do.
    expect(app.input.onStart).toHaveBeenCalledWith(1, expect.any(Function), { threshold: 500 });

    bindings[0]!.onStart.dispatch(1);
    expect(onStart).not.toHaveBeenCalled(); // paused, when: SceneAvailability.Active -> disallowed
  });

  test('the transition gate suppresses dispatch even for when: "always"', () => {
    const { app, bindings, transitionGateOpen } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: SceneAvailability.Always });
    bindings[0]!.onStart.dispatch(1);
    transitionGateOpen.value = true;

    bindings[0]!.onActive.dispatch(1);

    expect(onActive).not.toHaveBeenCalled();
  });
});

describe('SceneInputs — edge rules', () => {
  test('press while unpaused, release while paused: no trigger', () => {
    let currentPaused = false;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => currentPaused,
    );
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: SceneAvailability.Active });

    bindings[0]!.onStart.dispatch(1);

    currentPaused = true;

    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  test('press while paused (when: "active"), resume, release while unpaused: no trigger (press edge was disallowed)', () => {
    let currentPaused = true;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => currentPaused,
    );
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: SceneAvailability.Active });

    bindings[0]!.onStart.dispatch(1); // press edge disallowed

    currentPaused = false;
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled(); // press edge never primed
  });

  test('press while unpaused, pause mid-hold before release: no trigger (reset on the first disallowed onActive tick), even if resumed before release', () => {
    let currentPaused = false;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => currentPaused,
    );
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: SceneAvailability.Active });

    bindings[0]!.onStart.dispatch(1);

    currentPaused = true;
    bindings[0]!.onActive.dispatch(1); // one held-tick while paused -> primed resets

    currentPaused = false; // resumes before release
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).not.toHaveBeenCalled(); // primed was already reset; resuming doesn't re-arm it
  });

  test('press and release both while unpaused: onTrigger fires normally', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );
    const onTrigger = vi.fn();

    inputs.onTrigger(1, onTrigger, { when: SceneAvailability.Active });

    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onStop.dispatch(0);
    bindings[0]!.onTrigger.dispatch(0);

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  test('onStop fires when both press and release are in an allowed state', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );
    const onStop = vi.fn();

    inputs.onStop(1, onStop, { when: SceneAvailability.Active });

    bindings[0]!.onStart.dispatch(1);
    bindings[0]!.onStop.dispatch(0);

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('a binding with no when option behaves exactly like "active" (the default)', () => {
    let currentPaused = true;
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => currentPaused,
    );
    const onStart = vi.fn();

    inputs.onStart(1, onStart);

    bindings[0]!.onStart.dispatch(1);
    expect(onStart).not.toHaveBeenCalled();

    currentPaused = false;
    bindings[0]!.onStart.dispatch(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('SceneInputs — suspend()/resume()', () => {
  test('suspend() disables dispatch regardless of when', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: SceneAvailability.Always });
    bindings[0]!.onStart.dispatch(1);

    inputs.suspend();
    bindings[0]!.onActive.dispatch(1);
    expect(onActive).not.toHaveBeenCalled();
  });

  test('resume() restores dispatch for a fresh press/release cycle', () => {
    const { app, bindings } = createAppStub();
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );
    const onActive = vi.fn();

    inputs.onActive(1, onActive, { when: SceneAvailability.Always });
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
    const inputs = new SceneInputs(
      app,
      () => SceneState.Active,
      () => false,
    );

    inputs.onStart(1, () => undefined);
    inputs.onTrigger(1, () => undefined);

    inputs.destroy();

    expect(bindings[0]!.unbind).toHaveBeenCalledTimes(1);
    expect(bindings[1]!.unbind).toHaveBeenCalledTimes(1);
  });
});

describe('SceneInputs action maps', () => {
  const createMapStub = (): { app: Application; frame: (sample: ActionSample) => void; resyncSample: ActionSample; inputs: SceneInputs } => {
    const hosts = new Set<ActionScopeHost>();
    // The sample `SceneInputs.resume` re-seeds its maps from - zeroed by
    // default, so a test that only cares about registration need not know
    // resume re-seeds at all, while one that cares can preload it.
    const resyncSample = createEmptySample();
    const app = {
      input: {
        _trackScopeHost: vi.fn((host: ActionScopeHost) => void hosts.add(host)),
        _detachScopeHost: vi.fn((host: ActionScopeHost) => void hosts.delete(host)),
        _detachActionMap: vi.fn(),
        _actionSample: vi.fn((): ActionSample => resyncSample),
        _currentBatchSequence: vi.fn((): number => 0),
        _snapshotActionChannels: vi.fn((): Float32Array => resyncSample.values.slice()),
      },
      scenes: {
        get _transitionGateOpen(): boolean {
          return false;
        },
      },
    } as unknown as Application;

    return {
      app,
      resyncSample,
      // One tick of the real input clock: every registered host samples its
      // own maps. A map that is not reachable from a registered host simply
      // does not update, which is what "tracked" means from the outside.
      frame: (sample: ActionSample): void => {
        for (const host of hosts) {
          host._updateScopes(sample);
        }
      },
      inputs: new SceneInputs(
        app,
        () => SceneState.Active,
        () => false,
      ),
    };
  };

  test('attaching a map registers it with the application input clock', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    expect(inputs.attach(map)).toBe(map);
    expect(map.attached).toBe(true);

    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(true);
  });

  test('suspend stops updates and clears action state', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(true);

    inputs.suspend();

    expect(map.jump.active).toBe(false);
    expect(map.jump.pressed).toBe(false);

    advanceFrame(sample);
    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(false);
  });

  test('resume re-registers the map', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    inputs.suspend();
    inputs.resume();

    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(true);
  });

  test('resume resyncs a still-held action instead of producing a synthetic press', () => {
    const { frame, inputs, resyncSample } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    setChannel(sample, Keyboard.Space, 1); // key goes down
    frame(sample);
    expect(map.jump.pressed).toBe(true);

    inputs.suspend(); // reset while suspended — the key is still physically held
    expect(map.jump.active).toBe(false);

    // The key was never released - resume() sees it still held through the
    // manager's live sample (mirrored here by resyncSample).
    resyncSample.values[Keyboard.Space] = 1;
    inputs.resume();

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false); // resync, not a fresh press
  });

  test('resume leaves a released action inactive, not resurrected', () => {
    const { frame, inputs, resyncSample } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    setChannel(sample, Keyboard.Space, 1);
    frame(sample);

    inputs.suspend(); // key is released while suspended
    resyncSample.values[Keyboard.Space] = 0;
    inputs.resume();

    expect(map.jump.active).toBe(false);
    expect(map.jump.pressed).toBe(false);
  });

  test('a map attached while suspended stays out of the update set until resume', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.suspend();
    inputs.attach(map);

    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(false);

    inputs.resume();
    advanceFrame(sample);
    frame(sample);
    expect(map.jump.active).toBe(true);
  });

  test('destroy detaches every tracked map', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    inputs.destroy();

    expect(map.attached).toBe(false);

    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(false);
  });

  test('detaching a map directly removes it from the scene facade too', () => {
    const { frame, inputs } = createMapStub();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    const sample = createEmptySample();

    inputs.attach(map);
    map.detach();

    setChannel(sample, Keyboard.Space, 1);
    frame(sample);
    expect(map.jump.active).toBe(false);

    // A later resume must not resurrect the detached map.
    inputs.resume();
    advanceFrame(sample);
    frame(sample);
    expect(map.jump.active).toBe(false);
  });
});

describe('SceneInputs action maps — availability policy (when)', () => {
  type Mode = 'active' | 'paused' | 'always';

  const modes: readonly Mode[] = ['active', 'paused', 'always'];

  interface AvailabilityStub {
    inputs: SceneInputs;
    state: { value: SceneState };
    paused: { value: boolean };
    transitionGateOpen: { value: boolean };
    /** Truth the next resync/attach-time snapshot should report as "currently held". */
    snapshot: Float32Array;
  }

  /**
   * Same shape as `createMapStub()` above, plus mutable `state`/`paused`/
   * `transitionGateOpen` controls and a `snapshot` a test can preload before
   * a resync/re-attach - the real-world "channel is still physically held"
   * truth `_snapshotActionChannels` would report.
   */
  const createAvailabilityStub = (): AvailabilityStub => {
    const state = { value: SceneState.Active };
    const paused = { value: false };
    const transitionGateOpen = { value: false };
    const snapshot = new Float32Array(ChannelSize.Container);
    const resyncSample = createEmptySample();
    const hosts = new Set<ActionScopeHost>();

    const app = {
      input: {
        _trackScopeHost: vi.fn((host: ActionScopeHost) => void hosts.add(host)),
        _detachScopeHost: vi.fn((host: ActionScopeHost) => void hosts.delete(host)),
        _detachActionMap: vi.fn(),
        _actionSample: vi.fn((): ActionSample => {
          resyncSample.values.set(snapshot);

          return resyncSample;
        }),
        // Mirrors the real InputManager's live monotonic counter: "now", not a
        // constant - a re-arm on regaining availability must exclude batches
        // already sitting in the log from before this exact moment (e.g. a
        // press/release that happened while disallowed), never replay them.
        _currentBatchSequence: vi.fn((): number => nextSequence - 1),
        _snapshotActionChannels: vi.fn((): Float32Array => snapshot.slice()),
      },
      scenes: {
        get _transitionGateOpen(): boolean {
          return transitionGateOpen.value;
        },
      },
    } as unknown as Application;

    const inputs = new SceneInputs(
      app,
      () => state.value,
      () => paused.value,
    );

    return { inputs, state, paused, transitionGateOpen, snapshot };
  };

  /**
   * Put `stub` into the allowed/disallowed condition for `mode` via the
   * `SceneState`/`paused` axes alone - independent of `suspend()` and the
   * transition gate, which have their own dedicated situations below.
   * `'always'` never reacts to `paused`, so its only lever is a gated state.
   */
  const setAllowed = (stub: AvailabilityStub, mode: Mode, allowed: boolean): void => {
    if (mode === 'always') {
      stub.state.value = allowed ? SceneState.Active : SceneState.Preparing;
      stub.paused.value = false;

      return;
    }

    stub.state.value = SceneState.Active;
    stub.paused.value = mode === 'active' ? !allowed : allowed;
  };

  describe.each(modes)('when: "%s"', mode => {
    test('initial state: samples immediately when attached already-allowed', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(true);
    });

    test('initial state: stays inert when attached already-disallowed', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, false);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);

      expect(map.jump.active).toBe(false);
      expect(map.jump.pressed).toBe(false);
    });

    test('pause and resume toggle availability per the when policy, with no synthetic press on either transition', () => {
      const stub = createAvailabilityStub();
      stub.state.value = SceneState.Active;
      stub.paused.value = false;

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);

      const activeWhileUnpaused = mode !== 'paused';

      expect(map.jump.active).toBe(activeWhileUnpaused);

      advanceFrame(sample); // pause happens on a later real frame, not mid-batch
      stub.paused.value = true;
      stub.snapshot[Keyboard.Space] = 1; // still physically held across the transition
      map._update(sample);

      const activeWhilePaused = mode !== 'active';

      expect(map.jump.active).toBe(activeWhilePaused);
      expect(map.jump.pressed).toBe(false); // never a synthetic press from the toggle alone

      advanceFrame(sample); // resume happens on a later real frame too
      stub.paused.value = false;
      map._update(sample);

      expect(map.jump.active).toBe(activeWhileUnpaused);
      expect(map.jump.pressed).toBe(false);
    });

    test('the transition gate suppresses sampling regardless of when, and resyncs once closed', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);
      expect(map.jump.active).toBe(true);

      stub.transitionGateOpen.value = true;
      map._update(sample);
      expect(map.jump.active).toBe(false); // suppressed even for 'always'

      stub.transitionGateOpen.value = false;
      stub.snapshot[Keyboard.Space] = 1; // still physically held while the gate was open
      map._update(sample);

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false); // resync, not a synthetic press
    });

    test('a suspended scene stays inert regardless of when, and resume() resyncs a still-held key without a synthetic press', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);
      expect(map.jump.active).toBe(true);

      stub.inputs.suspend();

      // Defense in depth: even a direct _update call while the facade
      // considers itself suspended must stay inert, independent of `when`
      // (suspend() itself already stops tracking and resets the map, but the
      // availability predicate itself also gates on `_suspended`).
      map._update(sample);
      expect(map.jump.active).toBe(false);

      stub.snapshot[Keyboard.Space] = 1; // still physically held across the suspend
      stub.inputs.resume();

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false); // resync, not a synthetic press
    });

    test('held before enable: becoming allowed reports the key as already active, never a synthetic press', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, false);
      stub.snapshot[Keyboard.Space] = 1; // physically held from before the map ever attached

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1); // mirrors the same physical hold in the sample buffer

      map._update(sample); // still disallowed -> stays inert
      expect(map.jump.active).toBe(false);
      expect(map.jump.pressed).toBe(false);

      setAllowed(stub, mode, true);
      map._update(sample);

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false); // baseline from the snapshot, not a synthetic edge
    });

    test('pressed while disabled: enabling later does not surface a delayed press', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, false);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      map._update(sample); // establishes the inert baseline while disallowed

      setChannel(sample, Keyboard.Space, 1); // pressed while still disallowed
      map._update(sample);
      expect(map.jump.active).toBe(false); // never sampled

      stub.snapshot[Keyboard.Space] = 1; // true state at the moment it becomes allowed: held
      setAllowed(stub, mode, true);
      map._update(sample);

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false); // no delayed press — a resync, not an edge
    });

    test('released while disabled: enabling later does not surface a delayed release', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);
      expect(map.jump.active).toBe(true); // active while allowed

      setAllowed(stub, mode, false);
      map._update(sample); // disabled -> forced reset now, regardless of the real channel state
      expect(map.jump.active).toBe(false);

      setChannel(sample, Keyboard.Space, 0); // released while still disabled
      map._update(sample);
      expect(map.jump.active).toBe(false); // no change, still not sampled

      stub.snapshot[Keyboard.Space] = 0; // true state at the moment it becomes allowed: released
      setAllowed(stub, mode, true);
      map._update(sample);

      expect(map.jump.active).toBe(false);
      expect(map.jump.pressed).toBe(false);
      expect(map.jump.released).toBe(false); // no delayed release — already inert since the disable
    });

    test('a permission change mid real-frame takes effect on the very next _update call, with no one-frame lag', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample(); // frameId never advances — one real frame throughout
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);
      expect(map.jump.active).toBe(true);

      setAllowed(stub, mode, false); // permission flips within the same frameId
      map._update(sample); // same sample object, same frameId
      expect(map.jump.active).toBe(false); // reacted immediately, not delayed to the next frame

      setAllowed(stub, mode, true);
      stub.snapshot[Keyboard.Space] = 1;
      map._update(sample); // still the same frameId

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false);
    });

    test('detach then reattach under the same when option re-baselines a still-held key with no synthetic press', () => {
      const stub = createAvailabilityStub();
      setAllowed(stub, mode, true);

      const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
      stub.inputs.attach(map, { when: mode });

      const sample = createEmptySample();
      setChannel(sample, Keyboard.Space, 1);
      map._update(sample);
      expect(map.jump.active).toBe(true);

      map.detach();
      expect(map.attached).toBe(false);

      // Still physically held across the detach/reattach gap.
      stub.snapshot[Keyboard.Space] = 1;
      stub.inputs.attach(map, { when: mode });

      const sample2 = createEmptySample();
      sample2.values[Keyboard.Space] = 1; // held, no fresh batch this time

      map._update(sample2);

      expect(map.jump.active).toBe(true);
      expect(map.jump.pressed).toBe(false); // reattach baselines, doesn't replay a synthetic press
    });
  });
});
