import { SceneNode } from '@/core/SceneNode';
import { Color } from '@/core/Color';
import { Rectangle } from '@/math/Rectangle';
import { BlendModes } from '@/rendering/types';
import { View } from '@/rendering/View';
import { Signal } from '@/core/Signal';
import type { Texture } from '@/rendering/texture/Texture';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { Filter } from '@/rendering/filters/Filter';
import type { InteractionEvent } from '@/input/InteractionEvent';

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

const isDestroyableFilter = (filter: Filter): filter is Filter & DestroyableFilter => (
    'destroy' in filter && typeof (filter as Partial<DestroyableFilter>).destroy === 'function'
);

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
export type MaskSource =
    | Rectangle
    | Texture
    | RenderTexture
    | RenderNode
    | null;

export abstract class RenderNode extends SceneNode {

    private static _spriteFactory: (() => RenderNodeSpriteLike) | null = null;

    public interactive: boolean = false;
    public cursor: string | null = null;

    /**
     * When `true` and `interactive` is also `true`, this node will be
     * automatically repositioned to follow the pointer during a drag gesture.
     * The framework captures the pointer offset at drag-start so the node
     * doesn't snap to the cursor position. Both `interactive` and `draggable`
     * must be set for dragging to work — a `draggable` but non-interactive
     * node will never receive `pointerdown` and therefore cannot start a drag.
     */
    public draggable: boolean = false;

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

    private readonly _filters: Array<Filter> = [];
    private readonly _cacheBounds: Rectangle = new Rectangle();
    private _cacheSprite: RenderNodeSpriteLike | null = null;
    private _captureView: View | null = null;
    private _mask: MaskSource = null;
    private _cacheAsBitmap = false;
    private _cacheDirty = true;
    private _cacheTexture: RenderTexture | null = null;

    public get filters(): Array<Filter> {
        return this._filters;
    }

