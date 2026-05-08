import type { AbstractMedia } from '@/audio/AbstractMedia';
import { crossFade } from '@/audio/crossFade';

const makeMockMedia = (paused = false): jest.Mocked<Pick<AbstractMedia, 'paused' | 'play' | 'pause' | 'fadeIn' | 'fadeOut'>> => ({
  paused,
  play: jest.fn().mockReturnThis(),
  pause: jest.fn().mockReturnThis(),
  fadeIn: jest.fn().mockReturnThis(),
  fadeOut: jest.fn().mockReturnThis(),
});

describe('crossFade', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('calls fadeOut on `from` and fadeIn on `to` with durationMs', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia();

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 500);

    expect(from.fadeOut).toHaveBeenCalledWith(500, { stopAfter: true });
    expect(to.fadeIn).toHaveBeenCalledWith(500);

    jest.advanceTimersByTime(500);
    await promise;
  });

  test('calls play() on `to` if it is paused and autoPlayTarget is not false', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia(true); // paused = true

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 300);

    expect(to.play).toHaveBeenCalledTimes(1);
    expect(to.fadeIn).toHaveBeenCalledWith(300);

    jest.advanceTimersByTime(300);
    await promise;
  });

  test('does NOT call play() on `to` when autoPlayTarget: false', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia(true); // paused = true

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 300, {
      autoPlayTarget: false,
    });

    expect(to.play).not.toHaveBeenCalled();
    expect(to.fadeIn).toHaveBeenCalledWith(300);

    jest.advanceTimersByTime(300);
    await promise;
  });

  test('passes stopAfterFade: false to from.fadeOut', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia();

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 400, {
      stopAfterFade: false,
    });

    expect(from.fadeOut).toHaveBeenCalledWith(400, { stopAfter: false });

    jest.advanceTimersByTime(400);
    await promise;
  });

  test('returns a Promise that resolves after durationMs', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia();

    let resolved = false;
    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 1000);
    void promise.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    jest.advanceTimersByTime(999);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  test('durationMs: 0 resolves immediately (no timer needed)', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia();

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 0);

    jest.advanceTimersByTime(0);
    await promise;

    expect(from.fadeOut).toHaveBeenCalledWith(0, { stopAfter: true });
    expect(to.fadeIn).toHaveBeenCalledWith(0);
  });

  test('does NOT call play() on `to` when `to` is already playing', async () => {
    jest.useFakeTimers();

    const from = makeMockMedia();
    const to = makeMockMedia(false); // paused = false (already playing)

    const promise = crossFade(from as unknown as AbstractMedia, to as unknown as AbstractMedia, 500);

    expect(to.play).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await promise;
  });
});
