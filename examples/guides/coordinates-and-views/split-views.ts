// #region guide:split-views
import { type RenderingContext, type RenderNode, View } from '@codexo/exojs';

export const createSplitViews = (width: number, height: number): { left: View; right: View } => ({
  left: new View(0, 0, width / 2, height).setViewport(0, 0, 0.5, 1),
  right: new View(0, 0, width / 2, height).setViewport(0.5, 0, 0.5, 1),
});

export const drawSplitWorld = (context: RenderingContext, world: RenderNode, left: View, right: View): void => {
  context.render(world, { view: left });
  context.render(world, { view: right });
};
// #endregion guide:split-views

// #region guide:pointer-world
import type { PointLike } from '@codexo/exojs';

export const pointerInWorld = (view: View, pointer: PointLike): PointLike => view.screenToWorld(pointer.x, pointer.y);
// #endregion guide:pointer-world
