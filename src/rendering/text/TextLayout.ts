import type { LayoutOptions } from './LayoutOptions';
import type { GlyphInfo, GlyphPlacement, GlyphProvider, TextLayoutStyle, TextPageQuads, TextSize } from './types';

interface LinePlacement {
  placements: Array<{ info: GlyphInfo; x: number; y: number; char: string }>;
  width: number;
  wordCount: number;
}

/**
 * Compute the bounding pixel dimensions of `text` without allocating quad
 * placements. Returns `{ width: 0, height: 0 }` for empty text.
 */
export function measureText(text: string, style: TextLayoutStyle, provider: GlyphProvider): TextSize {
  if (text.length === 0) return { width: 0, height: 0 };

  const { fontSize, lineHeight, leading } = style;
  const computedLineHeight = fontSize * lineHeight + leading;
  const lines = text.split('\n');
  let maxLineWidth = 0;

  for (const line of lines) {
    let lineWidth = 0;
    for (const char of line) {
      lineWidth += provider.getGlyph(char, fontSize).advance;
    }
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
  }

  return { width: maxLineWidth, height: lines.length * computedLineHeight };
}

/**
 * Computes per-glyph quad placements for the given text, style, and layout
 * options.
 *
 * Handles `\n` line breaks, left/center/right/justify alignment, `letterSpacing`,
 * `leading`, `breakWords`, `whiteSpace` preprocessing, and optional kerning
 * (if the provider implements `getKerning`). RTL and ligature shaping are out
 * of scope; Unicode/diacritics are delegated to the browser's canvas engine.
 *
 * Returns an empty array for empty text.
 */
export function layoutText(text: string, style: TextLayoutStyle, layout: LayoutOptions, provider: GlyphProvider): readonly GlyphPlacement[] {
  if (text.length === 0) return [];

  const { fontSize, lineHeight, leading, align } = style;
  const computedLineHeight = fontSize * lineHeight + leading;
  const letterSpacing = layout.letterSpacing ?? 0;
  const maxWidth = layout.maxWidth;
  const breakWords = layout.breakWords ?? false;
  const whiteSpace = layout.whiteSpace ?? 'pre-line';

  // ── Whitespace preprocessing ──────────────────────────────────────────────
  const preprocessed = _applyWhiteSpace(text, whiteSpace);

  // Split into hard lines then optionally word-wrap each.
  const hardLines = preprocessed.split('\n');
  const allLines: string[] = [];

  for (const hard of hardLines) {
    if (maxWidth === undefined) {
      allLines.push(hard);
    } else {
      allLines.push(..._wrapLine(hard, fontSize, provider, maxWidth, letterSpacing, breakWords));
    }
  }

  // Pass 1: gather glyph info per line, track widths and word counts.
  const linePlacements: LinePlacement[] = [];
  let maxLineWidth = 0;

  for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
    // In-bounds: lineIndex < allLines.length.
    const line = allLines[lineIndex]!;
    const lineY = lineIndex * computedLineHeight;
    let cursorX = 0;
    let wordCount = 0;
    let inWord = false;
    const placements: LinePlacement['placements'] = [];
    let prevChar: string | null = null;

    for (const char of line) {
      // Kerning adjustment before placing this character.
      if (prevChar !== null && provider.getKerning !== undefined) {
        cursorX += provider.getKerning(prevChar, char, fontSize);
      }

      const info = provider.getGlyph(char, fontSize);
      placements.push({ info, x: cursorX, y: lineY, char });
      cursorX += info.advance + letterSpacing;

      if (char === ' ') {
        inWord = false;
      } else if (!inWord) {
        inWord = true;
        wordCount++;
      }

      prevChar = char;
    }

    const lineWidth = cursorX - (placements.length > 0 ? letterSpacing : 0);
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    linePlacements.push({ placements, width: lineWidth, wordCount });
  }

  // Pass 2: apply alignment offset and build final GlyphPlacement array.
  const result: GlyphPlacement[] = [];
  const lastLineIndex = linePlacements.length - 1;

  for (let li = 0; li < linePlacements.length; li++) {
    // In-bounds: li < linePlacements.length.
    const line = linePlacements[li]!;
    let offsetX = 0;

    if (align === 'right') {
      offsetX = maxLineWidth - line.width;
    } else if (align === 'center') {
      offsetX = (maxLineWidth - line.width) / 2;
    } else if (align === 'justify' && li !== lastLineIndex && line.wordCount > 1) {
      // Justify: distribute extra space evenly among inter-word gaps.
      const gaps = line.wordCount - 1;
      const extraPerGap = (maxLineWidth - line.width) / gaps;
      let wordIdx = -1;
      let prevWasSpace = true;
      const spaceAdv = provider.getGlyph(' ', fontSize).advance;

      for (const entry of line.placements) {
        if (prevWasSpace && entry.info.advance !== spaceAdv) {
          wordIdx++;
          prevWasSpace = false;
        } else if (!prevWasSpace && entry.info.advance === spaceAdv) {
          prevWasSpace = true;
        }

        result.push({
          x: entry.x + offsetX + wordIdx * extraPerGap + (entry.info.xBearing ?? 0),
          y: entry.y + (entry.info.yBearing ?? 0),
          width: entry.info.width,
          height: entry.info.height,
          page: entry.info.page,
          uvLeft: entry.info.uvLeft,
          uvTop: entry.info.uvTop,
          uvRight: entry.info.uvRight,
          uvBottom: entry.info.uvBottom,
        });
      }
      continue;
    }

    for (const { info, x, y } of line.placements) {
      result.push({
        x: x + offsetX + (info.xBearing ?? 0),
        y: y + (info.yBearing ?? 0),
        width: info.width,
        height: info.height,
        page: info.page,
        uvLeft: info.uvLeft,
        uvTop: info.uvTop,
        uvRight: info.uvRight,
        uvBottom: info.uvBottom,
      });
    }
  }

  return result;
}

