import type { TickClock } from '#input/actions/types';

/**
 * Fixed-step clock of one {@link Application}, which every action sampled by
 * its {@link InputSystem} files its occurrences against - see
 * {@link TickLedger}. The frame loop drives it directly rather than as a
 * system, so no system order can run fixed-step code before a step is open.
 *
 * @internal
 */
export class InputTickClock implements TickClock {
  public serial = 0;
  public active = false;

  /** A fixed step starts: it owns what was sampled since the previous one. */
  public open(): void {
    this.serial++;
    this.active = true;
  }

  /** The frame's fixed steps are over, or one of them threw. */
  public close(): void {
    this.active = false;
  }

  /**
   * Input sampled so far will never reach a fixed step: the frame loop stopped
   * or is skipping frames. Advancing the serial without a step leaves the open
   * window behind, so the next step does not deliver it as if it were fresh.
   */
  public retire(): void {
    this.serial++;
    this.active = false;
  }
}
