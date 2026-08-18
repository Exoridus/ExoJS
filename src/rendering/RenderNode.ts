import { Color } from '#core/Color';
import { registerRetainedRenderRoot, SceneNode, unregisterRetainedRenderRoot } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import type { InteractionEvent, InteractionEventType } from '#input/InteractionEvent';
import type { KeyEvent } from '#input/KeyEvent';
import { Rectangle } from '#math/Rectangle';
import type { Filter } from '#rendering/filters/Filter';
import type { Geometry } from '#rendering/geometry/Geometry';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import { playRenderTree } from '#rendering/plan/playRenderTree';
import { type RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedRootRepresentation } from '#rendering/plan/RetainedRootRepresentation';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import { BackendTargetPass } from './BackendTargetPass';
import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';
import type { TargetResolution } from './types';
import { BlendModes, isAdvancedBlendMode } from './types';
import { View } from './View';

interface DestroyableFilter {
  destroy(): void;
}

/**
 * The cache sprite, described structurally so this module never imports the
 * `Sprite` class (that edge would close a runtime cycle). `Drawable` is folded
 * in as a TYPE-only extension because the composite path now hands the sprite
 * straight to `backend.draw` — the factory returns a real `Sprite`, so this
 * only writes down what was already true.
 */
interface RenderNodeSpriteLike extends Drawable {
  width: number;
  height: number;
  setTexture(texture: RenderTexture | null): this;
  setBlendMode(blendMode: BlendModes): this;
  setTint(color: Color): this;
  setPosition(x: number, y: number): this;
  setRotation(rotation: number): this;
  setScale(x: number, y?: number): this;
  render(backend: RenderBackend): this;
  destroy(): void;
}

const isDestroyableFilter = (filter: Filter): filter is Filter & DestroyableFilter =>
  'destroy' in filter && typeof (filter as Partial<DestroyableFilter>).destroy === 'function';

/** Shared empty result for every node that has no filter list of its own. */
const NO_FILTERS: readonly Filter[] = [];

/**
 * Acceptable mask sources for {@link RenderNode.mask}.
 *
 * - `Rectangle` — solid axis-aligned mask. The fastest path: implemented
 *   internally via GPU scissor / clip rect; no intermediate render
 *   targets are required.
 * - `Texture` — uses the texture's alpha channel as the mask. Stretched
 *   to fit the masked node's local bounds. The texture is sampled with
 *   no transform of its own; if you need transform/anchor/scale, use a
 *   `Sprite(texture)` as the mask source instead.
 * - `RenderTexture` — same alpha-mask semantics as `Texture` for a
 *   dynamic/offscreen source.
 * - `RenderNode` — the mask node's full visual output (after its own
 *   transform, filters, cacheAsTexture, etc.) is rendered into an
 *   intermediate render texture and used as the alpha mask. Acceptable
 *   sources include `Sprite`, `Graphics`, `Container`, and any other
 *   class that extends `RenderNode`. Bare `SceneNode` instances are
 *   structural-only and rejected at compile time.
 * - `null` — no mask.
 *
 * Cost summary: `Rectangle` is O(1) GPU state. The other sources require
 * one or two intermediate render textures plus an alpha-composite pass.
 */
export type MaskSource = Rectangle | Texture | RenderTexture | RenderNode | null;

/**
 * {@link SceneNode} that can produce visual output. Adds the rendering
 * pipeline features on top of the structural transform/bounds carried by
 * SceneNode: post-process `filters`, an optional `mask` (via
 * {@link MaskSource}), a hard `clip`, texture caching (`cacheAsTexture`), and
 * the interaction surface (`interactive`, `draggable`, all the pointer
 * Signals).
 *
 * `tint` and `blendMode` are NOT here — they belong to {@link Drawable}, the
 * subclass that actually issues geometry. A {@link Container} has neither; to
 * recolour a whole subtree, put a {@link ColorMatrixFilter} on it.
 *
 * `RenderNode.render(backend)` is the per-frame visual entry point. The
 * base implementation collects a render plan, optimizes local ordering,
 * and plays it through the active backend.
 *
 * Subclasses of note: {@link Container} (children), {@link Sprite} (textured
 * quad), {@link Mesh} (custom geometry), {@link Graphics} (immediate-mode
 * shapes), {@link Text} (glyph-atlas text), {@link Video} (video texture),
 * {@link ParticleSystem} (particles).
 */
