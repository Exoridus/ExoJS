import type { Color } from '#core/Color';
import { playRenderTree } from '#rendering/plan/playRenderTree';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import { BackendTargetPass } from './BackendTargetPass';
import type { RenderingContext, RenderOptions } from './RenderingContext';
import type { RenderNode } from './RenderNode';
import { RenderPass, type RenderPassOptions } from './RenderPass';
import type { View } from './View';

/** Options for {@link RenderNodePass}. @advanced */
export interface RenderNodePassOptions extends RenderPassOptions {
  /** View to render the node with. Default: `target.view` when `target` is set, else `context.view`. */
  readonly view?: View;
  /**
   * Off-screen destination. When set, the node is rendered into this {@link RenderTexture} through the internal
   * target-redirect path (save / restore). `null` / omitted → the active target (canvas by default). Caller-owned
   * and must be stable across frames; the pass never allocates, pools, resizes, or destroys it.
   */
  readonly target?: RenderTexture | null;
  /** Clear the destination (the `target`, else the active target) to this colour immediately before the node renders. */
  readonly clear?: Color;
}

/**
 * Renders a scene subtree (a {@link RenderNode}) as one pass — into the active target, or off-screen when
 * `options.target` is set. The most common pass: world, HUD overlay, an off-screen scene capture.
 *
 * `view`/`target`/`clear` are fixed at construction; only `enabled`/`label` are mutable. The off-screen redirect is
 * built once and reused every frame (no per-frame allocation). The node and any caller `target` are NOT owned by
 * this pass — `destroy()` never frees them.
 * @advanced
 */
export class RenderNodePass extends RenderPass {
  private readonly _node: RenderNode;
  private readonly _target: RenderTexture | null;
  private readonly _clear: Color | null;
  private readonly _renderOptions: RenderOptions;
  private readonly _redirect: BackendTargetPass | null;

  public constructor(node: RenderNode, options?: RenderNodePassOptions) {
    super(options);

    this._node = node;
    this._target = options?.target ?? null;
    this._clear = options?.clear ?? null;
    this._renderOptions = options?.view !== undefined ? { view: options.view } : {};
    this._redirect =
      this._target !== null
        ? new BackendTargetPass(backend => playRenderTree(this._node, backend), {
            target: this._target,
            view: options?.view ?? this._target.view,
            ...(this._clear !== null && { clearColor: this._clear }),
          })
        : null;
  }

  public override execute(context: RenderingContext): void {
    if (this._redirect !== null) {
      context.backend.execute(this._redirect);

      return;
    }

    if (this._clear !== null) {
      context.backend.clear(this._clear);
    }

    context.render(this._node, this._renderOptions);
  }
}
