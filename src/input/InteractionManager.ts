import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { SceneState } from '#core/SceneState';
import type { Signal } from '#core/Signal';
import type { InteractionHooks, Stage } from '#core/Stage';
import type { Time } from '#core/Time';
import { DynamicAabbTree } from '#math/DynamicAabbTree';
import { Matrix } from '#math/Matrix';
import type { PointLike } from '#math/PointLike';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import { FocusController } from './FocusController';
import type { InputHost } from './InputHost';
import { createBrowserInputHost } from './InputHost';
import type { InteractionEventType } from './InteractionEvent';
import { InteractionEvent } from './InteractionEvent';
import type { Pointer } from './Pointer';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Fallback drag threshold in design pixels, used when the application did not set one. */
const defaultDragThreshold = 8;

const enum PointerEventFlag {
  None = 0,
  Down = 1 << 0,
  Move = 1 << 1,
  Up = 1 << 2,
  Tap = 1 << 3,
  Cancel = 1 << 4,
  Leave = 1 << 5,
  ContextMenu = 1 << 6,
}

interface PointerQueue {
  pointer: Pointer;
  events: number; // bitfield of PointerEventFlag
}

interface DragState {
  pointerId: number;
  node: RenderNode;
  /** Grab offset in the node's PARENT-LOCAL space, so dragging survives a transformed parent. */
  offsetX: number;
  offsetY: number;
  /**
   * `false` while the press is only a drag candidate — the pointer has not
   * travelled past the drag threshold yet, so no `dragstart` fired, no pointer
   * capture is held, and a release still counts as a tap.
   */
  active: boolean;
  /** Set for the one frame the drag was promoted, so `dragstart` fires exactly once. */
  started: boolean;
}

// ---------------------------------------------------------------------------
// Spatial-index types
// ---------------------------------------------------------------------------

interface IndexedNode {
  node: RenderNode;
}

// ---------------------------------------------------------------------------

/**
 * Routes pointer events from the {@link InputManager} to interactive
 * scene-graph nodes via DOM-style event bubbling. Maintains a persistent
 * dynamic-AABB-tree spatial index of interactive {@link RenderNode}s for
 * hit-testing and updates it incrementally — nodes notify the manager via the
 * `_notify*` hooks when they enter/leave the scene, change interactivity,
 * or move (causing bounds to dirty).
 *
 * Dispatches {@link InteractionEvent}s of every type in
 * {@link InteractionEventType}: `pointerdown` / `pointerup` /
 * `pointermove` / `pointerover` / `pointerout` / `pointertap` /
 * `contextmenu` / `dragstart` / `drag` / `dragend`. A `pointerdown` on a
 * draggable node only marks a drag candidate; the drag begins once the
 * pointer travels past `ApplicationOptions.input.dragThreshold`.
 *
 * Constructed automatically by {@link Application}; you do not instantiate
 * this class yourself.
 */
export class InteractionManager implements InteractionHooks {
  private readonly _app: Application;

  // Persistent spatial index (dynamic AABB tree) — null when no interactive
  // nodes are present.
  private _tree: DynamicAabbTree<IndexedNode> | null = null;

  // Fat-AABB margin (world units) for the tree. Zero: interactive nodes are
  // arbitrary-scale UI/world objects with no fixed collider size to tune a
  // margin against, and the index re-syncs only on explicit bounds
  // invalidation (not a per-step scan), so the fat-AABB coherence win a margin
  // would buy is negligible here — unlike the physics broad phase.
  private static readonly _treeMargin = 0;

  // Interactive nodes ANCHORED to an engaged transform-group boundary
  // (RetainedContainer): their getBounds()/contains() operate in GROUP-LOCAL
  // space, so their world extent moves with the group without any bounds
  // invalidation reaching them. They are deliberately kept OUT of the
  // world-space tree (whose bounds would go stale on every group move —
  // the camera-pan flagship case) and hit-tested by a linear scan through
  // `_containsWorldPoint`, which reads the live group matrix.
  private readonly _anchoredNodes = new Set<RenderNode>();

  // Scratch for inverting a group's world matrix during hit-testing.
  private readonly _anchorInverse = new Matrix();

