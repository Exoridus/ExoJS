import { getAudioContext, onAudioContextReady } from '#audio/audioContext';
import { AudioGenerator } from '#audio/AudioGenerator';
import { AudioStream } from '#audio/AudioStream';
import { AudioSystem } from '#audio/AudioSystem';
import { Envelope } from '#audio/Envelope';
import type { Loopable, Pausable, Playable, RatePitched, Seekable, Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { logger } from '#core/Logger';
import { SceneAudio } from '#core/scene/SceneAudio';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import { Signal } from '#core/Signal';
import { Time } from '#core/units';

import { mutable } from '../../support/mutable';

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

/**
 * Scope state the real-voice specs drive by hand: each transition flips the
 * state or pause flag and lets the facility re-apply its holds, exactly as
 * SceneScope does.
 */
const scopeControl = () => {
  let state: SceneState = SceneState.Active;
  let paused = false;

  return {
    getState: (): SceneState => state,
    getPaused: (): boolean => paused,
    suspend: (audio: SceneAudio): void => {
      state = SceneState.Suspended;
      audio._sync();
    },
    restore: (audio: SceneAudio): void => {
      state = SceneState.Active;
      audio._sync();
    },
    pause: (audio: SceneAudio): void => {
      paused = true;
      audio._sync();
    },
    resume: (audio: SceneAudio): void => {
      paused = false;
      audio._sync();
    },
  };
};

/** Whether a real voice is actually silent - a scene hold included - rather than paused by its caller. */
const silent = (voice: Voice): boolean => {
  const real = (voice as unknown as { _real?: Voice | null })._real ?? voice;

  return (real as unknown as { _halted?: boolean; paused: boolean })._halted ?? (real as unknown as { paused: boolean }).paused;
};

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

  describe('holds', () => {
    interface HoldableVoice extends Voice, Pausable {
      _setHeld: ReturnType<typeof vi.fn>;
    }

    const makeHoldableVoice = (overrides: Partial<Voice & Pausable> = {}): HoldableVoice =>
      ({
        ...makePausableVoice(overrides),
        _setHeld: vi.fn(),
      }) as unknown as HoldableVoice;

    const lastHold = (voice: HoldableVoice): boolean | undefined => voice._setHeld.mock.lastCall?.[0] as boolean | undefined;

    const fixture = (): { audio: SceneAudio; setState(state: SceneState): void; setPaused(paused: boolean): void } => {
      let state: SceneState = SceneState.Active;
      let paused = false;

      return {
        audio: new SceneAudio(
          createAppStub(makeVoice()),
          () => state,
          () => paused,
        ),
        setState: next => {
          state = next;
        },
        setPaused: next => {
          paused = next;
        },
      };
    };

    test.each([
      [SceneAvailability.Always, false, false],
      [SceneAvailability.Always, true, false],
      [SceneAvailability.Active, false, false],
      [SceneAvailability.Active, true, true],
      [SceneAvailability.Paused, false, true],
      [SceneAvailability.Paused, true, false],
    ] as const)("'%s' with the scene paused=%s is held: %s, from the moment it is tracked", (when, paused, held) => {
      const { audio, setPaused } = fixture();
      const voice = makeHoldableVoice();

      setPaused(paused);
      audio.add(voice, { when });

      expect(lastHold(voice)).toBe(held);
    });

    test('_sync() re-applies every policy after a pause flip and never pauses or resumes a voice itself', () => {
      const { audio, setPaused } = fixture();
      const active = makeHoldableVoice();
      const paused = makeHoldableVoice();

      audio.add(active, { when: SceneAvailability.Active });
      audio.add(paused, { when: SceneAvailability.Paused });
      setPaused(true);
      audio._sync();

      expect(lastHold(active)).toBe(true);
      expect(lastHold(paused)).toBe(false);
      expect(active.pause).not.toHaveBeenCalled();
      expect(paused.resume).not.toHaveBeenCalled();
    });

    test.each([SceneState.Suspended, SceneState.Destroying] as const)(
      'every voice is held while the scope is %s, always included',
      state => {
        const { audio, setState } = fixture();
        const voice = makeHoldableVoice();

        audio.add(voice);
        setState(state);
        audio._sync();

        expect(lastHold(voice)).toBe(true);
      },
    );

    test('_sync() drops voices that have ended', () => {
      const { audio } = fixture();
      const voice = makeHoldableVoice();

      audio.add(voice, { when: SceneAvailability.Active });
      mutable(voice).ended = true;
      voice._setHeld.mockClear();
      audio._sync();

      expect(voice._setHeld).not.toHaveBeenCalled();
      expect((audio as unknown as { _tracked: Map<Voice, unknown> })._tracked.has(voice)).toBe(false);
    });

    test('a pausable voice the scene cannot hold warns that it will not follow the policy', () => {
      const { audio } = fixture();
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      audio.add(makePausableVoice(), { when: SceneAvailability.Active });

      expect(warn).toHaveBeenCalledTimes(1);
    });

    test('add() drops voices that have ended since they were tracked', () => {
      const { audio } = fixture();
      const finished = makeHoldableVoice();

      audio.add(finished);
      mutable(finished).ended = true;
      audio.add(makeHoldableVoice());

      expect((audio as unknown as { _tracked: Map<Voice, unknown> })._tracked.has(finished)).toBe(false);
    });

    test('a voice that cannot pause is left playing, without error', () => {
      const { audio, setPaused } = fixture();
      const voice = makeVoice();

      vi.spyOn(console, 'warn').mockImplementation(() => {});
      audio.add(voice, { when: SceneAvailability.Active });
      setPaused(true);

      expect(() => audio._sync()).not.toThrow();
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

  test('fade() before flush replays the ramp on the real voice instead of dropping its duration', () => {
    const voice = makeVoice({ volume: 1, fade: vi.fn() });
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable, { volume: 0.8 });
    pending.fade(0.2, Time.seconds(0.5));

    expect(pending.volume).toBe(0.2);

    audio._flushPending();

    expect(voice.volume).toBe(0.8);
    expect(voice.fade).toHaveBeenCalledWith(0.2, 0.5);
  });

  test('a second fade() before flush keeps the original starting volume', () => {
    const voice = makeVoice({ volume: 1, fade: vi.fn() });
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable, { volume: 0.9 });
    pending.fade(0.5, Time.seconds(0.1));
    pending.fade(0.1, Time.seconds(0.25));

    audio._flushPending();

    expect(voice.volume).toBe(0.9);
    expect(voice.fade).toHaveBeenCalledTimes(1);
    expect(voice.fade).toHaveBeenCalledWith(0.1, 0.25);
  });

  test('a volume write after fade() before flush supersedes the buffered ramp', () => {
    const voice = makeVoice({ volume: 1, fade: vi.fn() });
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Preparing);

    const pending = audio.play(fakePlayable, { volume: 0.9 });
    pending.fade(0.2, Time.seconds(0.4));
    pending.volume = 0.6;

    audio._flushPending();

    expect(voice.volume).toBe(0.6);
    expect(voice.fade).not.toHaveBeenCalled();
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

  test('_flushPending() swaps the tracked PendingVoice for its real voice, which _sync() then holds', () => {
    const real = { ...makePausableVoice({ onEnd: new Signal() }), _setHeld: vi.fn() } as unknown as Voice & {
      _setHeld: ReturnType<typeof vi.fn>;
    };
    const app = createAppStub(real);
    let state: SceneState = SceneState.Preparing;
    const audio = new SceneAudio(app, () => state);

    audio.play(fakePlayable);
    audio._flushPending();
    state = SceneState.Suspended;
    audio._sync();

    expect(real._setHeld).toHaveBeenLastCalledWith(true);
  });

  test('_flushPending() carries the `when` policy from the PendingVoice to the real voice', () => {
    const real = { ...makePausableVoice({ onEnd: new Signal() }), _setHeld: vi.fn() } as unknown as Voice & {
      _setHeld: ReturnType<typeof vi.fn>;
    };
    const app = createAppStub(real);
    let state: SceneState = SceneState.Preparing;
    let paused = false;
    const audio = new SceneAudio(
      app,
      () => state,
      () => paused,
    );

    audio.play(fakePlayable, { when: SceneAvailability.Active });
    audio._flushPending();
    state = SceneState.Active;
    audio._sync();

    expect(real._setHeld).toHaveBeenLastCalledWith(false);

    // A lost policy would read as 'always' and leave the voice released.
    paused = true;
    audio._sync();

    expect(real._setHeld).toHaveBeenLastCalledWith(true);
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

  // SceneAudio detects pausable voices by duck-typing `pause`/`resume`.
  // The mocks above satisfy that by construction, so they cannot catch a real
  // voice type that never implemented `Pausable` - which is exactly how every
  // `Sound` ambience kept playing through scene.pause()/suspend(). These two
  // drive a real AudioSystem and a real Sound.
  describe('with a real Sound voice', () => {
    let scope = scopeControl();

    beforeEach(() => {
      scope = scopeControl();
    });

    const makeRealSetup = (): { app: Application; sound: Sound; audio: SceneAudio } => {
      const system = new AudioSystem();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const app = { audio: system } as unknown as Application;

      return { app, sound, audio: new SceneAudio(app, scope.getState, scope.getPaused) };
    };

    test('suspend()/restore() pause and resume a Sound voice', () => {
      const { app, sound, audio } = makeRealSetup();
      const voice = audio.play(sound, { loop: true }) as Voice & Pausable;

      expect(silent(voice)).toBe(false);

      scope.suspend(audio);
      expect(silent(voice)).toBe(true);
      expect(voice.ended).toBe(false);

      scope.restore(audio);
      expect(silent(voice)).toBe(false);

      voice.stop();
      sound.destroy();
      app.audio.destroy();
    });

    // The two features interact: suspend() freezes a looping ambience, other
    // code keeps triggering the same Sound while the scene is dormant, and the
    // pool picks the frozen voice as its eviction victim (it looks oldest under
    // FIFO and closest-to-end under LRU, because its bookkeeping ages against
    // the running context clock). restore() then skips it - it is `ended`, not
    // `paused` - and the ambience is silently gone.
    test('a suspended ambience survives pool pressure and comes back on restore', () => {
      const system = new AudioSystem();
      const sound = new Sound({ duration: 10 } as AudioBuffer, { poolSize: 2 });
      const app = { audio: system } as unknown as Application;
      const audio = new SceneAudio(app, scope.getState, scope.getPaused);

      const ambience = audio.play(sound, { loop: true }) as Voice & Pausable;

      scope.suspend(audio);
      expect(silent(ambience)).toBe(true);

      for (let i = 0; i < 4; i++) {
        system.play(sound);
      }

      expect(ambience.ended).toBe(false);

      scope.restore(audio);
      expect(silent(ambience)).toBe(false);
      expect(ambience.ended).toBe(false);

      ambience.stop();
      sound.destroy();
      system.destroy();
    });

    test('pause()/resume() honour the `when: active` policy for a Sound voice', () => {
      const { app, sound, audio } = makeRealSetup();
      const voice = audio.play(sound, { loop: true, when: SceneAvailability.Active }) as Voice & Pausable;

      scope.pause(audio);
      expect(silent(voice)).toBe(true);

      scope.resume(audio);
      expect(silent(voice)).toBe(false);

      voice.stop();
      sound.destroy();
      app.audio.destroy();
    });
  });

  // Same failure class as the paused sound voice one level down: `AudioGeneratorVoice`
  // never implemented `Pausable`, so a held synth note kept sounding straight
  // through scene.pause()/suspend().
  describe('with a real AudioGenerator voice', () => {
    let scope = scopeControl();

    beforeEach(() => {
      scope = scopeControl();
    });

    const makeRealSetup = (envelope: Envelope | null = null): { app: Application; generator: AudioGenerator; audio: SceneAudio } => {
      const system = new AudioSystem();
      const generator = new AudioGenerator({ frequency: 440, envelope });
      const app = { audio: system } as unknown as Application;

      return { app, generator, audio: new SceneAudio(app, scope.getState, scope.getPaused) };
    };

    test('suspend()/restore() pause and resume a generator voice', () => {
      const { app, generator, audio } = makeRealSetup();
      const voice = audio.play(generator) as Voice & Pausable;

      expect(silent(voice)).toBe(false);

      scope.suspend(audio);
      expect(silent(voice)).toBe(true);
      expect(voice.ended).toBe(false);

      scope.restore(audio);
      expect(silent(voice)).toBe(false);
      expect(voice.ended).toBe(false);

      voice.stop();
      generator.destroy();
      app.audio.destroy();
    });

    test('pause() reaches a `when: active` generator voice, and resume() gives it back', () => {
      const { app, generator, audio } = makeRealSetup(new Envelope({ attack: Time.seconds(0.01), decay: Time.seconds(0.05) }));
      const voice = audio.play(generator, { when: SceneAvailability.Active }) as Voice & Pausable;

      scope.pause(audio);
      expect(silent(voice)).toBe(true);

      scope.resume(audio);
      expect(silent(voice)).toBe(false);
      expect(voice.ended).toBe(false);

      voice.stop();
      generator.destroy();
      app.audio.destroy();
    });

    test('destroy() stops a generator voice that is currently paused', () => {
      const { app, generator, audio } = makeRealSetup();
      const voice = audio.play(generator) as Voice & Pausable;

      scope.suspend(audio);
      expect(silent(voice)).toBe(true);

      audio.destroy();

      expect(voice.ended).toBe(true);

      generator.destroy();
      app.audio.destroy();
    });
  });
});

// A deferred voice has to answer for the voice it will become: the bus it will
// route into and the capability set of its source, from the moment play()
// returns until long after the scene activated - the caller never gets a
// second handle. These drive a real AudioSystem so the bus and capability
// sets come from the real assets, not from a mock shaped to match.
describe('SceneAudio — deferred voice surface', () => {
  type FullVoice = Voice & Seekable & Pausable & Loopable & RatePitched;
  type CapabilityName = 'seek' | 'pause' | 'resume' | 'loop' | 'playbackRate' | 'detune';

  const capabilityNames: readonly CapabilityName[] = ['seek', 'pause', 'resume', 'loop', 'playbackRate', 'detune'];

  const hasCapability = (voice: Voice, name: CapabilityName): boolean => name in voice;

  const asFull = (voice: Voice): FullVoice => {
    for (const name of capabilityNames) {
      expect({ [name]: hasCapability(voice, name) }).toEqual({ [name]: true });
    }

    return voice as FullVoice;
  };

  const createRealApp = (): { system: AudioSystem; app: Application } => {
    const system = new AudioSystem();

    return { system, app: { audio: system } as unknown as Application };
  };

  const createAudioElementStub = (): HTMLAudioElement => {
    const el = document.createElement('audio');
    Object.defineProperty(el, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: true });
    vi.spyOn(el, 'play').mockImplementation(function (this: HTMLAudioElement) {
      mutable(this).paused = false;

      return Promise.resolve();
    });
    vi.spyOn(el, 'pause').mockImplementation(function (this: HTMLAudioElement) {
      mutable(this).paused = true;
    });

    return el;
  };

  const setContextState = (state: AudioContextState): void => {
    mutable(getAudioContext()).state = state;
  };

  afterEach(() => {
    setContextState('running');
    vi.restoreAllMocks();
  });

  describe('Sound', () => {
    test('bus resolves to the default sound bus from the moment play() returns', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = audio.play(sound);

      expect(voice.bus).toBe(system.sound);

      audio._flushPending();

      expect(voice.bus).toBe(system.sound);

      voice.stop();
      sound.destroy();
      system.destroy();
    });

    test('the returned handle carries the SoundVoice capabilities before and after the flush', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer, { loop: true });
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(sound, { playbackRate: 1.5 }));

      expect(voice.paused).toBe(false);
      expect(voice.time).toBe(0);
      expect(voice.duration).toBe(10);
      expect(voice.loop).toBe(true);
      expect(voice.playbackRate).toBe(1.5);

      audio._flushPending();

      asFull(voice);
      voice.pause();
      expect(voice.paused).toBe(true);
      voice.seek(4);
      expect(voice.time).toBe(4);
      voice.resume();
      expect(voice.paused).toBe(false);
      expect(voice.ended).toBe(false);

      voice.stop();
      expect(voice.ended).toBe(true);

      sound.destroy();
      system.destroy();
    });

    test('pause() before the flush starts the real voice paused; resume() then starts it', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(sound));

      voice.pause();
      expect(voice.paused).toBe(true);

      audio._flushPending();

      expect(voice.paused).toBe(true);
      expect(voice.ended).toBe(false);

      voice.resume();
      expect(voice.paused).toBe(false);

      voice.stop();
      sound.destroy();
      system.destroy();
    });

    test('pause() then resume() before the flush starts the voice playing', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(sound));

      voice.pause();
      voice.resume();
      audio._flushPending();

      expect(voice.paused).toBe(false);

      voice.stop();
      sound.destroy();
      system.destroy();
    });

    test('seek(), loop and rate writes before the flush become the real voice start state', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);
      const playSpy = vi.spyOn(system, 'play');

      const voice = asFull(audio.play(sound, { volume: 0.5 }));

      voice.seek(3);
      voice.loop = true;
      voice.playbackRate = 2;
      voice.detune = 100;
      expect(voice.time).toBe(3);

      audio._flushPending();

      expect(playSpy).toHaveBeenCalledWith(sound, expect.objectContaining({ volume: 0.5, time: 3 }));
      expect(voice.time).toBe(3);
      expect(voice.loop).toBe(true);
      expect(voice.playbackRate).toBe(2);
      expect(voice.detune).toBe(100);

      voice.stop();
      sound.destroy();
      system.destroy();
    });

    test('stop() before the flush prevents the late start', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);
      const playSpy = vi.spyOn(system, 'play');

      const voice = asFull(audio.play(sound));

      voice.pause();
      voice.stop();
      audio._flushPending();

      expect(playSpy).not.toHaveBeenCalled();
      expect(voice.ended).toBe(true);

      // Controls on a cancelled voice are inert, like on any ended voice.
      voice.resume();
      voice.seek(2);
      expect(playSpy).not.toHaveBeenCalled();

      sound.destroy();
      system.destroy();
    });

    test('a flushed deferred voice is part of the retention set', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const scope = scopeControl();
      const audio = new SceneAudio(app, scope.getState, scope.getPaused);

      const voice = asFull(audio.play(sound));

      audio._flushPending();
      scope.suspend(audio);
      expect(silent(voice)).toBe(true);

      scope.restore(audio);
      expect(silent(voice)).toBe(false);

      voice.stop();
      sound.destroy();
      system.destroy();
    });
  });

  describe('AudioStream', () => {
    test('bus resolves to the default music bus from the moment play() returns', () => {
      const { system, app } = createRealApp();
      const stream = new AudioStream(createAudioElementStub());
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = audio.play(stream);

      expect(voice.bus).toBe(system.music);

      audio._flushPending();

      expect(voice.bus).toBe(system.music);

      stream.destroy();
      system.destroy();
    });

    test('the returned handle carries the stream capabilities before and after the flush', () => {
      const { system, app } = createRealApp();
      const el = createAudioElementStub();
      const stream = new AudioStream(el);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(stream));

      expect(voice.duration).toBe(30);

      audio._flushPending();

      asFull(voice);
      expect(voice.paused).toBe(false);
      voice.pause();
      expect(voice.paused).toBe(true);
      expect(el.pause).toHaveBeenCalled();
      voice.seek(12);
      expect(el.currentTime).toBe(12);
      voice.resume();
      expect(voice.paused).toBe(false);

      stream.destroy();
      system.destroy();
    });

    test('pause() before the flush leaves the stream paused at activation', () => {
      const { system, app } = createRealApp();
      const el = createAudioElementStub();
      const stream = new AudioStream(el);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(stream));

      voice.pause();
      voice.seek(5);
      audio._flushPending();

      expect(voice.paused).toBe(true);
      expect(el.currentTime).toBe(5);

      voice.resume();
      expect(voice.paused).toBe(false);

      stream.destroy();
      system.destroy();
    });

    test('stop() before the flush prevents the late start', () => {
      const { system, app } = createRealApp();
      const el = createAudioElementStub();
      const stream = new AudioStream(el);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = audio.play(stream);

      voice.stop();
      audio._flushPending();

      expect(el.play).not.toHaveBeenCalled();
      expect(voice.ended).toBe(true);

      stream.destroy();
      system.destroy();
    });
  });

  describe('AudioGenerator', () => {
    test('is pausable but never claims to seek or loop, before or after the flush', () => {
      const { system, app } = createRealApp();
      const generator = new AudioGenerator({ frequency: 440 });
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = audio.play(generator);

      expect(voice.bus).toBe(system.sound);
      expect(hasCapability(voice, 'pause')).toBe(true);
      expect(hasCapability(voice, 'detune')).toBe(true);
      expect(hasCapability(voice, 'seek')).toBe(false);
      expect(hasCapability(voice, 'loop')).toBe(false);

      (voice as Voice & Pausable).pause();
      audio._flushPending();

      expect(hasCapability(voice, 'seek')).toBe(false);
      expect(hasCapability(voice, 'loop')).toBe(false);
      expect((voice as Voice & Pausable).paused).toBe(true);

      voice.stop();
      generator.destroy();
      system.destroy();
    });
  });

  describe('a Playable that does not describe its voice', () => {
    test('reports the system sound bus and only the base Voice surface', () => {
      const { system, app } = createRealApp();
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = audio.play(fakePlayable);

      expect(voice.bus).toBe(system.sound);
      expect(hasCapability(voice, 'pause')).toBe(false);
      expect(hasCapability(voice, 'seek')).toBe(false);

      voice.stop();
      system.destroy();
    });
  });

  // The autoplay unlock gate belongs to AudioSystem and the assets, not to the
  // scene: a pending voice is flushed at activation whether or not audio is
  // unlocked, and whatever the gate does with that play call is what the caller
  // observes through the same handle.
  describe('activation while audio is still locked', () => {
    test('a pending Sound goes through the unlock gate once: it ends and is not re-deferred', () => {
      const { system, app } = createRealApp();
      const sound = new Sound({ duration: 10 } as AudioBuffer);
      const audio = new SceneAudio(app, () => SceneState.Preparing);
      const playSpy = vi.spyOn(system, 'play');
      const onEnd = vi.fn();

      const voice = asFull(audio.play(sound));

      voice.onEnd.add(onEnd);
      setContextState('suspended');
      audio._flushPending();

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(voice.ended).toBe(true);
      expect(onEnd).toHaveBeenCalledTimes(1);

      // An ended voice ignores controls instead of throwing for the missing capability.
      expect(() => {
        voice.pause();
        voice.resume();
        voice.seek(1);
      }).not.toThrow();

      setContextState('running');
      onAudioContextReady.dispatch(getAudioContext());

      expect(playSpy).toHaveBeenCalledTimes(1);

      sound.destroy();
      system.destroy();
    });

    test('a pending stream paused before activation stays paused through the unlock', () => {
      const { system, app } = createRealApp();
      const el = createAudioElementStub();
      const stream = new AudioStream(el);
      const audio = new SceneAudio(app, () => SceneState.Preparing);

      const voice = asFull(audio.play(stream));

      voice.pause();
      setContextState('suspended');
      audio._flushPending();

      setContextState('running');
      onAudioContextReady.dispatch(getAudioContext());

      expect(el.play).not.toHaveBeenCalled();
      expect(voice.paused).toBe(true);

      voice.resume();
      expect(el.play).toHaveBeenCalledTimes(1);

      stream.destroy();
      system.destroy();
    });
  });
});
