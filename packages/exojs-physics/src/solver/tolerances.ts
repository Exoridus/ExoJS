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
 * The value is empirical, not derived: a face contact converges to exactly one
 * slop at any gravity, but a single-point contact rests one static spring
 * deflection deeper, and that offset grows with gravity (0.28 px at
 * 1 000 px/s², 0.53 px at 10 000, 0.67 px at 15 000). Three slops clears that
 * envelope for the gravity range the engine is tuned for while staying far
 * below the failure it gates, which starts at several px. Beyond roughly
 * 15 000 px/s² the push-out cap binds and the resting depth stops following
 * the deflection law, settling into a narrow limit cycle just below this
 * tolerance instead - so sleep is delayed there rather than granted to an
 * embedded body.
 * @internal
 */
export const sleepPenetrationTolerance = 3 * contactSlop;
