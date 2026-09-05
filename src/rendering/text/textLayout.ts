import { assert } from '#core/dev';

import type { LayoutOptions } from './LayoutOptions';
import { graphemes, graphemeStarts, isTrivialText, textRuns, wordSegments } from './segmentation';
import type { LineShaper } from './shaping';
import { resolveShaping } from './shaping';
import type { GlyphInfo, GlyphPlacement, GlyphProvider, TextLayoutResult, TextLayoutStyle, TextLineMetrics, TextPageQuads, TextTransform } from './types';

interface LinePlacement {
  placements: Array<{ info: GlyphInfo; x: number; y: number; cluster: string; sourceStart: number; sourceEnd: number }>;
  width: number;
  wordCount: number;
  sourceStart: number;
  sourceEnd: number;
}

/**
 * One line the text broke into, still expressed against the preprocessed
 * string so its characters can be traced back to the caller's.
 */
interface LayoutLine {
  /** The string this line places. */
  text: string;
  /** Offset of `text` in the preprocessed string. */
  start: number;
  /**
   * How many preprocessed units `text` stands for. Shorter than `text.length`
   * when an ellipsis was appended, which stands for nothing.
   */
  contentLength: number;
}

/** A half-open range of the string being wrapped. */
interface LineRange {
  start: number;
  end: number;
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
 * `leading`, `breakWords`, `whiteSpace` preprocessing, `maxHeight` / `maxLines`
 * overflow (`clip` / `ellipsis`), right-to-left flow, and optional kerning (if
 * the provider implements `getKerning`).
 *
 * `textTransform` maps the string's case before anything else runs, per
 * grapheme cluster and under `locale`, and the result is traced back to the
 * caller's string so a caret still lands on the character it was aimed at.
 *
 * The unit of layout is the grapheme cluster, not the code point: a combining
 * sequence, a ZWJ emoji and a regional-indicator flag are each placed as one
 * glyph and are never split by wrapping or by the ellipsis. `locale` selects
 * the segmentation locale.
 *
 * Two representations exist and `shaping` selects between them. On the simple
 * path each cluster is one glyph from the shared cache, and `direction: 'rtl'`
 * reverses a line's clusters visually - correct for uniformly right-to-left
 * text, but neither bidi nor contextual shaping. On the browser-shaped path a
 * `shaper` receives each laid-out line whole and the browser resolves bidi
 * order and contextual forms; the line is then one placement, so `justify`
 * cannot stretch it and `letterSpacing` is applied inside the shaping rather
 * than between placements. Without a `shaper` the simple path is used
 * regardless of `shaping`.
 *
 * Returns the placements alongside both extents the callers need - see
 * {@link TextLayoutResult} for why the advance and the ink are different
 * numbers. Text that places no glyph yields zeroes for both.
 */
export const layoutText = (text: string, style: TextLayoutStyle, layout: LayoutOptions, provider: GlyphProvider, shaper?: LineShaper): TextLayoutResult => {
  if (text.length === 0) return emptyTextLayout();

  const { fontSize, lineHeight, leading, align, textTransform } = style;
  const computedLineHeight = fontSize * lineHeight + leading;
  const letterSpacing = layout.letterSpacing ?? 0;
  const maxWidth = layout.maxWidth;
  const maxHeight = layout.maxHeight;
  const overflow = layout.overflow ?? 'visible';
  const rtl = layout.direction === 'rtl';
  const breakWords = layout.breakWords ?? false;
  const whiteSpace = layout.whiteSpace ?? 'pre-line';
  const locale = layout.locale;
  const shaped = shaper !== undefined && resolveShaping(text, layout) === 'browser';
  // A shaped line carries its spacing inside the raster the browser produced,
  // so adding it between placements again would double it.
  const glyphSpacing = shaped ? 0 : letterSpacing;

  // ── Preprocessing ─────────────────────────────────────────────────────────
  //
  // Both passes move characters - a case mapping can turn one cluster into two
  // units, collapsing blanks removes them - so each records where every
  // surviving unit came from. Without that record a caret could not be mapped
  // onto a laid-out glyph at all. The two maps compose into one because the
  // whitespace pass indexes the transformed string, not the caller's.
  const cased = _applyTextTransform(text, textTransform, locale);
  const { text: preprocessed, sourceMap: whiteSpaceMap } = _applyWhiteSpace(cased.text, whiteSpace);
  const sourceMap = _composeSourceMaps(whiteSpaceMap, cased.sourceMap);
  const toSource = (index: number): number => (sourceMap === null ? Math.min(index, text.length) : sourceMap[Math.min(index, sourceMap.length - 1)]!);

  // Split into hard lines then optionally word-wrap each.
  const allLines: LayoutLine[] = [];
  let hardStart = 0;

  for (const hard of preprocessed.split('\n')) {
    if (maxWidth === undefined) {
      allLines.push({ text: hard, start: hardStart, contentLength: hard.length });
    } else {
      const ranges = shaped
        ? _wrapShapedLine(hard, fontSize, shaper, maxWidth, breakWords, locale)
        : _wrapLine(hard, fontSize, provider, maxWidth, letterSpacing, breakWords, locale);

      for (const range of ranges) {
        allLines.push({ text: hard.slice(range.start, range.end), start: hardStart + range.start, contentLength: range.end - range.start });
      }
    }

    // Past the line break the hard split consumed.
    hardStart += hard.length + 1;
  }

  // ── Overflow ──────────────────────────────────────────────────────────────
  // Only whole line boxes count as fitting: a line whose baseline row would
  // extend past maxHeight is dropped rather than rendered half-cut.
  const lineCap = _resolveLineCap(layout.maxLines, maxHeight, overflow, computedLineHeight);
  const dropped = lineCap !== null && allLines.length > lineCap;

  if (dropped) allLines.length = lineCap;

  if (lineCap !== null && overflow === 'ellipsis' && allLines.length > 0) {
    const lastIndex = allLines.length - 1;
    // In-bounds: allLines.length > 0.
    const last = allLines[lastIndex]!;
    // A capped run also marks a line that no wrap could shorten - a single
    // unbreakable word under `maxLines: 1` is exactly the case a caller reaches
    // for the marker to cover, and dropping no line at all is how it presents.
    const tooWide =
      maxWidth !== undefined &&
      (shaped ? shaper.measureLine(last.text, fontSize) : _lineAdvance(last.text, fontSize, provider, letterSpacing, locale)) > maxWidth;

    if (dropped || tooWide) {
      const ellipsis = layout.ellipsis ?? defaultEllipsis;
      const truncated = shaped
        ? _ellipsizeShaped(last.text, ellipsis, fontSize, shaper, maxWidth, locale)
        : _ellipsize(last.text, ellipsis, fontSize, provider, maxWidth, letterSpacing, locale);

      allLines[lastIndex] = { text: truncated.text, start: last.start, contentLength: truncated.contentLength };
    }
  }

  // Pass 1: gather glyph info per line, track widths and word counts.
  const linePlacements: LinePlacement[] = [];
  let maxLineWidth = 0;

  for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
    // In-bounds: lineIndex < allLines.length.
    const line = allLines[lineIndex]!;
    const body = line.text;
    const lineY = lineIndex * computedLineHeight;
    const lineSourceStart = toSource(line.start);
    const lineSourceEnd = toSource(line.start + line.contentLength);
    let cursorX = 0;
    let wordCount = 0;
    let inWord = false;
    const placements: LinePlacement['placements'] = [];

    if (shaped) {
      // The browser receives the complete line, which is the only way it can
      // resolve bidi order and the contextual form of a letter from what
      // surrounds it. An empty line still occupies its box and places nothing.
      if (body.length > 0) {
        const info = shaper.shapeLine(body, fontSize);

        placements.push({ info, x: 0, y: lineY, cluster: body, sourceStart: lineSourceStart, sourceEnd: lineSourceEnd });
        cursorX = info.advance;
        wordCount = 1;
      }
    } else {
      // Trivial text needs no cluster boundary array at all - one code unit is
      // one cluster - which keeps the hot path allocating exactly what it did
      // before segmentation became the layout's unit.
      const starts = isTrivialText(body) ? null : graphemeStarts(body, locale);
      const clusterCount = starts === null ? body.length : starts.length;
      let prevCluster: string | null = null;

      for (let i = 0; i < clusterCount; i++) {
        // RTL walks the same clusters back to front, so the cursor keeps
        // advancing left-to-right and every downstream step (alignment,
        // justify, quad building) stays direction-agnostic. Each cluster keeps
        // the source range it had before the reordering.
        const index = rtl ? clusterCount - 1 - i : i;
        const from = starts === null ? index : starts[index]!;
        const to = starts === null ? index + 1 : (starts[index + 1] ?? body.length);
        const cluster = starts === null ? body[index]! : body.slice(from, to);

        // Kerning adjustment before placing this cluster.
        if (prevCluster !== null && provider.getKerning !== undefined) {
          cursorX += provider.getKerning(prevCluster, cluster, fontSize);
        }

        const info = provider.getGlyph(cluster, fontSize);

        placements.push({
          info,
          x: cursorX,
          y: lineY,
          cluster,
          // An ellipsis stands for nothing in the source, so it collapses to
          // an empty range at the point it replaced.
          sourceStart: toSource(line.start + Math.min(from, line.contentLength)),
          sourceEnd: toSource(line.start + Math.min(to, line.contentLength)),
        });
        cursorX += info.advance + letterSpacing;

        if (cluster === ' ') {
          inWord = false;
        } else if (!inWord) {
          inWord = true;
          wordCount++;
        }

        prevCluster = cluster;
      }

      cursorX -= placements.length > 0 ? letterSpacing : 0;
    }

    const lineWidth = cursorX;
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    linePlacements.push({ placements, width: lineWidth, wordCount, sourceStart: lineSourceStart, sourceEnd: lineSourceEnd });
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
          penAdvance: entry.info.advance + glyphSpacing,
          sourceStart: entry.sourceStart,
          sourceEnd: entry.sourceEnd,
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
      lines.push({
        start: lineStart,
        count: result.length - lineStart,
        x: offsetX,
        y: li * computedLineHeight,
        width: maxLineWidth,
        sourceStart: line.sourceStart,
        sourceEnd: line.sourceEnd,
      });
      continue;
    }