  // Scratch ancestor paths for `_comparePaintOrder`, reused across comparisons
  // so picking allocates nothing per pointer event.
  private readonly _pathA: RenderNode[] = [];
  private readonly _pathB: RenderNode[] = [];

  // One-shot dev diagnostic: interactive nodes under an engaged boundary.
  private _devAnchoredWarned = false;

  // All currently-tracked interactive RenderNodes.
  private _interactiveNodes = new Set<RenderNode>();

  // Nodes whose tree entry is stale (bounds changed since last insert).
  private _staleNodes = new Set<RenderNode>();

  // Tree proxy ids, keyed by node for O(1) removal/update.
  private _proxies = new Map<RenderNode, number>();

  // Tree-indexed (non-anchored) world-space interactive nodes grouped by the
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

  /** This manager's service bundle, installed on a scene root via {@link attachRoot}. */
  private readonly _stage: Stage;

  /**
   * UI-layer interaction hooks: no-ops, so screen-fixed UI nodes are kept OUT
   * of the world tree. The UI layer is hit-tested by a direct subtree walk
   * in screen space (see {@link _resolveHit}); per-node signal dispatch still
   * works because it reads the lazy node signals, not the tree.
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
   * Interaction-scope stack. While non-empty, hit-testing and focus traversal
   * are confined to the topmost root's subtree, so a modal dialog shields the
   * nodes beneath it.
   */
  private readonly _scopeStack: RenderNode[] = [];

  /** Keyboard focus for this application. Public access goes through this manager. */
  private readonly _focus: FocusController;

  /** Distance in design pixels a press must travel before it becomes a drag. */
  private readonly _dragThreshold: number;

  /** Scratch for inverting a parent's world matrix while positioning a dragged node. */
  private readonly _dragInverse = new Matrix();

  /** Platform seam for cursor and pointer capture. Shared with `app.input` where available. */
  private readonly _host: InputHost;

  /** Whether any pointer enqueued events since the last update(). */
  private _dirty = false;

  private readonly _onPointerDownHandler: (pointer: Pointer) => void;
  private readonly _onPointerMoveHandler: (pointer: Pointer) => void;
  private readonly _onPointerUpHandler: (pointer: Pointer) => void;
  private readonly _onPointerTapHandler: (pointer: Pointer) => void;
  private readonly _onPointerCancelHandler: (pointer: Pointer) => void;
  private readonly _onPointerLeaveHandler: (pointer: Pointer) => void;
  private readonly _onContextMenuHandler: (pointer: Pointer) => void;

