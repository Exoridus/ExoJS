/**
 * BMFont page ids.
 *
 * `BmFont` matches its page textures to the descriptor's pages by position, and
 * a glyph's `page` field indexes that same list, so the parsed `pages` array has
 * to be dense and ordered by page id. A non-contiguous id used to leave a hole
 * (`pages[2]` undefined, which the font factory then handed to the texture
 * loader as a page path) and a duplicate id silently overwrote the earlier page.
 * Both are corrupt descriptors, so the parser rejects them instead of returning
 * data no consumer can use.
 */
import { parseBmFontText } from '#assets/factories/parseBmFont';

const descriptor = (pages: string): string => `
common lineHeight=32 base=26
${pages}
chars count=1
char id=65 x=0 y=0 width=10 height=14 xoffset=0 yoffset=0 xadvance=12 page=0
`;

describe('parseBmFontText page ids', () => {
  test('rejects a duplicate page id instead of overwriting the earlier page', () => {
    const fnt = descriptor(`
page id=0 file="atlas_0.png"
page id=0 file="atlas_0_again.png"
`);

    expect(() => parseBmFontText(fnt)).toThrow(/duplicate page id 0/);
  });

  test('rejects a gap in the page ids instead of leaving a hole in the pages array', () => {
    const fnt = descriptor(`
page id=1 file="atlas_1.png"
page id=3 file="atlas_3.png"
`);

    expect(() => parseBmFontText(fnt)).toThrow(/page id 1 .*contiguous/);
  });

  test('returns a dense pages array in page-id order for a valid multi-page font', () => {
    const fnt = descriptor(`
page id=0 file="atlas_0.png"
page id=1 file="atlas_1.png"
`);

    expect(parseBmFontText(fnt).pages).toEqual(['atlas_0.png', 'atlas_1.png']);
  });

  test('still parses a descriptor that declares no pages at all', () => {
    expect(parseBmFontText(descriptor('')).pages).toEqual([]);
  });
});