    for (const { info, x, y, sourceStart, sourceEnd } of line.placements) {
      place({
        x: x + offsetX + (info.xBearing ?? 0),
        y: y + (info.yBearing ?? 0),
        width: info.width,
        height: info.height,
        penX: x + offsetX,
        penAdvance: info.advance + glyphSpacing,
        sourceStart,
        sourceEnd,
        page: info.page,
        uvLeft: info.uvLeft,
        uvTop: info.uvTop,
        uvRight: info.uvRight,
        uvBottom: info.uvBottom,
      });
    }

    lines.push({
      start: lineStart,
      count: result.length - lineStart,
      x: offsetX,
      y: li * computedLineHeight,
      width: line.width,
      sourceStart: line.sourceStart,
      sourceEnd: line.sourceEnd,
    });
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

/** Marker appended to the last kept line under `overflow: 'ellipsis'`. */
const defaultEllipsis = '…';

/** A line an overflow cut short, plus how much of it still stands for source characters. */
interface TruncatedLine {
  text: string;
  contentLength: number;
}

/**
 * How many lines survive, or `null` when nothing caps them.
 *
 * `maxLines` clips on its own because that is what asking for a line count
 * means; `maxHeight` only clips once an `overflow` policy opts in. Where both
 * apply the tighter one wins.
 */
const _resolveLineCap = (
  maxLines: number | undefined,
  maxHeight: number | undefined,
  overflow: 'visible' | 'clip' | 'ellipsis',
  computedLineHeight: number,
): number | null => {
  let cap: number | null = null;

  if (maxLines !== undefined) {
    assert(Number.isFinite(maxLines) && maxLines >= 1, 'LayoutOptions.maxLines must be a positive integer.');
    cap = Math.max(0, Math.floor(maxLines));
  }

  if (maxHeight !== undefined && overflow !== 'visible' && computedLineHeight > 0) {
    const fitting = Math.max(0, Math.floor(maxHeight / computedLineHeight));

    cap = cap === null ? fitting : Math.min(cap, fitting);
  }

  return cap;
};

/** Advance width of a laid-out line, without the letter-spacing gap after its last cluster. */
const _lineAdvance = (line: string, fontSize: number, provider: GlyphProvider, letterSpacing: number, locale: string | undefined): number =>
  line.length === 0 ? 0 : _cursorAdvance(line, fontSize, provider, letterSpacing, locale) - letterSpacing;

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
 * Append `ellipsis` to `line`, dropping trailing grapheme clusters until the
 * result fits `maxWidth`. Whole clusters go, so truncation never leaves a
 * dangling combining mark or half a flag behind. Without a `maxWidth` there is
 * nothing to fit against, so the marker is simply appended.
 */
const _ellipsize = (
  line: string,
  ellipsis: string,
  fontSize: number,
  provider: GlyphProvider,
  maxWidth: number | undefined,
  letterSpacing: number,
  locale: string | undefined,
): TruncatedLine => {
  if (maxWidth === undefined) return { text: line + ellipsis, contentLength: line.length };

  const clusters = graphemes(line, locale);
  // The marker is laid out cluster by cluster like any other text, so it has to
  // be measured that way too - handing it to the provider whole would ask the
  // atlas for one glyph standing for the entire string.
  const markerClusters = ellipsis.length === 0 ? [] : graphemes(ellipsis, locale);

  while (clusters.length > 0 && _measureClusters([...clusters, ...markerClusters], fontSize, provider, letterSpacing) > maxWidth) {
    clusters.pop();
  }

  const kept = clusters.join('');

  return { text: kept + ellipsis, contentLength: kept.length };
};

/**
 * The shaped counterpart of {@link _ellipsize}. Every candidate is measured
 * complete, marker included: for contextual text the width of a prefix plus
 * the width of the marker is not the width of the two together.
 */
const _ellipsizeShaped = (
  line: string,
  ellipsis: string,
  fontSize: number,
  shaper: LineShaper,
  maxWidth: number | undefined,
  locale: string | undefined,
): TruncatedLine => {
  if (maxWidth === undefined) return { text: line + ellipsis, contentLength: line.length };

  const clusters = graphemes(line, locale);

  while (clusters.length > 0 && shaper.measureLine(`${clusters.join('')}${ellipsis}`, fontSize) > maxWidth) {
    clusters.pop();
  }

  const kept = clusters.join('');

  return { text: kept + ellipsis, contentLength: kept.length };
};

/**
 * Greedy word wrap for browser-shaped text.
 *
 * Structurally the same pass as {@link _wrapLine}, with one difference that
 * matters: a candidate is measured as one contextual string rather than summed
 * from the widths of its parts, because for contextual text those are not the
 * same number.
 */
const _wrapShapedLine = (
  line: string,
  fontSize: number,
  shaper: LineShaper,
  maxWidth: number,
  breakWords: boolean,
  locale: string | undefined,
): LineRange[] => {
  if (line.length === 0) return [{ start: 0, end: 0 }];

  const ranges: LineRange[] = [];
  let start = -1;
  let end = -1;
  let gapStart = -1;
  let gapEnd = -1;

  for (const run of textRuns(line, locale)) {
    if (run.whitespace) {
      if (gapStart === -1) gapStart = run.start;
      gapEnd = run.end;
      continue;
    }

    if (breakWords && shaper.measureLine(line.slice(run.start, run.end), fontSize) > maxWidth) {
      if (start !== -1) ranges.push({ start, end });

      gapStart = -1;
      gapEnd = -1;

      let chunkStart = run.start;
      let chunkEnd = run.start;

      for (const bounds of _clusterBounds(line, run.start, run.end, locale)) {
        if (chunkEnd > chunkStart && shaper.measureLine(line.slice(chunkStart, bounds.end), fontSize) > maxWidth) {
          ranges.push({ start: chunkStart, end: chunkEnd });
          chunkStart = bounds.start;
        }

        chunkEnd = bounds.end;
      }

      start = chunkStart;
      end = chunkEnd;
      continue;
    }

    if (start === -1) {
      start = run.start;
      end = run.end;
      // The candidate is one contiguous slice, so measuring it also measures
      // the blanks it swallowed - which is the point: contextual widths do not
      // add up from parts.
    } else if (shaper.measureLine(line.slice(start, run.end), fontSize) <= maxWidth) {
      end = run.end;
    } else {
      ranges.push({ start, end });
      start = run.start;
      end = run.end;
    }

    gapStart = -1;
    gapEnd = -1;
  }

  ranges.push(_finalRange(line, start, end, gapStart, gapEnd));

  return ranges;
};

/**
 * The last line a wrap emits.
 *
 * Trailing blanks ride along with the line they followed - dropping them would
 * make an editor's caret jump back over spaces the user just typed - and a
 * line that is nothing but blanks keeps them too.
 */
const _finalRange = (line: string, start: number, end: number, gapStart: number, gapEnd: number): LineRange => {
  if (start !== -1) return { start, end: gapEnd === -1 ? end : gapEnd };
  if (gapStart !== -1) return { start: gapStart, end: gapEnd };

  return { start: line.length, end: line.length };
};

/** Cluster boundaries within `[from, to)`, expressed as offsets into `text`. */
const _clusterBounds = (text: string, from: number, to: number, locale: string | undefined): LineRange[] => {
  const body = text.slice(from, to);
  const ranges: LineRange[] = [];

  if (isTrivialText(body)) {
    for (let i = 0; i < body.length; i++) {
      ranges.push({ start: from + i, end: from + i + 1 });
    }

    return ranges;
  }

  const starts = graphemeStarts(body, locale);

  for (let i = 0; i < starts.length; i++) {
    ranges.push({ start: from + starts[i]!, end: from + (starts[i + 1] ?? body.length) });
  }

  return ranges;
};

/** The preprocessed text plus, when preprocessing moved characters, where each unit came from. */
interface PreprocessedText {
  text: string;
  /**
   * Source offset of every preprocessed unit, with one extra entry for the end
   * of the string. `null` when preprocessing was the identity, which is the
   * common case and the one worth not allocating for.
   */
  sourceMap: Int32Array | null;
}

/**
 * Fold two source maps into the one the layout reads.
 *
 * `outer` indexes the string `inner` produced, so a lookup has to go through
 * both; folding them once is cheaper than two lookups per glyph and keeps the
 * common case - neither pass changed anything - allocating nothing.
 */
const _composeSourceMaps = (outer: Int32Array | null, inner: Int32Array | null): Int32Array | null => {
  if (outer === null) return inner;
  if (inner === null) return outer;

  const composed = new Int32Array(outer.length);
  const last = inner.length - 1;

  for (let i = 0; i < outer.length; i++) {
    composed[i] = inner[Math.min(outer[i]!, last)]!;
  }

  return composed;
};

/** Uppercase `text` under `locale`, or locale-independently when there is none. */
const _upper = (text: string, locale: string | undefined): string => (locale === undefined ? text.toUpperCase() : text.toLocaleUpperCase(locale));

/**
 * Apply the `textTransform` case mapping, recording where each produced unit
 * came from.
 *
 * The mapping runs per grapheme cluster and can change a cluster's length -
 * German sharp s uppercases to two letters, a final sigma lowercases
 * differently from a medial one - so a caret mapped onto the result without
 * the record would drift by the difference. A transform that changes nothing
 * returns the input and no map, which is the whole cost of the default.
 */
const _applyTextTransform = (text: string, transform: TextTransform, locale: string | undefined): PreprocessedText => {
  if (transform === 'none' || text.length === 0) return { text, sourceMap: null };

  const starts = graphemeStarts(text, locale);
  // Only the cluster that opens a word is touched by `capitalize`, and word
  // boundaries are the segmenter's business, not the case mapper's.
  const wordStarts = transform === 'capitalize' ? _wordStartOffsets(text, locale) : null;

  let out = '';
  let changed = false;
  const map: number[] = [];

  for (let i = 0; i < starts.length; i++) {
    // In-bounds: i < starts.length.
    const from = starts[i]!;
    const to = starts[i + 1] ?? text.length;
    const cluster = text.slice(from, to);
    let mapped: string;

    if (wordStarts !== null) {
      mapped = wordStarts.has(from) ? _upper(cluster, locale) : cluster;
    } else if (transform === 'uppercase') {
      mapped = _upper(cluster, locale);
    } else {
      mapped = locale === undefined ? cluster.toLowerCase() : cluster.toLocaleLowerCase(locale);
    }

    if (mapped !== cluster) changed = true;

    for (let k = 0; k < mapped.length; k++) map.push(from);

    out += mapped;
  }

  if (!changed) return { text, sourceMap: null };

  map.push(text.length);

  return { text: out, sourceMap: Int32Array.from(map) };
};

/** Offsets at which a word-like segment begins - the clusters `capitalize` raises. */
const _wordStartOffsets = (text: string, locale: string | undefined): Set<number> => {
  const offsets = new Set<number>();

  for (const segment of wordSegments(text, locale)) {
    if (segment.wordLike) offsets.add(segment.start);
  }

  return offsets;
};

/** Whether the `whiteSpace` policy would change `text` at all. */
const _needsWhiteSpaceRewrite = (text: string, collapseBreaks: boolean): boolean => {
  let previousBlank = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    // A tab always becomes a space, so its mere presence is a rewrite.
    if (char === '\t') return true;

    if (char === '\n') {
      if (collapseBreaks) return true;

      previousBlank = false;
      continue;
    }

    const blank = char === ' ';

    if (blank && previousBlank) return true;

    previousBlank = blank;
  }

