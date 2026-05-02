import type { Pointer } from './Pointer';
import type { RenderNode } from '@/rendering/RenderNode';

export type InteractionEventType =
    | 'pointerdown'
    | 'pointerup'
    | 'pointermove'
    | 'pointerover'
    | 'pointerout'
    | 'pointertap';

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
    private _stopped: boolean = false;

    public constructor(
        type: InteractionEventType,
        target: RenderNode,
        pointer: Pointer,
        worldX: number,
        worldY: number,
    ) {
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

    public stopPropagation(): void {
        this._stopped = true;
    }
}
