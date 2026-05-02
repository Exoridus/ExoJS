/**
 * Tests for DynamicGlyphAtlas.
 *
 * jsdom does not implement canvas 2D, so we install a richer mock on
 * HTMLCanvasElement.prototype.getContext before each test. The mock
 * provides enough surface area for atlas glyph rasterization:
 * measureText, fillText, font, textBaseline, fillStyle, clearRect.
 */

import { DynamicGlyphAtlas } from '@/rendering/text/DynamicGlyphAtlas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCtx(overrides: Partial<CanvasRenderingContext2D> = {}): CanvasRenderingContext2D {
    return {
        font: '',
        textBaseline: 'alphabetic',
        fillStyle: '#ffffff',
        measureText: (_text: string) => ({
            width: 10,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: 9,
            actualBoundingBoxAscent: 13,
            actualBoundingBoxDescent: 3,
            fontBoundingBoxAscent: 14,
            fontBoundingBoxDescent: 4,
        } as TextMetrics),
        fillText: jest.fn(),
        clearRect: jest.fn(),
        ...overrides,
    } as unknown as CanvasRenderingContext2D;
}

function installMockCtx(ctx: CanvasRenderingContext2D): void {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => ctx,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DynamicGlyphAtlas', () => {
    let mockCtx: CanvasRenderingContext2D;

    beforeEach(() => {
        mockCtx = makeMockCtx();
        installMockCtx(mockCtx);
    });

    afterEach(() => {
        // Restore the minimal setup-env mock
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
        });
    });

    test('constructs at default 1024×1024 and exposes a Texture', () => {
        const atlas = new DynamicGlyphAtlas();

        expect(atlas.texture).toBeDefined();
        expect(atlas.texture.width).toBe(1024);
        expect(atlas.texture.height).toBe(1024);
    });

    test('getGlyph returns GlyphInfo with sane bounds and advance > 0', () => {
        const atlas = new DynamicGlyphAtlas();
        const info = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');

        expect(info.advance).toBeGreaterThan(0);
        expect(info.width).toBeGreaterThan(0);
        expect(info.height).toBeGreaterThan(0);
        // UV bounds must be within [0, 1]
        expect(info.uvLeft).toBeGreaterThanOrEqual(0);
        expect(info.uvRight).toBeLessThanOrEqual(1);
        expect(info.uvTop).toBeGreaterThanOrEqual(0);
        expect(info.uvBottom).toBeLessThanOrEqual(1);
        // Right > left, bottom > top
        expect(info.uvRight).toBeGreaterThan(info.uvLeft);
        expect(info.uvBottom).toBeGreaterThan(info.uvTop);
    });

    test('same call twice returns the same cached instance', () => {
        const atlas = new DynamicGlyphAtlas();
        const a = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');
        const b = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');

        expect(a).toBe(b);
    });

    test('different (font, size, weight, style, char) keys produce different entries', () => {
        const atlas = new DynamicGlyphAtlas();
        const infoA = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');
        const infoB = atlas.getGlyph('B', 'sans-serif', 16, 'normal', 'normal');
        const infoC = atlas.getGlyph('A', 'sans-serif', 32, 'normal', 'normal');
        const infoD = atlas.getGlyph('A', 'sans-serif', 16, 'bold', 'normal');
        const infoE = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'italic');

        expect(infoA).not.toBe(infoB);
        expect(infoA).not.toBe(infoC);
        expect(infoA).not.toBe(infoD);
        expect(infoA).not.toBe(infoE);
    });

    test('texture version increments on each new glyph insertion', () => {
        const atlas = new DynamicGlyphAtlas();
        const v0 = atlas.texture.version;

        atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');
        const v1 = atlas.texture.version;

        atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal'); // cached — no bump
        const v2 = atlas.texture.version;

        atlas.getGlyph('B', 'sans-serif', 16, 'normal', 'normal');
        const v3 = atlas.texture.version;

        expect(v1).toBeGreaterThan(v0);
        expect(v2).toBe(v1); // no bump for cached glyph
        expect(v3).toBeGreaterThan(v2);
    });

    test('atlas-full throws with expected message', () => {
        // Use a tiny 64×64 atlas. Each glyph slot is ~13+4=17px wide (with padding),
        // so after a few rows it fills up. Mock measureText to return a wide glyph.
        const wideCtx = makeMockCtx({
            measureText: (_: string) => ({
                width: 60,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 59,
                actualBoundingBoxAscent: 28,
                actualBoundingBoxDescent: 8,
                fontBoundingBoxAscent: 30,
                fontBoundingBoxDescent: 10,
            } as TextMetrics),
        });

        installMockCtx(wideCtx);

        const atlas = new DynamicGlyphAtlas(64, 64);

        // A single glyph needs ~64px wide * 40px high padded slot.
        // Two rows fills the atlas.
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let threw = false;

        try {
            for (const ch of chars) {
                atlas.getGlyph(ch, 'serif', 28, 'normal', 'normal');
            }
        } catch (err) {
            threw = true;
            expect((err as Error).message).toMatch(/GlyphAtlas full/);
        }

        expect(threw).toBe(true);
    });

    test('clear() empties the cache and resets the packer, allowing re-population', () => {
        const atlas = new DynamicGlyphAtlas();
        const info1 = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');

        atlas.clear();

        const info2 = atlas.getGlyph('A', 'sans-serif', 16, 'normal', 'normal');

        // After clear() a new entry is created — it may or may not be the same
        // object reference, but it must have been re-rasterized (i.e. fillText
        // was called again: the mock would be called again).
        // The simplest observable invariant: the slot position resets to (0,0).
        expect(info2.x).toBe(0);
        expect(info2.y).toBe(0);
        // Confirm it's a fresh object (different reference), because the map was cleared.
        expect(info2).not.toBe(info1);
    });

    test('constructs with custom dimensions', () => {
        const atlas = new DynamicGlyphAtlas(512, 256);

        expect(atlas.texture.width).toBe(512);
        expect(atlas.texture.height).toBe(256);
    });
});
