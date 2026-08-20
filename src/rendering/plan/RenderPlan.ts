import type { Color } from '#core/Color';
import type { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

import type { GroupScope } from './RenderScope';

/** @internal */
export interface RenderPassScope {
  target: RenderTarget | null;
  view: View;
  clearColor: Color | null;
  root: GroupScope;
}

/** @internal */
export interface RenderPlan {
  passes: RenderPassScope[];
  nodeCount: number;
  reset(): void;
}

/** @internal */
export class MutableRenderPlan implements RenderPlan {
  public readonly passes: RenderPassScope[] = [];
  public nodeCount = 0;

  /**
   * Reset the counters a build starts from. The pass list is deliberately NOT
   * emptied here: `RenderPlanBuilder.build` republishes it through
   * {@link setSinglePass} once it knows whether the collect produced anything,
   * and emptying it first would drop the pooled pass record - and the array's
   * backing store with it - on every single frame.
   */
  public reset(): void {
    this.nodeCount = 0;
  }

  /**
   * Publish this build's one pass, or no pass at all when `view` is `null`
   * (a collect that produced no entries). The pass record is reused across
   * frames; consumers read `passes` right after the build that filled it and
   * never hold it across another one.
   */
  public setSinglePass(view: View | null, root: GroupScope): void {
    if (view === null) {
      if (this.passes.length !== 0) {
        this.passes.length = 0;
      }

      return;
    }

    const pass = this.passes[0];

    if (pass === undefined) {
      this.passes.push({ target: null, view, clearColor: null, root });

      return;
    }

    pass.target = null;
    pass.view = view;
    pass.clearColor = null;
    pass.root = root;

    if (this.passes.length !== 1) {
      this.passes.length = 1;
    }
  }
}
