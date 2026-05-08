import type { RenderNode } from '@/rendering/RenderNode';

import type { Pointer } from './Pointer';

/**
 * String literal union of every interaction event the
 * {@link InteractionManager} can deliver to a {@link RenderNode}.
 * Handlers attach via the node's `interactive*` API.
 */
export type InteractionEventType = 'pointerdown' | 'pointerup' | 'pointermove' | 'pointerover' | 'pointerout' | 'pointertap' | 'dragstart' | 'drag' | 'dragend';

/**
 * DOM-Event-shaped envelope dispatched by {@link InteractionManager} to
 * interactive scene nodes. Bubbles up the parent chain — `target` stays
 * pinned to the hit-deepest node while `currentTarget` advances to each
 * ancestor that receives the event. Handlers may call
 * {@link InteractionEvent.stopPropagation} to halt the bubble.
 */
export class InteractionEvent {
  public readonly type: InteractionEventType;
  /** The node that was originally hit (deepest interactive). Stable across bubble. */
  public target: RenderNode;
  /** The node currently dispatching this event during bubbling. Changes per bubble step. */
  public currentTarget: RenderNode;
  public readonly pointer: Pointer;
  /** Canvas-space coordinates (same space as Pointer.x/y). */
  public readonly worldX: number;
  public readonly worldY: number;
  private _stopped = false;

  public constructor(type: InteractionEventType, target: RenderNode, pointer: Pointer, worldX: number, worldY: number) {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.pointer = pointer;
    this.worldX = worldX;
    this.worldY = worldY;
  }

  public get propagationStopped(): boolean {
    return this._stopped;
  }

  /** Halt further bubbling up the parent chain for this event. */
  public stopPropagation(): void {
    this._stopped = true;
  }
}
