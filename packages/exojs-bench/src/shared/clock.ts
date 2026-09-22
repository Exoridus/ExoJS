/**
 * What the page's own clock resolved, measured in the page that will be timed.
 *
 * `performance.now()` is coarsened by the engine, and by how much depends on
 * the browsing context rather than on the workload - notably on whether the
 * page reached a cross-origin-isolated context. A benchmark that reports
 * milliseconds without recording that grid cannot tell a fast cell from an
 * unresolved one, so the grid is measured alongside the cells and travels with
 * them into the profile.
 *
 * The probe must run in the page under measurement. A value read in the driver
 * process describes Node's clock and says nothing about the browser's.
 */

/** How many readings the probe takes looking for the smallest positive step. */
const PROBE_ITERATIONS = 10_000;

/** What one page's clock was observed to do. */
export interface ClockReport {
  /**
   * Smallest positive difference the probe observed between two consecutive
   * readings, or `null` where it observed none.
   *
   * This is the step size the probe saw, not a calibrated error bound on any
   * later measurement: engines may coarsen and jitter their timestamps, so a
   * single observed minimum bounds neither the error of one sample nor the
   * confidence of a comparison built from many. `null` means the probe
   * established nothing and must never be read as a fine clock - it is the
   * absence of the observation, not an observation of zero.
   */
  readonly resolutionMs: number | null;
  /** Whether the page reached a cross-origin-isolated context, which is what lifts the coarsest clamping. */
  readonly crossOriginIsolated: boolean;
}

/** Measure the clock's observed grid in the current page. */
export const probeClock = (): ClockReport => {
  let smallest = Number.POSITIVE_INFINITY;
  let previous = performance.now();

  for (let index = 0; index < PROBE_ITERATIONS; index += 1) {
    const now = performance.now();
    const delta = now - previous;

    if (delta > 0) {
      smallest = Math.min(smallest, delta);
      previous = now;
    }
  }

  return {
    resolutionMs: Number.isFinite(smallest) ? smallest : null,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  };
};

/** How a clock report reads in a caveat or a provenance line. */
export const describeClock = (clock: ClockReport): string =>
  clock.resolutionMs === null
    ? `The page's performance.now() resolution could not be established (cross-origin isolated: ${String(clock.crossOriginIsolated)}); readings near it cannot be told apart from it.`
    : `The page's performance.now() resolved to ${(clock.resolutionMs * 1000).toFixed(1)}us (cross-origin isolated: ${String(clock.crossOriginIsolated)}).`;
