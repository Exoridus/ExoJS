import type { RenderNode } from '#rendering/RenderNode';

import type { Pointer } from './Pointer';

/**
 * String literal union of every interaction event the
 * {@link InteractionManager} can deliver to a {@link RenderNode}.
 * Handlers attach via the node's `interactive*` API.
 */
export type InteractionEventType =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointerover'
  | 'pointerout'
  | 'pointertap'
  | 'contextmenu'
  | 'dragstart'
  | 'drag'
  | 'dragend';

/**
 * DOM-Event-shaped envelope dispatched by {@link InteractionManager} to
 * interactive scene nodes. Bubbles up the *entire* parent chain — `target`
 * stays pinned to the hit-deepest node while `currentTarget` advances to each
 * ancestor, whether or not that ancestor is itself interactive. Handlers may
 * call {@link InteractionEvent.stopPropagation} to halt the bubble.
 *
 * The envelope deliberately exposes no native `PointerEvent`: engine events
 * are frame-synchronous and outlive the platform event they came from. It also
 * has no `preventDefault` — a pointer event has no engine default behaviour to
 * suppress, and suppressing a *browser* default after the fact is not possible.
 */
export class InteractionEvent {
  public readonly type: InteractionEventType;
  /** The node that was originally hit (deepest interactive). Stable across bubble. */
  public readonly target: RenderNode;
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
