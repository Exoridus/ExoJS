import { Color } from '@/core/Color';
import { SceneNode } from '@/core/SceneNode';
import { Signal } from '@/core/Signal';
import type { InteractionEvent } from '@/input/InteractionEvent';
import { getActiveInteractionManager } from '@/input/internal/interactionManagerRegistry';
import { Rectangle } from '@/math/Rectangle';
import type { Filter } from '@/rendering/filters/Filter';
import type { Geometry } from '@/rendering/geometry/Geometry';
import { RenderPlanBuilder } from '@/rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '@/rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '@/rendering/plan/RenderPlanPlayer';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';
import { View } from '@/rendering/View';

interface DestroyableFilter {
  destroy(): void;
}

interface RenderNodeSpriteLike {
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
 *   transform, filters, cacheAsBitmap, etc.) is rendered into an
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
 * SceneNode: `tint`, `alpha`, `blendMode`, post-process `filters`, an
 * optional `mask` (via {@link MaskSource}), bitmap caching
 * (`cacheAsBitmap`), and the interaction surface
 * (`interactive`, `draggable`, all the pointer Signals).
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
    getActiveInteractionManager()?._notifyInteractiveChanged(this, value);
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
  public preserveDrawOrder = false;

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
  public clip = false;

  /**
   * Clip region used when {@link clip} is `true`. A `Rectangle` (or `null` for
   * the node's bounds) maps to the scissor fast path; a `Geometry` maps to the
   * stencil path. Has no effect while `clip` is `false`.
   *
   * @default null
   */
  public clipShape: Rectangle | Geometry | null = null;

  public readonly onPointerDown = new Signal<[InteractionEvent]>();
  public readonly onPointerUp = new Signal<[InteractionEvent]>();
  public readonly onPointerMove = new Signal<[InteractionEvent]>();
  public readonly onPointerOver = new Signal<[InteractionEvent]>();
  public readonly onPointerOut = new Signal<[InteractionEvent]>();
  public readonly onPointerTap = new Signal<[InteractionEvent]>();

  /** Fired once when a drag gesture begins on this node. Does not bubble. */
  public readonly onDragStart = new Signal<[InteractionEvent]>();
  /** Fired on every pointer-move while this node is being dragged. Does not bubble. */
  public readonly onDrag = new Signal<[InteractionEvent]>();
  /** Fired when the drag gesture ends (pointer-up or cancel). Does not bubble. */
  public readonly onDragEnd = new Signal<[InteractionEvent]>();

  private readonly _filters: Filter[] = [];
  private readonly _cacheBounds: Rectangle = new Rectangle();
  private _cacheSprite: RenderNodeSpriteLike | null = null;
  private _captureView: View | null = null;
  private _mask: MaskSource = null;
  private _cacheAsBitmap = false;
  private _cacheDirty = true;
  private _cacheTexture: RenderTexture | null = null;

  public get filters(): readonly Filter[] {
    return this._filters;
  }

  public set filters(filters: readonly Filter[]) {
    this._filters.length = 0;
    this._filters.push(...filters);
    this.invalidateCache();
  }

  /**
   * The mask source that controls visibility of this node's render
   * output. See {@link MaskSource} for accepted source types and their
   * semantics. Setting to `null` removes any active mask.
   *
   * Setting a `RenderNode` that is `this` is rejected (a node cannot
   * mask itself); other cycles (mask of mask of self) are not detected.
   */
  public get mask(): MaskSource {
    return this._mask;
  }

  public set mask(mask: MaskSource) {
    if (mask === this) {
      throw new Error('A RenderNode cannot use itself as its own mask source.');
    }

    if (this._mask !== mask) {
      this._mask = mask;
      this.invalidateCache();
    }
  }

  public render(backend: RenderBackend): this {
    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(this, backend);

      RenderPlanOptimizer.optimize(plan);
      RenderPlanPlayer.play(plan, backend);
    } finally {
      RenderPlanBuilder.release(builder);
    }

    return this;
  }

  /** @internal */
  public _collect(builder: RenderPlanBuilder, seq?: number): void {
    if (!this.visible) {
      return;
    }

    if (!this.inView(builder.view)) {
      builder.backend.stats.culledNodes++;

      return;
    }

    builder.emitNode(this, seq);
  }

  /** @internal */
  public _collectForRenderPlan(builder: RenderPlanBuilder): void {
    this._collectContent(builder);
  }

  /** @internal */
  public _isDrawableForRenderPlan(): boolean {
    return false;
  }

  /** @internal */
  protected _collectContent(_builder: RenderPlanBuilder): void {
    // Overridden by Drawable/Container.
  }

  public get cacheAsBitmap(): boolean {
    return this._cacheAsBitmap;
  }

  public set cacheAsBitmap(cacheAsBitmap: boolean) {
    if (this._cacheAsBitmap !== cacheAsBitmap) {
      this._cacheAsBitmap = cacheAsBitmap;
      this.invalidateCache();

      if (!cacheAsBitmap) {
        this._destroyCacheTexture();
      }
    }
  }

  public addFilter(filter: Filter): this {
    this._filters.push(filter);

    return this.invalidateCache();
  }

  public removeFilter(filter: Filter): this {
    const index = this._filters.indexOf(filter);

    if (index !== -1) {
      this._filters.splice(index, 1);
      this.invalidateCache();
    }

    return this;
  }

  public static setInternalSpriteFactory(factory: (() => RenderNodeSpriteLike) | null): void {
    RenderNode._spriteFactory = factory;
  }

  public clearFilters(): this {
    if (this._filters.length > 0) {
      this._filters.length = 0;
      this.invalidateCache();
    }

    return this;
  }

  public invalidateCache(): this {
    this._cacheDirty = true;

    return this;
  }

  /** @internal */
  public _renderPlanHasBarrierEffects(): boolean {
    return this._filters.length > 0 || this._mask !== null || this._cacheAsBitmap || this.clip;
  }

  /** @internal */
  public _renderPlanGetMaskSource(): MaskSource {
    return this._mask;
  }

  /** @internal */
  public _renderPlanGetFilters(): readonly Filter[] {
    return this._filters;
  }

  /** @internal */
  public _renderPlanGetBlendMode(): BlendModes {
    return BlendModes.Normal;
  }

  /** @internal */
  public _renderPlanCanReuseBitmapCache(left: number, top: number, width: number, height: number): boolean {
    return this._cacheAsBitmap && !this._cacheDirty && this._cacheTexture !== null && this._cacheBounds.equals({ x: left, y: top, width, height });
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
  public _renderPlanStoreCacheTexture(texture: RenderTexture, left: number, top: number, width: number, height: number): void {
    this._cacheTexture = texture;
    this._cacheBounds.set(left, top, width, height);
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

  public override destroy(): void {
    super.destroy();

    this._destroyCacheTexture();
    this._cacheBounds.destroy();
    this._cacheSprite?.destroy();
    this._cacheSprite = null;
    this._captureView?.destroy();
    this._captureView = null;

    for (const filter of this._filters) {
      if (isDestroyableFilter(filter)) {
        filter.destroy();
      }
    }

    this._filters.length = 0;
    this._mask = null;

    this.onPointerDown.destroy();
    this.onPointerUp.destroy();
    this.onPointerMove.destroy();
    this.onPointerOver.destroy();
    this.onPointerOut.destroy();
    this.onPointerTap.destroy();
    this.onDragStart.destroy();
    this.onDrag.destroy();
    this.onDragEnd.destroy();
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

    backend.execute(
      new RenderTargetPass(
        () => {
          renderContent();
        },
        {
          target,
          view: this._captureView,
          clearColor: Color.transparentBlack,
        },
      ),
    );
  }

  private _drawTexture(backend: RenderBackend, texture: RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): void {
    const sprite = this._getCacheSprite();

    sprite.setTexture(texture).setBlendMode(blendMode).setTint(Color.white).setPosition(x, y).setRotation(0).setScale(1, 1);

    sprite.width = width;
    sprite.height = height;
    sprite.render(backend);
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
