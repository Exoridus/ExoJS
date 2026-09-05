import { Color } from '#core/Color';

const channels = (color: Color): [number, number, number, number] => [color.r, color.g, color.b, color.a];

describe('Color.fromCss — hex forms', () => {
  test.each([
    ['#abc', [170, 187, 204, 1]],
    ['#aabbcc', [170, 187, 204, 1]],
  ] as const)('resolves %s', (value, expected) => {
    expect(channels(Color.fromCss(value))).toEqual(expected);
  });

  test.each([
    ['#abcd', 0.867],
    ['#aabbccdd', 0.867],
  ] as const)('carries the alpha of %s', (value, alpha) => {
    const color = Color.fromCss(value);

    expect([color.r, color.g, color.b]).toEqual([170, 187, 204]);
    expect(color.a).toBeCloseTo(alpha, 2);
  });
});

describe('Color.fromCss — functional syntaxes', () => {
  test('resolves a comma-separated rgb()', () => {
    expect(channels(Color.fromCss('rgb(1, 2, 3)'))).toEqual([1, 2, 3, 1]);
  });

  test('resolves a space-separated rgb()', () => {
    expect(channels(Color.fromCss('rgb(1 2 3)'))).toEqual([1, 2, 3, 1]);
  });

  test('resolves rgba() including its alpha', () => {
    expect(channels(Color.fromCss('rgba(10, 20, 30, 0.5)'))).toEqual([10, 20, 30, 0.5]);
  });

  test('resolves the slash alpha of the modern rgb() spelling', () => {
    expect(channels(Color.fromCss('rgb(10 20 30 / 50%)'))).toEqual([10, 20, 30, 0.5]);
  });

  test('resolves hsl() to its sRGB channels', () => {
    expect(channels(Color.fromCss('hsl(120, 100%, 50%)'))).toEqual([0, 255, 0, 1]);
  });

  test('resolves hsla() including its alpha', () => {
    expect(channels(Color.fromCss('hsla(120, 100%, 50%, 0.25)'))).toEqual([0, 255, 0, 0.25]);
  });
});

describe('Color.fromCss — named colors', () => {
  test('resolves a keyword the package ships no table for', () => {
    expect(channels(Color.fromCss('cornflowerblue'))).toEqual([100, 149, 237, 1]);
  });

  test('resolves a keyword regardless of case', () => {
    expect(channels(Color.fromCss('RebeccaPurple'))).toEqual([102, 51, 153, 1]);
  });

  test('resolves transparent to a fully transparent black', () => {
    expect(channels(Color.fromCss('transparent'))).toEqual([0, 0, 0, 0]);
  });
});

describe('Color.fromCss — alpha override and rejection', () => {
  test('the alpha argument overrides the alpha the value carried', () => {
    expect(channels(Color.fromCss('rgba(10, 20, 30, 0.5)', 0.25))).toEqual([10, 20, 30, 0.25]);
  });

  // `#` is not optional here, unlike in `Color.fromHex`: this path accepts what
  // CSS accepts, and CSS has no bare-hex form.
  test.each(['not-a-color', '', 'rgb(1, 2)', '#12345', 'aabbcc'])('rejects %j', value => {
    expect(() => Color.fromCss(value)).toThrow(/is not a CSS color/);
  });

  test('leaves no element behind in the document', () => {
    Color.fromCss('cornflowerblue');

    expect(document.body.children.length).toBe(0);
  });
});
