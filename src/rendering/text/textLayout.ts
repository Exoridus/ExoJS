import type { LayoutOptions } from './LayoutOptions';
import { graphemes, reverseGraphemes, textRuns } from './segmentation';
import type { GlyphInfo, GlyphPlacement, GlyphProvider, TextLayoutResult, TextLayoutStyle, TextLineMetrics, TextPageQuads } from './types';

interface LinePlacement {
  placements: Array<{ info: GlyphInfo; x: number; y: number; cluster: string }>;
  width: number;
  wordCount: number;
}

/**
 * Result for text that places no glyph at all: no quads, no advance, no ink.
 * Exported so a node can answer for an empty string without having to acquire
 * a glyph provider it would not use.
 * @internal
 */
export const emptyTextLayout = (): TextLayoutResult => ({
  placements: [],
  lines: [],
  advance: { width: 0, height: 0 },
  ink: { x: 0, y: 0, width: 0, height: 0 },
});

/**
 * Computes per-glyph quad placements for the given text, style, and layout
 * options.
 *
 * Handles `\n` line breaks, left/center/right/justify alignment, `letterSpacing`,
 * `leading`, `breakWords`, `whiteSpace` preprocessing, `maxHeight` overflow
 * (`clip` / `ellipsis`), right-to-left flow, and optional kerning (if the
 * provider implements `getKerning`).
 *
 * The unit of layout is the grapheme cluster, not the code point: a combining
 * sequence, a ZWJ emoji and a regional-indicator flag are each placed as one
 * glyph and are never split by wrapping or by the ellipsis. `locale` selects
 * the segmentation locale.
 *
 * `direction: 'rtl'` reverses each line's clusters visually once wrapping is
 * done, so uniformly right-to-left text reads correctly. Full bidi and
 * contextual shaping are out of scope here.
 *
 * Returns the placements alongside both extents the callers need - see
 * {@link TextLayoutResult} for why the advance and the ink are different
 * numbers. Text that places no glyph yields zeroes for both.
 */
