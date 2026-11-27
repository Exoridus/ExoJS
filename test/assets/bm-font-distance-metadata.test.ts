import { AssetDecodeError } from '#assets/AssetDecodeError';
import { parseBmFontText } from '#assets/factories/parseBmFont';
import { bmFontType } from '#assets/types/font';

const glyph = { id: 65, x: 12, y: 20, width: 24, height: 28, xoffset: -3, yoffset: -2, xadvance: 18, page: 0, chnl: 15 };

const textDescriptor = (field = ''): string => `
info face="External" size=32 padding=2,3,4,5 spacing=6,7
common lineHeight=40 base=32 scaleW=128 scaleH=64 pages=1
page id=0 file="external.png"
${field}
char id=65 x=12 y=20 width=24 height=28 xoffset=-3 yoffset=-2 xadvance=18 page=0 chnl=15
`;

const jsonDescriptor = (distanceField?: object): string =>
  JSON.stringify({
    pages: ['external.png'],
    info: { face: 'External', size: 32, padding: [2, 3, 4, 5], spacing: [6, 7] },
    common: { lineHeight: 40, base: 32, scaleW: 128, scaleH: 64, pages: 1 },
    chars: [glyph],
    kernings: [{ first: 65, second: 86, amount: -2 }],
    ...(distanceField === undefined ? {} : { distanceField }),
  });

const decode = (descriptor: string) => bmFontType.codec!.decode(descriptor, { locator: 'url:https://fonts.test/font.fnt' });

describe('external BMFont distance metadata', () => {
  test('retains different full distance spans for identical glyph geometry', () => {
    const narrow = parseBmFontText(textDescriptor('distanceField fieldType=msdf distanceRange=4'));
    const wide = parseBmFontText(textDescriptor('distanceField fieldType=msdf distanceRange=16'));

    expect(narrow.chars).toEqual(wide.chars);
    expect(narrow.distanceField).toEqual({ fieldType: 'msdf', distanceRange: 4, zeroDistanceValue: 0.5 });
    expect(wide.distanceField).toEqual({ fieldType: 'msdf', distanceRange: 16, zeroDistanceValue: 0.5 });
  });

  test.each(['sdf', 'msdf', 'mtsdf'] as const)('preserves %s declarations and fractional spans', fieldType => {
    const data = parseBmFontText(textDescriptor(`distanceField fieldType="${fieldType}" distanceRange=3.5`));

    expect(data.distanceField).toEqual({ fieldType, distanceRange: 3.5, zeroDistanceValue: 0.5 });
  });

  test('keeps a declared but missing span unknown rather than using padding or a radius default', () => {
    const data = parseBmFontText(textDescriptor('distanceField fieldType=msdf'));

    expect(data.distanceField).toEqual({ fieldType: 'msdf', distanceRange: null, zeroDistanceValue: 0.5 });
  });

  test('retains authored padding, atlas dimensions and channel without expanding the glyph rectangle', () => {
    const data = parseBmFontText(textDescriptor('distanceField fieldType=msdf distanceRange=16'));

    expect(data.padding).toEqual({ top: 2, right: 3, bottom: 4, left: 5 });
    expect(data.spacing).toEqual({ x: 6, y: 7 });
    expect(data.atlasWidth).toBe(128);
    expect(data.atlasHeight).toBe(64);
    expect(data.chars.get(65)).toEqual({
      x: 12,
      y: 20,
      width: 24,
      height: 28,
      xOffset: -3,
      yOffset: -2,
      xAdvance: 18,
      page: 0,
      channel: 15,
    });
  });

  test('does not infer a distance declaration or padding when metadata is absent', () => {
    const data = parseBmFontText('common lineHeight=32 base=26\npage id=0 file="color.png"\nchar id=65 width=16 height=16');

    expect(data.distanceField).toBeUndefined();
    expect(data.padding).toBeUndefined();
    expect(data.spacing).toBeUndefined();
    expect(data.atlasWidth).toBeUndefined();
    expect(data.atlasHeight).toBeUndefined();
    expect(data.chars.get(65)?.channel).toBeUndefined();
  });

  test.each(['0', '-4', 'NaN', 'Infinity', '4oops'])('rejects malformed external distanceRange=%s', value => {
    expect(() => parseBmFontText(textDescriptor(`distanceField fieldType=msdf distanceRange=${value}`))).toThrow(/distanceRange/);
  });

  test('rejects an unsupported declared field type instead of loading it as color', () => {
    expect(() => parseBmFontText(textDescriptor('distanceField fieldType=psdf distanceRange=4'))).toThrow(/fieldType/);
  });

  test('rejects conflicting duplicate field declarations', () => {
    expect(() =>
      parseBmFontText(textDescriptor('distanceField fieldType=msdf distanceRange=4\ndistanceField fieldType=msdf distanceRange=16')),
    ).toThrow(/distanceField/);
  });

  test.each([4, 16])('decodes the msdf-bmfont-xml JSON shape with range %s', async range => {
    const data = await decode(jsonDescriptor({ fieldType: 'msdf', distanceRange: range }));

    expect(data.distanceField).toEqual({ fieldType: 'msdf', distanceRange: range, zeroDistanceValue: 0.5 });
    expect(data.chars.get(65)).toEqual(parseBmFontText(textDescriptor()).chars.get(65));
    expect(data.padding).toEqual({ top: 2, right: 3, bottom: 4, left: 5 });
    expect(data.spacing).toEqual({ x: 6, y: 7 });
    expect(data.pages).toEqual(['external.png']);
    expect(data.kernings.get('65,86')).toBe(-2);
    expect(data.lineHeight).toBe(40);
    expect(data.base).toBe(32);
    expect(data.atlasWidth).toBe(128);
    expect(data.atlasHeight).toBe(64);
  });

  test('loads ordinary BMFont JSON without treating its color glyphs as distance data', async () => {
    const data = await decode(jsonDescriptor());

    expect(data.distanceField).toBeUndefined();
    expect(data.chars.get(65)?.xAdvance).toBe(18);
  });

  test('preserves a JSON declaration with unknown distance range', async () => {
    expect((await decode(jsonDescriptor({ fieldType: 'mtsdf' }))).distanceField).toEqual({
      fieldType: 'mtsdf',
      distanceRange: null,
      zeroDistanceValue: 0.5,
    });
  });

  test('rejects native msdf-atlas-gen JSON instead of returning an empty successful font', async () => {
    await expect(decode(JSON.stringify({ atlas: { type: 'msdf', distanceRange: 4 }, metrics: {}, glyphs: [] }))).rejects.toThrow(/BMFont/);
  });

  test.each(['[]', '[{}]', 'null', 'true', 'false', '42', '-1', '"font"'])('rejects a non-object JSON root (%s)', async root => {
    await expect(decode(`  ${root}\n`)).rejects.toBeInstanceOf(AssetDecodeError);
  });

  test.each([null, 0, -1, '4', 'NaN'])('rejects a malformed JSON span (%s)', async distanceRange => {
    await expect(decode(jsonDescriptor({ fieldType: 'msdf', distanceRange }))).rejects.toThrow(/distanceRange/);
  });
});
