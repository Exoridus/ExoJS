/**
 * Unicode segmentation: the boundaries every text-layout decision is allowed
 * to cut on. The corpus is the one the text stack has to survive - combining
 * sequences, emoji modifiers, ZWJ sequences and regional-indicator flags -
 * plus the wrapping runs the line breaker consumes.
 */

import {
  graphemeCount,
  graphemes,
  graphemeStarts,
  hasIntlSegmenter,
  isTrivialText,
  textRuns,
  wordSegments,
} from '#rendering/text/segmentation';

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

  test.each([
    ['Thai', 'ภาษาไทยเป็นภาษาที่สวยงาม', ['ภาษา', 'ไทย', 'เป็น', 'ภาษา', 'ที่', 'สวยงาม']],
    ['Lao', 'ພາສາລາວເປັນພາສາທີ່ງົດງາມ', ['ພາສາ', 'ລາວ', 'ເປັນ', 'ພາສາ', 'ທີ່', 'ງົດງາມ']],
    ['Khmer', 'ភាសាខ្មែរជាភាសាដ៏ស្រស់ស្អាត', ['ភាសាខ្មែរ', 'ជា', 'ភាសា', 'ដ៏', 'ស្រស់', 'ស្អាត']],
    ['Myanmar', 'မြန်မာဘာသာစကားသည်လှပသောဘာသာစကားဖြစ်သည်', ['မြန်မာဘာသာ', 'စကား', 'သည်', 'လှပ', 'သော', 'ဘာသာစကား', 'ဖြစ်သည်']],
  ])('%s preserves word boundaries for wrapping without spaces', (_script, text, expected) => {
    expect(runsOf(text)).toEqual(expected.map(part => ({ text: part, whitespace: false })));
  });

  test.each([
    ['Thai', 'ภาษา', 'ไทย'],
    ['Lao', 'ພາສາ', 'ລາວ'],
    ['Khmer', 'ភាសាខ្មែរ', 'ជា'],
    ['Myanmar', 'မြန်မာဘာသာ', 'စကား'],
  ])('%s keeps non-breaking spaces attached to both neighboring words', (_script, left, right) => {
    for (const space of ['\u00A0', '\u2007', '\u202F', '\uFEFF']) {
      const text = `${left}${space}${right}`;

      expect(runsOf(text)).toEqual([{ text, whitespace: false }]);
    }
  });

  test('a non-breaking space preserves surrounding word and blank boundaries', () => {
    expect(runsOf('เป็นภาษา\u00A0ไทยเป็น ภาษาไทย')).toEqual([
      { text: 'เป็น', whitespace: false },
      { text: 'ภาษา\u00A0ไทย', whitespace: false },
      { text: 'เป็น', whitespace: false },
      { text: ' ', whitespace: true },
      { text: 'ภาษา', whitespace: false },
      { text: 'ไทย', whitespace: false },
    ]);
  });

  test.each([
    ['ภาษา(ไทย)ภาษา', ['ภาษา', '(ไทย)', 'ภาษา']],
    ['ภาษา((ไทย))ภาษา', ['ภาษา', '((ไทย))', 'ภาษา']],
    ['ภาษา«ไทย»ภาษา', ['ภาษา', '«ไทย»', 'ภาษา']],
    ['ภาษาไทย,ภาษาไทย!', ['ภาษา', 'ไทย,', 'ภาษา', 'ไทย!']],
    ['ພາສາ(ລາວ)', ['ພາສາ', '(ລາວ)']],
    ['ភាសាខ្មែរ(ជា)', ['ភាសាខ្មែរ', '(ជា)']],
    ['မြန်မာဘာသာ(စကား)', ['မြန်မာဘာသာ', '(စကား)']],
  ])('keeps opening and closing punctuation attached in %s', (text, expected) => {
    expect(runsOf(text)).toEqual(expected.map(part => ({ text: part, whitespace: false })));
  });

  test('an apostrophe inside a Latin word between Thai words preserves plain segmentation', () => {
    expect(runsOf("ภาษาdon'tภาษา")).toEqual([{ text: "ภาษาdon'tภาษา", whitespace: false }]);
  });

  test.each(['(', '((', '[', '«'])('keeps trailing %s with the preceding word', punctuation => {
    expect(runsOf(`ภาษาไทย${punctuation}`)).toEqual([
      { text: 'ภาษา', whitespace: false },
      { text: `ไทย${punctuation}`, whitespace: false },
    ]);
  });

  test('an emoji sequence is not a break opportunity', () => {
    expect(runsOf(ZWJ_FAMILY)).toEqual([{ text: ZWJ_FAMILY, whitespace: false }]);
  });

  test('an empty string has no runs', () => {
    expect(textRuns('')).toEqual([]);
  });
});
