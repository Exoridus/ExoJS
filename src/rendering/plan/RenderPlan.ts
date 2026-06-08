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

  public reset(): void {
    this.passes.length = 0;
    this.nodeCount = 0;
  }
}
