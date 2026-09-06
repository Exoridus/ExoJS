import type { PhysicsCellResult } from '../PhysicsAdapter';

/**
 * The contract between the physics harness page and the Node driver that
 * launches it.
 *
 * It lives in its own module so the driver can describe what it expects back
 * from `page.evaluate` without importing the harness, whose module graph is the
 * physics engine arms themselves and belongs in the browser alone.
 */

/** One physics engine arm as the page found it. */
export interface PhysicsArmReport {
  /** Physics engine arm label, e.g. `exojs-physics`. */
  readonly engine: string;
  /** Arm configuration label, e.g. `native`. */
  readonly config: string;
  /** npm package name behind the arm, whose installed version the driver stamps into the report header. */
  readonly library: string;
  /** Whether the arm could be constructed in this browser. */
  readonly available: boolean;
  /** Why an unavailable arm could not be constructed; empty when it was. */
  readonly reason: string;
}

/**
 * What the page's clock can resolve, which decides how many `step`s one timing
 * sample has to cover.
 *
 * `performance.now()` is clamped as a Spectre mitigation unless the page is
 * cross-origin isolated, and the two engines do not clamp to the same value.
 * Both facts are recorded rather than assumed, because the fastest physics cells
 * sit within an order of magnitude of the clamp.
 */
export interface PhysicsClockReport {
  /** Smallest non-zero difference two consecutive `performance.now()` calls produced, in milliseconds. */
  readonly resolutionMs: number;
  /** Whether the page is cross-origin isolated, which is what lifts the coarse clamp. */
  readonly crossOriginIsolated: boolean;
}

/**
 * Outcome of driving one matrix cell in the page.
 *
 * A determinism divergence is kept distinct from every other failure on purpose:
 * an arm that simulated a different scene invalidates the cross-arm comparison
 * the whole matrix exists to make, so the driver must fail the run on it rather
 * than record it as one missing datapoint.
 */
export type PhysicsCellOutcome =
  | { readonly kind: 'measured'; readonly result: PhysicsCellResult }
  | { readonly kind: 'divergence'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string };
