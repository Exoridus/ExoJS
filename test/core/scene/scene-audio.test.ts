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

  describe('suspend()/resume()', () => {
    test('pauses currently-playing Pausable voices and resumes exactly that set', () => {
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

      audio.resume();

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
      expect(() => audio.resume()).not.toThrow();
    });

    test('resume() without a prior suspend() is a no-op', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app, () => SceneState.Active);

      audio.add(voice);

      expect(() => audio.resume()).not.toThrow();
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
});
