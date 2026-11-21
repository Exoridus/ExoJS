/**
 * Shared scenes and measurements for the text effect unit suites.
 *
 * Every effect length is measured where a reader sees it: as the distance in
 * device pixels between two 50 % coverage crossings on real rendered rows,
 * converted back to the node's local logical pixels through the surface ratio
 * and node scale. Colours are pure channels on black so each channel reads
 * one coverage term directly: green is the fill, red the outline, blue the
 * shadow. The backends draw to a raw canvas without an sRGB encode, so the
 * bytes are linear coverage.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Text } from '#rendering/text/Text';

export const effectCanvasSize = 480;
export const outlineWidths = [1, 2, 4] as const;
export const sdfRadii = [4, 8, 16] as const;
export const surfaceRatios = [1, 2, 3] as const;
export const nodeScales = [0.5, 1, 2] as const;

const fill = new Color(0, 255, 0);
const outlineColor = new Color(255, 0, 0);
const shadowColor = new Color(0, 0, 255);

/** Frame bytes, top-left origin, RGBA. */
export type Frame = Uint8Array | Uint8ClampedArray;

export interface EdgeCase {
  readonly outlineWidth: number;
  /** Omitted: the node chooses its reach automatically. */
  readonly sdfRadius?: number;
  readonly surfaceRatio: number;
  readonly scale: number;
}

/**
 * Where a glyph lands relative to both pixel grids it passes through.
 *
 * A measured width carries two phase-dependent errors: the atlas raster puts
 * the stem edge at some fraction of a raster pixel, and the screen samples
 * the result at some fraction of a device pixel. Neither is a property of the
 * effect, so every case is drawn at several of each and judged on the spread.
 * Font sizes move the stem across the raster grid; sub-pixel offsets, in
 * device pixels, move the node across the screen grid.
 */
export const rasterPhaseFontSizes = [40, 41.3, 42.6] as const;
export const screenPhaseOffsets = [0, 0.25, 0.5, 0.75] as const;

export interface Phase {
  /** Logical font size; large enough that an `H` stem gives dozens of straight rows at scale 0.5. */
  readonly fontSize: number;
  /** Extra horizontal offset in device pixels. */
  readonly deviceOffset: number;
}

const defaultPhase: Phase = { fontSize: 40, deviceOffset: 0 };

/**
 * An `H` whose left stem is the measured edge, placed so it stays on screen at
 * every ratio and scale of the matrix. Logical position 16 keeps the outline
 * and its antialiasing clear of the canvas edge.
 */
export const buildOutlineScene = (testCase: EdgeCase, phase: Phase = defaultPhase): { root: RenderNode; text: Text } => {
  const root = new Container();
  const text = new Text('H', {
    fontFamily: 'sans-serif',
    fontSize: phase.fontSize,
    ...(testCase.sdfRadius !== undefined && { sdfRadius: testCase.sdfRadius }),
    fillColor: fill,
    outlineColor,
    outlineWidth: testCase.outlineWidth,
  });

  text.setPosition(
    Math.max(16, testCase.outlineWidth + 8) + phase.deviceOffset / testCase.surfaceRatio,
    Math.max(8, testCase.outlineWidth + 4),
  );
  text.setScale(testCase.scale);
  root.addChild(text);

  return { root, text };
};

/** Same `H`, filled green with a blue shadow and no outline. */
export const buildShadowScene = (options: {
  readonly offsetX: number;
  readonly blur: number;
  readonly surfaceRatio: number;
  readonly scale: number;
  readonly sdfRadius?: number;
  readonly phase?: Phase;
}): { root: RenderNode; text: Text } => {
  const phase = options.phase ?? defaultPhase;
  const root = new Container();
  const text = new Text('H', {
    fontFamily: 'sans-serif',
    fontSize: phase.fontSize,
    sdfRadius: options.sdfRadius ?? 8,
    fillColor: fill,
    shadowColor,
    shadowAlpha: 1,
    shadowOffsetX: options.offsetX,
    shadowBlur: options.blur,
  });

  text.setPosition(16 + phase.deviceOffset / options.surfaceRatio, 8);
  text.setScale(options.scale);
  root.addChild(text);

  return { root, text };
};

