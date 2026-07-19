import type { Pausable, Playable, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import { SceneAudio } from '#core/scene/SceneAudio';

const makeVoice = (overrides: Partial<Voice> = {}): Voice =>
  ({
    stop: vi.fn(),
    ended: false,
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
    const audio = new SceneAudio(app);

    const result = audio.play(fakePlayable, { volume: 0.5 });

    expect(app.audio.play).toHaveBeenCalledWith(fakePlayable, { volume: 0.5 });
    expect(result).toBe(voice);
  });

  test('add() tracks an already-created Voice and returns it unchanged', () => {
    const app = createAppStub(makeVoice());
    const audio = new SceneAudio(app);
    const externalVoice = makeVoice();

    expect(audio.add(externalVoice)).toBe(externalVoice);
  });

  test('destroy() stops every tracked voice', () => {
    const voiceA = makeVoice();
    const voiceB = makeVoice();
    const app = createAppStub(voiceA);
    const audio = new SceneAudio(app);

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
      const audio = new SceneAudio(app);

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
      const audio = new SceneAudio(app);

      audio.add(nonPausable);

      expect(() => audio.suspend()).not.toThrow();
      expect(() => audio.resume()).not.toThrow();
    });

    test('resume() without a prior suspend() is a no-op', () => {
      const voice = makePausableVoice();
      const app = createAppStub(voice);
      const audio = new SceneAudio(app);

      audio.add(voice);

      expect(() => audio.resume()).not.toThrow();
      expect(voice.resume).not.toHaveBeenCalled();
    });
  });
});
