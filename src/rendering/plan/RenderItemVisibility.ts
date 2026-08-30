import type { ReadonlyRectangle } from '#math/Rectangle';

import type { SourceScope } from './renderSourceItem';
import type { MembershipBits, VisibilityQueryStats } from './SourceVisibilityIndex';

/**
 * @internal
 *
 * Decides which of one source scope's persistent items a cull rect admits, by
 * setting their bits in `bits`.
 *
 * The seam exists because the answer is a measurement, not an assumption, and
 * the cut-2 measurement moved it: at a million items the flat scan is not the
 * dominant cost of a camera step (materialising the ~250,000 admitted items is),
 * but once that materialisation is incremental the scan is all that is left, and
 * a full pass over a million items does not fit in the 8ms the target allows. So
 * both live here, the grid is the default, and the scan stays the reference the
 * grid is pinned against.
 *
 * The membership-set shape - rather than cut 1's per-item predicate - is what
 * the delta needs. A predicate answers one item at a time in recorded order,
 * which forces the caller to visit every item; a set lets an index answer "what
 * does this rect contain" and lets the caller diff two answers word-wise.
 */
export interface RenderItemVisibility {
  /** Set a bit in `bits` for every item of `scope` that `rect` admits. */
  select(scope: SourceScope, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void;
}
