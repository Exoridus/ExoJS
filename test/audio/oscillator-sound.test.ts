import { getAudioContext } from '@/audio/audio-context';
import { AudioBus } from '@/audio/AudioBus';
import { disposeAudioManager, getAudioManager } from '@/audio/AudioManager';
import { Envelope } from '@/audio/Envelope';
import { OscillatorSound } from '@/audio/OscillatorSound';
import { SoundPoolStrategy } from '@/audio/Sound';

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

interface MockGainNode {
  gain: MockAudioParam;
  connect: MockInstance;
  disconnect: MockInstance;
}

const createGainMock = (): MockGainNode => ({
  gain: makeMockAudioParam(1),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

// Setup spies for createOscillator and createGain on the live mock AudioContext
const setupOscillatorSpy = (): {
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
  restoreOscillator: () => void;
  restoreGain: () => void;
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
    restoreOscillator: () => oscillatorSpy.mockRestore(),
    restoreGain: () => gainSpy.mockRestore(),
  };
};

describe('OscillatorSound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    disposeAudioManager();
  });

  test('default options: frequency=440, type=sine, detune=0, envelope=null, poolSize=8', () => {
    const sound = new OscillatorSound();

    expect(sound.frequency).toBe(440);
    expect(sound.type).toBe('sine');
    expect(sound.detune).toBe(0);
    expect(sound.envelope).toBeNull();
    expect(sound.poolSize).toBe(8);
    expect(sound.priority).toBe(0);
    expect(sound.poolStrategy).toBe(SoundPoolStrategy.FirstInFirstOut);

    sound.destroy();
  });

  test('construction with custom options', () => {
    const env = new Envelope({ attackMs: 20 });
    const sound = new OscillatorSound({
      frequency: 880,
      type: 'square',
      detune: 50,
      envelope: env,
      poolSize: 4,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
      priority: 5,
    });

    expect(sound.frequency).toBe(880);
    expect(sound.type).toBe('square');
    expect(sound.detune).toBe(50);
    expect(sound.envelope).toBe(env);
    expect(sound.poolSize).toBe(4);
    expect(sound.poolStrategy).toBe(SoundPoolStrategy.LeastRecentlyUsed);
    expect(sound.priority).toBe(5);

    sound.destroy();
  });

  test('play() creates an OscillatorNode with correct type and frequency', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound({ frequency: 440, type: 'sine' });
    sound.play();

    expect(spy.oscillators.length).toBe(1);
    expect(spy.oscillators[0].type).toBe('sine');
    expect(spy.oscillators[0].frequency.value).toBe(440);
    expect(spy.oscillators[0].start).toHaveBeenCalled();

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('play() with square wave creates correct oscillator type', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound({ frequency: 880, type: 'square' });
    sound.play();

    expect(spy.oscillators[0].type).toBe('square');
    expect(spy.oscillators[0].frequency.value).toBe(880);

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('play({ frequency: 880 }) overrides frequency for that play', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound({ frequency: 440 });
    sound.play({ frequency: 880 });

    expect(spy.oscillators[0].frequency.value).toBe(880);
    // Default frequency unchanged
    expect(sound.frequency).toBe(440);

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('play({ type: "sawtooth" }) overrides type for that play', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound({ type: 'sine' });
    sound.play({ type: 'sawtooth' });

    expect(spy.oscillators[0].type).toBe('sawtooth');

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('play() past pool limit evicts via FIFO', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound({ poolSize: 2 });

    sound.play();
    sound.play();
    // Both in pool; no eviction yet
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    sound.play();
    // Third play evicts first (FIFO)
    expect(spy.oscillators[0].stop).toHaveBeenCalled();

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('pause() stops all oscillators', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    sound.play();
    sound.play();

    sound.pause();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restoreOscillator();
    spy.restoreGain();
  });

  test('pause() sets paused to true', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    sound.play();
    expect(sound.paused).toBe(false);

    sound.pause();
    expect(sound.paused).toBe(true);

    spy.restoreOscillator();
    spy.restoreGain();
  });

  test('with envelope, play() triggers the envelope on the voice gain', () => {
    const spy = setupOscillatorSpy();

    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 100 });
    const triggerSpy = vi.spyOn(env, 'trigger');

    const sound = new OscillatorSound({ envelope: env });
    sound.play();

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    // The first gain created is the master gainNode for the bus; subsequent ones are voice gains.
    // trigger is called with a gain AudioParam and currentTime.
    const [gainParam, atTime] = triggerSpy.mock.calls[0];
    expect(gainParam).toBeDefined();
    expect(typeof atTime).toBe('number');

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('with envelope, pause() schedules release and stops oscillator after releaseMs', () => {
    const spy = setupOscillatorSpy();

    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 200 });
    const releaseSpy = vi.spyOn(env, 'release');

    const sound = new OscillatorSound({ envelope: env });
    sound.play();
    sound.pause();

    expect(releaseSpy).toHaveBeenCalledTimes(1);

    // The oscillator should be scheduled to stop at currentTime + releaseMs/1000
    const ctx = getAudioContext();
    const expectedStopTime = ctx.currentTime + 200 / 1000;
    expect(spy.oscillators[0].stop).toHaveBeenCalledWith(expectedStopTime);

    spy.restoreOscillator();
    spy.restoreGain();
  });

  test('setNote(69) sets frequency to ~440', () => {
    const sound = new OscillatorSound();
    sound.setNote(69);

    expect(sound.frequency).toBeCloseTo(440, 5);
    sound.destroy();
  });

  test('setNote(60) sets frequency to ~261.626 (C4 / middle C)', () => {
    const sound = new OscillatorSound();
    sound.setNote(60);

    expect(sound.frequency).toBeCloseTo(261.626, 2);
    sound.destroy();
  });

  test('setNote() returns this for chaining', () => {
    const sound = new OscillatorSound();
    expect(sound.setNote(69)).toBe(sound);
    sound.destroy();
  });

  test('OscillatorSound.midiToFrequency(60) returns ~261.626', () => {
    expect(OscillatorSound.midiToFrequency(60)).toBeCloseTo(261.626, 2);
  });

  test('OscillatorSound.midiToFrequency(69) returns ~440', () => {
    expect(OscillatorSound.midiToFrequency(69)).toBeCloseTo(440, 5);
  });

  test('OscillatorSound.midiToFrequency(57) returns ~220 (A3)', () => {
    expect(OscillatorSound.midiToFrequency(57)).toBeCloseTo(220, 2);
  });

  test('default bus is mixer.sound', () => {
    const sound = new OscillatorSound();
    const manager = getAudioManager();

    expect(sound.bus).toBe(manager.sound);

    sound.destroy();
  });

  test('setting sound.bus reroutes to custom bus', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    const customBus = new AudioBus('custom-test', { parent: getAudioManager().master });

    sound.bus = customBus;
    expect(sound.bus).toBe(customBus);

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
    customBus.destroy();
  });

  test('destroy() stops all pooled sources', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    sound.play();
    sound.play();

    sound.destroy();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restoreOscillator();
    spy.restoreGain();
  });

  test('destroy() does not throw when no sources are playing', () => {
    const sound = new OscillatorSound();
    expect(() => sound.destroy()).not.toThrow();
  });

  test('paused is true initially', () => {
    const sound = new OscillatorSound();
    expect(sound.paused).toBe(true);
    sound.destroy();
  });

  test('play() sets paused to false', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    sound.play();
    expect(sound.paused).toBe(false);

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });

  test('play({ replace: true }) stops existing oscillators before starting new', () => {
    const spy = setupOscillatorSpy();

    const sound = new OscillatorSound();
    sound.play();
    sound.play({ replace: true });

    expect(spy.oscillators[0].stop).toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    spy.restoreOscillator();
    spy.restoreGain();
    sound.destroy();
  });
});
