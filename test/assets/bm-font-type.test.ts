import type { AssetDependencyScope } from '#assets/AssetFactory';
import { parseBmFontText } from '#assets/factories/parseBmFont';
import { bmFontType } from '#assets/types/font';
import { Texture } from '#rendering/texture/Texture';

import { factoryContext } from './factory-context';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_FNT = `
info face="Test Font" size=32 bold=0 italic=0
common lineHeight=40 base=32 scaleW=256 scaleH=256 pages=1
page id=0 file="test.png"
chars count=2
char id=65   x=0    y=0   width=10  height=14  xoffset=1  yoffset=2  xadvance=12  page=0  chnl=15
char id=66   x=10   y=0   width=10  height=14  xoffset=1  yoffset=2  xadvance=12  page=0  chnl=15
kerning first=65 second=66 amount=-1
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseBmFontText', () => {
  test('parses lineHeight and base from the common line', () => {
    const data = parseBmFontText(MINIMAL_FNT);
    expect(data.lineHeight).toBe(40);
    expect(data.base).toBe(32);
  });

  test('parses page filenames by id', () => {
    const data = parseBmFontText(MINIMAL_FNT);
    expect(data.pages[0]).toBe('test.png');
  });

  test('parses char entries into the chars Map', () => {
    const data = parseBmFontText(MINIMAL_FNT);
    expect(data.chars.size).toBe(2);

    const charA = data.chars.get(65)!;
    expect(charA).toBeDefined();
    expect(charA.x).toBe(0);
    expect(charA.y).toBe(0);
    expect(charA.width).toBe(10);
    expect(charA.height).toBe(14);
    expect(charA.xOffset).toBe(1);
    expect(charA.yOffset).toBe(2);
    expect(charA.xAdvance).toBe(12);
    expect(charA.page).toBe(0);
  });

  test('parses kerning pairs into the kernings Map', () => {
    const data = parseBmFontText(MINIMAL_FNT);
    expect(data.kernings.get('65,66')).toBe(-1);
  });

  test('ignores unknown tags without throwing', () => {
    const fntWithUnknown = `unknown tag=ignored\n${MINIMAL_FNT}`;
    expect(() => parseBmFontText(fntWithUnknown)).not.toThrow();
  });

  test('returns empty collections for empty input', () => {
    const data = parseBmFontText('');
    expect(data.chars.size).toBe(0);
    expect(data.kernings.size).toBe(0);
    expect(data.lineHeight).toBe(0);
    expect(data.base).toBe(0);
  });

  test('handles Windows CRLF line endings', () => {
    const crlf = MINIMAL_FNT.replace(/\n/g, '\r\n');
    const data = parseBmFontText(crlf);
    expect(data.lineHeight).toBe(40);
    expect(data.chars.size).toBe(2);
  });

  test('parses an unquoted (bare) file value on the page line', () => {
    const bareValue = `
common lineHeight=32 base=26
page id=0 file=atlas_0.png
chars count=0
`;
    const data = parseBmFontText(bareValue);
    expect(data.pages[0]).toBe('atlas_0.png');
  });

  test('handles multiple pages', () => {
    const multiPage = `
common lineHeight=32 base=26
page id=0 file="atlas_0.png"
page id=1 file="atlas_1.png"
chars count=0
`;
    const data = parseBmFontText(multiPage);
    expect(data.pages[0]).toBe('atlas_0.png');
    expect(data.pages[1]).toBe('atlas_1.png');
  });

  test('defaults a numeric attribute to 0 when its key is missing from the line', () => {
    const fnt = `
common lineHeight=32 base=26
page id=0 file="atlas_0.png"
chars count=1
char x=5 y=5 width=10 height=10 xoffset=0 yoffset=0 xadvance=10 page=0
`;
    // The "id" key is absent, so intVal('id') cannot match and falls back to 0.
    const data = parseBmFontText(fnt);
    expect(data.chars.get(0)).toBeDefined();
    expect(data.chars.get(0)!.x).toBe(5);
  });

  test('defaults a string attribute to "" when its key is missing from the line', () => {
    const fnt = `
