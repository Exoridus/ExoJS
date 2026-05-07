/**
 * Lightweight module that holds the module-level InteractionManager pointer
 * used by SceneNode / Container / RenderNode hooks.
 *
 * Kept in its own file to break the circular import chain:
 *   SceneNode ← InteractionManager ← Container ← RenderNode ← SceneNode
 *
 * By splitting the singleton out here, SceneNode/Container/RenderNode can
 * import from this module while InteractionManager (which imports Container)
 * remains free of a SceneNode ↔ InteractionManager cycle.
 *
 * @internal
 */

import type { RenderNode } from '@/rendering/RenderNode';

export interface InteractionManagerHooks {
    _notifyNodeAdded(node: RenderNode): void;
    _notifyNodeRemoved(node: RenderNode): void;
    _notifyInteractiveChanged(node: RenderNode, becameInteractive: boolean): void;
    _notifyBoundsInvalidated(node: RenderNode): void;
}

let _currentManager: InteractionManagerHooks | null = null;

/**
 * Returns the currently-registered InteractionManager, or null if none is
 * active. Called by RenderNode / Container / SceneNode hooks.
 *
 * @internal
 */
export function _getCurrentInteractionManager(): InteractionManagerHooks | null {
    return _currentManager;
}

/**
 * Register the active InteractionManager. Called from the InteractionManager
 * constructor. Last-constructed-wins (single-Application assumed).
 *
 * @internal
 */
export function _setCurrentInteractionManager(manager: InteractionManagerHooks | null): void {
    _currentManager = manager;
}
