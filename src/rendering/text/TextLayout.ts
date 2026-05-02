import type { DynamicGlyphAtlas } from './DynamicGlyphAtlas';
import type { GlyphInfo, GlyphPlacement } from './types';
import type { TextStyle } from './TextStyle';

interface LinePlacement {
    placements: Array<{
        info: GlyphInfo;
        x: number;
        y: number;
    }>;
    width: number;
}

/**
 * Computes per-glyph quad placements for the given text and style.
 *
 * Handles `\n` line breaks and left/center/right alignment. No word-wrap,
 * no RTL, no ligature shaping — Unicode/diacritics are delegated to the
 * browser's font engine via canvas `fillText`.
 *
 * Returns an empty array for empty text.
 */
export function layoutText(
    text: string,
    style: TextStyle,
    atlas: DynamicGlyphAtlas,
): ReadonlyArray<GlyphPlacement> {
    if (text.length === 0) {
        return [];
    }

    const { fontSize, fontFamily, fontWeight, fontStyle, lineHeight, align } = style;
    const computedLineHeight = fontSize * lineHeight;
    const lines = text.split('\n');

    // Pass 1: gather glyph info per line, track line widths
    const linePlacements: Array<LinePlacement> = [];
    let maxLineWidth = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const y = lineIndex * computedLineHeight;
        let cursorX = 0;
        const placements: LinePlacement['placements'] = [];

        for (const char of line) {
            const info = atlas.getGlyph(char, fontFamily, fontSize, fontWeight, fontStyle);

            placements.push({ info, x: cursorX, y });
            cursorX += info.advance;
        }

        const lineWidth = cursorX;

        if (lineWidth > maxLineWidth) {
            maxLineWidth = lineWidth;
        }

        linePlacements.push({ placements, width: lineWidth });
    }

    // Pass 2: apply alignment and build final GlyphPlacement array
    const result: Array<GlyphPlacement> = [];

    for (const line of linePlacements) {
        let offsetX = 0;

        if (align === 'right') {
            offsetX = maxLineWidth - line.width;
        } else if (align === 'center') {
            offsetX = (maxLineWidth - line.width) / 2;
        }

        for (const { info, x, y } of line.placements) {
            result.push({
                x: x + offsetX,
                y,
                width: info.width,
                height: info.height,
                uvLeft: info.uvLeft,
                uvTop: info.uvTop,
                uvRight: info.uvRight,
                uvBottom: info.uvBottom,
            });
        }
    }

    return result;
}
