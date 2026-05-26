import { RenderEntryKind } from './RenderCommand';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope } from './RenderScope';

/** @internal */
export class RenderPlanOptimizer {
  public static optimize(plan: RenderPlan): void {
    for (const pass of plan.passes) {
      this._optimizeGroup(pass.root);
    }
  }

  private static _optimizeGroup(scope: GroupScope): void {
    if (scope.hasMixedZ) {
      const indexed = scope.entries.map((entry, index) => ({ entry, index }));

      indexed.sort((left, right) => {
        return left.entry.zIndex - right.entry.zIndex || left.entry.seq - right.entry.seq || left.index - right.index;
      });

      for (let i = 0; i < indexed.length; i++) {
        scope.entries[i] = indexed[i].entry;
      }
    }

    for (const entry of scope.entries) {
      if (entry.kind === RenderEntryKind.Group) {
        this._optimizeGroup(entry.scope);
      } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
        this._optimizeGroup(entry.scope.childPlan);
      }
    }
  }
}