/** Coverage of one channel, 0..255. The raw test canvas stores the blended linear values unencoded. */
const channel = (frame: Frame, size: number, x: number, y: number, c: number): number => frame[(y * size + x) * 4 + c]!;

/**
 * Sub-pixel x of the first rising 50 % crossing of `value` on row `y`, in
 * device pixels measured to pixel centres, or `null` if the row never crosses.
 * Linear interpolation between the two straddling pixel centres: the ramps are
 * symmetric, so this lands on the threshold to well under a tenth of a pixel.
 */
const risingCrossing = (value: (x: number) => number, size: number, threshold = 127.5): number | null => {
  for (let x = 1; x < size; x++) {
    const before = value(x - 1);
    const after = value(x);

    if (before < threshold && after >= threshold) {
      return x - 1 + (threshold - before) / (after - before) + 0.5;
    }
  }

  return null;
};

/** Same, scanning right to left: the last falling crossing. */
const fallingCrossing = (value: (x: number) => number, size: number, threshold = 127.5): number | null => {
  for (let x = size - 2; x >= 0; x--) {
    const inside = value(x);
    const outside = value(x + 1);

    if (inside >= threshold && outside < threshold) {
      return x + (inside - threshold) / (inside - outside) + 0.5;
    }
  }

  return null;
};

/**
 * The rows that cross the straight middle of the stem: the central half of all
 * rows on which the fill edge exists, which leaves out the outline wrapping
 * around the stem ends.
 */
const stemRows = (frame: Frame, size: number, edge: (y: number) => number | null): number[] => {
  const rows: number[] = [];

  for (let y = 0; y < size; y++) {
    if (edge(y) !== null && channel(frame, size, 0, y, 1) === 0) {
      rows.push(y);
    }
  }

  const quarter = Math.floor(rows.length / 4);

  return rows.slice(quarter, rows.length - quarter);
};

export interface WidthSample {
  /** Per-row widths in local logical pixels. */
  readonly widths: readonly number[];
  readonly mae: number;
  readonly p99: number;
  readonly mean: number;
}

/** Error statistics of a set of measured widths against the requested one. */
export const summarize = (widths: number[], expected: number): WidthSample => {
  const errors = widths.map(width => Math.abs(width - expected)).sort((a, b) => a - b);
  const p99Index = Math.min(errors.length - 1, Math.ceil(errors.length * 0.99) - 1);

  return {
    widths,
    mae: errors.reduce((sum, error) => sum + error, 0) / Math.max(1, errors.length),
    p99: errors[Math.max(0, p99Index)] ?? Number.POSITIVE_INFINITY,
    mean: widths.reduce((sum, width) => sum + width, 0) / Math.max(1, widths.length),
  };
};

/**
 * Visible outline width on the left stem: from the outer 50 % crossing of the
 * outline-or-fill coverage (red + green) to the 50 % crossing of the fill
 * (green), in local logical pixels.
 */
export const measureOutlineWidth = (frame: Frame, size: number, testCase: EdgeCase): WidthSample => {
  const fillEdge = (y: number): number | null => risingCrossing(x => channel(frame, size, x, y, 1), size);
  const inkEdge = (y: number): number | null => risingCrossing(x => channel(frame, size, x, y, 0) + channel(frame, size, x, y, 1), size);
  const devicePerLocal = testCase.surfaceRatio * testCase.scale;
  const widths: number[] = [];

  for (const y of stemRows(frame, size, fillEdge)) {
    const inner = fillEdge(y);
    const outer = inkEdge(y);

    if (inner !== null && outer !== null) {
      widths.push((inner - outer) / devicePerLocal);
    }
  }

  return summarize(widths, testCase.outlineWidth);
};

