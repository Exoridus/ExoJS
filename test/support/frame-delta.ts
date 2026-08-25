import { Time } from '#core/units';

/**
 * The frame delta specs pass when they drive a system's `preUpdate` phase by
 * hand instead of running a real frame loop.
 *
 * One frame at 60 Hz. The value only has to be plausible: every system these
 * specs step this way ignores its delta and reacts to queued state instead, so
 * a spec that depends on the number is testing something it did not mean to.
 */
export const frameDelta = Time.seconds(1 / 60);
