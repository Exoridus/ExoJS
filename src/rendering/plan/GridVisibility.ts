import type { ReadonlyRectangle } from '#math/Rectangle';

import { FlatScanVisibility } from './FlatScanVisibility';
import type { RenderItemVisibility } from './RenderItemVisibility';
import type { SourceScope } from './renderSourceItem';
import type { MembershipBits, VisibilityQueryStats } from './SourceVisibilityIndex';

/**
 * @internal
 *
 * Uniform grid over the scope's indexable items, with the two classes a grid
 * cannot hold answered beside it (see {@link SourceVisibilityIndex}).
 *
 * Falls back to the flat scan for a scope whose index never got built, so the
 * seam has no state in which it produces a wrong set rather than a slow one.
 */
export class GridVisibility implements RenderItemVisibility {
  private readonly _fallback = new FlatScanVisibility();

  public select(scope: SourceScope, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void {
    if (!scope.index.isBuilt) {
      this._fallback.select(scope, rect, bits, stats);

      return;
    }

    scope.index.query(scope.items, rect, bits, stats);
  }
}
