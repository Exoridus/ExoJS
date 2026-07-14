import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import type { Signal } from '#core/Signal';
import type { InteractionHooks, Stage } from '#core/Stage';
import type { System } from '#core/System';
import type { Time } from '#core/Time';
import { Matrix } from '#math/Matrix';
import type { PointLike } from '#math/PointLike';
import type { QuadtreeItem } from '#math/Quadtree';
import { Quadtree } from '#math/Quadtree';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

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
export class InteractionManager implements InteractionHooks, System {
  /** App-systems tick band — interaction after input. @internal */
  public readonly order = 200;
  private readonly _app: Application;

  // Persistent quadtree — null when no interactive nodes are present.
  private _quadtree: Quadtree<IndexedNode> | null = null;

  // Interactive nodes ANCHORED to an engaged transform-group boundary
  // (RetainedContainer): their getBounds()/contains() operate in GROUP-LOCAL
  // space, so their world extent moves with the group without any bounds
  // invalidation reaching them. They are deliberately kept OUT of the
  // world-space quadtree (whose bounds would go stale on every group move —
  // the camera-pan flagship case) and hit-tested by a linear scan through
  // `_containsWorldPoint`, which reads the live group matrix. Maps node ->
  // insertion order (shared counter with the quadtree for z-tiebreaks).
  private readonly _anchoredNodes = new Map<RenderNode, number>();

  // Scratch for inverting a group's world matrix during hit-testing.
  private readonly _anchorInverse = new Matrix();

  // One-shot dev diagnostic: interactive nodes under an engaged boundary.
  private _devAnchoredWarned = false;

  // All currently-tracked interactive RenderNodes.
  private _interactiveNodes = new Set<RenderNode>();

  // Nodes whose quadtree entry is stale (bounds changed since last insert).
  private _staleNodes = new Set<RenderNode>();

  // Items stored in the quadtree, keyed by node for fast removal.
  private _quadtreeItems = new Map<RenderNode, QuadtreeItem<IndexedNode>>();

  // Quadtree-indexed (non-anchored) world-space interactive nodes grouped by the
  // nearest transform-group boundary they live under. Their world bounds follow
  // that group's own moves without any per-node bounds invalidation reaching
  // them, so a group move must mark exactly this set stale (see
  // `_notifyTransformGroupMoved`). Anchored descendants are hit-tested live and
  // are deliberately absent. Kept O(1) on the common case: a group with no such
  // descendants has no entry.
  private readonly _groupWorldDescendants = new Map<RenderNode, Set<RenderNode>>();

  // Reverse index: a world-space indexed node -> the boundary group it is filed
  // under in `_groupWorldDescendants` (for O(1) removal on re-index/unregister).
  private readonly _nodeBoundaryGroup = new Map<RenderNode, RenderNode>();

  // Running insertion-order counter used to break hit-test ties.
  private _quadtreeOrderCounter = 0;

  private readonly _quadtreeQueryBuffer: Array<QuadtreeItem<IndexedNode>> = [];

  /** This manager's service bundle, installed on a scene root via {@link attachRoot}. */
  private readonly _stage: Stage;

  /**
   * UI-layer interaction hooks: no-ops, so screen-fixed UI nodes are kept OUT
   * of the world quadtree. The UI layer is hit-tested by a direct subtree walk
   * in screen space (see {@link _resolveHit}); per-node signal dispatch still
   * works because it reads the lazy node signals, not the quadtree.
   */
  private readonly _uiInteraction: InteractionHooks = {
    _notifyNodeAdded: () => {},
    _notifyNodeRemoved: () => {},
    _notifyInteractiveChanged: () => {},
    _notifyBoundsInvalidated: () => {},
    _notifyTransformGroupMoved: () => {},
  };

  /** Service bundle installed on a scene's UI layer; shares focus with the world stage. */
  private readonly _uiStage: Stage;

  /** Maps pointerId → the deepest interactive RenderNode that pointer is currently over. */
  private readonly _lastHit = new Map<number, RenderNode>();

  /** Pending per-pointer event queues, filled by signal handlers each frame. */
  private readonly _pending = new Map<number, PointerQueue>();

  /** Active pointer captures set up by drag-start. Maps pointerId → the captured node. */
  private readonly _capturedPointers = new Map<number, RenderNode>();

  /** Active drag states. Maps pointerId → drag metadata. */
  private readonly _drags = new Map<number, DragState>();

