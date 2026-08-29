import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audio-context';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioSystem } from '#audio/AudioSystem';
import { Envelope } from '#audio/Envelope';

// ---------------------------------------------------------------------------
// Helpers - same oscillator/gain spies as audio-generator-voice.test.ts, plus a
// movable context clock (the envelope is scheduled against `currentTime`).
// ---------------------------------------------------------------------------

interface MockAudioParam {
  value: number;
  cancelScheduledValues: MockInstance;
  setValueAtTime: MockInstance;
  linearRampToValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
}

interface MockOscillatorNode {
  type: OscillatorType;
  frequency: MockAudioParam;
  detune: MockAudioParam;
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  onended: (() => void) | null;
}

interface MockGainNode {
  gain: MockAudioParam;
  connect: MockInstance;
  disconnect: MockInstance;
}

const makeMockAudioParam = (value = 0): MockAudioParam => ({
  value,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const createOscillatorMock = (): MockOscillatorNode => ({
  type: 'sine',
  frequency: makeMockAudioParam(440),
  detune: makeMockAudioParam(0),
  start: vi.fn(),
  stop: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  onended: null,
});

const createGainMock = (): MockGainNode => ({
  gain: makeMockAudioParam(1),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

/** Move the shared mock context's clock. `currentTime` is readonly on the real type. */
const setCurrentTime = (seconds: number): void => {
  (getAudioContext() as unknown as { currentTime: number }).currentTime = seconds;
};

interface Spy {
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
  restore: () => void;
}

/** Spy on createOscillator / createGain. Create the AudioSystem BEFORE calling this. */
const setupSpy = (): Spy => {
  const ctx = getAudioContext() as AudioContext & {
    createOscillator: () => OscillatorNode;
    createGain: () => GainNode;
  };

  const oscillators: MockOscillatorNode[] = [];
  const gains: MockGainNode[] = [];

  const oscillatorSpy = vi.spyOn(ctx, 'createOscillator').mockImplementation(() => {
    const node = createOscillatorMock();
    oscillators.push(node);
    return node as unknown as OscillatorNode;
  });

  const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    const node = createGainMock();
    gains.push(node);
    return node as unknown as GainNode;
  });

  return {
    oscillators,
    gains,
    restore: (): void => {
      oscillatorSpy.mockRestore();
      gainSpy.mockRestore();
    },
  };
};

/**
 * The voice's envelope gain. Two gains are created per play: the voice output
 * (in `AudioGenerator._createVoice`) and then the envelope gain (in the voice
 * constructor).
 */
const envelopeGainOf = (spy: Spy): MockGainNode => {
  expect(spy.gains.length).toBe(2);
  return spy.gains[1]!;
};

interface Setup {
  system: AudioSystem;
  generator: AudioGenerator;
  voice: AudioGeneratorVoice;
  spy: Spy;
  dispose: () => void;
}

const play = (options: { envelope?: Envelope; frequency?: number; detune?: number } = {}): Setup => {
  setCurrentTime(0);
  const system = new AudioSystem();
  const spy = setupSpy();
  const generator = new AudioGenerator({
    frequency: options.frequency ?? 440,
    detune: options.detune ?? 0,
    envelope: options.envelope ?? null,
  });
  const voice = system.play(generator) as AudioGeneratorVoice;

  return {
    system,
    generator,
    voice,
    spy,
    dispose: (): void => {
      spy.restore();
      generator.destroy();
      system.destroy();
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioGeneratorVoice — Pausable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setCurrentTime(0);
  });

  // ---- basic held voice ----

  test('a held voice reports paused and stops synthesizing when paused', () => {
    const { voice, spy, dispose } = play();

    expect(voice.paused).toBe(false);

    voice.pause();

    expect(voice.paused).toBe(true);
    expect(voice.ended).toBe(false);
    // The oscillator is retired outright - a paused scene must not keep an
    // oscillator running.
    expect(spy.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
    expect(spy.oscillators[0]!.disconnect).toHaveBeenCalledTimes(1);

    dispose();
  });

  test('retiring the oscillator on pause clears its onended, so it can never finish the voice', () => {
    const { voice, spy, dispose } = play();

    voice.pause();

    expect(spy.oscillators[0]!.onended).toBeNull();
    expect(voice.ended).toBe(false);

    dispose();
  });

  test('resume starts exactly one replacement oscillator and clears paused', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.resume();

    expect(voice.paused).toBe(false);
    expect(voice.ended).toBe(false);
    expect(spy.oscillators).toHaveLength(2);
    expect(spy.oscillators[1]!.start).toHaveBeenCalledTimes(1);
    // The replacement feeds the envelope gain, exactly like the original.
    expect(spy.oscillators[1]!.connect).toHaveBeenCalledWith(spy.gains[1]);

    dispose();
  });

  test('the resumed oscillator ends the voice naturally, like the original', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.resume();
    spy.oscillators[1]!.onended?.();

    expect(voice.ended).toBe(true);

    dispose();
  });

  // ---- idempotence ----

  test('pause() on an already-paused voice is a no-op', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.pause();

    expect(voice.paused).toBe(true);
    expect(spy.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
    expect(spy.oscillators).toHaveLength(1);

    dispose();
  });

  test('resume() on a running voice never starts a second oscillator', () => {
    const { voice, spy, dispose } = play();

    voice.resume();

    expect(voice.paused).toBe(false);
    expect(spy.oscillators).toHaveLength(1);

    dispose();
  });

  test('resume() twice starts only one replacement oscillator', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.resume();
    voice.resume();

    expect(spy.oscillators).toHaveLength(2);

    dispose();
  });

  test('pause() on an ended voice is a no-op and leaves it ended, not paused', () => {
    const { voice, dispose } = play();

    voice.stop();
    voice.pause();

    expect(voice.ended).toBe(true);
    expect(voice.paused).toBe(false);

    dispose();
  });

  test('resume() on an ended voice never resurrects it', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.stop();
    voice.resume();

    expect(voice.ended).toBe(true);
    expect(spy.oscillators).toHaveLength(1);

    dispose();
  });

  // ---- stop / teardown while paused ----

  test('stop() while paused ends the voice immediately instead of scheduling a silent release', () => {
    const envelope = new Envelope({ attackMs: 10, decayMs: 100, releaseMs: 500 });
    const releaseSpy = vi.spyOn(envelope, 'release');
    const { voice, dispose } = play({ envelope });

    voice.pause();
    voice.stop();

    // Nothing audible is left to ramp - a release tail on a retired oscillator
    // would only strand the voice for `releaseMs`.
    expect(releaseSpy).not.toHaveBeenCalled();
    expect(voice.ended).toBe(true);
    // `paused` is not unwound by the end - same as `SoundVoice`/
    // `AudioStreamVoice`, where a voice stopped while paused also stays
    // `paused`. Every `SceneAudio` path gates on `ended` first.
    expect(voice.paused).toBe(true);

    dispose();
  });

  test('destroying the owning generator while a voice is paused ends that voice', () => {
    const { voice, generator, spy, dispose } = play();

    voice.pause();
    generator.destroy();

    expect(voice.ended).toBe(true);
    // Teardown must not start a replacement oscillator on the way out.
    expect(spy.oscillators).toHaveLength(1);

    dispose();
  });

  test('pause() during an envelope release ends the voice rather than stranding it', () => {
    const envelope = new Envelope({ attackMs: 10, decayMs: 100, releaseMs: 500 });
    const { voice, dispose } = play({ envelope });

    // stop() with an envelope leaves the voice alive until the release tail is
    // over, finished by the oscillator's `onended`. Retiring the oscillator here
    // would clear that callback and leave the voice paused forever.
    voice.stop();
    expect(voice.ended).toBe(false);

    voice.pause();

    expect(voice.ended).toBe(true);
    expect(voice.paused).toBe(false);

    dispose();
  });

  test('pause() during a timed fade-out ends the voice rather than stranding it', () => {
    const { voice, dispose } = play();

    voice.stop(200);
    expect(voice.ended).toBe(false);

    voice.pause();

    expect(voice.ended).toBe(true);

    dispose();
  });

  // ---- envelope: state is frozen at the pause point ----

  test('pause during attack holds the interpolated attack value and cancels the pending ramps', () => {
    const envelope = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25 });
    const { voice, spy, dispose } = play({ envelope });
    const gain = envelopeGainOf(spy).gain;

    setCurrentTime(0.05);
    gain.cancelScheduledValues.mockClear();
    gain.setValueAtTime.mockClear();

    voice.pause();

    // Half way through a 100 ms attack → 0.5.
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(0.05);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0.05);

    dispose();
  });

  test('resume re-schedules the remaining attack from the frozen value, not from the elapsed clock', () => {
    const envelope = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25 });
    const { voice, spy, dispose } = play({ envelope });
    const gain = envelopeGainOf(spy).gain;

    setCurrentTime(0.05);
    voice.pause();

    // Five seconds of scene pause - far past attack + decay. The envelope must
    // not have run to sustain in the meantime.
    setCurrentTime(5);
    gain.setValueAtTime.mockClear();
    gain.linearRampToValueAtTime.mockClear();

    voice.resume();

    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.5, 5);
    // 50 ms of attack left, then the full decay.
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.closeTo(5.05, 9));
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, expect.closeTo(5.15, 9));

    dispose();
  });

  test('pause during decay resumes mid-decay, with no second attack ramp', () => {
    const envelope = new Envelope({ attackMs: 100, decayMs: 200, sustainLevel: 0.4 });
    const { voice, spy, dispose } = play({ envelope });
    const gain = envelopeGainOf(spy).gain;

    // 100 ms into a 200 ms decay: 1 + (0.4 - 1) * 0.5 = 0.7.
    setCurrentTime(0.2);
    voice.pause();

    setCurrentTime(3);
    gain.setValueAtTime.mockClear();
    gain.linearRampToValueAtTime.mockClear();

    voice.resume();

    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.7, 3);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 3.1);

    dispose();
  });

  test('pause during sustain resumes at the sustain level with no ramps left', () => {
    const envelope = new Envelope({ attackMs: 10, decayMs: 100, sustainLevel: 0.6 });
    const { voice, spy, dispose } = play({ envelope });
    const gain = envelopeGainOf(spy).gain;

    setCurrentTime(1);
    voice.pause();

    setCurrentTime(4);
    gain.setValueAtTime.mockClear();
    gain.linearRampToValueAtTime.mockClear();

    voice.resume();

    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.6, 4);
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    dispose();
  });

  test('a voice without an envelope pauses and resumes without touching the envelope gain', () => {
    const { voice, spy, dispose } = play();
    const gain = envelopeGainOf(spy).gain;

    gain.cancelScheduledValues.mockClear();
    gain.setValueAtTime.mockClear();

    voice.pause();
    voice.resume();

    expect(gain.cancelScheduledValues).not.toHaveBeenCalled();
    expect(gain.setValueAtTime).not.toHaveBeenCalled();
    expect(voice.paused).toBe(false);

    dispose();
  });

  // ---- pool pressure while paused ----

  test('a paused voice is not the eviction victim while unpaused voices exist', () => {
    setCurrentTime(0);
    const system = new AudioSystem();
    const spy = setupSpy();
    const generator = new AudioGenerator({ poolSize: 2 });

    const held = system.play(generator) as AudioGeneratorVoice;
    held.pause();

    // A paused voice looks oldest under FIFO - its pool bookkeeping ages against
    // the still-running context clock - so it would be evicted first, stopped
    // for good, and `SceneAudio.restore()` would then pass over it (`ended`, not
    // `paused`): the held note is silently gone.
    for (let index = 0; index < 4; index++) {
      system.play(generator);
    }

    expect(held.ended).toBe(false);
    expect(held.paused).toBe(true);

    spy.restore();
    generator.destroy();
    system.destroy();
  });

  test('an all-paused pool still evicts, so a full pool never blocks new playback', () => {
    setCurrentTime(0);
    const system = new AudioSystem();
    const spy = setupSpy();
    const generator = new AudioGenerator({ poolSize: 1 });

    const held = system.play(generator) as AudioGeneratorVoice;
    held.pause();

    const next = system.play(generator) as AudioGeneratorVoice;

    expect(held.ended).toBe(true);
    expect(next.ended).toBe(false);

    spy.restore();
    generator.destroy();
    system.destroy();
  });

  // ---- pitch / rate across a pause ----

  test('frequency set while paused is applied to the oscillator resume starts', () => {
    const { voice, spy, dispose } = play({ frequency: 440 });

    voice.pause();
    voice.frequency = 880;

    // No live oscillator to ramp - the retired one must not be written to.
    expect(spy.oscillators[0]!.frequency.setTargetAtTime).not.toHaveBeenCalled();

    voice.resume();

    expect(voice.frequency).toBe(880);
    expect(spy.oscillators[1]!.frequency.value).toBe(880);

    dispose();
  });

  test('detune set while paused is applied to the oscillator resume starts', () => {
    const { voice, spy, dispose } = play({ detune: 0 });

    voice.pause();
    voice.detune = 700;

    expect(spy.oscillators[0]!.detune.setTargetAtTime).not.toHaveBeenCalled();

    voice.resume();

    expect(voice.detune).toBe(700);
    expect(spy.oscillators[1]!.detune.value).toBe(700);

    dispose();
  });

  test('type set while paused is applied to the oscillator resume starts', () => {
    const { voice, spy, dispose } = play();

    voice.pause();
    voice.type = 'square';
    voice.resume();

    expect(voice.type).toBe('square');
    expect(spy.oscillators[1]!.type).toBe('square');

    dispose();
  });

  test('resume carries the unchanged pitch across, without reverting to the construction value', () => {
    const { voice, spy, dispose } = play({ frequency: 440 });

    voice.frequency = 660;
    voice.pause();
    voice.resume();

    expect(spy.oscillators[1]!.frequency.value).toBe(660);

    dispose();
  });
});
