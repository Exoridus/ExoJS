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
 * Penetration (px) above which a contact still counts as unresolved for the
 * sleep decision, so neither of its bodies may bank sleep time.
 *
 * The solver drives every resting contact down to {@link contactSlop}, but only
 * at a capped push-out speed that is below the sleep velocity threshold: a body
 * that landed hard therefore looks motionless long before its overlap is worked
 * off, and sleeping it would freeze it visibly embedded. Both sides must read
 * the same tolerance, or the sleep gate and the constraint it is gating drift
 * apart.
 *
 * Three slops of headroom: the converged fixed point is one slop for a
 * face contact and a little above it for a single-point one, while the failure
 * case is several px deep.
 * @internal
 */
export const maxRestingPenetration = 3 * contactSlop;
