import { getAudioContext } from '@/audio/audio-context';
import { Sound } from '@/audio/Sound';

const createAudioBufferStub = (): AudioBuffer => ({ duration: 5 }) as AudioBuffer;

interface MockGainNode {
  connect: jest.Mock;
  disconnect: jest.Mock;
  gain: {
    setTargetAtTime: jest.Mock;
    cancelScheduledValues: jest.Mock;
    setValueAtTime: jest.Mock;
    linearRampToValueAtTime: jest.Mock;
    value: number;
  };
}

const setupGainSpy = (): { gainNode: MockGainNode; restore: () => void } => {
  const gainNode: MockGainNode = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: {
      setTargetAtTime: jest.fn(),
      cancelScheduledValues: jest.fn(),
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      value: 1,
    },
  };

  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };
  const spy = jest.spyOn(ctx, 'createGain').mockReturnValue(gainNode as unknown as GainNode);

  return {
    gainNode,
    restore: () => spy.mockRestore(),
  };
};

describe('Audio fade helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
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
    jest.useFakeTimers();
    const { gainNode, restore } = setupGainSpy();
    const ctx = getAudioContext();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 0.5);

    expect(sound.paused).toBe(false);
    jest.advanceTimersByTime(500);
    expect(sound.paused).toBe(true);

    restore();
    sound.destroy();
  });

  test('fadeOut(500, { stopAfter: false }) does not pause', () => {
    jest.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500, { stopAfter: false });

    jest.advanceTimersByTime(600);
    expect(sound.paused).toBe(false);

    restore();
    sound.destroy();
  });

  test('fadeIn(500) cancels a previous fadeOut scheduled pause', () => {
    jest.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    // Before the fade out timer fires, call fadeIn — should cancel the stop
    jest.advanceTimersByTime(100);
    sound.fadeIn(500);

    // Now advance past the original fadeOut duration
    jest.advanceTimersByTime(500);
    expect(sound.paused).toBe(false);

    restore();
    sound.destroy();
  });

  test('destroy() clears scheduled stops without leaking timers', () => {
    jest.useFakeTimers();
    const { restore } = setupGainSpy();
    const sound = new Sound(createAudioBufferStub());

    sound.play();
    sound.fadeOut(500);

    // Destroying before the timer fires should not throw
    expect(() => sound.destroy()).not.toThrow();

    restore();
  });
});
