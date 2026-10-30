import type { AtlasPage } from '#rendering/text/GlyphAtlas';
import { getDefaultGlyphAtlasPool, resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

const pixels = (page: AtlasPage): Uint8ClampedArray => {
  const canvas = page.texture.source as OffscreenCanvas;

  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
};

test('a loaded FontFace refreshes atlas-free measurements and every dependent shaped raster', async () => {
  resetDefaultGlyphAtlasPool();
  const family = 'RuntimeFontLoadCache';
  const face = new FontFace(family, 'url(/examples/assets/fonts/font-kenney-future.ttf)');
  const nativeLoad = face.load.bind(face);
  let finishLoad!: (face: FontFace) => void;
  const load = vi.spyOn(face, 'load').mockImplementation(
    () =>
      new Promise(resolve => {
        finishLoad = resolve;
      }),
  );
  const options = { fontFamily: family, fontSize: 32, shaping: 'browser' as const, colorGlyphs: true };
  const content = 'WWWWiiii';
  const beforeMeasure = Text.measure(content, { fontFamily: family, fontSize: 32 }).width;
  const first = new Text(content, { ...options, font: face });
  const second = new Text(content, options);

  try {
    const firstPage = first.textPages[0]!;
    const secondPage = second.textPages[0]!;
    const beforeRaster = pixels(firstPage);
    const destroyFirst = vi.spyOn(firstPage.texture, 'destroy');
    const destroySecond = vi.spyOn(secondPage.texture, 'destroy');
    expect(first.shapingMode).toBe('browser');
    expect(second.shapingMode).toBe('browser');
    expect(first.textPages[0]).toBe(firstPage);
    await nativeLoad();
    finishLoad(face);
    await Promise.resolve();
    await Promise.resolve();
    expect(Text.measure(content, { fontFamily: family, fontSize: 32 }).width).not.toBe(beforeMeasure);
    expect(first.textPages[0]).not.toBe(firstPage);
    expect(second.textPages[0]).not.toBe(secondPage);
    expect(destroyFirst).toHaveBeenCalledOnce();
    expect(destroySecond).toHaveBeenCalledOnce();
    expect(pixels(first.textPages[0]!).some((value, index) => value !== beforeRaster[index])).toBe(true);
    const settled = first.textPages[0];
    expect(first.textPages[0]).toBe(settled);
  } finally {
    first.destroy();
    second.destroy();
    load.mockRestore();
    document.fonts.delete(face);
    getDefaultGlyphAtlasPool().clearVariant({ family });
    resetDefaultGlyphAtlasPool();
  }
});

test('clearVariant refreshes native measurements without an atlas', async () => {
  resetDefaultGlyphAtlasPool();
  const family = 'RuntimeMetricsOnlyLoad';
  const face = new FontFace(family, 'url(/examples/assets/fonts/font-kenney-future.ttf)');
  const content = 'WWWWiiii';
  const options = { fontFamily: family, fontSize: 32 };
  const before = Text.measure(content, options).width;
  document.fonts.add(face);

  try {
    await face.load();
    expect(Text.measure(content, options).width).toBe(before);
    getDefaultGlyphAtlasPool().clearVariant({ family });
    expect(Text.measure(content, options).width).not.toBe(before);
  } finally {
    document.fonts.delete(face);
    resetDefaultGlyphAtlasPool();
  }
});
