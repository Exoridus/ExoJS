import { crossFade } from '#audio/crossFade';
import type { Voice } from '#audio/Playable';

const makeMockVoice = (): Pick<Voice, 'fade' | 'stop'> => ({
  fade: vi.fn(),
  stop: vi.fn(),
});

describe('crossFade', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('fades `to` up to 1 and stops `from`, both over durationMs', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, 500);

    expect(to.fade).toHaveBeenCalledWith(1, 500);
    expect(from.stop).toHaveBeenCalledWith(500);

    vi.advanceTimersByTime(500);
    await promise;
  });

  test('honors a custom toVolume', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, 300, { toVolume: 0.6 });

    expect(to.fade).toHaveBeenCalledWith(0.6, 300);
    expect(from.stop).toHaveBeenCalledWith(300);

    vi.advanceTimersByTime(300);
    await promise;
  });

  test('clamps toVolume into [0, 1]', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, 200, { toVolume: 5 });

    expect(to.fade).toHaveBeenCalledWith(1, 200);

    vi.advanceTimersByTime(200);
    await promise;
  });

  test('returns a Promise that resolves after durationMs', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    let resolved = false;
    const promise = crossFade(from as Voice, to as Voice, 1000);
    void promise.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    vi.advanceTimersByTime(999);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  test('durationMs: 0 resolves immediately', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, 0);

    vi.advanceTimersByTime(0);
    await promise;

    expect(to.fade).toHaveBeenCalledWith(1, 0);
    expect(from.stop).toHaveBeenCalledWith(0);
  });
});
