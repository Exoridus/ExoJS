import { getAudioContext } from '#audio/audio-context';
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

  test('fadeIn(0) plays immediately if paused', () => {
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    expect(sound.paused).toBe(true);
    sound.fadeIn(0);
    expect(sound.paused).toBe(false);

    restore();
    sound.destroy();
  });

  test('fadeIn(500) schedules linearRamp with correct target time', () => {
    const { gainNode, restore } = setupGainSpy();
    const ctx = getAudioContext();
    const sound = new Sound(createAudioBufferStub());

    sound.fadeIn(500);

    expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(ctx.currentTime);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime);
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      1, // volume target (not muted, volume=1)
      ctx.currentTime + 0.5,
    );

    restore();
    sound.destroy();
  });

  test('fadeOut(0) pauses immediately', () => {
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    expect(sound.paused).toBe(false);

    sound.fadeOut(0);
    expect(sound.paused).toBe(true);

    restore();
    sound.destroy();
  });

  test('fadeOut(500) schedules ramp and pauses after durationMs', () => {
    vi.useFakeTimers();
    const { gainNode, restore } = setupGainSpy();
    const ctx = getAudioContext();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 0.5);

    expect(sound.paused).toBe(false);
    vi.advanceTimersByTime(500);
    expect(sound.paused).toBe(true);

    restore();
    sound.destroy();
  });

  test('fadeOut(500, { stopAfter: false }) does not pause', () => {
    vi.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500, { stopAfter: false });

    vi.advanceTimersByTime(600);
    expect(sound.paused).toBe(false);

    restore();
    sound.destroy();
  });

  test('fadeIn(500) cancels a previous fadeOut scheduled pause', () => {
    vi.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    // Before the fade out timer fires, call fadeIn — should cancel the stop
    vi.advanceTimersByTime(100);
    sound.fadeIn(500);

    // Now advance past the original fadeOut duration
    vi.advanceTimersByTime(500);
    expect(sound.paused).toBe(false);

    restore();
    sound.destroy();
  });

  test('destroy() clears scheduled stops without leaking timers', () => {
    vi.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    // Destroying before the timer fires should not throw
    expect(() => sound.destroy()).not.toThrow();

    restore();
  });
});
