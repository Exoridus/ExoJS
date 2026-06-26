import type { RenderNode } from '#rendering/RenderNode';

import type { Application } from './Application';

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
 * Friend-class hooks a scene node uses to reach its owning keyboard-focus
 * service. Implemented by `FocusManager`. Kept on the {@link Stage} so a node
 * never needs a direct reference to the manager.
 */
export interface FocusHooks {
  /** The node that currently holds keyboard focus, or `null`. */
  readonly focused: RenderNode | null;
  /** Move keyboard focus to `node` (a no-op when `node.focusable` is `false`). */
  focus(node: RenderNode): void;
  /** Clear focus, or only clear it when `node` currently holds it. */
  blur(node?: RenderNode): void;
  /** @internal — drop focus when a focused node (or an ancestor) leaves the tree. */
  _notifyNodeRemoved(node: RenderNode): void;
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
  readonly focus: FocusHooks;
  /**
   * The owning {@link Application}. Present in all production stages created by
   * {@link InteractionManager}; may be absent in lightweight test stubs (hence
   * optional). Widgets that need input access should use `this._stage?.app`.
   */
  readonly app?: Application;
}
