// Thin wrappers around the User Timing API (performance.mark /
// performance.measure). All calls are guarded against environments where
// `performance` or individual User Timing methods are unavailable (e.g.
// some jsdom configurations, older browsers), so they are always safe to call.

const hasPerf = typeof performance !== 'undefined';

/**
 * Emit a named `PerformanceMark` at the current instant.
 * No-op when the User Timing API is unavailable.
 */
export const perfMark = (name: string): void => {
  if (hasPerf && typeof performance.mark === 'function') performance.mark(name);
};

/**
 * Record a `PerformanceMeasure` between two marks.
 *
 * - When `endMark` is omitted the measurement runs from `startMark` to *now*.
 * - Returns the created `PerformanceMeasure`, or `undefined` if the API is
 *   unavailable or either mark was never emitted.
 */
export const perfMeasure = (
  name: string,
  startMark: string,
  endMark?: string,
): PerformanceMeasure | undefined => {
  if (!hasPerf || typeof performance.measure !== 'function') return undefined;
  try {
    return performance.measure(name, startMark, endMark);
  } catch {
    return undefined;
  }
};

/**
 * Remove all marks with the given name, or all marks when `name` is omitted.
 * No-op when the User Timing API is unavailable.
 */
export const perfClearMarks = (name?: string): void => {
  if (hasPerf && typeof performance.clearMarks === 'function') performance.clearMarks(name);
};

/**
 * Remove all measures with the given name, or all measures when `name` is omitted.
 * No-op when the User Timing API is unavailable.
 */
export const perfClearMeasures = (name?: string): void => {
  if (hasPerf && typeof performance.clearMeasures === 'function') performance.clearMeasures(name);
};
