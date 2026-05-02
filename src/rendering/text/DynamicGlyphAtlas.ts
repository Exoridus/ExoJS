import { Texture } from '@/rendering/texture/Texture';
import type { GlyphInfo, GlyphKey } from './types';

const glyphPadding = 2;

interface Shelf {
    y: number;
    height: number;
    cursorX: number;
}

interface ShelfPackerResult {
    x: number;
    y: number;
}

class ShelfPacker {
    private readonly _shelves: Array<Shelf> = [];
    private readonly _width: number;
    private readonly _height: number;

    public constructor(width: number, height: number) {
        this._width = width;
        this._height = height;
    }

    public insert(width: number, height: number): ShelfPackerResult {
        // Try existing shelves in order (ascending y)
        for (const shelf of this._shelves) {
            if (shelf.height >= height && shelf.cursorX + width <= this._width) {
                const x = shelf.cursorX;

                shelf.cursorX += width;

                return { x, y: shelf.y };
            }
        }

        // Create a new shelf at the bottom
        const last = this._shelves[this._shelves.length - 1];
        const bottomY = last === undefined ? 0 : last.y + last.height;

        if (bottomY + height > this._height) {
            throw new Error(
                `GlyphAtlas full — clear() and re-render, or instantiate with larger dims`,
            );
        }

        this._shelves.push({ y: bottomY, height, cursorX: width });

        return { x: 0, y: bottomY };
    }

    public reset(): void {
        this._shelves.length = 0;
    }
}

/**
 * A shared atlas that rasterizes glyphs on demand into an offscreen canvas
 * and wraps it as a Texture for use by the Mesh-based Text renderer.
 *
 * Glyphs are always rasterized in white so that runtime tinting via
 * `Mesh.tint` applies the fill color without requiring re-rasterization.
 *
 * Use `getDefaultGlyphAtlas()` from `atlas-singleton.ts` rather than
 * constructing directly.
 */
export class DynamicGlyphAtlas {

    public readonly texture: Texture;

    private readonly _canvas: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;
    private readonly _packer: ShelfPacker;
    private readonly _cache: Map<GlyphKey, GlyphInfo> = new Map();
    private readonly _width: number;
    private readonly _height: number;

    public constructor(width = 1024, height = 1024) {
        this._width = width;
        this._height = height;

        // Use OffscreenCanvas when available, fall back to HTMLCanvasElement.
        // In jsdom / Node the global may be absent; createCanvas falls through
        // to document.createElement which jsdom provides.
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement
            : document.createElement('canvas');

        if ('width' in canvas) {
            (canvas as HTMLCanvasElement).width = width;
            (canvas as HTMLCanvasElement).height = height;
        }

        this._canvas = canvas as HTMLCanvasElement;

        const ctx = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;

        if (ctx === null) {
            throw new Error('DynamicGlyphAtlas: could not obtain a 2D context.');
        }

        this._ctx = ctx;
        this._packer = new ShelfPacker(width, height);
        this.texture = new Texture(canvas as HTMLCanvasElement);
        this.texture.setSize(width, height);
    }

    /**
     * Returns the cached GlyphInfo for the given character + font parameters,
     * rasterizing it into the atlas if not already present.
     */
    public getGlyph(
        char: string,
        family: string,
        size: number,
        weight: string | number,
        style: 'normal' | 'italic',
    ): GlyphInfo {
        const key: GlyphKey = `${char}:${family}:${size}:${weight}:${style}`;
        const cached = this._cache.get(key);

        if (cached !== undefined) {
            return cached;
        }

        const info = this._rasterize(char, family, size, weight, style, key);

        this._cache.set(key, info);

        // Bump texture version so GPU backends re-upload the canvas data.
        this.texture.updateSource();

        return info;
    }

    /**
     * Clears all cached glyphs and resets the atlas packer.
     * The underlying canvas pixels are also cleared.
     */
    public clear(): void {
        this._cache.clear();
        this._packer.reset();
        this._ctx.clearRect(0, 0, this._width, this._height);
        this.texture.updateSource();
    }

    // -----------------------------------------------------------------------

    private _rasterize(
        char: string,
        family: string,
        size: number,
        weight: string | number,
        fontStyle: 'normal' | 'italic',
        _key: GlyphKey,
    ): GlyphInfo {
        const ctx = this._ctx;
        const padding = glyphPadding;

        ctx.font = `${fontStyle} ${weight} ${size}px ${family}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';

        const metrics = ctx.measureText(char);

        const ascent = Math.ceil(
            (metrics as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent
            ?? metrics.actualBoundingBoxAscent
            ?? size * 0.8,
        );
        const descent = Math.ceil(
            (metrics as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent
            ?? metrics.actualBoundingBoxDescent
            ?? size * 0.2,
        );
        const advance = metrics.width;
        const glyphWidth = Math.max(
            1,
            Math.ceil(
                (metrics.actualBoundingBoxLeft ?? 0) + (metrics.actualBoundingBoxRight ?? 0),
            ) || Math.ceil(advance),
        );
        const glyphHeight = Math.max(1, ascent + descent);

        const slotW = glyphWidth + padding * 2;
        const slotH = glyphHeight + padding * 2;
        const slot = this._packer.insert(slotW, slotH);

        // Draw the glyph white into the atlas slot
        ctx.fillText(
            char,
            slot.x + padding + (metrics.actualBoundingBoxLeft ?? 0),
            slot.y + padding + ascent,
        );

        const info: GlyphInfo = {
            x: slot.x,
            y: slot.y,
            width: glyphWidth,
            height: glyphHeight,
            advance,
            ascent,
            uvLeft: slot.x / this._width,
            uvTop: slot.y / this._height,
            uvRight: (slot.x + slotW) / this._width,
            uvBottom: (slot.y + slotH) / this._height,
        };

        return info;
    }
}
