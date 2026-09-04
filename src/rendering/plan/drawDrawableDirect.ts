import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';

/** The two plan-depth hooks a backend may implement; both are optional (test stubs implement neither). */
interface DrawPlanDepthHooks {
  _beginDrawPlan?(nodeCount: number): void;
  _endDrawPlan?(): void;
}

/**
 * Draw ONE already-resolved drawable that engine-internal effect code owns,
 * without building a render plan for it.
 *
 * `RenderNode.render()` is `playRenderTree` - build, optimize, play - and the
 * filter and composite paths call it once per sprite they draw. That is a whole
 * plan cycle to issue a single quad the caller already holds, positioned by the
 * caller, into a target the caller already bound. A blur at quality 3 pays it
 * fifteen times per filtered node per frame.
 *
 * Everything the plan would have contributed for this one node is either
 * already true or already provided:
 *
 * - TARGET / VIEW / CLEAR - the enclosing `BackendTargetPass` bound them. A
 *   single-sprite plan's pass carries `target: null` and the backend's own
 *   view, so playing it changes neither.
 * - TRANSFORM SLOT - the renderers already fall back to `pushTransform` when
 *   no plan draw command is active (`WebGl2SpriteRenderer`), which is the same
 *   row the plan would have written at its group upload boundary.
 * - FLUSH ORDER - the plan-depth bracket below keeps it. Ending a NESTED plan
 *   flushes the active renderer and rewinds the transform rows it pushed, so
 *   the drawable's batch lands in the target that is bound now and the
 *   frame-scoped buffer does not grow per effect pass.
 * - CULLING - deliberately dropped. The plan would have tested this drawable
 *   against the cull rect, but effect code only reaches here for output it has
 *   already decided to produce, and the quad fills the target it draws into.
 *   The test can only remove a draw the caller asked for.
 *
 * NOT a general fast path and not a public one: it takes a drawable whose
 * transform and texture the caller has just set, with no children, no filters
 * and no effects of its own. Anything with a subtree still goes through
 * `playRenderTree`.
 * @internal
 */
export const drawDrawableDirect = (drawable: Drawable, backend: RenderBackend): void => {
  const hooks = backend as RenderBackend & DrawPlanDepthHooks;

  hooks._beginDrawPlan?.(1);

  try {
    backend.draw(drawable);
  } finally {
    hooks._endDrawPlan?.();
  }
};