  return false;
};

/**
 * Apply the `whiteSpace` policy, recording where each surviving unit came
 * from. Collapsing a run of blanks shifts everything after it, and a caret
 * mapped onto the result without that record would drift by the number of
 * blanks the layout removed.
 */
const _applyWhiteSpace = (text: string, mode: 'normal' | 'pre' | 'pre-line'): PreprocessedText => {
  if (mode === 'pre') return { text, sourceMap: null };

  const collapseBreaks = mode === 'normal';

  // Most strings a layout sees carry nothing to collapse, and for those the
  // rewrite and the map it would need are pure cost - one scan decides.
  if (!_needsWhiteSpaceRewrite(text, collapseBreaks)) return { text, sourceMap: null };

  let out = '';
  const map: number[] = [];
  let pendingBlank = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (char === '\n' && !collapseBreaks) {
      out += char;
      map.push(i);
      // Collapsing is per line, so the next line's leading blank survives.
      pendingBlank = false;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n') {
      if (pendingBlank) continue;

      out += ' ';
      map.push(i);
      pendingBlank = true;
      continue;
    }

    out += char;
    map.push(i);
    pendingBlank = false;
  }

  map.push(text.length);

  return { text: out, sourceMap: Int32Array.from(map) };
};

/**
 * Cursor advance of `text`, INCLUDING the letter-spacing gap after its last
 * cluster. Widths in this form add up across concatenation, so the wrapper can
 * compose a candidate from parts it measured separately; a line's reported
 * width drops the one trailing gap again.
 */