export abstract class RenderNode extends SceneNode {
  private static _spriteFactory: (() => RenderNodeSpriteLike) | null = null;

  private _interactive = false;
  public cursor: string | null = null;

  public get interactive(): boolean {
    return this._interactive;
  }

  public set interactive(value: boolean) {
    if (this._interactive === value) {
      return;
    }

    this._interactive = value;
    this._stage?.interaction._notifyInteractiveChanged(this, value);
  }

  /**
   * When `true` and `interactive` is also `true`, this node will be
   * automatically repositioned to follow the pointer during a drag gesture.
   * The framework captures the pointer offset at drag-start so the node
   * doesn't snap to the cursor position. Both `interactive` and `draggable`
   * must be set for dragging to work — a `draggable` but non-interactive
   * node will never receive `pointerdown` and therefore cannot start a drag.
   */
  public draggable = false;

  private _preserveDrawOrder = false;

  /**
   * When `true`, material-aware overlap reordering is disabled for this
   * node's draw-order scope. Draw commands are submitted in exact document
   * order (after scope-local z-sorting), preserving the painter's guarantee
   * irrespective of material compatibility or AABB safety analysis.
   *
   * Adjacency coalescing of consecutive same-material draws still applies;
   * it does not change visual output order.
   *
   * @default false
   */
  public get preserveDrawOrder(): boolean {
    return this._preserveDrawOrder;
  }

  public set preserveDrawOrder(preserveDrawOrder: boolean) {
    if (this._preserveDrawOrder !== preserveDrawOrder) {
      this._preserveDrawOrder = preserveDrawOrder;
      this.invalidateCache();
      this._markStructureDirty();
    }
  }

  private _clip = false;

  /**
   * When `true`, descendants are geometrically clipped to {@link clipShape}.
   * Unlike {@link mask} (which is alpha/visibility masking), `clip` is a hard
   * geometric boundary:
   *
   * - `clipShape === null` — clip to this node's world-space bounds
   *   ({@link getBounds}), using the GPU scissor fast path.
   * - `clipShape` is a `Rectangle` — clip to that world-space rectangle via
   *   scissor.
   * - `clipShape` is a `Geometry` — clip to the geometry's silhouette via the
   *   stencil buffer (WebGL2). Only fragments inside the shape survive.
   *
   * Clipping wraps the node's final (filtered/masked) output and acts as a
   * render barrier: draw commands are never reordered or batched across the
   * clip boundary.
   *
   * @default false
   */
  public get clip(): boolean {
    return this._clip;
  }

  public set clip(clip: boolean) {
    if (this._clip !== clip) {
      this._clip = clip;
      this.invalidateCache();
      this._markStructureDirty();
    }
  }

  private _clipShape: Rectangle | Geometry | null = null;

  /**
   * Clip region used when {@link clip} is `true`. A `Rectangle` (or `null` for
   * the node's bounds) maps to the scissor fast path; a `Geometry` maps to the
   * stencil path. Has no effect while `clip` is `false`.
   *
   * @default null
   */
  public get clipShape(): Rectangle | Geometry | null {
    return this._clipShape;
  }

  public set clipShape(clipShape: Rectangle | Geometry | null) {
    if (this._clipShape !== clipShape) {
      this._clipShape = clipShape;
      this.invalidateCache();
      this._markStructureDirty();
    }
  }

