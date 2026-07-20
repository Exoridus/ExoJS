import type { Application } from '#core/Application';
import { SceneTweens } from '#core/scene/SceneTweens';

const createAppStub = (createResult: unknown): Application =>
  ({
    tweens: {
      create: vi.fn(() => createResult),
      add: vi.fn(),
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

  describe('suspend()/resume()', () => {
    test('pauses currently-Active tweens and resumes exactly that set', () => {
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

      tweens.resume();

      expect(active.resume).toHaveBeenCalledTimes(1);
      expect(alreadyPaused.resume).not.toHaveBeenCalled(); // was never suspended by us
      expect(complete.resume).not.toHaveBeenCalled();
    });

    test('resume() without a prior suspend() is a no-op', () => {
      const tween = makeStubTween('active');
      const app = createAppStub(tween);
      const tweens = new SceneTweens(app);

      tweens.add(tween as never);

      expect(() => tweens.resume()).not.toThrow();
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

      tweens.resume();

      // The second suspend() overwrote the recorded set with an empty one
      // (the tween was already paused, so it didn't qualify) — resume()
      // therefore has nothing to resume. This matches SceneAudio's
      // "already paused — not part of the suspended set" behavior exactly.
      expect(tween.resume).not.toHaveBeenCalled();
    });
  });
});