    public set filters(filters: ReadonlyArray<Filter>) {
        this.setFilters(filters);
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

    public abstract render(backend: RenderBackend): this;

    public get cacheAsBitmap(): boolean {
        return this._cacheAsBitmap;
    }

    public set cacheAsBitmap(cacheAsBitmap: boolean) {
        this.setCacheAsBitmap(cacheAsBitmap);
    }

    public setFilters(filters: ReadonlyArray<Filter>): this {
        this._filters.length = 0;
        this._filters.push(...filters);

        return this.invalidateCache();
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

    public setCacheAsBitmap(cacheAsBitmap: boolean): this {
        if (this._cacheAsBitmap !== cacheAsBitmap) {
            this._cacheAsBitmap = cacheAsBitmap;
            this.invalidateCache();

            if (!cacheAsBitmap) {
                this._destroyCacheTexture();
            }
        }

        return this;
    }

    public invalidateCache(): this {
        this._cacheDirty = true;

        return this;
    }

    protected renderVisualContent(
        backend: RenderBackend,
        renderContent: () => void,
        blendMode: BlendModes = BlendModes.Normal,
    ): void {
        const hasFilters = this._filters.length > 0;
        const needsBitmapCache = this._cacheAsBitmap;

        if (!hasFilters && !needsBitmapCache) {
            this._withMask(backend, renderContent, blendMode);

            return;
        }

        const rawBounds = this.getBounds();

        if (rawBounds.width <= 0 || rawBounds.height <= 0) {
            return;
        }

        const left = Math.floor(rawBounds.left);
        const top = Math.floor(rawBounds.top);
        const width = Math.max(1, Math.ceil(rawBounds.width));
        const height = Math.max(1, Math.ceil(rawBounds.height));
        const cacheBoundsChanged = !this._cacheBounds.equals({ x: left, y: top, width, height });
        const shouldRefreshCache = needsBitmapCache && (
            this._cacheDirty
            || this._cacheTexture === null
            || cacheBoundsChanged
        );

        if (needsBitmapCache && !shouldRefreshCache && this._cacheTexture !== null) {
            this._withMask(backend, () => {
                this._drawTexture(backend, this._cacheTexture as RenderTexture, left, top, width, height, blendMode);
            }, blendMode);

            return;
        }

        const temporaryTextures: Array<RenderTexture> = [];
        const cacheTexture = needsBitmapCache ? this._ensureCacheTexture(width, height) : null;

        try {
            const sourceTexture = (needsBitmapCache && !hasFilters)
                ? cacheTexture as RenderTexture
                : backend.acquireRenderTexture(width, height);

            if (sourceTexture !== cacheTexture) {
                temporaryTextures.push(sourceTexture);
            }

            this._renderContentToTexture(backend, sourceTexture, left, top, width, height, renderContent);

            let finalTexture = sourceTexture;

            if (hasFilters) {
                for (let index = 0; index < this._filters.length; index++) {
                    const isLast = index === this._filters.length - 1;
                    const output = (isLast && needsBitmapCache)
                        ? cacheTexture as RenderTexture
                        : backend.acquireRenderTexture(width, height);

                    if (output !== cacheTexture) {
                        temporaryTextures.push(output);
                    }

                    this._filters[index].apply(backend, finalTexture, output);
                    finalTexture = output;
                }
            }

            if (needsBitmapCache) {
                this._cacheTexture = cacheTexture;
                this._cacheBounds.set(left, top, width, height);
                this._cacheDirty = false;
            }

            this._withMask(backend, () => {
                this._drawTexture(backend, finalTexture, left, top, width, height, blendMode);
            }, blendMode);
        } finally {
            for (const texture of temporaryTextures) {
                backend.releaseRenderTexture(texture);
            }
        }
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

    private _withMask(
        backend: RenderBackend,
        callback: () => void,
        blendMode: BlendModes = BlendModes.Normal,
    ): void {
        const mask = this._mask;

        if (mask === null) {
            callback();

            return;
        }

        // Fast path: rectangle mask uses GPU scissor.
        if (mask instanceof Rectangle) {
            if (mask.width <= 0 || mask.height <= 0) {
                return;
            }

            backend.pushScissorRect(mask);

            try {
                callback();
            } finally {
                backend.popScissorRect();
            }

            return;
        }

        // Alpha-mask paths: Texture, RenderTexture, or RenderNode source.
        // Strategy:
        //   1. Render `callback` (the masked content) into an intermediate
        //      contentTexture.
        //   2. Resolve the mask into a texture: Texture/RenderTexture used
        //      directly; RenderNode rendered into a maskTexture first.
        //   3. Compose contentTexture * mask.alpha into the active target at the
        //      content's world-space position.
        //   4. Release intermediates.
        const contentBounds = this.getBounds();

        if (contentBounds.width <= 0 || contentBounds.height <= 0) {
            return;
        }

        const left = Math.floor(contentBounds.left);
        const top = Math.floor(contentBounds.top);
        const width = Math.max(1, Math.ceil(contentBounds.width));
        const height = Math.max(1, Math.ceil(contentBounds.height));

        const contentTexture = backend.acquireRenderTexture(width, height);
        const releasePool: Array<RenderTexture> = [contentTexture];

        try {
            this._renderContentToTexture(backend, contentTexture, left, top, width, height, callback);

            const maskTexture = this._resolveMaskTexture(backend, mask, width, height, releasePool);

            backend.composeWithAlphaMask(contentTexture, maskTexture, left, top, width, height, blendMode);
        } finally {
            for (const texture of releasePool) {
                backend.releaseRenderTexture(texture);
            }
        }
    }

    private _resolveMaskTexture(
        backend: RenderBackend,
        mask: Texture | RenderTexture | RenderNode,
        width: number,
        height: number,
        releasePool: Array<RenderTexture>,
    ): Texture | RenderTexture {
        if (mask instanceof RenderNode) {
            // Render the mask node's full visual output into an
            // intermediate render texture sized to match the masked
            // content. The mask node renders with its own transform; the
            // intermediate is positioned over the masked content's
            // world-space bounds so the resulting texture uses the
            // masked content's local UV space.
            const maskTexture = backend.acquireRenderTexture(width, height);

            releasePool.push(maskTexture);

            const contentBounds = this.getBounds();
            const left = Math.floor(contentBounds.left);
            const top = Math.floor(contentBounds.top);

            this._renderContentToTexture(backend, maskTexture, left, top, width, height, () => {
                mask.render(backend);
            });

            return maskTexture;
        }

        // mask is Texture or RenderTexture — use directly.
        return mask;
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
            this._captureView = new View(left + (width / 2), top + (height / 2), width, height);
        } else {
            this._captureView.reset(left + (width / 2), top + (height / 2), width, height);
        }

        backend.execute(new RenderTargetPass(
            () => {
                renderContent();
            },
            {
                target,
                view: this._captureView,
                clearColor: Color.transparentBlack,
            },
        ));
    }

    private _drawTexture(
        backend: RenderBackend,
        texture: RenderTexture,
        x: number,
        y: number,
        width: number,
        height: number,
        blendMode: BlendModes,
    ): void {
        const sprite = this._getCacheSprite();

        sprite
            .setTexture(texture)
            .setBlendMode(blendMode)
            .setTint(Color.white)
            .setPosition(x, y)
            .setRotation(0)
            .setScale(1, 1);

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