  // Interaction signals are lazily materialized: a non-interactive node (the
  // common case) allocates none. The dispatch path uses _peekInteractionSignal,
  // so firing never materializes a signal that has no listener.
  private _signals: Map<InteractionEventType, Signal<[InteractionEvent]>> | null = null;

  public get onPointerDown(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointerdown');
  }

  public get onPointerUp(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointerup');
  }

  public get onPointerMove(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointermove');
  }

  public get onPointerOver(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointerover');
  }

  public get onPointerOut(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointerout');
  }

  public get onPointerTap(): Signal<[InteractionEvent]> {
    return this._interactionSignal('pointertap');
  }

  /**
   * Fired when a pointer requests a context menu over this node — right-click,
   * or a long-press/touch gesture that has an attributable pointer. Bubbles
   * like the other pointer events, so a scene-wide fallback can listen on an
   * ancestor. Carries no native event — whether the browser's own menu
   * appears is decided by `ApplicationOptions.input.allowNativeContextMenu`,
   * independently of this.
   *
   * Requires an attributable pointer: a pointerless keyboard-only request
   * (the context-menu key, or Shift+F10, with no pointer ever having touched
   * the surface — see {@link ContextMenuRequest}'s doc comment) has nothing to
   * hit-test or bubble with, so it never reaches this per-node event. It only
   * ever reaches the engine-wide, scene-graph-independent `app.input.onContextMenu`.
   */
  public get onContextMenu(): Signal<[InteractionEvent]> {
    return this._interactionSignal('contextmenu');
  }

  /** Fired once when a drag gesture begins on this node. Does not bubble. */
  public get onDragStart(): Signal<[InteractionEvent]> {
    return this._interactionSignal('dragstart');
  }

  /** Fired on every pointer-move while this node is being dragged. Does not bubble. */
  public get onDrag(): Signal<[InteractionEvent]> {
    return this._interactionSignal('drag');
  }

  /** Fired when the drag gesture ends (pointer-up or cancel). Does not bubble. */
  public get onDragEnd(): Signal<[InteractionEvent]> {
    return this._interactionSignal('dragend');
  }

  private _interactionSignal(type: InteractionEventType): Signal<[InteractionEvent]> {
    const signals = (this._signals ??= new Map<InteractionEventType, Signal<[InteractionEvent]>>());
    let signal = signals.get(type);

    if (signal === undefined) {
      signal = new Signal<[InteractionEvent]>();
      signals.set(type, signal);
    }

    return signal;
  }

  /** @internal — the signal for `type`, or `null` if never materialized (used by the dispatch peek). */
  public _peekInteractionSignal(type: InteractionEventType): Signal<[InteractionEvent]> | null {
    return this._signals?.get(type) ?? null;
  }

  // Focus & keyboard. Like the interaction signals these are lazily
  // materialized — a node that never participates in focus allocates none.
  // Routed by app.interaction's focus controller to the focused node.

  /**
   * When `true`, this node can receive keyboard focus — via {@link focus},
   * Tab traversal, or `app.interaction.focus(node)` — and is delivered key
   * events through {@link onKeyDown} / {@link onKeyUp} while focused, or
   * while any of its descendants holds focus (key events bubble up the
   * parent chain like pointer {@link InteractionEvent}s do).
   *
   * A {@link Widget} additionally has to be enabled: disabling one takes it
   * out of the Tab order and rejects programmatic focus, without touching
   * this flag.
   *
   * @default false
   */
  public focusable = false;

  /**
   * Tab-traversal order among focusable nodes in the same focus scope. Lower
   * values are visited first; equal values keep document (tree) order.
   *
   * @default 0
   */
  public tabIndex = 0;

  private _onFocus: Signal<[RenderNode]> | null = null;
  private _onBlur: Signal<[RenderNode]> | null = null;
  private _onKeyDown: Signal<[KeyEvent]> | null = null;
  private _onKeyUp: Signal<[KeyEvent]> | null = null;

