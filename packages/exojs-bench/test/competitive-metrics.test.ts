import { compareRunMedians, hardwareGpuMedian, summarizeSamples } from '../src/competitive/metrics';

describe('competitive metric boundaries', () => {
  test('reports nearest-rank tails, variance and explicit stutter threshold without changing samples', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);
    const summary = summarizeSamples(samples, 50);

    expect(summary).toMatchObject({ count: 100, mean: 50.5, median: 50.5, p95: 95, p99: 99, max: 100, stutters: 50 });
    expect(summary?.variance).toBeCloseTo(833.25);
    expect(samples[0]).toBe(1);
    expect(summarizeSamples([], 50)).toBeNull();
  });

  test('rejects corrupt samples instead of silently removing them', () => {
    expect(() => summarizeSamples([1, Number.NaN])).toThrow(/finite/);
    expect(() => summarizeSamples([-1])).toThrow(/non-negative/);
    expect(() => summarizeSamples([1], 0)).toThrow(/threshold/);
  });

  test('never promotes missing source or rAF cadence into GPU execution time', () => {
    expect(hardwareGpuMedian({ frameMsMedian: 16.7 })).toBeNull();
    expect(hardwareGpuMedian({ frameMsMedian: 16.7, frameTimeSource: 'raf-cadence' })).toBeNull();
    expect(hardwareGpuMedian({ frameMsMedian: 0.3, frameTimeSource: 'webgl2-time-elapsed' })).toBe(0.3);
    expect(hardwareGpuMedian({ frameMsMedian: 0.2, frameTimeSource: 'webgpu-render-pass-timestamps' })).toBe(0.2);
  });

  test('uses independent run medians rather than treating frames as independent repetitions', () => {
    const tooFew = compareRunMedians([1, 1, 1], [2, 2, 2]);
    expect(tooFew.status).toBe('INCONCLUSIVE');
    expect(tooFew.runs).toBe(3);

    const clear = compareRunMedians([1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2]);
    expect(clear.status).toBe('REFERENCE_FASTER');
    expect(clear.ratio).toBe(2);
    expect(clear.interval95).toEqual([2, 2]);
    expect(clear.signTestP).toBeCloseTo(0.015625);
  });

  test('does not invent a winner for alternating or zero-resolution runs', () => {
    expect(compareRunMedians([1, 1, 1, 1, 1, 1], [0.5, 2, 0.5, 2, 0.5, 2]).status).toBe('INCONCLUSIVE');
    expect(compareRunMedians([0, 0], [1, 1]).status).toBe('UNRESOLVED');
    expect(() => compareRunMedians([1], [1, 2])).toThrow(/paired/);
  });
});
