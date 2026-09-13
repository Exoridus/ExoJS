/**
 * `AudioOutputClock` against the three shapes the platform actually presents:
 * a context that reports an output timestamp, one that does not, and one that
 * reports a placeholder pair before it has rendered anything.
 */
import { AudioOutputClock } from '#audio/AudioOutputClock';

interface FakeContext {
  currentTime: number;
  baseLatency?: unknown;
  outputLatency?: unknown;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

const asContext = (context: FakeContext): AudioContext => context as unknown as AudioContext;

describe('AudioOutputClock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('pairs currentTime with performance.now() when the context reports no output timestamp', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);

    const snapshot = new AudioOutputClock(asContext({ currentTime: 2 })).snapshot();

    expect(snapshot).toEqual({
      contextTime: 2,
      performanceTime: 5000,
      baseLatency: null,
      outputLatency: null,
      source: 'estimated',
    });
  });

  test('prefers the output timestamp over currentTime', () => {
    const snapshot = new AudioOutputClock(
      asContext({
        currentTime: 2,
        baseLatency: 0.01,
        outputLatency: 0.04,
        getOutputTimestamp: () => ({ contextTime: 1.95, performanceTime: 4950 }),
      }),
    ).snapshot();

    expect(snapshot).toEqual({
      contextTime: 1.95,
      performanceTime: 4950,
      baseLatency: 0.01,
      outputLatency: 0.04,
      source: 'output-timestamp',
    });
  });

  test('treats the pre-first-quantum placeholder as no timestamp at all', () => {
    vi.spyOn(performance, 'now').mockReturnValue(800);

    const snapshot = new AudioOutputClock(
      asContext({
        currentTime: 0,
        getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 800 }),
      }),
    ).snapshot();

    expect(snapshot.source).toBe('estimated');
  });

  test('reports a latency the environment does not provide as null rather than zero', () => {
    const snapshot = new AudioOutputClock(
      asContext({
        currentTime: 1,
        baseLatency: Number.NaN,
        outputLatency: undefined,
        getOutputTimestamp: () => ({ contextTime: 1, performanceTime: 100 }),
      }),
    ).snapshot();

    expect(snapshot.baseLatency).toBeNull();
    expect(snapshot.outputLatency).toBeNull();
  });

  test('falls back when the timestamp pair is incomplete', () => {
    vi.spyOn(performance, 'now').mockReturnValue(300);

    const snapshot = new AudioOutputClock(
      asContext({
        currentTime: 4,
        getOutputTimestamp: () => ({ contextTime: 3.9 }),
      }),
    ).snapshot();

    expect(snapshot).toMatchObject({ contextTime: 4, performanceTime: 300, source: 'estimated' });
  });

  describe('conversion', () => {
    const stable = (): AudioContext =>
      asContext({
        currentTime: 10,
        getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 20_000 }),
      });

    test('maps a context second onto a thousand performance milliseconds', () => {
      const clock = new AudioOutputClock(stable());

      expect(clock.contextToPerformanceTime(10)).toBe(20_000);
      expect(clock.contextToPerformanceTime(10.5)).toBe(20_500);
      expect(clock.contextToPerformanceTime(9)).toBe(19_000);
    });

    test('inverts within floating-point tolerance', () => {
      const clock = new AudioOutputClock(stable());

      expect(clock.performanceToContextTime(clock.contextToPerformanceTime(12.345))).toBeCloseTo(12.345, 9);
      expect(clock.contextToPerformanceTime(clock.performanceToContextTime(21_234.5))).toBeCloseTo(21_234.5, 6);
    });

    test('is monotonic in both directions', () => {
      const clock = new AudioOutputClock(stable());

      expect(clock.contextToPerformanceTime(11)).toBeGreaterThan(clock.contextToPerformanceTime(10));
      expect(clock.performanceToContextTime(21_000)).toBeGreaterThan(clock.performanceToContextTime(20_000));
    });
  });

  describe('anchoring', () => {
    test('keeps the newer reading while the clock runs forward', () => {
      let contextTime = 1;
      let performanceTime = 1000;
      const clock = new AudioOutputClock(asContext({ currentTime: 0, getOutputTimestamp: () => ({ contextTime, performanceTime }) }));

      expect(clock.contextToPerformanceTime(1)).toBe(1000);

      contextTime = 2;
      performanceTime = 2010;

      // The two clocks drifted 10 ms apart; a clock that kept its first anchor
      // would still answer 2000 here and never converge.
      expect(clock.contextToPerformanceTime(2)).toBe(2010);
    });

    test('ignores a reading that moves backwards within the same source', () => {
      let contextTime = 5;
      const clock = new AudioOutputClock(asContext({ currentTime: 0, getOutputTimestamp: () => ({ contextTime, performanceTime: contextTime * 1000 }) }));

      expect(clock.snapshot().contextTime).toBe(5);

      contextTime = 4;

      expect(clock.snapshot().contextTime).toBe(5);
    });

    test('takes an output timestamp over an estimate even though it reads earlier', () => {
      vi.spyOn(performance, 'now').mockReturnValue(9000);

      let timestamp: { contextTime?: number; performanceTime?: number } = {};
      const clock = new AudioOutputClock(asContext({ currentTime: 9, getOutputTimestamp: () => timestamp }));

      expect(clock.snapshot()).toMatchObject({ contextTime: 9, source: 'estimated' });

      // The output timestamp trails `currentTime` by the output latency, so the
      // upgrade must not be refused for reading earlier than the estimate did.
      timestamp = { contextTime: 8.95, performanceTime: 8950 };

      expect(clock.snapshot()).toMatchObject({ contextTime: 8.95, source: 'output-timestamp' });
    });
  });

  describe('shared context', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.resetModules();
    });

    test('reads the context ExoJS shares when none is given', async () => {
      const { AudioOutputClock: Clock } = await import('#audio/AudioOutputClock');
      const { getAudioContext } = await import('#audio/audioContext');

      expect(new Clock().context).toBe(getAudioContext());
    });

    test('drops the anchor when the shared context is replaced', async () => {
      const first: FakeContext = { currentTime: 0, getOutputTimestamp: () => ({ contextTime: 30, performanceTime: 30_000 }) };
      const second: FakeContext = { currentTime: 0, getOutputTimestamp: () => ({ contextTime: 2, performanceTime: 2000 }) };
      let current = first;

      vi.doMock('#audio/audioContext', () => ({ getAudioContext: () => asContext(current) }));

      const { AudioOutputClock: Clock } = await import('#audio/AudioOutputClock');
      const clock = new Clock();

      expect(clock.snapshot().contextTime).toBe(30);

      current = second;

      // Without the context check the backwards guard would pin the clock to a
      // correlation belonging to a context that no longer exists.
      expect(clock.snapshot().contextTime).toBe(2);
    });
  });
});
