/**
 * Tests for the layoutText() function.
 *
 * We use a minimal mock DynamicGlyphAtlas that returns predictable GlyphInfo
 * values so we can assert exact placement coordinates without depending on
 * real canvas measurement.
 */

import type { GlyphInfo } from '@/rendering/text/types';
import type { DynamicGlyphAtlas } from '@/rendering/text/DynamicGlyphAtlas';
import { layoutText } from '@/rendering/text/TextLayout';
import { TextStyle } from '@/rendering/text/TextStyle';

// ---------------------------------------------------------------------------
// Mock atlas
// ---------------------------------------------------------------------------

/** Returns a predictable GlyphInfo for any char. Width = charCode % 10 + 6. */
function makeAtlas(advance = 10, width = 8, height = 16): DynamicGlyphAtlas {
    const infoBase: GlyphInfo = {
        x: 0, y: 0,
        width,
        height,
        advance,
        ascent: 13,
        uvLeft: 0, uvTop: 0, uvRight: 0.1, uvBottom: 0.02,
    };

    return {
        getGlyph: jest.fn(() => infoBase),
        texture: { width: 1024, height: 1024 },
    } as unknown as DynamicGlyphAtlas;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutText', () => {
    test('empty text returns an empty array', () => {
        const atlas = makeAtlas();
        const style = new TextStyle({ fontSize: 16, align: 'left' });

        expect(layoutText('', style, atlas)).toEqual([]);
    });

    test('single line "Hello" — 5 placements with increasing x', () => {
        const advance = 10;
        const atlas = makeAtlas(advance);
        const style = new TextStyle({ fontSize: 16, align: 'left' });

        const placements = layoutText('Hello', style, atlas);

        expect(placements).toHaveLength(5);

        for (let i = 0; i < placements.length; i++) {
            expect(placements[i].x).toBe(i * advance);
            expect(placements[i].y).toBe(0);
        }
    });

    test('multi-line "Hi\\nThere" — 7 placements, "There" starts at y = lineHeight', () => {
        const fontSize = 16;
        const lineHeight = 1.2;
        const advance = 10;
        const atlas = makeAtlas(advance);
        const style = new TextStyle({ fontSize, lineHeight, align: 'left' });

        const placements = layoutText('Hi\nThere', style, atlas);

        // "Hi" = 2 chars, "There" = 5 chars, '\n' skipped
        expect(placements).toHaveLength(7);

        // First line y = 0
        expect(placements[0].y).toBe(0);
        expect(placements[1].y).toBe(0);

        // Second line y = fontSize * lineHeight
        const expectedY = fontSize * lineHeight;

        for (let i = 2; i < 7; i++) {
            expect(placements[i].y).toBeCloseTo(expectedY);
        }
    });

    test('align "left" — x starts at 0 for all lines', () => {
        const advance = 10;
        const atlas = makeAtlas(advance);
        const style = new TextStyle({ fontSize: 16, align: 'left' });

        const placements = layoutText('AB\nC', style, atlas);

        // Line 0: A at x=0, B at x=10
        expect(placements[0].x).toBe(0);
        expect(placements[1].x).toBe(10);
        // Line 1: C at x=0 (left-aligned)
        expect(placements[2].x).toBe(0);
    });

    test('align "right" — shorter lines are shifted right', () => {
        const advance = 10;
        const atlas = makeAtlas(advance);
        const style = new TextStyle({ fontSize: 16, align: 'right' });

        // Line 0: "AB"  → width = 20 (maxLineWidth)
        // Line 1: "C"   → width = 10, shift = 20-10=10
        const placements = layoutText('AB\nC', style, atlas);

        expect(placements).toHaveLength(3);

        // "AB" is the widest; no shift
        expect(placements[0].x).toBe(0);  // A (already at max)
        expect(placements[1].x).toBe(10); // B

        // "C" is shifted by 10
        expect(placements[2].x).toBe(10);
    });

    test('align "center" — shorter lines are centered', () => {
        const advance = 10;
        const atlas = makeAtlas(advance);
        const style = new TextStyle({ fontSize: 16, align: 'center' });

        // Line 0: "AB" → width = 20 (maxLineWidth)
        // Line 1: "C"  → width = 10, shift = (20-10)/2 = 5
        const placements = layoutText('AB\nC', style, atlas);

        expect(placements).toHaveLength(3);

        // "C" is shifted by 5
        expect(placements[2].x).toBeCloseTo(5);
    });

    test('single space character returns a placement (advance > 0, no visible pixels required)', () => {
        const atlas = makeAtlas(5); // space has advance
        const style = new TextStyle({ fontSize: 16, align: 'left' });

        const placements = layoutText(' ', style, atlas);

        expect(placements).toHaveLength(1);
        expect(placements[0].x).toBe(0);
    });

    test('placements carry correct UV coordinates from atlas', () => {
        const glyphInfo: GlyphInfo = {
            x: 4, y: 8,
            width: 12,
            height: 20,
            advance: 12,
            ascent: 16,
            uvLeft: 0.05,
            uvTop: 0.1,
            uvRight: 0.15,
            uvBottom: 0.2,
        };

        const atlas = {
            getGlyph: () => glyphInfo,
            texture: { width: 1024, height: 1024 },
        } as unknown as DynamicGlyphAtlas;

        const style = new TextStyle({ fontSize: 16, align: 'left' });
        const placements = layoutText('X', style, atlas);

        expect(placements[0].uvLeft).toBe(glyphInfo.uvLeft);
        expect(placements[0].uvTop).toBe(glyphInfo.uvTop);
        expect(placements[0].uvRight).toBe(glyphInfo.uvRight);
        expect(placements[0].uvBottom).toBe(glyphInfo.uvBottom);
        expect(placements[0].width).toBe(glyphInfo.width);
        expect(placements[0].height).toBe(glyphInfo.height);
    });
});
