import type { Stage } from '#core/Stage';
import type { RenderNode } from '#rendering/RenderNode';

/** Tracks the scene roots whose Stage bindings belong to one interaction system. @internal */
export class InteractionRootBindings {
  private readonly _roots = new Map<RenderNode, Stage>();
  private _destroyed = false;

  public get destroyed(): boolean {
    return this._destroyed;
  }

  public attach(root: RenderNode, stage: Stage): boolean {
    if (this._destroyed) {
      return false;
    }

    this._roots.set(root, stage);
    root._setStage(stage);

    return true;
  }

  public detach(root: RenderNode, stage: Stage): boolean {
    if (this._roots.get(root) === stage) {
      this._roots.delete(root);
    }

    return root._getStage() === stage;
  }

  public destroy(): boolean {
    if (this._destroyed) {
      return false;
    }

    this._destroyed = true;

    for (const [root, stage] of this._roots) {
      if (root._getStage() === stage) {
        root._setStage(null);
      }
    }

    this._roots.clear();

    return true;
  }
}
