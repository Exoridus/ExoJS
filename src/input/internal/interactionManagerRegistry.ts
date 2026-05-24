import type { RenderNode } from '@/rendering/RenderNode';

export interface InteractionManagerRegistryHooks {
  _notifyNodeAdded(node: RenderNode): void;
  _notifyNodeRemoved(node: RenderNode): void;
  _notifyInteractiveChanged(node: RenderNode, becameInteractive: boolean): void;
  _notifyBoundsInvalidated(node: RenderNode): void;
}

let _activeManager: InteractionManagerRegistryHooks | null = null;

export function getActiveInteractionManager(): InteractionManagerRegistryHooks | null {
  return _activeManager;
}

export function setActiveInteractionManager(manager: InteractionManagerRegistryHooks | null): void {
  _activeManager = manager;
}