  /** Fired when this node gains keyboard focus. */
  public get onFocus(): Signal<[RenderNode]> {
    return (this._onFocus ??= new Signal<[RenderNode]>());
  }

  /** Fired when this node loses keyboard focus. */
  public get onBlur(): Signal<[RenderNode]> {
    return (this._onBlur ??= new Signal<[RenderNode]>());
  }

  /** Fired for each key pressed while this node — or a descendant of it — holds focus. Bubbles; see {@link KeyEvent}. */
  public get onKeyDown(): Signal<[KeyEvent]> {
    return (this._onKeyDown ??= new Signal<[KeyEvent]>());
  }

  /** Fired for each key released while this node — or a descendant of it — holds focus. Bubbles; see {@link KeyEvent}. */
  public get onKeyUp(): Signal<[KeyEvent]> {
    return (this._onKeyUp ??= new Signal<[KeyEvent]>());
  }

  /** @internal — the focus/blur signal if materialized, else `null` (dispatch peek). */
  public _peekFocusSignal(type: 'focus' | 'blur'): Signal<[RenderNode]> | null {
    return type === 'focus' ? this._onFocus : this._onBlur;
  }

  /** @internal — the keydown/keyup signal if materialized, else `null` (dispatch peek). */
  public _peekKeySignal(type: 'keydown' | 'keyup'): Signal<[KeyEvent]> | null {
    return type === 'keydown' ? this._onKeyDown : this._onKeyUp;
  }

  /** Request keyboard focus for this node through its owning focus service. */
  public focus(): this {
    this._stage?.focus.focus(this);

    return this;
  }

  /** Release keyboard focus from this node if it currently holds it. */
  public blur(): this {
    this._stage?.focus.blur(this);

    return this;
  }

  /**
   * Built on the first filter this node is given. Nodes without filters are the
   * overwhelming majority in any real scene, and an always-allocated empty array
   * costs every one of them a heap object for a feature it never uses; reads go
   * through {@link NO_FILTERS} instead.
   */
  private _filters: Filter[] | null = null;
  /**
   * The bounds the texture cache was captured at — built on the first capture.
   * A `Rectangle` is four heap objects (itself, its observable position and
   * size, and the bound change callback), and only `cacheAsTexture` nodes ever
   * need one.
   */
  private _cacheBounds: Rectangle | null = null;
  private _cacheSprite: RenderNodeSpriteLike | null = null;
  private _captureView: View | null = null;
  /** Lazily built, then reused for every capture this node performs — see {@link _renderContentToTexture}. */
  private _capturePass: BackendTargetPass | null = null;
  private _captureContent: (() => void) | null = null;
  private _mask: MaskSource = null;
  private _cacheAsTexture = false;
  private _cacheResolution: TargetResolution = 'inherit';
  /**
   * Effective resolution the current cache texture was baked at. Compared on
   * reuse alongside the bounds: a cache baked for a DPR-1 surface is the wrong
   * texture for a DPR-2 one even though its logical bounds are unchanged, and
   * without this a `resize()` that only changes the pixel ratio would replay a
   * stale, half-resolution bake forever.
   */
  private _cacheBakedResolution = 0;
  private _cacheDirty = true;
  private _cacheTexture: RenderTexture | null = null;
  private _retainedRoot: RetainedRootRepresentation | null = null;

  public get filters(): readonly Filter[] {
    return this._filters ?? NO_FILTERS;
  }

  public set filters(filters: readonly Filter[]) {
    this._detachFilterOwnership();

    if (filters.length === 0) {
      if (this._filters !== null) {
        this._filters.length = 0;
      }
    } else {
      const own = (this._filters ??= []);

      own.length = 0;
      own.push(...filters);

      for (let index = 0; index < own.length; index++) {
        // In-bounds: index < length.
        own[index]!._attachOwner(this);
      }
    }

    this.invalidateCache();
  }

