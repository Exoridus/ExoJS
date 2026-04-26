import { SceneNode } from '@/core/SceneNode';
import { Color } from '@/core/Color';
import { Rectangle } from '@/math/Rectangle';
import { BlendModes } from '@/rendering/types';
import { View } from '@/rendering/View';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import type { SceneRenderRuntime } from '@/rendering/SceneRenderRuntime';
import type { Filter } from '@/rendering/filters/Filter';

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
    render(runtime: SceneRenderRuntime): this;
    destroy(): void;
}

const isDestroyableFilter = (filter: Filter): filter is Filter & DestroyableFilter => (
    'destroy' in filter && typeof (filter as Partial<DestroyableFilter>).destroy === 'function'
);

export abstract class RenderNode extends SceneNode {

    private static _spriteFactory: (() => RenderNodeSpriteLike) | null = null;

    private readonly _filters: Array<Filter> = [];
    private readonly _cacheBounds: Rectangle = new Rectangle();
    private _cacheSprite: RenderNodeSpriteLike | null = null;
    private _captureView: View | null = null;
    private _mask: SceneNode | null = null;
    private _cacheAsBitmap = false;
    private _cacheDirty = true;
    private _cacheTexture: RenderTexture | null = null;

    public get filters(): Array<Filter> {
        return this._filters;
    }

    public set filters(filters: ReadonlyArray<Filter>) {
        this.setFilters(filters);
    }

    public get mask(): SceneNode | null {
        return this._mask;
    }

    public set mask(mask: SceneNode | null) {
        if (this._mask !== mask) {
            this._mask = mask;
            this.invalidateCache();
        }
    }

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
        runtime: SceneRenderRuntime,
        renderContent: () => void,
        blendMode: BlendModes = BlendModes.Normal,
    ): void {
        const hasFilters = this._filters.length > 0;
        const needsBitmapCache = this._cacheAsBitmap;

        if (!hasFilters && !needsBitmapCache) {
            this._withMask(runtime, renderContent);

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
            this._withMask(runtime, () => {
                this._drawTexture(runtime, this._cacheTexture as RenderTexture, left, top, width, height, blendMode);
            });

            return;
        }

        const temporaryTextures: Array<RenderTexture> = [];
        const cacheTexture = needsBitmapCache ? this._ensureCacheTexture(width, height) : null;

        try {
            const sourceTexture = (needsBitmapCache && !hasFilters)
                ? cacheTexture as RenderTexture
                : runtime.acquireRenderTexture(width, height);

            if (sourceTexture !== cacheTexture) {
                temporaryTextures.push(sourceTexture);
            }

            this._renderContentToTexture(runtime, sourceTexture, left, top, width, height, renderContent);

            let finalTexture = sourceTexture;

            if (hasFilters) {
                for (let index = 0; index < this._filters.length; index++) {
                    const isLast = index === this._filters.length - 1;
                    const output = (isLast && needsBitmapCache)
                        ? cacheTexture as RenderTexture
                        : runtime.acquireRenderTexture(width, height);

                    if (output !== cacheTexture) {
                        temporaryTextures.push(output);
                    }

                    this._filters[index].apply(runtime, finalTexture, output);
                    finalTexture = output;
                }
            }

            if (needsBitmapCache) {
                this._cacheTexture = cacheTexture;
                this._cacheBounds.set(left, top, width, height);
                this._cacheDirty = false;
            }

            this._withMask(runtime, () => {
                this._drawTexture(runtime, finalTexture, left, top, width, height, blendMode);
            });
        } finally {
            for (const texture of temporaryTextures) {
                runtime.releaseRenderTexture(texture);
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
    }

    private _withMask(runtime: SceneRenderRuntime, callback: () => void): void {
        if (this._mask === null) {
            callback();

            return;
        }

        const maskBounds = this._mask.getBounds();

        if (maskBounds.width <= 0 || maskBounds.height <= 0) {
            return;
        }

        runtime.pushMask(maskBounds);

        try {
            callback();
        } finally {
            runtime.popMask();
        }
    }

    private _renderContentToTexture(
        runtime: SceneRenderRuntime,
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

        runtime.execute(new RenderTargetPass(
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
        runtime: SceneRenderRuntime,
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
        sprite.render(runtime);
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