common lineHeight=32 base=26
page id=0
chars count=0
`;
    // The "file" key is absent, so strVal('file') matches neither the quoted
    // nor the bare form and falls back to ''.
    const data = parseBmFontText(fnt);
    expect(data.pages[0]).toBe('');
  });

  test('parses the Kenney Blocks fixture — 95 chars, lineHeight=32', () => {
    const fnt = `
info face="Kenney Blocks" size=32 bold=0 italic=0
common lineHeight=32 base=27 scaleW=256 scaleH=256 pages=1
page id=0 file="kenney-blocks-32.png"
chars count=95
char id=32   x=252  y=19   width=1   height=1   xoffset=0  yoffset=0   xadvance=5   page=0  chnl=15
char id=65   x=14   y=41   width=13  height=18  xoffset=0  yoffset=9   xadvance=16  page=0  chnl=15
char id=90   x=70   y=57   width=13  height=18  xoffset=0  yoffset=9   xadvance=16  page=0  chnl=15
`;
    const data = parseBmFontText(fnt);
    expect(data.lineHeight).toBe(32);
    expect(data.base).toBe(27);
    expect(data.pages[0]).toBe('kenney-blocks-32.png');
    expect(data.chars.get(65)).toBeDefined(); // 'A'
    expect(data.chars.get(90)).toBeDefined(); // 'Z'
    expect(data.chars.get(32)).toBeDefined(); // space
  });
});

// ---------------------------------------------------------------------------
// bmFontType
// ---------------------------------------------------------------------------

/** A dependency scope that records what the font asked for and hands back a blank texture. */
const recordingScope = (requested: string[]): AssetDependencyScope => {
  return {
    load: vi.fn(async (asset: unknown) => {
      requested.push((asset as { _config: { source: string } })._config.source);

      return new Texture(null);
    }),
  } as unknown as AssetDependencyScope;
};

describe('bmFontType', () => {
  test('decodes the descriptor text into parsed font data', async () => {
    const fontData = await bmFontType.codec!.decode(MINIMAL_FNT, { locator: 'url:https://example.com/fonts/ui.fnt' });

    expect(fontData.lineHeight).toBe(40);
    expect(fontData.pages).toEqual(['test.png']);
  });

  test('claims each page texture through the font own dependency scope', async () => {
    const requested: string[] = [];
    const dependencies = recordingScope(requested);
    const fontData = await bmFontType.codec!.decode(MINIMAL_FNT, { locator: 'url:https://example.com/fonts/ui.fnt' });

    const font = await bmFontType.createFactory().create(fontData, factoryContext(undefined, { source: 'https://example.com/fonts/ui.fnt', dependencies }));

    expect(requested).toEqual(['https://example.com/fonts/test.png']);
    expect(font.textures).toHaveLength(1);
    expect(font.fontData.lineHeight).toBe(40);
  });

  test('resolves page URLs against the descriptor source, not the page filename alone', async () => {
    const requested: string[] = [];
    const dependencies = recordingScope(requested);
    const fontData = await bmFontType.codec!.decode(MINIMAL_FNT, { locator: 'url:https://example.com/assets/fonts/ui.fnt' });

    await bmFontType.createFactory().create(fontData, factoryContext(undefined, { source: 'https://example.com/assets/fonts/ui.fnt', dependencies }));

    expect(requested).toEqual(['https://example.com/assets/fonts/test.png']);
  });

  test('loads multiple page textures in page-index order', async () => {
    const multiPage = `
common lineHeight=32 base=26
page id=0 file="atlas_0.png"
page id=1 file="atlas_1.png"
chars count=0
`;
    const requested: string[] = [];
    const dependencies = recordingScope(requested);
    const fontData = await bmFontType.codec!.decode(multiPage, { locator: 'url:https://example.com/ui.fnt' });

    const font = await bmFontType.createFactory().create(fontData, factoryContext(undefined, { source: 'https://example.com/ui.fnt', dependencies }));

    expect(requested).toEqual(['https://example.com/atlas_0.png', 'https://example.com/atlas_1.png']);
    expect(font.textures).toHaveLength(2);
  });
});