export const layoutText = (text: string, style: TextLayoutStyle, layout: LayoutOptions, provider: GlyphProvider): TextLayoutResult => {
  if (text.length === 0) return emptyTextLayout();

  const { fontSize, lineHeight, leading, align } = style;
  const computedLineHeight = fontSize * lineHeight + leading;
  const letterSpacing = layout.letterSpacing ?? 0;
  const maxWidth = layout.maxWidth;
  const maxHeight = layout.maxHeight;
  const overflow = layout.overflow ?? 'visible';
  const rtl = layout.direction === 'rtl';
  const breakWords = layout.breakWords ?? false;
  const whiteSpace = layout.whiteSpace ?? 'pre-line';
  const locale = layout.locale;

  // ── Whitespace preprocessing ──────────────────────────────────────────────
  const preprocessed = _applyWhiteSpace(text, whiteSpace);

  // Split into hard lines then optionally word-wrap each.
  const hardLines = preprocessed.split('\n');
  const allLines: string[] = [];

  for (const hard of hardLines) {
    if (maxWidth === undefined) {
      allLines.push(hard);
    } else {
      allLines.push(..._wrapLine(hard, fontSize, provider, maxWidth, letterSpacing, breakWords, locale));
    }
  }

  // ── Vertical overflow ─────────────────────────────────────────────────────
  // Only whole line boxes count as fitting: a line whose baseline row would
  // extend past maxHeight is dropped rather than rendered half-cut.
  if (maxHeight !== undefined && overflow !== 'visible' && computedLineHeight > 0) {
    const maxLines = Math.max(0, Math.floor(maxHeight / computedLineHeight));

    if (allLines.length > maxLines) {
      allLines.length = maxLines;

      if (overflow === 'ellipsis' && maxLines > 0) {
        // In-bounds: maxLines > 0 and allLines.length === maxLines.
        allLines[maxLines - 1] = _ellipsize(allLines[maxLines - 1]!, fontSize, provider, maxWidth, letterSpacing, locale);
      }
    }
  }

  // Pass 1: gather glyph info per line, track widths and word counts.
  const linePlacements: LinePlacement[] = [];
  let maxLineWidth = 0;

  for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
    // In-bounds: lineIndex < allLines.length.
    // RTL reorders each line visually before placement, so the cursor can keep
    // advancing left-to-right and every downstream step (alignment, justify,
    // quad building) stays direction-agnostic.
    const line = rtl ? reverseGraphemes(allLines[lineIndex]!, locale) : allLines[lineIndex]!;
    const lineY = lineIndex * computedLineHeight;
    let cursorX = 0;
    let wordCount = 0;
    let inWord = false;
    const placements: LinePlacement['placements'] = [];
    let prevCluster: string | null = null;

    for (const cluster of graphemes(line, locale)) {
      // Kerning adjustment before placing this cluster.
      if (prevCluster !== null && provider.getKerning !== undefined) {
        cursorX += provider.getKerning(prevCluster, cluster, fontSize);
      }

      const info = provider.getGlyph(cluster, fontSize);
      placements.push({ info, x: cursorX, y: lineY, cluster });
      cursorX += info.advance + letterSpacing;

      if (cluster === ' ') {
        inWord = false;
      } else if (!inWord) {
        inWord = true;
        wordCount++;
      }

      prevCluster = cluster;
    }

    const lineWidth = cursorX - (placements.length > 0 ? letterSpacing : 0);
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    linePlacements.push({ placements, width: lineWidth, wordCount });
  }

  // Pass 2: apply alignment offset and build final GlyphPlacement array.
  //
  // The ink extent accumulates here rather than in a follow-up sweep: every
  // quad is already in hand, and the minimum is genuinely open - in SDF mode
  // the first glyph starts at a negative x/y because the atlas hands out
  // bearings that pull the padded tile back around the cursor.
  const result: GlyphPlacement[] = [];
  const lines: TextLineMetrics[] = [];
  const lastLineIndex = linePlacements.length - 1;
  let inkMinX = Infinity;
  let inkMinY = Infinity;
  let inkMaxX = -Infinity;
  let inkMaxY = -Infinity;

  const place = (placement: GlyphPlacement): void => {
    result.push(placement);

    if (placement.x < inkMinX) inkMinX = placement.x;
    if (placement.y < inkMinY) inkMinY = placement.y;
    if (placement.x + placement.width > inkMaxX) inkMaxX = placement.x + placement.width;
    if (placement.y + placement.height > inkMaxY) inkMaxY = placement.y + placement.height;
  };

  for (let li = 0; li < linePlacements.length; li++) {
    // In-bounds: li < linePlacements.length.
    const line = linePlacements[li]!;
    const lineStart = result.length;
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

      for (const entry of line.placements) {
        if (prevWasSpace && entry.cluster !== ' ') {
          wordIdx++;
          prevWasSpace = false;
        } else if (!prevWasSpace && entry.cluster === ' ') {
          prevWasSpace = true;
        }

        place({
          x: entry.x + offsetX + wordIdx * extraPerGap + (entry.info.xBearing ?? 0),
          y: entry.y + (entry.info.yBearing ?? 0),
          width: entry.info.width,
          height: entry.info.height,
          penX: entry.x + offsetX + wordIdx * extraPerGap,
          penAdvance: entry.info.advance + letterSpacing,
          page: entry.info.page,
          uvLeft: entry.info.uvLeft,
          uvTop: entry.info.uvTop,
          uvRight: entry.info.uvRight,
          uvBottom: entry.info.uvBottom,
        });
      }

      // Justify stretches the line to fill maxLineWidth exactly - each of the
      // `gaps` inter-word gaps absorbs `extraPerGap`, so the line's actual
      // width after layout is maxLineWidth, not the pre-justify `line.width`
      // a selection rectangle or caret would otherwise fall short of.
      lines.push({ start: lineStart, count: result.length - lineStart, x: offsetX, y: li * computedLineHeight, width: maxLineWidth });
      continue;
    }

    for (const { info, x, y } of line.placements) {
      place({
        x: x + offsetX + (info.xBearing ?? 0),
        y: y + (info.yBearing ?? 0),
        width: info.width,
        height: info.height,
        penX: x + offsetX,
        penAdvance: info.advance + letterSpacing,
        page: info.page,
        uvLeft: info.uvLeft,
        uvTop: info.uvTop,
        uvRight: info.uvRight,
        uvBottom: info.uvBottom,
      });
    }

    lines.push({ start: lineStart, count: result.length - lineStart, x: offsetX, y: li * computedLineHeight, width: line.width });
  }

  // Text that is nothing but line breaks places no glyph yet still occupies
  // the line boxes it broke into - a caret has to be able to sit on them.
  if (result.length === 0) {
    return {
      placements: result,
      lines,
      advance: { width: maxLineWidth, height: allLines.length * computedLineHeight },
      ink: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  return {
    placements: result,
    lines,
    advance: { width: maxLineWidth, height: allLines.length * computedLineHeight },
    ink: { x: inkMinX, y: inkMinY, width: inkMaxX - inkMinX, height: inkMaxY - inkMinY },
  };
};

/**
 * Convert {@link GlyphPlacement} arrays into per-atlas-page quad geometry
 * ready for GPU upload. Zero-size placements (e.g. whitespace glyphs that
 * have no atlas entry) are skipped.
 */
export const buildTextPageQuads = (placements: readonly GlyphPlacement[]): TextPageQuads[] => {
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
    const indices = new Uint32Array(n * 6);

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
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Character appended to the last visible line under `overflow: 'ellipsis'`. */
const ELLIPSIS = '…';

/** Advance width of a run of grapheme clusters, without the gap after the last one. */
const _measureClusters = (clusters: readonly string[], fontSize: number, provider: GlyphProvider, letterSpacing: number): number => {
  if (clusters.length === 0) return 0;

  let width = 0;

  for (const cluster of clusters) {
    width += provider.getGlyph(cluster, fontSize).advance + letterSpacing;
  }

  // The gap after the final glyph is not part of the line's ink extent.
  return width - letterSpacing;
};

/**
 * Append an ellipsis to `line`, dropping trailing grapheme clusters until the
 * result fits `maxWidth`. Whole clusters go, so truncation never leaves a
 * dangling combining mark or half a flag behind. Without a `maxWidth` there is
 * nothing to fit against, so the ellipsis is simply appended.
 */
const _ellipsize = (
  line: string,
  fontSize: number,
  provider: GlyphProvider,
  maxWidth: number | undefined,
  letterSpacing: number,
  locale: string | undefined,
): string => {
  if (maxWidth === undefined) return line + ELLIPSIS;

  const clusters = graphemes(line, locale);

  while (clusters.length > 0 && _measureClusters([...clusters, ELLIPSIS], fontSize, provider, letterSpacing) > maxWidth) {
    clusters.pop();
  }

  return clusters.join('') + ELLIPSIS;
};

const _applyWhiteSpace = (text: string, mode: 'normal' | 'pre' | 'pre-line'): string => {
  if (mode === 'pre') return text;
  if (mode === 'normal') {
    return text.replaceAll('\n', ' ').replaceAll(/[ \t]+/g, ' ');
  }
  // 'pre-line': collapse spaces per line, preserve newlines (default)
  return text
    .split('\n')
    .map(line => line.replaceAll(/[ \t]+/g, ' '))
    .join('\n');
};

/**
 * Cursor advance of `text`, INCLUDING the letter-spacing gap after its last
 * cluster. Widths in this form add up across concatenation, so the wrapper can
 * compose a candidate from parts it measured separately; a line's reported
 * width drops the one trailing gap again.
 */
const _cursorAdvance = (text: string, fontSize: number, provider: GlyphProvider, letterSpacing: number, locale: string | undefined): number => {
  let advance = 0;

  for (const cluster of graphemes(text, locale)) {
    advance += provider.getGlyph(cluster, fontSize).advance + letterSpacing;
  }

  return advance;
};

/**
 * Greedy word wrap over locale-aware runs.
 *
 * Whitespace runs are candidates in their own right rather than part of a
 * word: the run a line breaks on is dropped, and a run that stays inside a
 * line is preserved verbatim, which is what keeps `whiteSpace: 'pre'` columns
 * intact. `breakWords` splits an oversized word at grapheme-cluster
 * boundaries, so an emoji sequence or a combining sequence is never cut in
 * half.
 */
const _wrapLine = (
  line: string,
  fontSize: number,
  provider: GlyphProvider,
  maxWidth: number,
  letterSpacing: number,
  breakWords: boolean,
  locale: string | undefined,
): string[] => {
  if (line.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  let currentAdvance = 0;
  let gap = '';
  let gapAdvance = 0;

  for (const run of textRuns(line, locale)) {
    const text = line.slice(run.start, run.end);

    if (run.whitespace) {
      gap += text;
      gapAdvance += _cursorAdvance(text, fontSize, provider, letterSpacing, locale);
      continue;
    }

    const wordAdvance = _cursorAdvance(text, fontSize, provider, letterSpacing, locale);

    if (breakWords && wordAdvance - letterSpacing > maxWidth) {
      if (current.length > 0) lines.push(current);

      gap = '';
      gapAdvance = 0;

      let chunk = '';
      let chunkAdvance = 0;

      for (const cluster of graphemes(text, locale)) {
        const clusterAdvance = provider.getGlyph(cluster, fontSize).advance + letterSpacing;

        if (chunk.length > 0 && chunkAdvance + clusterAdvance - letterSpacing > maxWidth) {
          lines.push(chunk);
          chunk = cluster;
          chunkAdvance = clusterAdvance;
        } else {
          chunk += cluster;
          chunkAdvance += clusterAdvance;
        }
      }

      current = chunk;
      currentAdvance = chunkAdvance;
      continue;
    }

    if (current.length === 0) {
      current = text;
      currentAdvance = wordAdvance;
    } else if (currentAdvance + gapAdvance + wordAdvance - letterSpacing <= maxWidth) {
      current += gap + text;
      currentAdvance += gapAdvance + wordAdvance;
    } else {
      lines.push(current);
      current = text;
      currentAdvance = wordAdvance;
    }

    gap = '';
    gapAdvance = 0;
  }

  // Trailing whitespace rides along with the line it followed; on a line that
  // placed no word at all there is nothing for it to trail, and an all-blank
  // line stays blank.
  if (current.length > 0) current += gap;

  lines.push(current);

  return lines;
};
