import type { RenderPlan } from '#rendering/plan/RenderPlan';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { View } from '#rendering/View';

/**
 * A single-pass {@link RenderPlan} drawing `root` to the backbuffer without a
 * clear - the smallest plan the optimizer and the player accept.
 *
 * The returned plan is mutable, so a test that needs a second pass or a
 * different `nodeCount` writes it on the result rather than restating the
 * interface in a literal that would fall behind it.
 */
export const createRenderPlanDouble = (view: View, root: GroupScope): RenderPlan => ({
  passes: [{ target: null, view, clearColor: null, root }],
  nodeCount: root.entries.length,
  reset(): void {
    this.passes.length = 0;
    this.nodeCount = 0;
  },
});
