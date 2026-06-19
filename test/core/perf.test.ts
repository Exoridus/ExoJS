import { Perf } from '#core/Perf';

// jsdom does not implement the User Timing API (mark/measure/clearMarks/
// clearMeasures). Tests therefore inject a minimal mock on `performance`
// and verify that the Perf wrappers delegate correctly.

const makeMockPerf = () => ({
  mark: vi.fn(),
  measure: vi.fn().mockReturnValue({ name: '', duration: 0 } as unknown as PerformanceMeasure),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
});

describe('Perf utilities', () => {
  let originalMark: typeof performance.mark;
  let originalMeasure: typeof performance.measure;
  let originalClearMarks: typeof performance.clearMarks;
  let originalClearMeasures: typeof performance.clearMeasures;

  beforeEach(() => {
    const mock = makeMockPerf();
    originalMark = performance.mark;
    originalMeasure = performance.measure;
    originalClearMarks = performance.clearMarks;
    originalClearMeasures = performance.clearMeasures;
    Object.assign(performance, mock);
  });

  afterEach(() => {
    Object.assign(performance, {
      mark: originalMark,
      measure: originalMeasure,
      clearMarks: originalClearMarks,
      clearMeasures: originalClearMeasures,
    });
  });

  test('perfMark calls performance.mark with the given name', () => {
    Perf.mark('exo:frame-start');
    expect(performance.mark).toHaveBeenCalledWith('exo:frame-start');
  });

  test('perfMeasure calls performance.measure and returns the result', () => {
    const result = Perf.measure('exo:frame', 'exo:frame-start', 'exo:frame-end');
    expect(performance.measure).toHaveBeenCalledWith('exo:frame', 'exo:frame-start', 'exo:frame-end');
    expect(result).toBeDefined();
  });

  test('perfMeasure returns undefined when performance.measure throws', () => {
    (performance.measure as MockInstance).mockImplementation(() => {
      throw new DOMException('Mark not found', 'InvalidAccessError');
    });
    const result = Perf.measure('exo:bad', 'exo:nonexistent');
    expect(result).toBeUndefined();
  });

  test('perfClearMarks calls performance.clearMarks with the given name', () => {
    Perf.clearMarks('exo:frame-start');
    expect(performance.clearMarks).toHaveBeenCalledWith('exo:frame-start');
  });

  test('perfClearMeasures calls performance.clearMeasures with the given name', () => {
    Perf.clearMeasures('exo:frame');
    expect(performance.clearMeasures).toHaveBeenCalledWith('exo:frame');
  });

  test('perfMark is a no-op when performance.mark is unavailable', () => {
    (performance as Partial<Performance>).mark = undefined as unknown as typeof performance.mark;
    expect(() => Perf.mark('exo:test')).not.toThrow();
  });
});
