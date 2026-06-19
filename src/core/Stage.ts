import type { RenderNode } from '#rendering/RenderNode';

/**
 * Friend-class hooks a scene node uses to notify its owning interaction service
 * of lifecycle and bounds changes. Implemented by `InteractionManager`. Kept on
 * the {@link Stage} so a node never needs a direct reference to the manager.
 */
export interface InteractionHooks {
  _notifyNodeAdded(node: RenderNode): void;
  _notifyNodeRemoved(node: RenderNode): void;
  _notifyInteractiveChanged(node: RenderNode, becameInteractive: boolean): void;
  _notifyBoundsInvalidated(node: RenderNode): void;
}

/**
 * Per-Application service bundle that scene nodes reach through their owning
 * tree — set on attach via `SceneNode._setStage` and cleared on detach.
 *
 * Replaces the former process-global active-manager singleton: each Application
 * owns its own stage, so multiple Applications coexist on one page without
 * cross-talk (a node always routes to *its* app's services). The interface is
 * intentionally a bundle so additional app-scoped services (UI/focus, …) can be
 * added without rewiring node ownership.
 */
export interface Stage {
  readonly interaction: InteractionHooks;
}
