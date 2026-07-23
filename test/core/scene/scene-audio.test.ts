import type { Pausable, Playable, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import { SceneAudio } from '#core/scene/SceneAudio';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';

const makeVoice = (overrides: Partial<Voice> = {}): Voice =>
  ({
    stop: vi.fn(),
    ended: false,
    onEnd: new Signal(),
    ...overrides,
  }) as unknown as Voice;

const makePausableVoice = (overrides: Partial<Voice & Pausable> = {}): Voice & Pausable =>
  ({
    stop: vi.fn(),
    ended: false,
    paused: false,
    pause: vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    }),
    resume: vi.fn(function (this: { paused: boolean }) {
      this.paused = false;
    }),
    ...overrides,
  }) as unknown as Voice & Pausable;

const createAppStub = (playResult: Voice): Application =>
  ({
    audio: {
      play: vi.fn(() => playResult),
    },
  }) as unknown as Application;

const fakePlayable = {} as unknown as Playable;

describe('SceneAudio', () => {
  test('play() delegates to app.audio.play and tracks the returned Voice', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Active);

    const result = audio.play(fakePlayable, { volume: 0.5 });

    expect(app.audio.play).toHaveBeenCalledWith(fakePlayable, { volume: 0.5 });
    expect(result).toBe(voice);
  });

  test('add() tracks an already-created Voice and returns it unchanged', () => {
    const app = createAppStub(makeVoice());
    const audio = new SceneAudio(app, () => SceneState.Active);
    const externalVoice = makeVoice();

    expect(audio.add(externalVoice)).toBe(externalVoice);
  });

  test('destroy() stops every tracked voice', () => {
    const voiceA = makeVoice();
    const voiceB = makeVoice();
    const app = createAppStub(voiceA);
    const audio = new SceneAudio(app, () => SceneState.Active);

    audio.play(fakePlayable);
    audio.add(voiceB);

    audio.destroy();

    expect(voiceA.stop).toHaveBeenCalledTimes(1);
    expect(voiceB.stop).toHaveBeenCalledTimes(1);
  });

  describe('suspend()/restore()', () => {
    test('pauses currently-playing Pausable voices and restores exactly that set', () => {
      const playing = makePausableVoice();
      const alreadyPaused = makePausableVoice({ paused: true });
      const ended = makePausableVoice({ ended: true });
      const app = createAppStub(playing);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(playing);
      audio.add(alreadyPaused);
      audio.add(ended);

      audio.suspend();

      expect(playing.pause).toHaveBeenCalledTimes(1);
      expect(alreadyPaused.pause).not.toHaveBeenCalled(); // already paused — not part of the suspended set
      expect(ended.pause).not.toHaveBeenCalled(); // ended — nothing to pause

      audio.restore();

      expect(playing.resume).toHaveBeenCalledTimes(1);
      expect(alreadyPaused.resume).not.toHaveBeenCalled(); // was never suspended by us
      expect(ended.resume).not.toHaveBeenCalled();
    });

    test('leaves a non-Pausable voice playing (suspended "where supported")', () => {
      const nonPausable = makeVoice(); // no pause()/resume()
      const app = createAppStub(nonPausable);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(nonPausable);

      expect(() => audio.suspend()).not.toThrow();
      expect(() => audio.restore()).not.toThrow();
    });

    test('restore() without a prior suspend() is a no-op', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice);

      expect(() => audio.restore()).not.toThrow();
      expect(voice.resume).not.toHaveBeenCalled();
    });
  });

  describe('pause()/resume() — when policy', () => {
    test('when:"active" voice is frozen on pause() and resumed on resume()', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice, { when: 'active' });

      audio.pause();
      expect(voice.pause).toHaveBeenCalledTimes(1);

      audio.resume();
      expect(voice.resume).toHaveBeenCalledTimes(1);
    });

    test('when:"paused" voice (already sitting paused) is woken on pause() and re-frozen on resume()', () => {
      const voice = makePausableVoice({ paused: true });
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice, { when: 'paused' });

      audio.pause();
      expect(voice.resume).toHaveBeenCalledTimes(1);

      audio.resume();
      expect(voice.pause).toHaveBeenCalledTimes(1);
    });

    test('when:"always" (default) voice is never touched by pause()/resume()', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice);

      audio.pause();
      audio.resume();

      expect(voice.pause).not.toHaveBeenCalled();
      expect(voice.resume).not.toHaveBeenCalled();
    });

    test('a non-Pausable voice with when:"active" is left alone, no error', () => {
      const voice = makeVoice(); // no pause()/resume()
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice, { when: 'active' });

      expect(() => audio.pause()).not.toThrow();
      expect(() => audio.resume()).not.toThrow();
    });

    test('resume() does not resume a when:"active" voice the caller resumed manually in between', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice, { when: 'active' });

      audio.pause(); // freezes it, records it
      voice.resume(); // caller manually resumes it themselves before the scene resumes
      (voice.resume as ReturnType<typeof vi.fn>).mockClear();

      audio.resume(); // should NOT re-touch it — it's no longer paused

      expect(voice.resume).not.toHaveBeenCalled();
    });
  });
});

