import type { Application } from '#core/Application';
import { SceneTweens } from '#core/scene/SceneTweens';

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
    const tweens = new SceneTweens(app);
    const target = {};

    const result = tweens.create(target);

    expect(app.tweens.create).toHaveBeenCalledWith(target);
    expect(result).toBe(tween);
  });

  test('add() tracks an already-created Tween via app.tweens.add', () => {
    const app = createAppStub(makeStubTween());
    const tweens = new SceneTweens(app);
    const external = makeStubTween();

    expect(tweens.add(external as never)).toBe(tweens);
    expect(app.tweens.add).toHaveBeenCalledWith(external);
  });

  test('destroy() stops every tracked tween', () => {
    const tweenA = makeStubTween();
    const tweenB = makeStubTween();
    const app = createAppStub(tweenA);
    const tweens = new SceneTweens(app);

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
      const tweens = new SceneTweens(app);

      const result = tweens.createSequencer();

      expect(app.tweens.createSequencer).toHaveBeenCalledTimes(1);
      expect(result).toBe(sequencer);
    });

    test('destroy() stops every tracked sequencer', () => {
      const sequencer = makeStubSequencer();
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app);

      tweens.createSequencer();
      tweens.destroy();

      expect(sequencer.stop).toHaveBeenCalledTimes(1);
    });

    test('suspend()/restore() covers tracked sequencers exactly like tweens', () => {
      const sequencer = makeStubSequencer('active');
      const app = createAppStub(makeStubTween(), sequencer);
      const tweens = new SceneTweens(app);

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
      const tweens = new SceneTweens(app);

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
      const tweens = new SceneTweens(app);

      tweens.add(tween as never);

      expect(() => tweens.restore()).not.toThrow();
      expect(tween.resume).not.toHaveBeenCalled();
    });

    test('a second suspend() call overwrites the tracked suspended set — an already-paused tween is not re-recorded', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app);

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
      const tweens = new SceneTweens(app);

      tweens.create({}, { when: 'active' });

      tweens.pause();
      expect(tween.pause).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(tween.resume).toHaveBeenCalledTimes(1);
    });

    test('when:"paused" tween (already sitting paused) is woken on pause() and re-frozen on resume()', () => {
      const tween = makeStubTween('paused');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app);

      tweens.add(tween as never, { when: 'paused' });

      tweens.pause();
      expect(tween.resume).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(tween.pause).toHaveBeenCalledTimes(1);
    });

    test('when:"always" (default) tween is never touched by pause()/resume()', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app);

      tweens.create({});

      tweens.pause();
      tweens.resume();

      expect(tween.pause).not.toHaveBeenCalled();
      expect(tween.resume).not.toHaveBeenCalled();
    });

    test('resume() does not resume a when:"active" tween the user paused manually in between', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app);

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
      const tweens = new SceneTweens(app);

      tweens.createSequencer({ when: 'active' });

      tweens.pause();
      expect(sequencer.pause).toHaveBeenCalledTimes(1);

      tweens.resume();
      expect(sequencer.resume).toHaveBeenCalledTimes(1);
    });
  });
});
