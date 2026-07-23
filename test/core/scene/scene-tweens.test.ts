import { Tween } from '#animation/Tween';
import { TweenSequencer } from '#animation/TweenSequencer';
import type { Application } from '#core/Application';
import { SceneTweens } from '#core/scene/SceneTweens';
import { SceneState } from '#core/SceneState';

const createAppStub = (createResult: unknown, sequencerResult?: unknown): Application =>
  ({
    tweens: {
      create: vi.fn(() => createResult),
      add: vi.fn(),
      createSequencer: vi.fn(() => sequencerResult),
    },
  }) as unknown as Application;

interface StubTween {
  state: 'idle' | 'active' | 'paused' | 'complete' | 'stopped';
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const makeStubTween = (state: StubTween['state'] = 'active'): StubTween => ({
  state,
  pause: vi.fn(function (this: StubTween) {
    this.state = 'paused';
  }),
  resume: vi.fn(function (this: StubTween) {
    this.state = 'active';
  }),
  stop: vi.fn(function (this: StubTween) {
    this.state = 'stopped';
  }),
});

/** Mirrors `StubTween` — `TweenSequencerState` uses the same string values as `TweenState`. */
const makeStubSequencer = (state: StubTween['state'] = 'active'): StubTween => makeStubTween(state);

describe('SceneTweens', () => {
  test('create() delegates to app.tweens.create and tracks the returned Tween', () => {
    const tween = makeStubTween();
    const app = createAppStub(tween);
    const tweens = new SceneTweens(app, () => SceneState.Active);
    const target = {};

    const result = tweens.create(target);

    expect(app.tweens.create).toHaveBeenCalledWith(target);
    expect(result).toBe(tween);
  });

  test('add() tracks an already-created Tween via app.tweens.add', () => {
    const app = createAppStub(makeStubTween());
    const tweens = new SceneTweens(app, () => SceneState.Active);
    const external = makeStubTween();

    expect(tweens.add(external as never)).toBe(tweens);
    expect(app.tweens.add).toHaveBeenCalledWith(external);
  });

  test('destroy() stops every tracked tween', () => {
    const tweenA = makeStubTween();
    const tweenB = makeStubTween();
    const app = createAppStub(tweenA);
    const tweens = new SceneTweens(app, () => SceneState.Active);

    tweens.create({});
    tweens.add(tweenB as never);

    tweens.destroy();

    expect(tweenA.stop).toHaveBeenCalledTimes(1);
    expect(tweenB.stop).toHaveBeenCalledTimes(1);
  });

  describe('createSequencer()', () => {
    test('delegates to app.tweens.createSequencer and tracks the returned sequencer', () => {
      const sequencer = makeStubSequencer();
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      const result = tweens.createSequencer();

      expect(app.tweens.createSequencer).toHaveBeenCalledTimes(1);
      expect(result).toBe(sequencer);
    });

    test('destroy() stops every tracked sequencer', () => {
      const sequencer = makeStubSequencer();
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.createSequencer();
      tweens.destroy();

      expect(sequencer.stop).toHaveBeenCalledTimes(1);
    });

    test('suspend()/restore() covers tracked sequencers exactly like tweens', () => {
      const sequencer = makeStubSequencer('active');
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.createSequencer();

      tweens.suspend();
      expect(sequencer.pause).toHaveBeenCalledTimes(1);

      tweens.restore();
      expect(sequencer.resume).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspend()/restore()', () => {
    test('pauses currently-Active tweens and restores exactly that set', () => {
      const active = makeStubTween('active');
      const alreadyPaused = makeStubTween('paused');
      const complete = makeStubTween('complete');
      const app = createAppStub(active);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.create({});
      tweens.add(alreadyPaused as never);
      tweens.add(complete as never);

      tweens.suspend();

      expect(active.pause).toHaveBeenCalledTimes(1);
      expect(alreadyPaused.pause).not.toHaveBeenCalled(); // already paused — not part of the suspended set
      expect(complete.pause).not.toHaveBeenCalled(); // complete — nothing to pause

      tweens.restore();

      expect(active.resume).toHaveBeenCalledTimes(1);
      expect(alreadyPaused.resume).not.toHaveBeenCalled(); // was never suspended by us
      expect(complete.resume).not.toHaveBeenCalled();
    });

    test('restore() without a prior suspend() is a no-op', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.add(tween as never);

      expect(() => tweens.restore()).not.toThrow();
      expect(tween.resume).not.toHaveBeenCalled();
    });

    test('a second suspend() call overwrites the tracked suspended set — an already-paused tween is not re-recorded', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.add(tween as never);

      tweens.suspend(); // pauses it, records it as suspended-by-us
      tweens.suspend(); // tween is now 'paused' (not 'active') — the second call correctly excludes it

      expect(tween.pause).toHaveBeenCalledTimes(1);

      tweens.restore();

      // The second suspend() overwrote the recorded set with an empty one
      // (the tween was already paused, so it didn't qualify) — restore()
      // therefore has nothing to restore. This matches SceneAudio's
      // "already paused — not part of the suspended set" behavior exactly.
      expect(tween.resume).not.toHaveBeenCalled();
    });
  });

  describe('pause()/resume() — when policy', () => {
    test('when:"active" tween is frozen on pause() and resumed on resume()', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.create({}, { when: 'active' });

      tweens.pause();
      expect(tween.pause).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(tween.resume).toHaveBeenCalledTimes(1);
    });

    test('when:"paused" tween (already sitting paused) is woken on pause() and re-frozen on resume()', () => {
      const tween = makeStubTween('paused');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.add(tween as never, { when: 'paused' });

      tweens.pause();
      expect(tween.resume).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(tween.pause).toHaveBeenCalledTimes(1);
    });

    test('when:"always" (default) tween is never touched by pause()/resume()', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.create({});

      tweens.pause();
      tweens.resume();

      expect(tween.pause).not.toHaveBeenCalled();
      expect(tween.resume).not.toHaveBeenCalled();
    });

    test('resume() does not resume a when:"active" tween the user paused manually in between', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.create({}, { when: 'active' });

      tweens.pause(); // freezes it, records it
      tween.resume(); // user manually resumes it themselves before the scene resumes
      tween.resume.mockClear();

      tweens.resume(); // should NOT re-touch it — it's no longer Paused

      expect(tween.resume).not.toHaveBeenCalled();
    });

    test('covers sequencers exactly like tweens', () => {
      const sequencer = makeStubSequencer('active');
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app, () => SceneState.Active);

      tweens.createSequencer({ when: 'active' });

      tweens.pause();
      expect(sequencer.pause).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(sequencer.resume).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SceneTweens — dormancy (create/add/createSequencer while not Active)', () => {
  test('create() while Ready does not call app.tweens.create — the tween is never attached to the app-wide manager', () => {
    const app = createAppStub(makeStubTween());
    const tweens = new SceneTweens(app, () => SceneState.Ready);
    const target = { x: 0 };

    const tween = tweens.create(target);

    expect(app.tweens.create).not.toHaveBeenCalled();
    expect(tween).toBeInstanceOf(Tween);
  });

  test('a real Tween created and started while Ready produces no application-wide effect until activation', () => {
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);
    const target = { x: 0 };

    const tween = tweens.create(target).to({ x: 100 }, 1);

    tween.start();
    tween.update(0.5); // manual update — proves the app-wide manager never drives it

    // The real app-wide manager was never told about this tween at all.
    expect(app.tweens.add).not.toHaveBeenCalled();

    state = SceneState.Active;
    tweens.activate();

    expect(app.tweens.add).toHaveBeenCalledWith(tween);
  });

  test('activate() attaches every cold tween to the app-wide manager, in whatever state it is currently in', () => {
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);

    const idleTween = tweens.create({});

    state = SceneState.Active;
    tweens.activate();

    expect(app.tweens.add).toHaveBeenCalledWith(idleTween);
  });

