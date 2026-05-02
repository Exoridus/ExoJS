import { Container } from '@/rendering/Container';
import { InteractionEvent } from './InteractionEvent';

import type { RenderNode } from '@/rendering/RenderNode';
import type { Application } from '@/core/Application';
import type { Pointer } from './Pointer';
import type { InteractionEventType } from './InteractionEvent';
import type { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

const enum PointerEventFlag {
    None   = 0,
    Down   = 1 << 0,
    Move   = 1 << 1,
    Up     = 1 << 2,
    Tap    = 1 << 3,
    Cancel = 1 << 4,
    Leave  = 1 << 5,
}

interface PointerQueue {
    pointer: Pointer;
    events: number; // bitfield of PointerEventFlag
}

interface DragState {
    pointerId: number;
    node: RenderNode;
    offsetX: number;
    offsetY: number;
}

// ---------------------------------------------------------------------------

export class InteractionManager {
    private readonly _app: Application;

    /** Maps pointerId → the deepest interactive RenderNode that pointer is currently over. */
    private readonly _lastHit = new Map<number, RenderNode>();

    /** Pending per-pointer event queues, filled by signal handlers each frame. */
    private readonly _pending = new Map<number, PointerQueue>();

    /** Active pointer captures set up by drag-start. Maps pointerId → the captured node. */
    private readonly _capturedPointers = new Map<number, RenderNode>();

    /** Active drag states. Maps pointerId → drag metadata. */
    private readonly _drags = new Map<number, DragState>();

    /** Whether any pointer enqueued events since the last update(). */
    private _dirty = false;

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

    /**
     * Returns the RenderNode currently hovered by the given pointer, or null.
     * If pointerId is omitted, returns the hovered node for the first pointer
     * in iteration order (typically the primary mouse pointer).
     */
    public getHoveredNode(pointerId?: number): RenderNode | null {
        if (pointerId !== undefined) {
            return this._lastHit.get(pointerId) ?? null;
        }

        const firstEntry = this._lastHit.values().next();

        return firstEntry.done ? null : firstEntry.value;
    }

    public destroy(): void {
        this._app.inputManager.onPointerDown.remove(this._onPointerDownHandler);
        this._app.inputManager.onPointerMove.remove(this._onPointerMoveHandler);
        this._app.inputManager.onPointerUp.remove(this._onPointerUpHandler);
        this._app.inputManager.onPointerTap.remove(this._onPointerTapHandler);
        this._app.inputManager.onPointerCancel.remove(this._onPointerCancelHandler);
        this._app.inputManager.onPointerLeave.remove(this._onPointerLeaveHandler);
        this._lastHit.clear();
        this._pending.clear();
        this._capturedPointers.clear();
        this._drags.clear();
        this._dirty = false;
    }

    /**
     * Process all pending pointer events accumulated since the last frame.
     * Must be called once per frame from {@link Application.update}, after
     * `inputManager.update()` has run (so signals are already dispatched and
     * queued here) and before game-state updates so that user listeners on
     * `onPointerDown` etc. fire before per-frame logic mutates state.
     *
     * The dirty flag ensures this is a no-op on frames with no pointer
     * activity; every signal handler that enqueues an event sets `_dirty =
     * true`, and `update()` clears it at the top before draining the queue.
     */
    public update(): void {
        if (!this._dirty) return;
        this._dirty = false;

        for (const queue of this._pending.values()) {
            this._processQueue(queue);
        }

        this._pending.clear();
        this._updateCursor();
    }

    // ---------------------------------------------------------------------------
    // Signal handlers — only enqueue flags, never hit-test
    // ---------------------------------------------------------------------------

    private _handlePointerDown(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Down);
    }

    private _handlePointerMove(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Move);
    }

    private _handlePointerUp(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Up);
    }

    private _handlePointerTap(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Tap);
    }

    private _handlePointerCancel(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Cancel);
    }

    private _handlePointerLeave(pointer: Pointer): void {
        this._enqueue(pointer, PointerEventFlag.Leave);
    }

    private _enqueue(pointer: Pointer, flag: PointerEventFlag): void {
        let q = this._pending.get(pointer.id);

        if (!q) {
            q = { pointer, events: 0 };
            this._pending.set(pointer.id, q);
        } else {
            // Refresh to latest pointer ref (same object usually, but be defensive).
            q.pointer = pointer;
        }

        q.events |= flag;
        this._dirty = true;
    }

    // ---------------------------------------------------------------------------
    // Per-frame queue processing
    // ---------------------------------------------------------------------------

    private _processQueue(queue: PointerQueue): void {
        const { pointer, events } = queue;
        const { id, x, y } = pointer;

        // Determine the hit node. Captured pointers short-circuit hit-testing.
        const captured = this._capturedPointers.get(id) ?? null;
        const hit = captured !== null ? captured : this._hitTest(x, y);

        // --- Over / Out transitions ---
        // Skip while a drag is active for this pointer — the dragged node
        // stays "hovered" by definition and we don't want spurious events.
        const drag = this._drags.get(id) ?? null;
        const last = this._lastHit.get(id) ?? null;
        const isExitEvent = (events & (PointerEventFlag.Cancel | PointerEventFlag.Leave)) !== 0;

        if (captured === null && hit !== last && !isExitEvent) {
            if (last !== null) {
                this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
            }

            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointerover', hit, pointer, x, y));
            }

            this._setLastHit(id, hit);
        }

        // --- Down ---
        if ((events & PointerEventFlag.Down) !== 0) {
            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointerdown', hit, pointer, x, y));

                // Start drag if node is draggable and no existing drag for this pointer.
                if (hit.draggable && !this._drags.has(id)) {
                    const offsetX = hit.position.x - x;
                    const offsetY = hit.position.y - y;

                    this._drags.set(id, { pointerId: id, node: hit, offsetX, offsetY });
                    this._capturedPointers.set(id, hit);

                    try {
                        this._app.canvas.setPointerCapture(id);
                    } catch {
                        // Best-effort — jsdom and some browsers may not support this.
                    }

                    this._dispatchDirect(new InteractionEvent('dragstart', hit, pointer, x, y), hit.onDragStart);
                }
            }
        }

        // --- Move ---
        if ((events & PointerEventFlag.Move) !== 0) {
            if (drag !== null) {
                // Auto-position the dragged node, preserving the grab offset.
                drag.node.position.x = x + drag.offsetX;
                drag.node.position.y = y + drag.offsetY;
            }

            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointermove', hit, pointer, x, y));
            }

            if (drag !== null) {
                this._dispatchDirect(new InteractionEvent('drag', drag.node, pointer, x, y), drag.node.onDrag);
            }
        }

        // --- Up ---
        if ((events & PointerEventFlag.Up) !== 0) {
            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointerup', hit, pointer, x, y));
            }

            if (drag !== null) {
                this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node.onDragEnd);
                this._endDrag(id);
            }
        }

        // --- Tap ---
        if ((events & PointerEventFlag.Tap) !== 0) {
            if (hit !== null) {
                this._dispatchBubble(new InteractionEvent('pointertap', hit, pointer, x, y));
            }
        }

        // --- Cancel / Leave ---
        if (isExitEvent) {
            if (drag !== null) {
                this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node.onDragEnd);
                this._endDrag(id);
            } else if (last !== null) {
                this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
            }

            this._lastHit.delete(id);
        }
    }

    private _endDrag(pointerId: number): void {
        this._drags.delete(pointerId);
        this._capturedPointers.delete(pointerId);

        try {
            this._app.canvas.releasePointerCapture(pointerId);
        } catch {
            // Releasing an already-released pointer throws in some browsers; swallow it.
        }
    }

    // ---------------------------------------------------------------------------
    // Hit-testing
    // ---------------------------------------------------------------------------

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

    // ---------------------------------------------------------------------------
    // Dispatch helpers
    // ---------------------------------------------------------------------------

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

    /** Dispatch an event directly on a single node without bubbling. */
    private _dispatchDirect(event: InteractionEvent, signal: Signal<[InteractionEvent]>): void {
        event.currentTarget = event.target;
        signal.dispatch(event);
    }

    private _signalFor(type: InteractionEventType, node: RenderNode): Signal<[InteractionEvent]> {
        switch (type) {
            case 'pointerdown': return node.onPointerDown;
            case 'pointerup': return node.onPointerUp;
            case 'pointermove': return node.onPointerMove;
            case 'pointerover': return node.onPointerOver;
            case 'pointerout': return node.onPointerOut;
            case 'pointertap': return node.onPointerTap;
            case 'dragstart': return node.onDragStart;
            case 'drag': return node.onDrag;
            case 'dragend': return node.onDragEnd;
        }
    }

    // ---------------------------------------------------------------------------
    // Cursor
    // ---------------------------------------------------------------------------

    private _setLastHit(id: number, node: RenderNode | null): void {
        if (node !== null) {
            this._lastHit.set(id, node);
        } else {
            this._lastHit.delete(id);
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
