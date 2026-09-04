import { crossFade } from '#audio/crossFade';
import type { Voice } from '#audio/Playable';
import { Time } from '#core/units';

const makeMockVoice = (): Pick<Voice, 'fade' | 'stop'> => ({
  fade: vi.fn(),
  stop: vi.fn(),
});

describe('crossFade', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('fades `to` up to 1 and stops `from`, both over duration', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, Time.seconds(0.5));

    expect(to.fade).toHaveBeenCalledWith(1, 0.5);
    expect(from.stop).toHaveBeenCalledWith(0.5);

    vi.advanceTimersByTime(500);
    await promise;
  });

  test('honors a custom toVolume', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, Time.seconds(0.3), { toVolume: 0.6 });

    expect(to.fade).toHaveBeenCalledWith(0.6, 0.3);
    expect(from.stop).toHaveBeenCalledWith(0.3);

    vi.advanceTimersByTime(300);
    await promise;
  });

  test('clamps toVolume into [0, 1]', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, Time.seconds(0.2), { toVolume: 5 });

    expect(to.fade).toHaveBeenCalledWith(1, 0.2);

    vi.advanceTimersByTime(200);
    await promise;
  });

  test('stopAfter: false fades `from` out without stopping it', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, Time.seconds(0.4), { stopAfter: false });

    expect(from.fade).toHaveBeenCalledWith(0, 0.4);
    expect(from.stop).not.toHaveBeenCalled();
    expect(to.fade).toHaveBeenCalledWith(1, 0.4);

    vi.advanceTimersByTime(400);
    await promise;
  });

  test('returns a Promise that resolves after duration', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    let resolved = false;
    const promise = crossFade(from as Voice, to as Voice, Time.seconds(1));
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

  test('duration: 0 resolves immediately', async () => {
    vi.useFakeTimers();

    const from = makeMockVoice();
    const to = makeMockVoice();

    const promise = crossFade(from as Voice, to as Voice, Time.seconds(0));

    vi.advanceTimersByTime(0);
    await promise;

    expect(to.fade).toHaveBeenCalledWith(1, 0);
    expect(from.stop).toHaveBeenCalledWith(0);
  });
});
