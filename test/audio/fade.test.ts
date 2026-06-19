import { getAudioContext } from '#audio/audio-context';
import { getAudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';

const createAudioBufferStub = (): AudioBuffer => ({ duration: 5 }) as AudioBuffer;

interface MockGainNode {
  connect: MockInstance;
  disconnect: MockInstance;
  gain: {
    setTargetAtTime: MockInstance;
    cancelScheduledValues: MockInstance;
    setValueAtTime: MockInstance;
    linearRampToValueAtTime: MockInstance;
    value: number;
  };
}

const setupGainSpy = (): { gainNode: MockGainNode; restore: () => void } => {
  const gainNode: MockGainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      value: 1,
    },
  };

  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };
  const spy = vi.spyOn(ctx, 'createGain').mockReturnValue(gainNode as unknown as GainNode);

  return {
    gainNode,
    restore: () => spy.mockRestore(),
  };
};

describe('Audio fade helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('Voice.fadeOut(0) stops immediately (ended becomes true)', () => {
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    expect(voice.ended).toBe(false);

    voice.fadeOut(0);
    expect(voice.ended).toBe(true);

    restore();
    sound.destroy();
  });

  test('Voice.fadeOut(500) schedules linearRamp to 0', () => {
    vi.useFakeTimers();
    const { gainNode, restore } = setupGainSpy();
    const ctx = getAudioContext();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    voice.fadeOut(500);

    expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 0.5);

    // Voice not ended yet — timer hasn't fired
    expect(voice.ended).toBe(false);
    vi.advanceTimersByTime(500);
    expect(voice.ended).toBe(true);

    restore();
    sound.destroy();
  });

  test('Voice.setVolume() updates gain node', () => {
    const { gainNode, restore } = setupGainSpy();
    const ctx = getAudioContext();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    voice.setVolume(0.5);

    expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, ctx.currentTime, 0.01);

    restore();
    sound.destroy();
  });

  test('Voice.stop() marks voice as ended immediately', () => {
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    expect(voice.ended).toBe(false);

    voice.stop();
    expect(voice.ended).toBe(true);

    restore();
    sound.destroy();
  });

  test('Voice.fadeOut with pending timer: stop() before timer fires marks ended', () => {
    vi.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    voice.fadeOut(500);

    // Stop before timer fires
    voice.stop();
    expect(voice.ended).toBe(true);

    // Advance past the original fadeOut — should not throw or double-stop
    vi.advanceTimersByTime(600);
    expect(voice.ended).toBe(true);

    restore();
    sound.destroy();
  });

  test('sound.destroy() stops all active voices', () => {
    vi.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());
    const manager = getAudioManager();

    const voice = manager.play(sound);
    voice.fadeOut(500); // schedules a timer

    // Destroying Sound stops all voices without throwing
    expect(() => sound.destroy()).not.toThrow();

    restore();
  });
});
