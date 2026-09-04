/**
 * Unicode segmentation: the boundaries every text-layout decision is allowed
 * to cut on. The corpus is the one the text stack has to survive - combining
 * sequences, emoji modifiers, ZWJ sequences and regional-indicator flags -
 * plus the wrapping runs the line breaker consumes.
 */

import { graphemeCount, graphemes, graphemeStarts, hasIntlSegmenter, isTrivialText, textRuns, wordSegments } from '#rendering/text/segmentation';

const COMBINING = 'é'; // e + combining acute
const SKIN_TONE = '\u{1F44D}\u{1F3FD}'; // thumbs up + medium skin tone
const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // man + ZWJ + woman + ZWJ + girl
const FLAG = '\u{1F1E9}\u{1F1EA}'; // regional indicators D + E

describe('grapheme segmentation', () => {
  test('the platform provides Intl.Segmenter in the test runtime', () => {
    // Every expectation below describes the segmented behaviour. If this ever
    // fails, the rest of this block is asserting the degraded fallback and the
    // failure has to be read as "no real segmentation here", not as a bug in
    // the corpus.
    expect(hasIntlSegmenter).toBe(true);
  });

  test.each([
    ['combining sequence', COMBINING],
    ['emoji with a skin-tone modifier', SKIN_TONE],
    ['ZWJ sequence', ZWJ_FAMILY],
    ['regional-indicator flag', FLAG],
  ])('%s stays one cluster', (_label, text) => {
    expect(graphemes(text)).toEqual([text]);
    expect(graphemeCount(text)).toBe(1);
    expect(graphemeStarts(text)).toEqual([0]);
  });

  test('ASCII segments one cluster per character', () => {
    expect(graphemes('Score: 12')).toEqual(['S', 'c', 'o', 'r', 'e', ':', ' ', '1', '2']);
    expect(graphemeStarts('Score: 12')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('cluster starts are UTF-16 offsets, so astral clusters advance by two units', () => {
    expect(graphemeStarts(`A${FLAG}B`)).toEqual([0, 1, 5]);
  });

  test('an empty string has no clusters', () => {
    expect(graphemes('')).toEqual([]);
    expect(graphemeCount('')).toBe(0);
  });

  test('text below the first combining mark is segmented without the platform segmenter', () => {
    expect(isTrivialText('Score: 1234')).toBe(true);
    expect(isTrivialText(`A${COMBINING}`)).toBe(false);
    expect(isTrivialText(FLAG)).toBe(false);
    // CR is excluded because CRLF is a single cluster.
    expect(isTrivialText('a\r\nb')).toBe(false);
  });
});

describe('word segmentation', () => {
  test('segments tile the input with no gaps', () => {
    const text = 'the quick  fox';
    const segments = wordSegments(text);

    expect(segments[0]?.start).toBe(0);
    expect(segments.at(-1)?.end).toBe(text.length);

    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.start).toBe(segments[i - 1]!.end);
    }
  });

  test('words are marked word-like and blanks are not', () => {
    const segments = wordSegments('hi there');

    expect(segments.map(segment => segment.wordLike)).toEqual([true, false, true]);
  });
});

describe('line-break runs', () => {
  const runsOf = (text: string): Array<{ text: string; whitespace: boolean }> =>
    textRuns(text).map(run => ({ text: text.slice(run.start, run.end), whitespace: run.whitespace }));

  test('a spaced Latin line alternates word and blank runs', () => {
    expect(runsOf('a b')).toEqual([
      { text: 'a', whitespace: false },
      { text: ' ', whitespace: true },
      { text: 'b', whitespace: false },
    ]);
  });

  test('a run of blanks is one run, so a break can drop all of it at once', () => {
    expect(runsOf('a   b')).toEqual([
      { text: 'a', whitespace: false },
      { text: '   ', whitespace: true },
      { text: 'b', whitespace: false },
    ]);
  });

  test('punctuation stays attached to the word it follows', () => {
    expect(runsOf('hi, there')).toEqual([
      { text: 'hi,', whitespace: false },
      { text: ' ', whitespace: true },
      { text: 'there', whitespace: false },
    ]);
  });

  test('an unspaced script breaks between its own words instead of forming one token', () => {
    const runs = runsOf('日本語のテキスト');

    expect(runs.length).toBeGreaterThan(1);
    expect(runs.every(run => !run.whitespace)).toBe(true);
    expect(runs.map(run => run.text).join('')).toBe('日本語のテキスト');
  });

  test('an emoji sequence is not a break opportunity', () => {
    expect(runsOf(ZWJ_FAMILY)).toEqual([{ text: ZWJ_FAMILY, whitespace: false }]);
  });

  test('an empty string has no runs', () => {
    expect(textRuns('')).toEqual([]);
  });
});
