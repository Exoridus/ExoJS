/**
 * The playability line the published comparison marks against, and the one
 * judgement in this harness that is about a number's meaning rather than about
 * how two numbers differ.
 *
 * It is deliberately the WHOLE 60 fps frame and not a fraction of it. How much
 * of a frame a game may spend on physics, or on the CPU side of rendering, is
 * the reader's decision and depends on everything else their frame does. What is
 * not a decision is a single step or frame that costs more than the frame it has
 * to fit in: no schedule of the remaining work rescues it. Marking that line
 * therefore states a fact about the measurement; marking a fraction of it would
 * state an opinion about the reader's budget.
 *
 * Nothing is derived from it beyond the mark. A "bodies at N ms" capacity number
 * would be an interpolation between rungs rather than a measured value, and the
 * comparison publishes only what was measured.
 */

/** One 60 fps frame, in milliseconds. */
export const FRAME_BUDGET_MS = 16.7;

/**
 * Whether a published time is past a whole frame, and therefore unplayable
 * regardless of how the rest of the frame is budgeted.
 *
 * A value no arm produced is not over budget: an absence is not a result.
 */
export const exceedsFrameBudget = (ms: number | null): boolean => ms !== null && Number.isFinite(ms) && ms > FRAME_BUDGET_MS;