/**
 * Visible shadow overhang on the right stem: from the fill's last 50 %
 * crossing to the last 50 % crossing of fill-or-shadow coverage, in local
 * logical pixels. With a symmetric blur ramp the 50 % point stays on the
 * offset edge, so this is the offset itself.
 */
export const measureShadowOverhang = (
  frame: Frame,
  size: number,
  options: { readonly offsetX: number; readonly surfaceRatio: number; readonly scale: number },
): WidthSample => {
  const fillEdge = (y: number): number | null => fallingCrossing(x => channel(frame, size, x, y, 1), size);
  const inkEdge = (y: number): number | null => fallingCrossing(x => channel(frame, size, x, y, 1) + channel(frame, size, x, y, 2), size);
  const devicePerLocal = options.surfaceRatio * options.scale;
  const widths: number[] = [];

  for (const y of stemRows(frame, size, fillEdge)) {
    const inner = fillEdge(y);
    const outer = inkEdge(y);

    if (inner !== null && outer !== null) {
      widths.push((outer - inner) / devicePerLocal);
    }
  }

  return summarize(widths, options.offsetX);
};

/**
 * The 10 %-90 % rise of the shadow's outer edge on the stem rows, in local
 * logical pixels. A smoothstep across ±blur rises 10 %→90 % over 1.216 × blur.
 */
export const measureShadowRamp = (
  frame: Frame,
  size: number,
  options: { readonly surfaceRatio: number; readonly scale: number },
): number => {
  const devicePerLocal = options.surfaceRatio * options.scale;
  const fillEdge = (y: number): number | null => fallingCrossing(x => channel(frame, size, x, y, 1), size);
  const ramps: number[] = [];

  for (const y of stemRows(frame, size, fillEdge)) {
    const shadow = (x: number): number => channel(frame, size, x, y, 2) + channel(frame, size, x, y, 1);
    const at90 = fallingCrossing(shadow, size, 0.9 * 255);
    const at10 = fallingCrossing(shadow, size, 0.1 * 255);

    if (at90 !== null && at10 !== null) {
      ramps.push((at10 - at90) / devicePerLocal);
    }
  }

  ramps.sort((a, b) => a - b);

  return ramps[Math.floor(ramps.length / 2)] ?? Number.NaN;
};

/** Mean absolute and 99th-percentile per-channel difference between two frames. */
export const frameDifference = (a: Frame, b: Frame): { mae: number; p99: number; max: number } => {
  const diffs = new Uint16Array(256);
  let total = 0;
  let max = 0;

  for (let i = 0; i < a.length; i++) {
    if ((i & 3) === 3) {
      continue;
    }

    const d = Math.abs(a[i]! - b[i]!);

    diffs[d] = diffs[d]! + 1;
    total += d;
    max = Math.max(max, d);
  }

  const count = (a.length / 4) * 3;
  let seen = 0;
  let p99 = 0;

  for (let d = 0; d < 256; d++) {
    seen += diffs[d]!;

    if (seen >= count * 0.99) {
      p99 = d;
      break;
    }
  }

  return { mae: total / count, p99, max };
};

/**
 * Pixels lit in `channelIndex` outside the columns `[from, to)`. Used to prove
 * a shadow stays a translated copy of its own glyph.
 */
export const litOutsideColumns = (frame: Frame, size: number, channelIndex: number, from: number, to: number): number => {
  let count = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x < from || x >= to) && channel(frame, size, x, y, channelIndex) > 8) {
        count++;
      }
    }
  }

  return count;
};

/** Horizontal extent `[min, max]` of pixels lit in `channelIndex`, or `null`. */
export const litColumns = (frame: Frame, size: number, channelIndex: number): [number, number] | null => {
  let min = size;
  let max = -1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (channel(frame, size, x, y, channelIndex) > 8) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  }

  return max < 0 ? null : [min, max];
};
