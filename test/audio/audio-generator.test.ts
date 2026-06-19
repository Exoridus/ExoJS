import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioManager } from '#audio/AudioManager';
import { Envelope } from '#audio/Envelope';
import { SoundPoolStrategy } from '#audio/Sound';

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

/**
 * Spy on createOscillator / createGain of the live mock AudioContext. Create
 * the AudioManager BEFORE calling this so its bus gains don't land in `gains`.
 */
const setupSpy = (): {
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
  restore: () => void;
} => {
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
    restore: () => {
      oscillatorSpy.mockRestore();
      gainSpy.mockRestore();
    },
  };
};

describe('AudioGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Descriptor ----

  test('default options: frequency=440, type=sine, detune=0, envelope=null, poolSize=8', () => {
    const gen = new AudioGenerator();
    expect(gen.frequency).toBe(440);
    expect(gen.type).toBe('sine');
    expect(gen.detune).toBe(0);
    expect(gen.envelope).toBeNull();
    expect(gen.poolSize).toBe(8);
    expect(gen.priority).toBe(0);
    expect(gen.poolStrategy).toBe(SoundPoolStrategy.FirstInFirstOut);
  });

  test('construction with custom options', () => {
    const env = new Envelope({ attackMs: 20 });
    const gen = new AudioGenerator({
      frequency: 880,
      type: 'square',
      detune: 50,
      envelope: env,
      poolSize: 4,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
      priority: 5,
    });
    expect(gen.frequency).toBe(880);
    expect(gen.type).toBe('square');
    expect(gen.detune).toBe(50);
    expect(gen.envelope).toBe(env);
    expect(gen.poolSize).toBe(4);
    expect(gen.poolStrategy).toBe(SoundPoolStrategy.LeastRecentlyUsed);
    expect(gen.priority).toBe(5);
  });

  test('setNote(69) sets frequency to ~440', () => {
    const gen = new AudioGenerator();
    expect(gen.setNote(69)).toBe(gen);
    expect(gen.frequency).toBeCloseTo(440, 5);
  });

  test('setNote(60) sets frequency to ~261.626 (C4)', () => {
    const gen = new AudioGenerator();
    gen.setNote(60);
    expect(gen.frequency).toBeCloseTo(261.626, 2);
  });

  test('AudioGenerator.midiToFrequency maps MIDI to Hz', () => {
    expect(AudioGenerator.midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(AudioGenerator.midiToFrequency(60)).toBeCloseTo(261.626, 2);
    expect(AudioGenerator.midiToFrequency(57)).toBeCloseTo(220, 2);
  });

  // ---- Playback (manager.play -> voice) ----

  test('manager.play() creates an OscillatorNode with the descriptor type and frequency', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440, type: 'sine' });

    manager.play(gen);

    expect(spy.oscillators.length).toBe(1);
    expect(spy.oscillators[0].type).toBe('sine');
    expect(spy.oscillators[0].frequency.value).toBe(440);
    expect(spy.oscillators[0].start).toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  test('the descriptor frequency is snapshotted into the voice at play time', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440 });

    gen.frequency = 880;
    manager.play(gen);

    expect(spy.oscillators[0].frequency.value).toBe(880);

    spy.restore();
    gen.destroy();
  });

  test('voice.frequency setter retunes the live oscillator', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.frequency = 660;

    expect(spy.oscillators[0].frequency.setTargetAtTime).toHaveBeenCalledWith(660, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('voice.detune setter updates the live oscillator detune', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.detune = 1200;

    expect(spy.oscillators[0].detune.setTargetAtTime).toHaveBeenCalledWith(1200, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('play past the pool limit evicts the oldest voice (FIFO)', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ poolSize: 2 });

    manager.play(gen);
    manager.play(gen);
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    manager.play(gen);
    expect(spy.oscillators[0].stop).toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  test('with an envelope, play() triggers it on the voice envelope gain', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 100 });
    const triggerSpy = vi.spyOn(env, 'trigger');
    const gen = new AudioGenerator({ envelope: env });

    manager.play(gen);

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    const [gainParam, atTime] = triggerSpy.mock.calls[0];
    expect(gainParam).toBeDefined();
    expect(typeof atTime).toBe('number');

    spy.restore();
    gen.destroy();
  });

  test('with an envelope, voice.stop() releases it and stops the oscillator after releaseMs', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 200 });
    const releaseSpy = vi.spyOn(env, 'release');
    const gen = new AudioGenerator({ envelope: env });

    const voice = manager.play(gen);
    voice.stop();

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    const ctx = getAudioContext();
    expect(spy.oscillators[0].stop).toHaveBeenCalledWith(ctx.currentTime + 200 / 1000);

    spy.restore();
    gen.destroy();
  });

  test('without an envelope, voice.stop() stops the oscillator immediately', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen);
    voice.stop();

    expect(spy.oscillators[0].stop).toHaveBeenCalled();
    expect(voice.ended).toBe(true);

    spy.restore();
    gen.destroy();
  });

  // ---- Bus routing ----

  test('voice routes to manager.sound by default', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen);
    expect(voice.bus).toBe(manager.sound);

    spy.restore();
    gen.destroy();
  });

  test('options.bus routes the voice to a custom bus', () => {
    const manager = new AudioManager();
    const customBus = new AudioBus('gen-custom', { parent: manager.master });
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen, { bus: customBus });
    expect(voice.bus).toBe(customBus);

    spy.restore();
    gen.destroy();
    customBus.destroy();
  });

  // ---- Lifecycle ----

  test('stopAll() stops all active voices', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    manager.play(gen);
    manager.play(gen);
    gen.stopAll();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restore();
    gen.destroy();
  });

  test('destroy() stops all active voices', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    manager.play(gen);
    manager.play(gen);
    gen.destroy();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restore();
  });

  test('destroy() does not throw when nothing is playing', () => {
    const gen = new AudioGenerator();
    expect(() => gen.destroy()).not.toThrow();
  });
});
