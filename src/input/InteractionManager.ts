import { Container } from '@/rendering/Container';
import { InteractionEvent } from './InteractionEvent';

import type { RenderNode } from '@/rendering/RenderNode';
import type { Application } from '@/core/Application';
import type { Pointer } from './Pointer';
import type { InteractionEventType } from './InteractionEvent';
import type { Signal } from '@/core/Signal';

export class InteractionManager {
    private readonly _app: Application;
    /** Maps pointerId → the deepest interactive RenderNode that pointer is currently over. */
    private readonly _lastHit = new Map<number, RenderNode>();

    private readonly _onPointerDownHandler: (pointer: Pointer) => void;
    private readonly _onPointerMoveHandler: (pointer: Pointer) => void;
    private readonly _onPointerUpHandler: (pointer: Pointer) => void;
    private readonly _onPointerTapHandler: (pointer: Pointer) => void;
    private readonly _onPointerCancelHandler: (pointer: Pointer) => void;
    private readonly _onPointerLeaveHandler: (pointer: Pointer) => void;

    public constructor(app: Application) {
        this._app = app;

        this._onPointerDownHandler = this._handlePointerDown.bind(this);
        this._onPointerMoveHandler = this._handlePointerMove.bind(this);
        this._onPointerUpHandler = this._handlePointerUp.bind(this);
        this._onPointerTapHandler = this._handlePointerTap.bind(this);
        this._onPointerCancelHandler = this._handlePointerCancel.bind(this);
        this._onPointerLeaveHandler = this._handlePointerLeave.bind(this);

        app.inputManager.onPointerDown.add(this._onPointerDownHandler);
        app.inputManager.onPointerMove.add(this._onPointerMoveHandler);
        app.inputManager.onPointerUp.add(this._onPointerUpHandler);
        app.inputManager.onPointerTap.add(this._onPointerTapHandler);
        app.inputManager.onPointerCancel.add(this._onPointerCancelHandler);
        app.inputManager.onPointerLeave.add(this._onPointerLeaveHandler);
    }

    public destroy(): void {
        this._app.inputManager.onPointerDown.remove(this._onPointerDownHandler);
        this._app.inputManager.onPointerMove.remove(this._onPointerMoveHandler);
        this._app.inputManager.onPointerUp.remove(this._onPointerUpHandler);
        this._app.inputManager.onPointerTap.remove(this._onPointerTapHandler);
        this._app.inputManager.onPointerCancel.remove(this._onPointerCancelHandler);
        this._app.inputManager.onPointerLeave.remove(this._onPointerLeaveHandler);
        this._lastHit.clear();
    }

    private _handlePointerDown(pointer: Pointer): void {
        const { x, y, id } = pointer;
        const hit = this._hitTest(x, y);
        const last = this._lastHit.get(id) ?? null;

        if (hit !== last) {
            if (last !== null) {
                this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
            }
            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointerover', hit, pointer, x, y));
            }
            this._setLastHit(id, hit);
        }

        if (hit !== null) {
            this._dispatchBubble(new InteractionEvent('pointerdown', hit, pointer, x, y));
        }

        this._updateCursor();
    }

    private _handlePointerMove(pointer: Pointer): void {
        const { x, y, id } = pointer;
        const hit = this._hitTest(x, y);
        const last = this._lastHit.get(id) ?? null;

        if (hit !== last) {
            if (last !== null) {
                this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
            }
            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointerover', hit, pointer, x, y));
            }
            this._setLastHit(id, hit);
        }

        if (hit !== null) {
            this._dispatchBubble(new InteractionEvent('pointermove', hit, pointer, x, y));
        }

        this._updateCursor();
    }

    private _handlePointerUp(pointer: Pointer): void {
        const { x, y } = pointer;
        const hit = this._hitTest(x, y);

        if (hit !== null) {
            this._dispatchBubble(new InteractionEvent('pointerup', hit, pointer, x, y));
        }

        this._updateCursor();
    }

    private _handlePointerTap(pointer: Pointer): void {
        const { x, y } = pointer;
        const hit = this._hitTest(x, y);

        if (hit !== null) {
            this._dispatchBubble(new InteractionEvent('pointertap', hit, pointer, x, y));
        }
    }

    private _handlePointerCancel(pointer: Pointer): void {
        const { x, y, id } = pointer;
        const last = this._lastHit.get(id) ?? null;

        if (last !== null) {
            this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
        }

        this._lastHit.delete(id);
        this._updateCursor();
    }

    private _handlePointerLeave(pointer: Pointer): void {
        const { x, y, id } = pointer;
        const last = this._lastHit.get(id) ?? null;

        if (last !== null) {
            this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
        }

        this._lastHit.delete(id);
        this._updateCursor();
    }

    private _setLastHit(id: number, node: RenderNode | null): void {
        if (node !== null) {
            this._lastHit.set(id, node);
        } else {
            this._lastHit.delete(id);
        }
    }

    private _hitTest(x: number, y: number): RenderNode | null {
        const root = this._app.sceneManager.scene?.root;

        if (!root) {
            return null;
        }

        return this._hitTestNode(root, x, y);
    }

    // Walk children in REVERSE order (top z-order first). Recurse into Container children even
    // when the container itself isn't interactive (so children can be hit through a non-interactive parent).
    // Return the FIRST (deepest, top-most) interactive node whose contains(x, y) returns true.
    private _hitTestNode(node: RenderNode, x: number, y: number): RenderNode | null {
        if (!node.visible) {
            return null;
        }

        if (node instanceof Container) {
            const children = node.children;

            for (let i = children.length - 1; i >= 0; i--) {
                const hit = this._hitTestNode(children[i], x, y);

                if (hit) {
                    return hit;
                }
            }
        }

        if (node.interactive && node.contains(x, y)) {
            return node;
        }

        return null;
    }

    private _dispatchBubble(event: InteractionEvent): void {
        let current: RenderNode | null = event.target;

        while (current !== null && !event.propagationStopped) {
            event.currentTarget = current;
            const signal = this._signalFor(event.type, current);

            signal.dispatch(event);

            if (event.propagationStopped) {
                break;
            }

            // Walk up to interactive ancestor only (parent must opt in to receive bubble).
            const parent: Container | null = current.parentNode;

            current = (parent !== null && parent.interactive) ? parent : null;
        }
    }

    private _signalFor(type: InteractionEventType, node: RenderNode): Signal<[InteractionEvent]> {
        switch (type) {
            case 'pointerdown': return node.onPointerDown;
            case 'pointerup': return node.onPointerUp;
            case 'pointermove': return node.onPointerMove;
            case 'pointerover': return node.onPointerOver;
            case 'pointerout': return node.onPointerOut;
            case 'pointertap': return node.onPointerTap;
        }
    }

    private _updateCursor(): void {
        let cursor: string | null = null;

        for (const node of this._lastHit.values()) {
            let n: RenderNode | null = node;

            while (n !== null) {
                if (n.cursor !== null) {
                    cursor = n.cursor;
                    break;
                }

                const p: Container | null = n.parentNode;

                n = p;
            }

            if (cursor !== null) {
                break;
            }
        }

        this._app.canvas.style.cursor = cursor ?? '';
    }
}