  /**
   * The mask source that controls visibility of this node's render
   * output. See {@link MaskSource} for accepted source types and their
   * semantics. Setting to `null` removes any active mask.
   *
   * Setting a `RenderNode` that is `this` is rejected (a node cannot
   * mask itself). Indirect cycles (`a.mask = b; b.mask = a`) are rejected
   * as well: the candidate's mask chain is walked and any cycle — whether
   * it closes on `this` or was already present in the chain — fails the
   * assignment.
   */
  public get mask(): MaskSource {
    return this._mask;
  }

  public set mask(mask: MaskSource) {
    if (mask === this) {
      throw new Error('A RenderNode cannot use itself as its own mask source.');
    }

    if (mask instanceof RenderNode) {
      const seen = new Set<RenderNode>([this]);

      for (let node: MaskSource = mask; node instanceof RenderNode; node = node._mask) {
        if (seen.has(node)) {
          throw new Error('A RenderNode mask assignment must not create a mask cycle.');
        }

        seen.add(node);
      }
    }

    if (this._mask !== mask) {
      this._mask = mask;
      this.invalidateCache();
    }
  }

  /**
   * Raw rendering entry point. Direct backend access — bypasses the
   * RenderPlan pipeline machinery. Prefer the high-level
   * {@link RenderingContext.render} path via the owning
   * `RenderingContext` wherever possible.
   *
   * @advanced
   */
  public render(backend: RenderBackend): this {
    playRenderTree(this, backend);

    return this;
  }

  /** @internal */
  public _collect(builder: RenderPlanBuilder, seq?: number): void {
    if (this.destroyed) {
      // A destroyed node has released its pooled transform/bounds; collecting
      // it would read freed state and re-pin it. `destroy()` unlinks the node,
      // so this normally cannot be reached through a parent's child list — but
      // a destroyed node handed straight to the renderer as a detached root
      // still lands here. Skip it: "renders nothing" is the correct result.
      //
      // Unconditional, NOT __DEV__-gated: the skip is the behaviour, not a
      // diagnostic. Gating it would let production keep replaying a destroyed
      // node's last visual state while dev renders nothing — a dev/prod
      // divergence in what ends up on screen.
      return;
    }

    if (!this.visible) {
      return;
    }

    if (!builder._isViewCullSuppressed) {
      if (!this._inCullRect(builder.cullRect)) {
        builder.backend.stats.culledNodes++;
        builder._noteViewCulled();

        return;
      }

      builder._noteViewKept(this);
    }

    builder.emitNode(this, seq);
  }

  /** @internal */
  public _collectForRenderPlan(builder: RenderPlanBuilder): void {
    if (this._isTransformGroupBoundary) {
      builder._pushViewCullSuppression();

      try {
        this._collectContent(builder);
      } finally {
        builder._popViewCullSuppression();
      }

      return;
    }

    this._collectContent(builder);
  }

  /** @internal */
  public _isDrawableForRenderPlan(): boolean {
    return false;
  }

  /**
   * @internal — whether this node, when it IS the render root, gets the
   * automatic persistent render representation. Grouping nodes do
   * ({@link Container} overrides this); a drawable root is a single draw with
   * nothing to retain, and a `RetainedContainer` root already owns the
   * group-level retention tier and must not be wrapped in a second one.
   */
  public _supportsRootRetention(): boolean {
    return false;
  }

  /**
   * @internal — the automatic persistent render representation for this node as
   * a render root, created on first use. Overlapping roots (`render(world)`
   * plus `render(world.hud)`, mask sub-renders) each own their own; nothing
   * here is an exclusive owner slot on the subtree.
   */
  public _retainedRootRepresentation(): RetainedRootRepresentation {
    if (this._retainedRoot === null) {
      this._retainedRoot = new RetainedRootRepresentation();
      // Arm the transform-move seam: while at least one representation is live,
      // own-transform mutations walk their ancestor chain and offer themselves
      // to every root above. Balanced by destroy().
      registerRetainedRenderRoot();
    }

    return this._retainedRoot;
  }

