/**
 * Compile-time API contract for {@link TextStyleOptions} and {@link LayoutOptions}.
 *
 * The playground example "multiline-and-wrap" rendered broken text because it
 * used stale PixiJS-era keys (`fill`, `stroke`, `strokeThickness`, `wordWrap`,
 * `wordWrapWidth`) that the current API silently ignores at runtime — so the
 * runtime smoke test could not catch them. These assertions pin the canonical
 * option names so the stale aliases fail the type-check (`tsc --noEmit`) instead
 * of slipping through unnoticed. The `@ts-expect-error` directives also fire in
 * reverse: if a stale key is ever (re)added to the option types, the now-unused
 * directive makes the type-check fail.
 */

import { Color } from '@/core/Color';
import type { LayoutOptions } from '@/rendering/text/LayoutOptions';
import type { TextStyleOptions } from '@/rendering/text/TextStyle';

const acceptStyle = (_options: TextStyleOptions): void => undefined;
const acceptLayout = (_options: LayoutOptions): void => undefined;

describe('TextStyleOptions API contract', () => {
  it('exposes the canonical fill / outline keys with the documented types', () => {
    expectTypeOf<TextStyleOptions['fillColor']>().toEqualTypeOf<Color | undefined>();
    expectTypeOf<TextStyleOptions['outlineColor']>().toEqualTypeOf<Color | undefined>();
    expectTypeOf<TextStyleOptions['outlineWidth']>().toEqualTypeOf<number | undefined>();
  });

  it('accepts a fully canonical style options object', () => {
    acceptStyle({
      fillColor: Color.white,
      outlineColor: Color.black,
      outlineWidth: 0.2,
      align: 'left',
      lineHeight: 1.2,
      fontSize: 24,
      fontFamily: 'Arial',
    });
    expect(true).toBe(true);
  });

  it('rejects the stale fill / stroke keys', () => {
    // @ts-expect-error `fill` is not a TextStyleOptions key — use `fillColor`.
    acceptStyle({ fill: 'white', fontSize: 16 });
    // @ts-expect-error `stroke` is not a TextStyleOptions key — use `outlineColor`.
    acceptStyle({ stroke: 'black' });
    // @ts-expect-error `strokeThickness` is not a TextStyleOptions key — use `outlineWidth`.
    acceptStyle({ strokeThickness: 3 });
    expect(true).toBe(true);
  });

  it('rejects word-wrap keys on the style object (they belong to LayoutOptions)', () => {
    // @ts-expect-error `wordWrap` is not a style key — set `maxWidth` in LayoutOptions.
    acceptStyle({ wordWrap: true });
    // @ts-expect-error `wordWrapWidth` is not a style key — use LayoutOptions `maxWidth`.
    acceptStyle({ wordWrapWidth: 300 });
    expect(true).toBe(true);
  });
});

describe('LayoutOptions API contract', () => {
  it('exposes the canonical wrapping keys with the documented types', () => {
    expectTypeOf<LayoutOptions['maxWidth']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<LayoutOptions['breakWords']>().toEqualTypeOf<boolean | undefined>();
  });

  it('accepts a canonical layout options object', () => {
    acceptLayout({ maxWidth: 320, breakWords: true, letterSpacing: 2 });
    expect(true).toBe(true);
  });

  it('rejects the stale wordWrap / wordWrapWidth keys', () => {
    // @ts-expect-error `wordWrap` is not a LayoutOptions key — presence of `maxWidth` enables wrapping.
    acceptLayout({ wordWrap: true });
    // @ts-expect-error `wordWrapWidth` is not a LayoutOptions key — use `maxWidth`.
    acceptLayout({ wordWrapWidth: 300 });
    expect(true).toBe(true);
  });
});
