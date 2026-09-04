/**
 * Representation selection and the browser-shaped layout path.
 *
 * The shaper is faked here: what a real browser produces for an Arabic line is
 * a browser test's business, while which representation the engine picks, what
 * it hands the shaper, and how the result is placed are decisions this layer
 * owns and can assert exactly.
 */

import { resolveShaping } from '#rendering/text/shaping';
import { layoutText } from '#rendering/text/textLayout';
import { TextStyle } from '#rendering/text/TextStyle';
import type { GlyphInfo, GlyphProvider } from '#rendering/text/types';

const ARABIC = 'العربية';
const HEBREW = 'שלום';
const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const COMBINING = 'é';

const advancePerUnit = 10;

const makeProvider = (): GlyphProvider => ({
  getGlyph: (_char: string, fontSize: number): GlyphInfo => ({
    x: 0,
    y: 0,
    width: advancePerUnit,
    height: fontSize,
    advance: advancePerUnit,
    ascent: fontSize,
    page: 0,
    uvLeft: 0,
    uvTop: 0,
    uvRight: 1,
    uvBottom: 1,
  }),
});

/**
 * Stand-in for the browser text engine: an advance proportional to the line
 * length, and a record of every string it was asked about.
 */
const makeShaper = (
  perUnit = advancePerUnit,
): {
  measureLine: (line: string, fontSize: number) => number;
  shapeLine: (line: string, fontSize: number) => GlyphInfo;
  measured: string[];
  shaped: string[];
} => {
  const measured: string[] = [];
  const shaped: string[] = [];

  return {
    measured,
    shaped,
    measureLine: (line: string): number => {
      measured.push(line);

      return [...line].length * perUnit;
    },
    shapeLine: (line: string, fontSize: number): GlyphInfo => {
      shaped.push(line);

      return {
        x: 0,
        y: 0,
        width: [...line].length * perUnit,
        height: fontSize,
        advance: [...line].length * perUnit,
        ascent: fontSize,
        page: 0,
        uvLeft: 0,
        uvTop: 0,
        uvRight: 1,
        uvBottom: 1,
      };
    },
  };
};

describe('resolveShaping', () => {
  test.each([
    ['plain Latin', 'Score: 1234'],
    ['Greek', 'Ελληνικά'],
    ['Cyrillic', 'Привет'],
    ['CJK', '日本語のテキスト'],
    ['a ZWJ emoji sequence', ZWJ_FAMILY],
    ['a combining sequence', COMBINING],
  ])('%s stays on the shared-glyph path', (_label, text) => {
    expect(resolveShaping(text, {})).toBe('simple');
  });

  test.each([
    ['Arabic', ARABIC],
    ['Hebrew', HEBREW],
    ['mixed Latin and Arabic', `Build 42 - ${ARABIC} (Beta)`],
    ['Thai', 'ภาษาไทย'],
    ['Devanagari', 'हिन्दी'],
  ])('%s needs browser shaping', (_label, text) => {
    expect(resolveShaping(text, {})).toBe('browser');
  });

  test('a right-to-left base direction needs browser shaping whatever the content', () => {
    expect(resolveShaping('Latin', { direction: 'rtl' })).toBe('browser');
  });

  test('an explicit bidi control needs browser shaping', () => {
    expect(resolveShaping('a‮b', {})).toBe('browser');
  });

  test.each([
    ['simple', 'simple'],
    ['browser', 'browser'],
  ] as const)('an explicit "%s" request overrides the classifier', (requested, expected) => {
    expect(resolveShaping(ARABIC, { shaping: requested })).toBe(expected);
    expect(resolveShaping('Latin', { shaping: requested })).toBe(expected);
  });
});

describe('layoutText with a browser shaper', () => {
  const style = (): TextStyle => new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0, align: 'left' });

  test('without a shaper the simple path runs even for content that would need shaping', () => {
    const placements = layoutText(ARABIC, style(), {}, makeProvider()).placements;

    expect(placements.length).toBe([...ARABIC].length);
  });

  test('each line is handed to the shaper whole and placed as one glyph', () => {
    const shaper = makeShaper();

    const layout = layoutText(`${ARABIC}\n${HEBREW}`, style(), {}, makeProvider(), shaper);

    expect(shaper.shaped).toEqual([ARABIC, HEBREW]);
    expect(layout.placements).toHaveLength(2);
    expect(layout.lines).toHaveLength(2);
    expect(layout.placements[0]?.penX).toBe(0);
    expect(layout.placements[1]?.y).toBe(16);
  });

  test('the line is never reversed before shaping - the browser owns the bidi order', () => {
    const shaper = makeShaper();

    layoutText(ARABIC, style(), { direction: 'rtl' }, makeProvider(), shaper);

    expect(shaper.shaped).toEqual([ARABIC]);
  });

  test('a wrap candidate is measured complete rather than assembled from its words', () => {
    const shaper = makeShaper();

    layoutText('alpha beta gamma', style(), { maxWidth: 100, shaping: 'browser' }, makeProvider(), shaper);

    // 'alpha beta' is measured as one string; a per-word sum would never ask.
    expect(shaper.measured).toContain('alpha beta');
  });

  test('wrapping puts each resulting line on its own row', () => {
    const shaper = makeShaper();

    const layout = layoutText('alpha beta gamma', style(), { maxWidth: 100, shaping: 'browser' }, makeProvider(), shaper);

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.placements).toHaveLength(layout.lines.length);
  });

  test('the ellipsis candidate is measured complete, ellipsis included', () => {
    const shaper = makeShaper();

    layoutText('alpha beta\ngamma', style(), { maxWidth: 60, maxHeight: 16, overflow: 'ellipsis', shaping: 'browser' }, makeProvider(), shaper);

    expect(shaper.measured.some(line => line.endsWith('…'))).toBe(true);
    expect(shaper.shaped.at(-1)?.endsWith('…')).toBe(true);
  });

  test('letter spacing is applied inside the shaping, not between placements', () => {
    const shaper = makeShaper();

    const layout = layoutText('abc', style(), { letterSpacing: 7, shaping: 'browser' }, makeProvider(), shaper);

    // The shaper reported 3 x 10; adding the layout's own spacing on top would
    // report 37 and place the caret past the end of the line.
    expect(layout.placements[0]?.penAdvance).toBe(30);
    expect(layout.advance.width).toBe(30);
  });

  test('justify leaves a shaped line alone - one placement has nothing to distribute', () => {
    const shaper = makeShaper();
    const justified = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0, align: 'justify' });

    const layout = layoutText('alpha beta gamma', justified, { maxWidth: 100, shaping: 'browser' }, makeProvider(), shaper);

    for (const placement of layout.placements) {
      expect(placement.penX).toBe(0);
    }
  });

  test('an empty line places nothing yet still occupies its box', () => {
    const shaper = makeShaper();

    const layout = layoutText(`${ARABIC}\n\n${ARABIC}`, style(), {}, makeProvider(), shaper);

    expect(layout.lines).toHaveLength(3);
    expect(layout.placements).toHaveLength(2);
    expect(layout.advance.height).toBe(48);
  });
});