  /**
   * @internal — the descendant transform-move seam for the automatic root
   * representation. Gated on a live CAPTURE, not on a live recording as
   * {@link RetainedContainer._enqueueDirtyTransformRow} is: the root treats a
   * queued move as its proof that the transform channel is accounted for, and
   * that proof has to exist one tier earlier. Without it a scene that moves
   * something every frame would never see the clean frame it needs to record in
   * the first place, and would stay on plain collect forever.
   */
  public override _enqueueRetainedRootRow(node: RenderNode): void {
    const representation = this._retainedRoot;

    if (!representation?.fragment.hasCapture) {
      return;
    }

    representation.fragment.enqueueDirtyTransformRow(node);
  }

  /** @internal */
  protected _collectContent(_builder: RenderPlanBuilder): void {
    // Overridden by Drawable/Container.
  }

  /**
   * Bake this node's subtree into a {@link RenderTexture} once and replay that
   * texture until the subtree changes, instead of walking and drawing it every
   * frame.
   *
   * Worth it for a subtree that is expensive to draw and rarely changes. The
   * cache is invalidated by anything that moves the node's world bounds — the
   * node's own transform included — so a node that animates re-bakes every
   * frame and is strictly slower than not caching it at all.
   *
   * Setting it to `false` frees the texture immediately.
   * @stable
   */
  public get cacheAsTexture(): boolean {
    return this._cacheAsTexture;
  }

  public set cacheAsTexture(cacheAsTexture: boolean) {
    if (this._cacheAsTexture !== cacheAsTexture) {
      this._cacheAsTexture = cacheAsTexture;
      this.invalidateCache();

      if (!cacheAsTexture) {
        this._destroyCacheTexture();
      }
    }
  }

  /**
   * Resolution the {@link cacheAsTexture} texture is baked at, in device pixels
   * per logical unit.
   *
   * `'inherit'` (the default) matches the surface the cache is composited into,
   * so enabling the cache does not soften the picture on a HiDPI display. Pin it
   * to a number to trade sharpness for memory and bake cost — a cache is
   * `resolution²` texels, so `1` on a DPR-3 phone is a ninth of the VRAM and a
   * ninth of the fill per re-bake.
   *
   * Changing it invalidates the cache.
   * @stable
   */
  public get cacheResolution(): TargetResolution {
    return this._cacheResolution;
  }

  public set cacheResolution(cacheResolution: TargetResolution) {
    if (this._cacheResolution !== cacheResolution) {
      this._cacheResolution = cacheResolution;
      this.invalidateCache();
    }
  }

  public addFilter(filter: Filter): this {
    (this._filters ??= []).push(filter);
    // Registers this node as a consumer, so a later mutation of the filter's own
    // state reaches back here without the application having to re-add it.
    filter._attachOwner(this);

    return this.invalidateCache();
  }

  public removeFilter(filter: Filter): this {
    const index = this._filters?.indexOf(filter) ?? -1;

    if (index !== -1) {
      this._filters!.splice(index, 1);
      filter._detachOwner(this);
      this.invalidateCache();
    }

    return this;
  }

  /** Drop this node from every filter it currently holds. */
  private _detachFilterOwnership(): void {
    const filters = this._filters;

    if (filters === null) {
      return;
    }

    for (let index = 0; index < filters.length; index++) {
      // In-bounds: index < length.
      filters[index]!._detachOwner(this);
    }
  }

  public static setInternalSpriteFactory(factory: (() => RenderNodeSpriteLike) | null): void {
    RenderNode._spriteFactory = factory;
  }

  public clearFilters(): this {
    if (this._filters !== null && this._filters.length > 0) {
      this._detachFilterOwnership();
      this._filters.length = 0;
      this.invalidateCache();
    }

    return this;
  }

