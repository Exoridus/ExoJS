export type TextAlignment = 'left' | 'center' | 'right';

/**
 * A key that uniquely identifies a glyph in the atlas cache.
 * Format: `${char}:${family}:${size}:${weight}:${style}`
 */
export type GlyphKey = string;

/**
 * Cached glyph data stored in the atlas after rasterization.
 */
export interface GlyphInfo {
    /** Atlas X position (pixels, top-left of padded slot). */
    readonly x: number;
    /** Atlas Y position (pixels, top-left of padded slot). */
    readonly y: number;
    /** Glyph render width in pixels (excluding padding). */
    readonly width: number;
    /** Glyph render height in pixels (excluding padding). */
    readonly height: number;
    /** Horizontal advance in pixels (how far to move the cursor). */
    readonly advance: number;
    /** Distance from baseline to top of glyph in pixels. */
    readonly ascent: number;
    /** UV left edge (0..1, including padding). */
    readonly uvLeft: number;
    /** UV top edge (0..1, including padding). */
    readonly uvTop: number;
    /** UV right edge (0..1, including padding). */
    readonly uvRight: number;
    /** UV bottom edge (0..1, including padding). */
    readonly uvBottom: number;
}

/**
 * A single glyph's quad placement in local text space.
 * Origin is the top-left of the first line.
 */
export interface GlyphPlacement {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly uvLeft: number;
    readonly uvTop: number;
    readonly uvRight: number;
    readonly uvBottom: number;
}