describe('SceneAudio — Preparing gate', () => {
  test('play() during Preparing does not call app.audio.play yet', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    audio.play(fakePlayable);

    expect(app.audio.play).not.toHaveBeenCalled();
  });

  test('play() during Preparing returns a Voice-shaped stand-in synchronously', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable);

    expect(pending.ended).toBe(false);
    expect(typeof pending.stop).toBe('function');
    expect(typeof pending.fade).toBe('function');
  });

  test('_flushPending() starts every voice queued during Preparing, applying buffered volume', () => {
    const voice = makeVoice({ volume: 1 });
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable, { volume: 0.5 });
    pending.volume = 0.3;

    audio._flushPending();

    expect(app.audio.play).toHaveBeenCalledTimes(1);
    expect(voice.volume).toBe(0.3);
  });

  test('stop() before flush cancels playback — the real voice is never created', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable);
    pending.stop();
    audio._flushPending();

    expect(app.audio.play).not.toHaveBeenCalled();
    expect(pending.ended).toBe(true);
  });

  test('stop() before flush fires onEnd exactly once', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);
    const pending = audio.play(fakePlayable);
    const onEnd = vi.fn();

    pending.onEnd.add(onEnd);
    pending.stop();
    pending.stop();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('play() once Active bypasses the gate entirely', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Active);

    const result = audio.play(fakePlayable);

    expect(app.audio.play).toHaveBeenCalledTimes(1);
    expect(result).toBe(voice);
  });

  test('destroy() cancels any still-pending (never-flushed) voice', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable);
    audio.destroy();

    expect(pending.ended).toBe(true);
    expect(app.audio.play).not.toHaveBeenCalled();
  });

  test('_flushPending() swaps the tracked PendingVoice for its real voice, so suspend() can pause it', () => {
    const real = makePausableVoice({ onEnd: new Signal() });
    const app = createAppStub(real);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    audio.play(fakePlayable);
    audio._flushPending();
    audio.suspend();

    expect(real.pause).toHaveBeenCalledTimes(1);
  });

  test('_flushPending() carries the `when` policy from the PendingVoice to the real voice', () => {
    const real = makePausableVoice({ onEnd: new Signal() });
    const app = createAppStub(real);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    audio.play(fakePlayable, { when: 'active' });
    audio._flushPending();

    // If the `when` policy were lost during the flush swap, pause() would
    // never touch the real voice — asserting it does proves the policy
    // survived the PendingVoice -> real Voice swap.
    audio.pause();

    expect(real.pause).toHaveBeenCalledTimes(1);
  });
});

describe('SceneAudio — dormancy gate widens to Ready/Suspended, rejects Destroying/Destroyed', () => {
  test('play() during Ready buffers a PendingVoice, same as Preparing', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Ready);

    const pending = audio.play(fakePlayable);

    expect(app.audio.play).not.toHaveBeenCalled();
    expect(pending.ended).toBe(false);
  });

  test('play() during Suspended buffers a PendingVoice (a new registration while already dormant, not just Preparing/Ready)', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Suspended);

    const pending = audio.play(fakePlayable);

    expect(app.audio.play).not.toHaveBeenCalled();
    expect(pending.ended).toBe(false);
  });

  test('_flushPending() started during Suspended starts for real once flushed', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Suspended);

    audio.play(fakePlayable);
    audio._flushPending();

    expect(app.audio.play).toHaveBeenCalledTimes(1);
  });

  test('play() during Destroying, in dev builds, throws a lifecycle error and never buffers or plays', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Destroying);

    expect(() => audio.play(fakePlayable)).toThrow(/destroy/i);
    expect(app.audio.play).not.toHaveBeenCalled();
  });

  test('play() during Destroyed, in dev builds, throws a lifecycle error', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Destroyed);

    expect(() => audio.play(fakePlayable)).toThrow(/destroy/i);
  });
});