  public invalidateCache(): this {
    this._cacheDirty = true;
    this._markContentDirty();

    return this;
  }

  /**
   * Mark this node's visual content dirty without going through a standard
   * setter — e.g. a custom {@link Drawable} subclass backed by externally
   * mutable data (the pattern `TileChunkNode` in `@codexo/exojs-tilemap`
   * already uses via its own `_chunk.revision` compare). Call this after
   * mutating such state so the Track-B retained-plan skip does not serve a
   * stale frame for this node.
   */
  public invalidateContent(): this {
    this._markContentDirty();

    return this;
  }

  /** @internal */
  public _renderPlanHasBarrierEffects(): boolean {
    return (
      (this._filters !== null && this._filters.length > 0) ||
      this._mask !== null ||
      this._cacheAsTexture ||
      this.clip ||
      isAdvancedBlendMode(this._renderPlanGetBlendMode())
    );
  }

  protected override _escapesTransformGroup(): boolean {
    // Barrier-effect nodes escape on their own (their effect machinery
    // composites in world space); additionally the parent boundary
    // may push this node out when its SUBTREE contains a deep barrier — the
    // sub-branch escape. Callers only reach this when the parent is
    // a transform-group boundary, so the parent query stays off hot paths.
    return this._renderPlanHasBarrierEffects() || this.parent?._childEscapesTransformGroup(this) === true;
  }

  /** @internal */
  public _renderPlanGetMaskSource(): MaskSource {
    return this._mask;
  }

  /** @internal */
  public _renderPlanGetFilters(): readonly Filter[] {
    return this._filters ?? NO_FILTERS;
  }

  /** @internal */
  public _renderPlanGetBlendMode(): BlendModes {
    return BlendModes.Normal;
  }

  /** @internal */
  public _renderPlanCanReuseTextureCache(left: number, top: number, width: number, height: number, resolution: number): boolean {
    if (!this._cacheAsTexture || this._cacheDirty || this._cacheTexture === null || this._cacheBounds === null || this._cacheBakedResolution !== resolution) {
      return false;
    }

    // Compared field by field rather than through `equals`, which takes a rect
    // and so needed an object literal built here — once per cached barrier per
    // frame, purely to be read and thrown away.
    const bounds = this._cacheBounds;

    return bounds.x === left && bounds.y === top && bounds.width === width && bounds.height === height;
  }

  /** @internal */
  public _renderPlanGetCacheTexture(): RenderTexture | null {
    return this._cacheTexture;
  }

  /** @internal */
  public _renderPlanEnsureCacheTexture(width: number, height: number): RenderTexture {
    return this._ensureCacheTexture(width, height);
  }

  /** @internal */
  public _renderPlanStoreCacheTexture(texture: RenderTexture, left: number, top: number, width: number, height: number, resolution: number): void {
    this._cacheTexture = texture;
    (this._cacheBounds ??= new Rectangle()).set(left, top, width, height);
    this._cacheBakedResolution = resolution;
    this._cacheDirty = false;
  }

  /** @internal */
  public _renderPlanRenderToTexture(
    backend: RenderBackend,
    target: RenderTexture,
    left: number,
    top: number,
    width: number,
    height: number,
    renderContent: () => void,
  ): void {
    this._renderContentToTexture(backend, target, left, top, width, height, renderContent);
  }

  /** @internal */
  public _renderPlanDrawTexture(
    backend: RenderBackend,
    texture: RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: BlendModes,
  ): void {
    this._drawTexture(backend, texture, x, y, width, height, blendMode);
  }

