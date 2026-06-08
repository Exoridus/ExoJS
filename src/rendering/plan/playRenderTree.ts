import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

import { RenderPlanBuilder } from './RenderPlanBuilder';
import { RenderPlanOptimizer } from './RenderPlanOptimizer';
import { RenderPlanPlayer } from './RenderPlanPlayer';

/** @internal — single source of truth for plan build→optimize→play. */
export function playRenderTree(node: RenderNode, backend: RenderBackend): void {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(node, backend);

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, backend);
  } finally {
    RenderPlanBuilder.release(builder);
  }
}