  /**
   * Modal input-capture stack. While non-empty, hit-testing is confined to the
   * topmost root's subtree, so a modal dialog shields the nodes beneath it.
   */
  private readonly _captureStack: RenderNode[] = [];

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
    this._stage = { interaction: this, focus: app.focus, app };
    this._uiStage = { interaction: this._uiInteraction, focus: app.focus, app };

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
   * Confine pointer hit-testing to `root`'s subtree until a matching
   * {@link popInputCapture}. Pointer events outside the subtree hit nothing, so
   * a modal dialog (optionally with a full-screen backdrop to swallow clicks)
   * shields the interactive nodes beneath it. Captures stack — the most
   * recently pushed root wins.
   */
  public pushInputCapture(root: RenderNode): void {
    this._captureStack.push(root);
  }

  /** Release the most recently pushed input capture (see {@link pushInputCapture}). */
  public popInputCapture(): void {
    this._captureStack.pop();
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
    this._captureStack.length = 0;
    this._interactiveNodes.clear();
    this._staleNodes.clear();
    this._quadtreeItems.clear();
    this._anchoredNodes.clear();
    this._groupWorldDescendants.clear();
    this._nodeBoundaryGroup.clear();
    this._dirty = false;

    if (this._quadtree !== null) {
      this._quadtree.destroy();
      this._quadtree = null;
    }
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
  public update(_delta: Time): void {
    if (!this._dirty) return;
    this._dirty = false;

    this._flushStaleEntries();

    for (const queue of this._pending.values()) {
      this._processQueue(queue);
    }

    this._pending.clear();
    this._updateCursor();
  }

  /**
   * Bind a scene's root container to this manager: install the manager's
   * {@link Stage} on the subtree (so its nodes route their hooks here) and
   * register the subtree's interactive nodes. Called by {@link SceneManager}
   * when a scene becomes active.
   * @internal
   */
  public attachRoot(root: Container): void {
    root._setStage(this._stage);
    this._notifyNodeAdded(root);
  }

  /**
   * Unbind a scene's root: unregister its interactive nodes and clear the stage
   * from the subtree. Called by {@link SceneManager} when a scene is removed.
   * @internal
   */
  public detachRoot(root: Container): void {
    this._app.focus.blur();
    this._captureStack.length = 0;
    this._notifyNodeRemoved(root);
    root._setStage(null);
  }

  /**
   * Bind a scene's UI layer to this manager. Installs the UI stage (no-op world
   * hooks, shared focus) so its nodes route focus here but stay out of the world
   * quadtree; the layer is hit-tested by a direct walk in screen space.
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
  public attachUIRoot(root: Container): void {
    root._setStage(this._uiStage);
  }

  /** Unbind a scene's UI layer. @internal */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
  public detachUIRoot(root: Container): void {
    root._setStage(null);
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

  /**
   * Called when a transform-group boundary moves as a whole. Its anchored
   * descendants are hit-tested live and need nothing; its world-space (escaped,
   * non-anchored) interactive descendants are indexed in the quadtree with
   * bounds captured at insert time, so mark exactly those stale to force a
   * re-insert at their new world position before the next hit-test. O(1) when
   * the group has no such descendants (the common camera-pan case).
   *
   * @internal
   */
  public _notifyTransformGroupMoved(group: RenderNode): void {
    const descendants = this._groupWorldDescendants.get(group);

    if (descendants === undefined) {
      return;
    }

    for (const node of descendants) {
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
    const { id } = pointer;

    // Resolve the hit node and the coordinate space it lives in. A captured
    // pointer short-circuits hit-testing; otherwise the screen-fixed UI layer
    // is tried before the camera-space world (see _resolveHit). Coordinates
    // follow the hit's layer (UI = screen space, world = camera space) so
    // dragging and event positions agree with node positions — correct under
    // pixelRatio > 1, letterboxing, and a panned / zoomed / rotated camera.
    const captured = this._capturedPointers.get(id) ?? null;
    let hit: RenderNode | null;
    let x: number;
    let y: number;

    if (captured !== null) {
      const coords = this._pointerCoords(pointer, this._isUINode(captured));

      hit = captured;
      x = coords.x;
      y = coords.y;
    } else {
      const resolved = this._resolveHit(pointer);

      hit = resolved.node;
      x = resolved.x;
      y = resolved.y;
    }

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

          this._dispatchDirect(new InteractionEvent('dragstart', hit, pointer, x, y), hit._peekInteractionSignal('dragstart'));
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
        this._dispatchDirect(new InteractionEvent('drag', drag.node, pointer, x, y), drag.node._peekInteractionSignal('drag'));
      }
    }

    // --- Up ---
    if ((events & PointerEventFlag.Up) !== 0) {
      if (hit !== null) {
        this._dispatchBubble(new InteractionEvent('pointerup', hit, pointer, x, y));
      }

      if (drag !== null) {
        this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node._peekInteractionSignal('dragend'));
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
        this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node._peekInteractionSignal('dragend'));
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

  /**
   * Resolve the hit node and its coordinate space for a fresh pointer. An
   * active modal capture confines hit-testing to its subtree; otherwise the
   * screen-fixed UI layer is tried first (screen space), then the camera world.
   */
  private _resolveHit(pointer: Pointer): { node: RenderNode | null; x: number; y: number } {
    const capture = this._captureStack.at(-1);

    if (capture !== undefined) {
      const coords = this._pointerCoords(pointer, this._isUINode(capture));

      return { node: this._hitTestNode(capture, coords.x, coords.y), x: coords.x, y: coords.y };
    }

    const uiRoot = this._app.scene.currentScene?._peekUI() ?? null;

    if (uiRoot !== null) {
      const ui = this._app.rendering.screenView.screenToWorld(pointer.x, pointer.y);
      const uiHit = this._hitTestNode(uiRoot, ui.x, ui.y);

      if (uiHit !== null) {
        return { node: uiHit, x: ui.x, y: ui.y };
      }
    }

    const world = this._app.rendering.view.screenToWorld(pointer.x, pointer.y);

    return { node: this._hitTest(world.x, world.y), x: world.x, y: world.y };
  }

  /** Map a design-space pointer into either the screen-fixed UI view or the camera world. */
  private _pointerCoords(pointer: Pointer, ui: boolean): PointLike {
    const view = ui ? this._app.rendering.screenView : this._app.rendering.view;

    return view.screenToWorld(pointer.x, pointer.y);
  }

  /** Whether `node` lives inside the active scene's UI layer. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
  private _isUINode(node: RenderNode): boolean {
    const uiRoot = this._app.scene.currentScene?._peekUI() ?? null;

    if (uiRoot === null) {
      return false;
    }

    let current: RenderNode | null = node;

    while (current !== null) {
      if (current === uiRoot) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

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

      // World-aware contains, not the raw group-local one: a node indexed in
      // world space could have gained a boundary ancestor since insertion.
      if (indexed.order > bestOrder && this._containsWorldPoint(indexed.node, x, y)) {
        bestOrder = indexed.order;
        bestNode = indexed.node;
      }
    }

    // Group-anchored nodes live outside the quadtree (see `_anchoredNodes`):
    // exact hit-test through the live group matrix, same z-tiebreak.
    for (const [node, order] of this._anchoredNodes) {
      if (order > bestOrder && this._containsWorldPoint(node, x, y)) {
        bestOrder = order;
        bestNode = node;
      }
    }

    return bestNode;
  }

  /**
   * World-correct point containment: `node.contains` expects coordinates in
   * the node's OWN global space, which under an engaged transform-group
   * boundary ({@link RetainedContainer}) is group-local, not world. Resolve
   * the node's live anchor and map the world-space pointer into group space
   * through the inverse of the anchor's world matrix first; without an
   * anchor this is a plain `contains`. Resolving live (instead of trusting
   * index-time state) keeps boundary engage/disengage flips correct.
   */
  private _containsWorldPoint(node: RenderNode, x: number, y: number): boolean {
    const anchor = node._resolveTransformGroupAnchor();

    if (anchor === null) {
      return node.contains(x, y);
    }

    const inverse = anchor.getWorldTransform().getInverse(this._anchorInverse);
    // Same forward-map convention as AbstractVector.transform / SceneNode.contains:
    // p' = [[a, b], [c, d]] · p + (x, y).
    const groupX = inverse.a * x + inverse.b * y + inverse.x;
    const groupY = inverse.c * x + inverse.d * y + inverse.y;

    return node.contains(groupX, groupY);
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
        const child = children[i];
        if (child === undefined) {
          continue;
        }

        const hit = this._hitTestNode(child, x, y);

        if (hit) {
          return hit;
        }
      }
    }

    if (node.interactive && this._containsWorldPoint(node, x, y)) {
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
    this._anchoredNodes.delete(node);
    this._clearGroupMembership(node);

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
   * Index a single node: group-anchored nodes go to the linear side list
   * (their group-local bounds are useless as world-space quadtree keys and
   * would go stale on every group move), everything else into the quadtree.
   */
  private _insertNode(node: RenderNode, order: number = this._quadtreeOrderCounter++): void {
    if (this._quadtree === null) {
      return;
    }

    // Drop any prior group filing (a re-index may re-bucket this node between the
    // quadtree and the anchored side list, or under a different boundary).
    this._clearGroupMembership(node);

    if (node._resolveTransformGroupAnchor() !== null) {
      this._anchoredNodes.set(node, order);

      if (__DEV__) {
        this._warnAnchoredInteractive(node);
      }

      return;
    }

    const bounds = node.getBounds();
    const item: QuadtreeItem<IndexedNode> = {
      bounds: new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height),
      payload: { node, order },
    };

    this._quadtree.insert(item);
    this._quadtreeItems.set(node, item);

    // A world-space node living under a transform-group boundary is indexed with
    // world bounds that follow the group's own moves; file it so a group move
    // can mark it stale (see `_notifyTransformGroupMoved`). A node with no
    // boundary ancestor moves only on its own bounds invalidation — no filing.
    const group = this._nearestBoundaryAncestor(node);

    if (group !== null) {
      let descendants = this._groupWorldDescendants.get(group);

      if (descendants === undefined) {
        descendants = new Set<RenderNode>();
        this._groupWorldDescendants.set(group, descendants);
      }

      descendants.add(node);
      this._nodeBoundaryGroup.set(node, group);
    }
  }

  /** Remove `node` from its transform-group filing, dropping the group entry when it empties. */
  private _clearGroupMembership(node: RenderNode): void {
    const group = this._nodeBoundaryGroup.get(node);

    if (group === undefined) {
      return;
    }

    this._nodeBoundaryGroup.delete(node);

    const descendants = this._groupWorldDescendants.get(group);

    if (descendants !== undefined) {
      descendants.delete(node);

      if (descendants.size === 0) {
        this._groupWorldDescendants.delete(group);
      }
    }
  }

  /** Nearest ancestor that is an engaged transform-group boundary, or null. */
  private _nearestBoundaryAncestor(node: RenderNode): RenderNode | null {
    let ancestor: RenderNode | null = node.parent;

    while (ancestor !== null) {
      if (ancestor._isTransformGroupBoundary) {
        return ancestor;
      }

      ancestor = ancestor.parent;
    }

    return null;
  }

  /**
   * Flush stale entries: drop each stale node's old index entry and re-index
   * it with fresh bounds AND a freshly resolved group anchor (a boundary
   * engage/disengage flip re-buckets the node between the quadtree and the
   * anchored side list here). Called at the start of update().
   */
  private _flushStaleEntries(): void {
    if (this._quadtree === null || this._staleNodes.size === 0) {
      return;
    }

    for (const node of this._staleNodes) {
      const oldItem = this._quadtreeItems.get(node);
      const order = oldItem?.payload.order ?? this._anchoredNodes.get(node) ?? this._quadtreeOrderCounter++;

      if (oldItem !== undefined) {
        this._quadtree.remove(oldItem);
        oldItem.bounds.destroy();
      }

      this._quadtreeItems.delete(node);
      this._anchoredNodes.delete(node);

      this._insertNode(node, order);
    }

    this._staleNodes.clear();
  }

  /**
   * S2-D1-style one-shot dev diagnostic (belt-and-braces telemetry): an
   * interactive node under an engaged transform-group boundary works — the
   * manager maps pointers through the group's world matrix — but its public
   * `getBounds()`/`position` remain GROUP-LOCAL, which regularly surprises
   * gameplay code. Dev builds only; stripped in production via `__DEV__`.
   */
  private _warnAnchoredInteractive(node: RenderNode): void {
    if (this._devAnchoredWarned) {
      return;
    }

    this._devAnchoredWarned = true;
    logger.warn(
      `An interactive node${node.name ? ` '${node.name}'` : ''} was registered inside an engaged RetainedContainer. ` +
        'Pointer hit-testing maps through the group world transform automatically, but the node itself stays in ' +
        'GROUP-LOCAL space: getBounds()/position are relative to the group, and event coordinates are world-space. ' +
        'Use getWorldTransform() for world-space queries against such nodes.',
      { source: 'input' },
    );
  }

  /** Build a fresh Quadtree sized to encompass the canvas + current scene root. */
  private _createQuadtree(): Quadtree<IndexedNode> {
    // Seed in design/world units (matching node bounds and the camera-converted
    // pointer coordinates); unioned below with the scene root's world bounds.
    const width = this._app.width || 800;
    const height = this._app.height || 600;
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
          const child = node.children[index];
          if (child !== undefined) {
            stack.push(child);
          }
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

      signal?.dispatch(event);

      if (event.propagationStopped) {
        break;
      }

      // Walk up to interactive ancestor only (parent must opt in to receive bubble).
      const parent: Container | null = current.parent;

      current = parent !== null && parent.interactive ? parent : null;
    }
  }

  /** Dispatch an event directly on a single node without bubbling. */
  private _dispatchDirect(event: InteractionEvent, signal: Signal<[InteractionEvent]> | null): void {
    event.currentTarget = event.target;
    signal?.dispatch(event);
  }

  private _signalFor(type: InteractionEventType, node: RenderNode): Signal<[InteractionEvent]> | null {
    // Peek (never materialize): a node with no listener for `type` has no
    // signal, so dispatch simply skips it.
    return node._peekInteractionSignal(type);
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
