import type { Application } from '@/core/Application';
import type { Signal } from '@/core/Signal';
import { setActiveInteractionManager } from '@/input/internal/interactionManagerRegistry';
import type { QuadtreeItem } from '@/math/Quadtree';
import { Quadtree } from '@/math/Quadtree';
import { Rectangle } from '@/math/Rectangle';
import { Container } from '@/rendering/Container';
import type { RenderNode } from '@/rendering/RenderNode';

import type { InteractionEventType } from './InteractionEvent';
import { InteractionEvent } from './InteractionEvent';
import type { Pointer } from './Pointer';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

const enum PointerEventFlag {
  None = 0,
  Down = 1 << 0,
  Move = 1 << 1,
  Up = 1 << 2,
  Tap = 1 << 3,
  Cancel = 1 << 4,
  Leave = 1 << 5,
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
// Spatial-index types
// ---------------------------------------------------------------------------

interface IndexedNode {
  node: RenderNode;
  order: number;
}

// ---------------------------------------------------------------------------

/**
 * Routes pointer events from the {@link InputManager} to interactive
 * scene-graph nodes via DOM-style event bubbling. Maintains a persistent
 * quadtree spatial index of interactive {@link RenderNode}s for hit-testing
 * and updates it incrementally — nodes notify the manager via the
 * `_notify*` hooks when they enter/leave the scene, change interactivity,
 * or move (causing bounds to dirty).
 *
 * Dispatches {@link InteractionEvent}s of every type in
 * {@link InteractionEventType}: `pointerdown` / `pointerup` /
 * `pointermove` / `pointerover` / `pointerout` / `pointertap` /
 * `dragstart` / `drag` / `dragend`. Drag events are derived from
 * threshold-based pointer movement after a `pointerdown`.
 *
 * Constructed automatically by {@link Application}; you do not instantiate
 * this class yourself.
 */
export class InteractionManager {
  private readonly _app: Application;

  // Persistent quadtree — null when no interactive nodes are present.
  private _quadtree: Quadtree<IndexedNode> | null = null;

  // All currently-tracked interactive RenderNodes.
  private _interactiveNodes = new Set<RenderNode>();

  // Nodes whose quadtree entry is stale (bounds changed since last insert).
  private _staleNodes = new Set<RenderNode>();

  // Items stored in the quadtree, keyed by node for fast removal.
  private _quadtreeItems = new Map<RenderNode, QuadtreeItem<IndexedNode>>();

  // Running insertion-order counter used to break hit-test ties.
  private _quadtreeOrderCounter = 0;

  private readonly _quadtreeQueryBuffer: Array<QuadtreeItem<IndexedNode>> = [];

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

    // Register as the active singleton so RenderNode / Container / SceneNode hooks
    // can reach the manager without holding an explicit reference.
    setActiveInteractionManager(this);

    this._onPointerDownHandler = this._handlePointerDown.bind(this);
    this._onPointerMoveHandler = this._handlePointerMove.bind(this);
    this._onPointerUpHandler = this._handlePointerUp.bind(this);
    this._onPointerTapHandler = this._handlePointerTap.bind(this);
    this._onPointerCancelHandler = this._handlePointerCancel.bind(this);
    this._onPointerLeaveHandler = this._handlePointerLeave.bind(this);

    app.input.onPointerDown.add(this._onPointerDownHandler);
    app.input.onPointerMove.add(this._onPointerMoveHandler);
    app.input.onPointerUp.add(this._onPointerUpHandler);
    app.input.onPointerTap.add(this._onPointerTapHandler);
    app.input.onPointerCancel.add(this._onPointerCancelHandler);
    app.input.onPointerLeave.add(this._onPointerLeaveHandler);
  }

  /**
   * Returns the RenderNode currently hovered by the given pointer, or null.
   * If pointerId is omitted, returns the hovered node for the first pointer
   * in iteration order (typically the primary mouse pointer).
   */
  /**
   * Return the deepest interactive node currently under the given pointer,
   * or under any active pointer when `pointerId` is omitted (the first
   * pointer with a hit wins). `null` when no pointer is hovering an
   * interactive node.
   */
  public getHoveredNode(pointerId?: number): RenderNode | null {
    if (pointerId !== undefined) {
      return this._lastHit.get(pointerId) ?? null;
    }

    const firstEntry = this._lastHit.values().next();

    return firstEntry.done ? null : firstEntry.value;
  }

  /**
   * Returns all currently captured RenderNodes (nodes that have an active
   * drag / pointer-capture in progress). Used by debug layers.
   */
  /**
   * Snapshot of nodes that currently have pointer-capture (a pointer
   * pressed inside them and is being dragged). Used internally for drag
   * routing; exposed read-only for diagnostic / debug consumers.
   */
  public getCapturedNodes(): readonly RenderNode[] {
    return [...this._capturedPointers.values()];
  }

  /**
   * Returns the internal quadtree used for spatial hit-testing, or null when
   * no interactive nodes are present. Used by {@link HitTestLayer} to render
   * the quadtree partitioning during development. Not part of the stable
   * public API — friend-class access only.
   *
   * @internal
   */
  public _getDebugQuadtree(): Quadtree<{ node: RenderNode; order: number }> | null {
    return this._quadtree;
  }

  public destroy(): void {
    this._app.input.onPointerDown.remove(this._onPointerDownHandler);
    this._app.input.onPointerMove.remove(this._onPointerMoveHandler);
    this._app.input.onPointerUp.remove(this._onPointerUpHandler);
    this._app.input.onPointerTap.remove(this._onPointerTapHandler);
    this._app.input.onPointerCancel.remove(this._onPointerCancelHandler);
    this._app.input.onPointerLeave.remove(this._onPointerLeaveHandler);
    this._lastHit.clear();
    this._pending.clear();
    this._capturedPointers.clear();
    this._drags.clear();
    this._interactiveNodes.clear();
    this._staleNodes.clear();
    this._quadtreeItems.clear();
    this._dirty = false;

    if (this._quadtree !== null) {
      this._quadtree.destroy();
      this._quadtree = null;
    }

    setActiveInteractionManager(null);
  }

  /**
   * Process all pending pointer events accumulated since the last frame.
   * Must be called once per frame from {@link Application.update}, after
   * `input.update()` has run (so signals are already dispatched and
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

    this._flushStaleEntries();

    for (const queue of this._pending.values()) {
      this._processQueue(queue);
    }

    this._pending.clear();
    this._updateCursor();
  }

  // ---------------------------------------------------------------------------
  // Hooks called by RenderNode / Container / SceneNode
  // These are prefixed _ to signal "internal-but-public".
  // ---------------------------------------------------------------------------

  /**
   * Called when a subtree rooted at `node` has been added to the scene.
   * Walks the subtree and registers any interactive nodes found.
   *
   * @internal
   */
  public _notifyNodeAdded(node: RenderNode): void {
    for (const n of this._iterateSubtree(node)) {
      if (n.interactive) {
        this._registerNode(n);
      }
    }
  }

  /**
   * Called when a subtree rooted at `node` is about to be removed from the
   * scene. Walks the subtree and unregisters any interactive nodes found.
   *
   * @internal
   */
  public _notifyNodeRemoved(node: RenderNode): void {
    for (const n of this._iterateSubtree(node)) {
      if (this._interactiveNodes.has(n)) {
        this._unregisterNode(n);
      }
    }
  }

  /**
   * Called when a node's `interactive` property changes.
   *
   * @internal
   */
  public _notifyInteractiveChanged(node: RenderNode, becameInteractive: boolean): void {
    if (becameInteractive) {
      this._registerNode(node);
    } else {
      this._unregisterNode(node);
    }
  }

  /**
   * Called when a node's world transform / bounds are invalidated. If the
   * node is currently tracked as interactive, mark it stale so its quadtree
   * entry is refreshed on the next query.
   *
   * @internal
   */
  public _notifyBoundsInvalidated(node: RenderNode): void {
    if (this._interactiveNodes.has(node)) {
      this._staleNodes.add(node);
    }
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
    if (this._quadtree !== null) {
      return this._hitTestIndexed(x, y);
    }

    const root = this._app.scene.currentScene?.root;

    if (!root) {
      return null;
    }

    return this._hitTestNode(root, x, y);
  }

  private _hitTestIndexed(x: number, y: number): RenderNode | null {
    const candidates = this._quadtreeQueryBuffer;

    candidates.length = 0;
    this._quadtree!.queryPoint(x, y, candidates);

    let bestOrder = -1;
    let bestNode: RenderNode | null = null;

    for (const candidate of candidates) {
      const indexed = candidate.payload;

      if (indexed.order > bestOrder && indexed.node.contains(x, y)) {
        bestOrder = indexed.order;
        bestNode = indexed.node;
      }
    }

    return bestNode;
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
  // Persistent spatial index management
  // ---------------------------------------------------------------------------

  /**
   * Register an interactive node: add it to the tracking set, create the
   * quadtree if this is the first interactive node, and insert the node.
   */
  private _registerNode(node: RenderNode): void {
    if (this._interactiveNodes.has(node)) {
      return;
    }

    this._interactiveNodes.add(node);

    // Lazy-init the quadtree on the first interactive node.
    if (this._quadtree === null) {
      this._quadtree = this._createQuadtree();
    }

    this._insertNode(node);
  }

  /**
   * Unregister an interactive node: remove from the quadtree and tracking
   * set. Dispose the quadtree when it becomes empty.
   */
  private _unregisterNode(node: RenderNode): void {
    if (!this._interactiveNodes.has(node)) {
      return;
    }

    this._interactiveNodes.delete(node);
    this._staleNodes.delete(node);

    const item = this._quadtreeItems.get(node);

    if (item !== undefined && this._quadtree !== null) {
      this._quadtree.remove(item);
    }

    this._quadtreeItems.delete(node);

    if (this._interactiveNodes.size === 0 && this._quadtree !== null) {
      this._quadtree.destroy();
      this._quadtree = null;
      this._quadtreeOrderCounter = 0;
    }
  }

  /**
   * Insert a single node into the quadtree (or mark it stale to be inserted
   * at next flush if the quadtree is not yet ready).
   */
  private _insertNode(node: RenderNode): void {
    if (this._quadtree === null) {
      return;
    }

    const bounds = node.getBounds();
    const item: QuadtreeItem<IndexedNode> = {
      bounds: new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height),
      payload: { node, order: this._quadtreeOrderCounter++ },
    };

    this._quadtree.insert(item);
    this._quadtreeItems.set(node, item);
  }

  /**
   * Flush stale entries: remove each stale node's old quadtree entry and
   * re-insert it with fresh bounds. Called at the start of update().
   */
  private _flushStaleEntries(): void {
    if (this._quadtree === null || this._staleNodes.size === 0) {
      return;
    }

    for (const node of this._staleNodes) {
      const oldItem = this._quadtreeItems.get(node);

      if (oldItem !== undefined) {
        this._quadtree.remove(oldItem);
        oldItem.bounds.destroy();
      }

      this._quadtreeItems.delete(node);

      // Re-insert with current bounds.
      const bounds = node.getBounds();
      const newItem: QuadtreeItem<IndexedNode> = {
        bounds: new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height),
        payload: { node, order: oldItem?.payload.order ?? this._quadtreeOrderCounter++ },
      };

      this._quadtree.insert(newItem);
      this._quadtreeItems.set(node, newItem);
    }

    this._staleNodes.clear();
  }

  /** Build a fresh Quadtree sized to encompass the canvas + current scene root. */
  private _createQuadtree(): Quadtree<IndexedNode> {
    const canvas = this._app.canvas;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width || 800;
    const height = rect.height || canvas.height || 600;
    const bounds = new Rectangle(0, 0, width, height);
    const root = this._app.scene.currentScene?.root;

    if (root) {
      const rootBounds = root.getBounds();
      const minX = Math.min(bounds.left, rootBounds.left);
      const minY = Math.min(bounds.top, rootBounds.top);
      const maxX = Math.max(bounds.right, rootBounds.right);
      const maxY = Math.max(bounds.bottom, rootBounds.bottom);

      bounds.set(minX, minY, maxX - minX, maxY - minY);
    }

    return new Quadtree<IndexedNode>(bounds);
  }

  /**
   * Iterative pre-order subtree traversal (root first). Generator form keeps
   * callers simple and avoids recursive stack growth on deep hierarchies.
   */
  private *_iterateSubtree(root: RenderNode): Generator<RenderNode> {
    const stack: RenderNode[] = [root];

    while (stack.length > 0) {
      const node = stack.pop()!;

      yield node;

      if (node instanceof Container) {
        // Push in reverse so iteration preserves child insertion order.
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }
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
      const parent: Container | null = current.parent;

      current = parent !== null && parent.interactive ? parent : null;
    }
  }

  /** Dispatch an event directly on a single node without bubbling. */
  private _dispatchDirect(event: InteractionEvent, signal: Signal<[InteractionEvent]>): void {
    event.currentTarget = event.target;
    signal.dispatch(event);
  }

  private _signalFor(type: InteractionEventType, node: RenderNode): Signal<[InteractionEvent]> {
    switch (type) {
      case 'pointerdown':
        return node.onPointerDown;
      case 'pointerup':
        return node.onPointerUp;
      case 'pointermove':
        return node.onPointerMove;
      case 'pointerover':
        return node.onPointerOver;
      case 'pointerout':
        return node.onPointerOut;
      case 'pointertap':
        return node.onPointerTap;
      case 'dragstart':
        return node.onDragStart;
      case 'drag':
        return node.onDrag;
      case 'dragend':
        return node.onDragEnd;
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

        const p: Container | null = n.parent;

        n = p;
      }

      if (cursor !== null) {
        break;
      }
    }

    this._app.canvas.style.cursor = cursor ?? '';
  }
}