  /**
   * Releases everything this node owns, including GPU-side resources.
   *
   * Calling it is mandatory for a node that has acted as a render root: from
   * its first recorded frame such a node owns a group-scoped instance,
   * transform and tint buffer, and the backend holds that bundle until the
   * node is destroyed or the backend itself is. Dropping the last reference
   * is not enough — GPU lifetime is deterministic here on purpose and is not
   * tied to garbage collection.
   */
  public override destroy(): void {
    super.destroy();

    this._destroyCacheTexture();
    // Releases the captured entry records (and their drawable references) plus
    // the recorded GPU bundle this node owned as a render root, and balances the
    // representation's seam registration exactly once.
    if (this._retainedRoot !== null) {
      this._retainedRoot.dispose();
      this._retainedRoot = null;
      unregisterRetainedRenderRoot();
    }
    this._cacheBounds?.destroy();
    this._cacheBounds = null;
    this._cacheSprite?.destroy();
    this._cacheSprite = null;
    this._captureView?.destroy();
    this._captureView = null;

    if (this._filters !== null) {
      this._detachFilterOwnership();

      for (const filter of this._filters) {
        if (isDestroyableFilter(filter)) {
          filter.destroy();
        }
      }

      this._filters.length = 0;
      this._filters = null;
    }

    this._mask = null;

    if (this._signals !== null) {
      for (const signal of this._signals.values()) {
        signal.destroy();
      }

      this._signals.clear();
      this._signals = null;
    }

    this._onFocus?.destroy();
    this._onBlur?.destroy();
    this._onKeyDown?.destroy();
    this._onKeyUp?.destroy();
    this._onFocus = this._onBlur = this._onKeyDown = this._onKeyUp = null;
  }

  private _renderContentToTexture(
    backend: RenderBackend,
    target: RenderTexture,
    left: number,
    top: number,
    width: number,
    height: number,
    renderContent: () => void,
  ): void {
    if (this._captureView === null) {
      this._captureView = new View(left + width / 2, top + height / 2, width, height);
    } else {
      this._captureView.reset(left + width / 2, top + height / 2, width, height);
    }

    // The pass, its options object and the body closure were all built fresh
    // here, once per barrier per frame. The pass is now owned by the node and
    // re-pointed; the body is a bound method that reads the staged content
    // callback, so it is allocated once instead of per capture.
    //
    // Staging is safe against nesting because the stack is per NODE: a filtered
    // subtree inside another filtered node captures through the inner node's
    // own pass. A node cannot be capturing inside itself.
    // The indirection closure is built with the pass rather than held as a
    // per-node field: every node paid for it, only capturing nodes use it.
    this._capturePass ??= new BackendTargetPass(() => this._captureContent?.());
    this._captureContent = renderContent;

    try {
      backend.execute(this._capturePass.retarget(target, this._captureView, Color.transparentBlack));
    } finally {
      this._captureContent = null;
    }
  }

  private _drawTexture(backend: RenderBackend, texture: RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): void {
    const sprite = this._getCacheSprite();

    sprite.setTexture(texture).setBlendMode(blendMode).setTint(Color.white).setPosition(x, y).setRotation(0).setScale(1, 1);

    sprite.width = width;
    sprite.height = height;
    drawDrawableDirect(sprite, backend);
  }

  private _ensureCacheTexture(width: number, height: number): RenderTexture {
    if (this._cacheTexture === null) {
      this._cacheTexture = new RenderTexture(width, height);
    } else if (this._cacheTexture.width !== width || this._cacheTexture.height !== height) {
      this._cacheTexture.setSize(width, height);
    }

    return this._cacheTexture;
  }

  private _destroyCacheTexture(): void {
    if (this._cacheTexture !== null) {
      this._cacheTexture.destroy();
      this._cacheTexture = null;
    }

    this._cacheBakedResolution = 0;
    this._cacheDirty = true;
  }

  private _getCacheSprite(): RenderNodeSpriteLike {
    if (this._cacheSprite === null) {
      if (RenderNode._spriteFactory === null) {
        throw new Error('RenderNode sprite factory is not initialized.');
      }

      this._cacheSprite = RenderNode._spriteFactory();
    }

    return this._cacheSprite;
  }
}