/**
 * Convert {@link GlyphPlacement} arrays into per-atlas-page quad geometry
 * ready for GPU upload. Zero-size placements (e.g. whitespace glyphs that
 * have no atlas entry) are skipped.
 */
export function buildTextPageQuads(placements: readonly GlyphPlacement[]): TextPageQuads[] {
  const byPage = new Map<number, GlyphPlacement[]>();
  for (const p of placements) {
    if (p.width <= 0 || p.height <= 0) continue; // skip invisible/whitespace quads
    let arr = byPage.get(p.page);
    if (arr === undefined) byPage.set(p.page, (arr = []));
    arr.push(p);
  }

  const result: TextPageQuads[] = [];

  for (const [pageIndex, pagePlacements] of byPage) {
    const n = pagePlacements.length;
    const vertices = new Float32Array(n * 8);
    const uvs = new Float32Array(n * 8);
    const indices = new Uint16Array(n * 6);

    for (let i = 0; i < n; i++) {
      // In-bounds: i < n === pagePlacements.length.
      const p = pagePlacements[i]!;
      const v = i * 8;
      const baseV = i * 4;
      const idxBase = i * 6;

      vertices[v + 0] = p.x;
      vertices[v + 1] = p.y;
      vertices[v + 2] = p.x + p.width;
      vertices[v + 3] = p.y;
      vertices[v + 4] = p.x + p.width;
      vertices[v + 5] = p.y + p.height;
      vertices[v + 6] = p.x;
      vertices[v + 7] = p.y + p.height;

      uvs[v + 0] = p.uvLeft;
      uvs[v + 1] = p.uvTop;
      uvs[v + 2] = p.uvRight;
      uvs[v + 3] = p.uvTop;
      uvs[v + 4] = p.uvRight;
      uvs[v + 5] = p.uvBottom;
      uvs[v + 6] = p.uvLeft;
      uvs[v + 7] = p.uvBottom;

      indices[idxBase + 0] = baseV;
      indices[idxBase + 1] = baseV + 1;
      indices[idxBase + 2] = baseV + 2;
      indices[idxBase + 3] = baseV;
      indices[idxBase + 4] = baseV + 2;
      indices[idxBase + 5] = baseV + 3;
    }

    result.push({ pageIndex, vertices, uvs, indices, quadCount: n });
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _applyWhiteSpace(text: string, mode: 'normal' | 'pre' | 'pre-line'): string {
  if (mode === 'pre') return text;
  if (mode === 'normal') {
    return text.replaceAll('\n', ' ').replaceAll(/[ \t]+/g, ' ');
  }
  // 'pre-line': collapse spaces per line, preserve newlines (default)
  return text
    .split('\n')
    .map(line => line.replaceAll(/[ \t]+/g, ' '))
    .join('\n');
}

function _wrapLine(line: string, fontSize: number, provider: GlyphProvider, maxWidth: number, letterSpacing: number, breakWords: boolean): string[] {
  if (line.length === 0) return [''];

  const words = line.split(' ');
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  const spaceAdv = provider.getGlyph(' ', fontSize).advance + letterSpacing;

  for (const word of words) {
    let wordWidth = 0;
    for (const char of word) {
      wordWidth += provider.getGlyph(char, fontSize).advance + letterSpacing;
    }
    wordWidth = Math.max(0, wordWidth - letterSpacing);

    if (breakWords && wordWidth > maxWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
        currentWidth = 0;
      }
      let charLine = '';
      let charLineWidth = 0;
      for (const char of word) {
        const cw = provider.getGlyph(char, fontSize).advance + letterSpacing;
        if (charLine.length > 0 && charLineWidth + cw > maxWidth) {
          lines.push(charLine);
          charLine = char;
          charLineWidth = cw;
        } else {
          charLine += char;
          charLineWidth += cw;
        }
      }
      if (charLine.length > 0) {
        current = charLine;
        currentWidth = charLineWidth;
      }
    } else if (current.length === 0) {
      current = word;
      currentWidth = wordWidth;
    } else {
      const withSpace = currentWidth + spaceAdv + wordWidth;
      if (withSpace <= maxWidth) {
        current += ` ${word}`;
        currentWidth = withSpace;
      } else {
        lines.push(current);
        current = word;
        currentWidth = wordWidth;
      }
    }
  }

  lines.push(current);
  return lines;
}