const _cursorAdvance = (text: string, fontSize: number, provider: GlyphProvider, letterSpacing: number, locale: string | undefined): number => {
  let advance = 0;

  if (isTrivialText(text)) {
    for (let i = 0; i < text.length; i++) {
      advance += provider.getGlyph(text[i]!, fontSize).advance + letterSpacing;
    }

    return advance;
  }

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
): LineRange[] => {
  if (line.length === 0) return [{ start: 0, end: 0 }];

  const ranges: LineRange[] = [];
  let start = -1;
  let end = -1;
  let currentAdvance = 0;
  let gapStart = -1;
  let gapEnd = -1;
  let gapAdvance = 0;

  for (const run of textRuns(line, locale)) {
    const text = line.slice(run.start, run.end);

    if (run.whitespace) {
      if (gapStart === -1) gapStart = run.start;
      gapEnd = run.end;
      gapAdvance += _cursorAdvance(text, fontSize, provider, letterSpacing, locale);
      continue;
    }

    const wordAdvance = _cursorAdvance(text, fontSize, provider, letterSpacing, locale);

    if (breakWords && wordAdvance - letterSpacing > maxWidth) {
      if (start !== -1) ranges.push({ start, end });

      gapStart = -1;
      gapEnd = -1;
      gapAdvance = 0;

      let chunkStart = run.start;
      let chunkEnd = run.start;
      let chunkAdvance = 0;

      for (const bounds of _clusterBounds(line, run.start, run.end, locale)) {
        const clusterAdvance = provider.getGlyph(line.slice(bounds.start, bounds.end), fontSize).advance + letterSpacing;

        if (chunkEnd > chunkStart && chunkAdvance + clusterAdvance - letterSpacing > maxWidth) {
          ranges.push({ start: chunkStart, end: chunkEnd });
          chunkStart = bounds.start;
          chunkAdvance = clusterAdvance;
        } else {
          chunkAdvance += clusterAdvance;
        }

        chunkEnd = bounds.end;
      }

      start = chunkStart;
      end = chunkEnd;
      currentAdvance = chunkAdvance;
      continue;
    }

    if (start === -1) {
      start = run.start;
      end = run.end;
      currentAdvance = wordAdvance;
    } else if (currentAdvance + gapAdvance + wordAdvance - letterSpacing <= maxWidth) {
      end = run.end;
      currentAdvance += gapAdvance + wordAdvance;
    } else {
      ranges.push({ start, end });
      start = run.start;
      end = run.end;
      currentAdvance = wordAdvance;
    }

    gapStart = -1;
    gapEnd = -1;
    gapAdvance = 0;
  }

  ranges.push(_finalRange(line, start, end, gapStart, gapEnd));

  return ranges;
};
