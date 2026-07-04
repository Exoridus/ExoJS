import { getAudioContext } from '#audio/audio-context';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioManager } from '#audio/AudioManager';
import { Envelope } from '#audio/Envelope';

// ---------------------------------------------------------------------------
// Helpers — mirrors the oscillator/gain spies used in audio-generator.test.ts.
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

/** Spy on createOscillator / createGain / createPanner. Create the AudioManager BEFORE calling this. */
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioGeneratorVoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- frequency / type / playbackRate / detune getters ----

  test('frequency getter reflects the snapshotted value', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 523 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    expect(voice.frequency).toBe(523);

    spy.restore();
    gen.destroy();
  });

  test('type getter/setter reflects and updates the live oscillator type', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ type: 'sawtooth' });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    expect(voice.type).toBe('sawtooth');

    voice.type = 'square';
    expect(voice.type).toBe('square');
    expect(spy.oscillators[0].type).toBe('square');

    spy.restore();
    gen.destroy();
  });

  test('playbackRate getter/setter is stored but inert (no oscillator API to drive)', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    expect(voice.playbackRate).toBe(1);

    voice.playbackRate = 2.5;
    expect(voice.playbackRate).toBe(2.5);

    spy.restore();
    gen.destroy();
  });

  test('detune getter reflects the current value after the setter updates it', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ detune: 10 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    expect(voice.detune).toBe(10);

    voice.detune = 250;
    expect(voice.detune).toBe(250);
    expect(spy.oscillators[0].detune.setTargetAtTime).toHaveBeenCalledWith(250, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('type setter still updates the descriptor snapshot after the voice ends (but not the dead oscillator)', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.stop();
    expect(voice.ended).toBe(true);

    spy.oscillators[0].type = 'sine';
    voice.type = 'triangle';

    expect(voice.type).toBe('triangle');
    // The ended guard skips writing to the (already torn-down) oscillator.
    expect(spy.oscillators[0].type).toBe('sine');

    spy.restore();
    gen.destroy();
  });

  test('frequency setter still updates the snapshot after end but skips the dead oscillator', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.stop();
    spy.oscillators[0].frequency.setTargetAtTime.mockClear();

    voice.frequency = 990;

    expect(voice.frequency).toBe(990);
    expect(spy.oscillators[0].frequency.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  test('detune setter still updates the snapshot after end but skips the dead oscillator', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ detune: 0 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.stop();
    spy.oscillators[0].detune.setTargetAtTime.mockClear();

    voice.detune = 1200;

    expect(voice.detune).toBe(1200);
    expect(spy.oscillators[0].detune.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  // ---- oscillator natural end (onended) ----

  test('the oscillator natural end (onended) finishes the voice', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    expect(voice.ended).toBe(false);

    spy.oscillators[0].onended?.();

    expect(voice.ended).toBe(true);

    spy.restore();
    gen.destroy();
  });

  // ---- stop(): double-stop is a no-op ----

  test('calling stop() twice is idempotent', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.stop();
    expect(spy.oscillators[0].stop).toHaveBeenCalledTimes(1);

    voice.stop();
    // The `if (this._ended) return;` guard prevents a second teardown attempt.
    expect(spy.oscillators[0].stop).toHaveBeenCalledTimes(1);

    spy.restore();
    gen.destroy();
  });

  // ---- stop(fadeMs): delegates to the base fade-out path, bypassing the envelope release ----

  test('stop(fadeMs) with fadeMs > 0 fades out via BaseVoice instead of releasing the envelope', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const env = new Envelope({ releaseMs: 500 });
    const releaseSpy = vi.spyOn(env, 'release');
    const gen = new AudioGenerator({ envelope: env });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.stop(200);

    // The envelope's own release() is bypassed entirely for a faded stop.
    expect(releaseSpy).not.toHaveBeenCalled();
    // The oscillator itself is not told to stop synchronously — BaseVoice
    // schedules a timed gain fade on the voice output instead.
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(voice.ended).toBe(false);

    spy.restore();
    gen.destroy();
  });

  // ---- spatialization routes the envelope gain through the panner ----

  test('setting voice.position spatializes the generator voice through the panner', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const ctx = getAudioContext();
    const pannerSpy = vi.spyOn(ctx, 'createPanner');
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.position = { x: 3, y: 4 };

    expect(pannerSpy).toHaveBeenCalledTimes(1);
    expect(voice.position?.x).toBe(3);

    pannerSpy.mockRestore();
    spy.restore();
    gen.destroy();
  });
});
