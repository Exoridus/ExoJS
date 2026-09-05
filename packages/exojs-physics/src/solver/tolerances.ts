/**
 * Penetration allowance (px) the soft bias leaves uncorrected. The narrow phase
 * only produces a manifold while the colliders overlap, so pushing penetration
 * fully to zero lets a resting contact wink out for a frame (free-fall, then
 * re-detect) - a periodic energy spike. Leaving a small slop keeps the contact
 * persistently overlapping and the warm-start cache alive.
 * @internal
 */
export const contactSlop = 0.25;

/**
 * Penetration (px) below which a contact never blocks the sleep decision,
 * whatever the push-out is doing.
 *
 * The sleep gate has to consult penetration at all because the push-out moves
 * bodies through the solver's position bias, which the relax pass removes from
 * their velocity again: a body still climbing out of geometry looks motionless
 * to the velocity thresholds, and sleeping it would freeze it visibly embedded.
 * Both sides must read the same tolerance, or the sleep gate and the constraint
 * it is gating drift apart.
 *
 * The value is empirical, not derived: a face contact converges to exactly one
 * slop at any gravity, but a single-point contact rests one static spring
 * deflection deeper, and that offset grows with acceleration (0.28 px at
 * 1 000 px/s², 0.53 px at 10 000). Three slops clears that envelope for the
 * gravity range the engine is tuned for, so an ordinary resting contact is
 * settled by depth alone. Equilibria deeper than that - a loaded contact inside
 * a pile, or a lone contact at extreme acceleration - are decided on push-out
 * progress instead, against {@link sleepPushOutProgressSpeed}.
 * @internal
 */
export const sleepPenetrationTolerance = 3 * contactSlop;

/**
 * Speed (px/s) at which an overlap deeper than {@link sleepPenetrationTolerance}
 * still counts as being worked off, so neither of its bodies may bank sleep
 * time. Below it the contact has reached the depth its own load holds it at, and
 * keeping the island awake would only re-solve a scene that has stopped moving.
 *
 * The threshold has to clear the jitter a settled scene's contacts carry while
 * staying well under the speed a genuinely converging contact shows: the soft
 * bias closes the excess beyond the slop at roughly `biasRate` per second
 * (about 9/s at the default 30 Hz over four sub-steps), so a contact converging
 * onto the tolerance is still closing at several px/s when it arrives there.
 * @internal
 */
export const sleepPushOutProgressSpeed = 1;