  public constructor(app: Application) {
    this._app = app;
    this._focus = new FocusController(app);
    this._dragThreshold = app.options?.input?.dragThreshold ?? defaultDragThreshold;
    this._host = app.input._host ?? createBrowserInputHost(app.canvas);
    this._stage = { interaction: this, focus: this._focus, app };
    this._uiStage = { interaction: this._uiInteraction, focus: this._focus, app };

    this._onPointerDownHandler = this._handlePointerDown.bind(this);
    this._onPointerMoveHandler = this._handlePointerMove.bind(this);
    this._onPointerUpHandler = this._handlePointerUp.bind(this);
    this._onPointerTapHandler = this._handlePointerTap.bind(this);
    this._onPointerCancelHandler = this._handlePointerCancel.bind(this);
    this._onPointerLeaveHandler = this._handlePointerLeave.bind(this);
    this._onContextMenuHandler = this._handleContextMenu.bind(this);

    app.input.onPointerDown.add(this._onPointerDownHandler);
    app.input.onPointerMove.add(this._onPointerMoveHandler);
    app.input.onPointerUp.add(this._onPointerUpHandler);
    app.input.onPointerTap.add(this._onPointerTapHandler);
    app.input.onPointerCancel.add(this._onPointerCancelHandler);
    app.input.onPointerLeave.add(this._onPointerLeaveHandler);
    app.input.onContextMenu.add(this._onContextMenuHandler);
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

  /** The node that currently holds keyboard focus, or `null`. */
  public get focused(): RenderNode | null {
    return this._focus.focused;
  }

  /**
   * Move keyboard focus to `node`. No-op when `node` is already focused or is
   * not {@link RenderNode.focusable}. Fires `onBlur` on the previously focused
   * node, then `onFocus` on `node`.
   */
  public focus(node: RenderNode): void {
    this._focus.focus(node);
  }

  /** Clear keyboard focus, or only clear it when `node` currently holds it. */
  public blur(node?: RenderNode): void {
    this._focus.blur(node);
  }

  /** Move focus to the next focusable node of the active scope, in Tab order. */
  public focusNext(): void {
    this._focus.focusNext();
  }

  /** Move focus to the previous focusable node of the active scope, in Tab order. */
  public focusPrevious(): void {
    this._focus.focusPrevious();
  }

  /**
   * Confine interaction to `root`'s subtree until a matching {@link popScope}.
   * Pointer events outside the subtree hit nothing and Tab traversal stays
   * inside it, so a modal dialog (optionally with a full-screen backdrop to
   * swallow clicks) shields everything beneath it. Scopes stack — the most
   * recently pushed root wins.
   *
   * A scope is not what makes a node interactive; `node.interactive = true`
   * alone does that. Nor is it the browser pointer-capture taken during a
   * drag, which is a private implementation detail. Prefer
   * `scene.interaction.scope()` when the scope should end with its scene.
   */
  public pushScope(root: RenderNode): void {
    this._scopeStack.push(root);
    this._focus.pushScope(root);
  }

  /** Release the most recently pushed interaction scope (see {@link pushScope}). */
  public popScope(): void {
    this._scopeStack.pop();
    this._focus.popScope();
  }

  /**
   * Returns the internal dynamic-AABB-tree spatial index used for hit-testing,
   * or null when no interactive nodes are present. Used by {@link HitTestLayer}
   * to render the tree's bounding volumes during development. Not part of the
   * stable public API — friend-class access only.
   *
   * @internal
   */
  public _getDebugQuadtree(): DynamicAabbTree<IndexedNode> | null {
    return this._tree;
  }

  public destroy(): void {
    this._app.input.onPointerDown.remove(this._onPointerDownHandler);
    this._app.input.onPointerMove.remove(this._onPointerMoveHandler);
    this._app.input.onPointerUp.remove(this._onPointerUpHandler);
    this._app.input.onPointerTap.remove(this._onPointerTapHandler);
    this._app.input.onPointerCancel.remove(this._onPointerCancelHandler);
    this._app.input.onPointerLeave.remove(this._onPointerLeaveHandler);
    this._app.input.onContextMenu.remove(this._onContextMenuHandler);
    this._lastHit.clear();
    this._pending.clear();
    this._capturedPointers.clear();
    this._drags.clear();
    this._scopeStack.length = 0;
    this._focus.destroy();
    this._interactiveNodes.clear();
    this._staleNodes.clear();
    this._proxies.clear();
    this._anchoredNodes.clear();
    this._groupWorldDescendants.clear();
    this._nodeBoundaryGroup.clear();
    this._dirty = false;

    if (this._tree !== null) {
      this._tree.destroy();
      this._tree = null;
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
   *
   * Gated by the active scope's {@link SceneState} (only `Active` dispatches
   * — pause does not gate interaction; `Preparing`/`Suspended`/`Destroying`/
   * `Destroyed`/no-scene do not dispatch) and by the director's transition
   * gate (definition §13.6) — gated frames discard the pending queue rather
   * than deferring it, so a pointer-down queued before a transition never
   * replays once it clears.
   */
  public update(_delta: Time): void {
    if (!this._dirty) return;

    const state = this._app.scenes.state;
    const gated = (state !== null && state !== SceneState.Active) || this._app.scenes._transitionGateOpen;

    this._dirty = false;

    if (gated) {
      this._pending.clear();

      return;
    }

    this._flushStaleEntries();

    for (const queue of this._pending.values()) {
      this._processQueue(queue);
    }

    this._pending.clear();
    this._updateCursor();
  }

  /**
   * @internal Invoked once per frame by {@link Application.update}'s
   * internal prepare stage, after input and ahead of fixed steps — not a
   * public {@link System} phase. Thin wrapper over
   * {@link InteractionManager.update}.
   */
  public _prepareFrame(delta: Time): void {
    this.update(delta);
  }

  /**
   * Bind a root node to this manager: install the manager's {@link Stage} on
   * the subtree (so its nodes route their hooks here) and register the
   * subtree's interactive nodes. `root` accepts any {@link RenderNode} (not
   * just a {@link Container}) so it also serves {@link SceneInteraction.observe}'s
   * explicit-root path — a leaf node has no descendants to walk, so binding
   * one just installs the stage on itself. Called automatically for a
   * scene's structural root by its `SceneScope` when the scene becomes
   * active.
   * @internal
   */
  public attachRoot(root: RenderNode): void {
    root._setStage(this._stage);
    this._notifyNodeAdded(root);
  }

  /**
   * Unbind a root node: unregister its interactive nodes and clear the stage
   * from the subtree. Called automatically for a scene's structural root by
   * its `SceneScope` when the scene ends permanently.
   * @internal
   */
  public detachRoot(root: RenderNode): void {
    this._focus.blur();
    this._scopeStack.length = 0;
    this._focus.clearScopes();
    this._notifyNodeRemoved(root);
    root._setStage(null);
  }

  /**
   * Bind a scene's UI layer to this manager. Installs the UI stage (no-op world
   * hooks, shared focus) so its nodes route focus here but stay out of the world
   * tree; the layer is hit-tested by a direct walk in screen space.
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
   * node is currently tracked as interactive, mark it stale so its tree
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
   * non-anchored) interactive descendants are indexed in the tree with
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

  private _handleContextMenu(pointer: Pointer): void {
    this._enqueue(pointer, PointerEventFlag.ContextMenu);
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

    // Commit a pending drag candidate before anything else: the very frame a
    // drag starts must already route through the captured node, or a fast
    // first move would land pointerover on whatever it swept across.
    this._promoteDragCandidate(id, pointer, events);

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

        // Only note the candidate. A press is not yet a drag — committing here
        // would make every click on a draggable node jitter it and swallow the tap.
        if (hit.draggable && !this._drags.has(id)) {
          const local = this._toParentLocal(hit, x, y);

          this._drags.set(id, {
            pointerId: id,
            node: hit,
            offsetX: hit.position.x - local.x,
            offsetY: hit.position.y - local.y,
            active: false,
            started: false,
          });
        }
      }
    }

    // --- Move ---
    if ((events & PointerEventFlag.Move) !== 0) {
      if (drag !== null && drag.started) {
        drag.started = false;
        this._dispatchDirect(new InteractionEvent('dragstart', drag.node, pointer, x, y), drag.node._peekInteractionSignal('dragstart'));
      }

      if (drag !== null && drag.active) {
        // Auto-position the dragged node, preserving the grab offset. `position`
        // is parent-local, so the pointer has to be mapped there first.
        const local = this._toParentLocal(drag.node, x, y);

        drag.node.position.x = local.x + drag.offsetX;
        drag.node.position.y = local.y + drag.offsetY;
      }

      if (hit !== null) {
        this._dispatchBubble(new InteractionEvent('pointermove', hit, pointer, x, y));
      }

      if (drag !== null && drag.active) {
        this._dispatchDirect(new InteractionEvent('drag', drag.node, pointer, x, y), drag.node._peekInteractionSignal('drag'));
      }
    }

    // --- Up ---
    const completedDrag = drag !== null && drag.active && (events & (PointerEventFlag.Up | PointerEventFlag.Cancel | PointerEventFlag.Leave)) !== 0;

    if ((events & PointerEventFlag.Up) !== 0) {
      if (hit !== null) {
        this._dispatchBubble(new InteractionEvent('pointerup', hit, pointer, x, y));
      }

      if (drag !== null) {
        if (drag.active) {
          this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node._peekInteractionSignal('dragend'));
        }

        this._endDrag(id);
      }
    }

    // --- Tap ---
    // A press that turned into a drag is not also a tap.
    if ((events & PointerEventFlag.Tap) !== 0 && !completedDrag) {
      if (hit !== null) {
        this._dispatchBubble(new InteractionEvent('pointertap', hit, pointer, x, y));
      }
    }

    // --- Context menu ---
    if ((events & PointerEventFlag.ContextMenu) !== 0) {
      if (hit !== null) {
        this._dispatchBubble(new InteractionEvent('contextmenu', hit, pointer, x, y));
      }
    }

    // --- Cancel / Leave ---
    if (isExitEvent) {
      if (drag !== null) {
        if (drag.active) {
          this._dispatchDirect(new InteractionEvent('dragend', drag.node, pointer, x, y), drag.node._peekInteractionSignal('dragend'));
        }

        this._endDrag(id);
      } else if (last !== null) {
        this._dispatchBubble(new InteractionEvent('pointerout', last, pointer, x, y));
      }

      this._lastHit.delete(id);
    }
  }

  /**
   * Turn a drag candidate into a real drag once the press has travelled past
   * the threshold. Uses the pointer's accumulated excursion rather than its
   * current distance, so a drag that wanders out and back still counts.
   */
  private _promoteDragCandidate(id: number, pointer: Pointer, events: number): void {
    if ((events & PointerEventFlag.Move) === 0) {
      return;
    }

    const drag = this._drags.get(id) ?? null;

    if (drag === null || drag.active || pointer.maxDistanceFromPress <= this._dragThreshold) {
      return;
    }

    drag.active = true;
    drag.started = true;
    this._capturedPointers.set(id, drag.node);
    this._host.capturePointer(id);
  }

  /**
   * Map a pointer position into the space `node.position` is expressed in.
   * The dragged node's coordinates are parent-local, while the pointer arrives
   * in world (or screen, for UI) space; without this a node under a scaled,
   * rotated or offset parent drifts away from the cursor. Under an engaged
   * transform group the chain is group-local, so the point is rebased through
   * the anchor first, exactly as {@link _containsWorldPoint} does.
   */
  private _toParentLocal(node: RenderNode, x: number, y: number): { x: number; y: number } {
    const parent = node.parent;

    if (parent === null) {
      return { x, y };
    }

    let localX = x;
    let localY = y;
    const anchor = node._resolveTransformGroupAnchor();

    if (anchor !== null) {
      const toGroup = anchor.getWorldTransform().getInverse(this._anchorInverse);

      localX = toGroup.a * x + toGroup.b * y + toGroup.x;
      localY = toGroup.c * x + toGroup.d * y + toGroup.y;
    }

    const inverse = parent.getWorldTransform().getInverse(this._dragInverse);

    return {
      x: inverse.a * localX + inverse.b * localY + inverse.x,
      y: inverse.c * localX + inverse.d * localY + inverse.y,
    };
  }

  private _endDrag(pointerId: number): void {
    this._drags.delete(pointerId);
    this._capturedPointers.delete(pointerId);
    this._host.releasePointer(pointerId);
  }

  // ---------------------------------------------------------------------------
  // Hit-testing
  // ---------------------------------------------------------------------------

  /**
   * Resolve the hit node and its coordinate space for a fresh pointer. An
   * active interaction scope confines hit-testing to its subtree; otherwise the
   * screen-fixed UI layer is tried first (screen space), then the camera world.
   */
  private _resolveHit(pointer: Pointer): { node: RenderNode | null; x: number; y: number } {
    const scope = this._scopeStack.at(-1);

    if (scope !== undefined) {
      const coords = this._pointerCoords(pointer, this._isUINode(scope));

      return { node: this._hitTestNode(scope, coords.x, coords.y), x: coords.x, y: coords.y };
    }

    const uiRoot = this._app.scenes.currentScene?._peekUI() ?? null;

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
    const uiRoot = this._app.scenes.currentScene?._peekUI() ?? null;

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
    if (this._tree !== null) {
      return this._hitTestIndexed(x, y);
    }

    const root = this._app.scenes.currentScene?.root;

    if (!root) {
      return null;
    }

    return this._hitTestNode(root, x, y);
  }

  private _hitTestIndexed(x: number, y: number): RenderNode | null {
    let bestNode: RenderNode | null = null;

    // Keep only the topmost candidate as the query walks, so no intermediate
    // array is needed. World-aware contains, not the raw group-local one: a
    // node indexed in world space could have gained a boundary ancestor since
    // insertion.
    this._tree!.queryPoint(x, y, indexed => {
      const node = indexed.node;

      if (this._beatsBest(node, bestNode, x, y)) {
        bestNode = node;
      }
    });

    // Group-anchored nodes live outside the tree (see `_anchoredNodes`):
    // exact hit-test through the live group matrix, same ordering rule.
    for (const node of this._anchoredNodes) {
      if (this._beatsBest(node, bestNode, x, y)) {
        bestNode = node;
      }
    }

    return bestNode;
  }

  /** Whether `candidate` is a hit that paints above the best node found so far. */
  private _beatsBest(candidate: RenderNode, best: RenderNode | null, x: number, y: number): boolean {
    if (best !== null && this._comparePaintOrder(candidate, best) <= 0) {
      return false;
    }

    return this._isHittable(candidate) && this._containsWorldPoint(candidate, x, y);
  }

  /**
   * A node is only a hit target while it and every ancestor up to the root is
   * visible. The spatial index deliberately keeps hidden nodes registered —
   * `visible = false` does not unregister — so the check has to happen here.
   */
  private _isHittable(node: RenderNode): boolean {
    let current: RenderNode | null = node;

    while (current !== null) {
      if (!current.visible) {
        return false;
      }

      current = current.parent;
    }

    return true;
  }

  /**
   * Order two nodes the way the renderer paints them: positive when `a` is
   * drawn after (visually above) `b`, negative when before, `0` when the two
   * are the same node or live in unrelated trees.
   *
   * The comparison is hierarchical, matching how the render plan is built:
   * find the nearest common ancestor, then compare the two branches that
   * diverge there by local `zIndex` and, on a tie, document order. A deeply
   * nested node therefore cannot escape the scope of its ancestors no matter
   * how high its own `zIndex` — exactly the constraint the renderer imposes,
   * and the reason a single comparison needs no global sort.
   *
   * When one node is an ancestor of the other, the descendant paints later: a
   * container renders its own content before its children.
   */
  private _comparePaintOrder(a: RenderNode, b: RenderNode): number {
    if (a === b) {
      return 0;
    }

    const pathA = this._collectAncestorPath(a, this._pathA);
    const pathB = this._collectAncestorPath(b, this._pathB);
    const shared = Math.min(pathA.length, pathB.length);
    let depth = 0;

    while (depth < shared && pathA[depth] === pathB[depth]) {
      depth++;
    }

    if (depth === pathA.length) {
      return -1;
    }

    if (depth === pathB.length) {
      return 1;
    }

    const branchA = pathA[depth]!;
    const branchB = pathB[depth]!;

    if (branchA.zIndex !== branchB.zIndex) {
      return branchA.zIndex - branchB.zIndex;
    }

    // Same z within the same scope — document order decides, as it does in
    // `RenderPlanOptimizer`'s `seq` tiebreak. A null parent means the two nodes
    // sit in unrelated trees and are not comparable.
    const parent = branchA.parent;

    return parent === null ? 0 : parent.getChildIndex(branchA) - parent.getChildIndex(branchB);
  }

  /** Fill `out` with the root-to-node ancestor chain and return it. */
  private _collectAncestorPath(node: RenderNode, out: RenderNode[]): RenderNode[] {
    out.length = 0;

    let current: RenderNode | null = node;

    while (current !== null) {
      out.push(current);
      current = current.parent;
    }

    out.reverse();

    return out;
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

  /**
   * Walk children back-to-front in paint order (topmost first) and return the
   * first interactive node containing the point. Recurses into containers that
   * are not interactive themselves, so a child can still be hit through a
   * plain layout parent.
   */
  private _hitTestNode(node: RenderNode, x: number, y: number): RenderNode | null {
    if (!node.visible) {
      return null;
    }

    if (node instanceof Container) {
      const children = this._childrenInPaintOrder(node);

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

  /**
   * Children in the order the renderer paints them. Returns the live child list
   * untouched in the common case where every sibling shares a `zIndex` — the
   * same shortcut `RenderPlanOptimizer` takes with `hasMixedZ` — and allocates
   * a sorted copy only when the z values actually differ. The sort is stable,
   * so equal z keeps document order.
   */
  private _childrenInPaintOrder(container: Container): readonly RenderNode[] {
    const children = container.children;
    const first = children[0];

    if (first === undefined) {
      return children;
    }

    for (let i = 1; i < children.length; i++) {
      if (children[i]!.zIndex !== first.zIndex) {
        return [...children].sort((left, right) => left.zIndex - right.zIndex);
      }
    }

    return children;
  }

  // ---------------------------------------------------------------------------
  // Persistent spatial index management
  // ---------------------------------------------------------------------------

  /**
   * Register an interactive node: add it to the tracking set, create the
   * tree if this is the first interactive node, and insert the node.
   */
  private _registerNode(node: RenderNode): void {
    if (this._interactiveNodes.has(node)) {
      return;
    }

    this._interactiveNodes.add(node);

    // Lazy-init the tree on the first interactive node.
    if (this._tree === null) {
      this._tree = new DynamicAabbTree<IndexedNode>(InteractionManager._treeMargin);
    }

    this._insertNode(node);
  }

  /**
   * Unregister an interactive node: remove from the tree and tracking
   * set. Dispose the tree when it becomes empty.
   */
  private _unregisterNode(node: RenderNode): void {
    if (!this._interactiveNodes.has(node)) {
      return;
    }

    this._interactiveNodes.delete(node);
    this._staleNodes.delete(node);
    this._anchoredNodes.delete(node);
    this._clearGroupMembership(node);

    const proxy = this._proxies.get(node);

    if (proxy !== undefined && this._tree !== null) {
      this._tree.remove(proxy);
    }

    this._proxies.delete(node);

    if (this._interactiveNodes.size === 0 && this._tree !== null) {
      this._tree.destroy();
      this._tree = null;
    }
  }

  /**
   * Index a single node: group-anchored nodes go to the linear side list
   * (their group-local bounds are useless as world-space tree keys and
   * would go stale on every group move), everything else into the tree.
   */
  private _insertNode(node: RenderNode): void {
    if (this._tree === null) {
      return;
    }

    // Drop any prior group filing (a re-index may re-bucket this node between the
    // tree and the anchored side list, or under a different boundary).
    this._clearGroupMembership(node);

    if (node._resolveTransformGroupAnchor() !== null) {
      this._anchoredNodes.add(node);

      if (__DEV__) {
        this._warnAnchoredInteractive(node);
      }

      return;
    }

    const bounds = node.getBounds();
    const proxy = this._tree.insert(bounds.left, bounds.top, bounds.right, bounds.bottom, { node });

    this._proxies.set(node, proxy);

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
   * engage/disengage flip re-buckets the node between the tree and the
   * anchored side list here). Called at the start of update().
   *
   * Remove+reinsert rather than the tree's `update()`: `update()` only touches
   * the tree, so it cannot re-bucket a node between the tree and the anchored
   * side list on a boundary engage/disengage flip — which this flush must do —
   * whereas remove+reinsert composes trivially with the anchor re-resolution in
   * `_insertNode`. `update()`'s fat-AABB no-op fast path would still spare churn
   * for a node flagged dirty without a real bounds change (bounds invalidation
   * fires unconditionally), but at margin 0 a genuinely-moved node always
   * escapes its equal-sized fat AABB, so that fast path is the minority case.
   */
  private _flushStaleEntries(): void {
    if (this._tree === null || this._staleNodes.size === 0) {
      return;
    }

    for (const node of this._staleNodes) {
      const proxy = this._proxies.get(node);

      if (proxy !== undefined) {
        this._tree.remove(proxy);
      }

      this._proxies.delete(node);
      this._anchoredNodes.delete(node);

      this._insertNode(node);
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

  /**
   * Walk the event from its target up through every ancestor. `interactive`
   * decides whether a node can be *hit*, not whether an event may pass through
   * it — a plain layout container in the middle of the path must not silently
   * cut a listener on the node above it off from the event. Propagation ends
   * only at the root or at an explicit {@link InteractionEvent.stopPropagation}.
   */
  private _dispatchBubble(event: InteractionEvent): void {
    let current: RenderNode | null = event.target;

    while (current !== null) {
      event.currentTarget = current;
      this._signalFor(event.type, current)?.dispatch(event);

      if (event.propagationStopped) {
        break;
      }

      current = current.parent;
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

    this._host.setCursor(cursor ?? '');
  }
}