  test('add() while Suspended pauses an already-Active tween immediately and resumes it on activate() only if still Paused', () => {
    const running = makeStubTween('active');
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Suspended;
    const tweens = new SceneTweens(app, () => state);

    tweens.add(running as never);

    expect(running.pause).toHaveBeenCalledTimes(1);

    state = SceneState.Active;
    tweens.activate();

    expect(running.resume).toHaveBeenCalledTimes(1);
  });

  test('add() while Suspended does not resume a tween the caller stopped in the meantime', () => {
    const running = makeStubTween('active');
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Suspended;
    const tweens = new SceneTweens(app, () => state);

    tweens.add(running as never);
    running.state = 'stopped'; // caller stopped it directly while still dormant

    state = SceneState.Active;
    tweens.activate();

    expect(running.resume).not.toHaveBeenCalled();
  });

  test('createSequencer() while Ready constructs without a manager — start() does not tick', () => {
    const sequencer = makeStubSequencer();
    const app = createAppStub(makeStubTween(), sequencer as never);
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);

    const created = tweens.createSequencer();

    expect(app.tweens.createSequencer).not.toHaveBeenCalled();
    expect(created).toBeInstanceOf(TweenSequencer);

    state = SceneState.Active;
    tweens.activate();
  });

  test('create()/add()/createSequencer() delegate immediately, as before, once Active', () => {
    const stubTween = makeStubTween();
    const stubSequencer = makeStubSequencer();
    const app = createAppStub(stubTween, stubSequencer as never);
    const tweens = new SceneTweens(app, () => SceneState.Active);

    tweens.create({});
    tweens.createSequencer();

    expect(app.tweens.create).toHaveBeenCalledTimes(1);
    expect(app.tweens.createSequencer).toHaveBeenCalledTimes(1);
  });
});
