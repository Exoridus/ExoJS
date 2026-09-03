import type { FontAssetOptions } from '#assets/factories/FontFactory';
import { FontFactory } from '#assets/factories/FontFactory';

import { factoryContext } from './factory-context';

// ---------------------------------------------------------------------------
// FontFace / document.fonts polyfill
// ---------------------------------------------------------------------------
//
// jsdom implements neither the `FontFace` constructor nor `document.fonts`
// (the FontFaceSet). FontFactory only calls `new FontFace(...).load()` and
// `document.fonts.add`/`.delete` inside its methods, so a minimal stand-in
// installed for the duration of this file is sufficient.

let shouldFailToLoad = false;

class MockFontFace {
  public family: string;

  public constructor(
    family: string,
    public readonly source: BufferSource,
    public readonly descriptors?: FontFaceDescriptors,
  ) {
    this.family = family;
  }

  public load(): Promise<FontFace> {
    if (shouldFailToLoad) {
      return Promise.reject(new Error('mock: unparsable font data'));
    }

    return Promise.resolve(this as unknown as FontFace);
  }
}

const fontsAdd = vi.fn();
const fontsDelete = vi.fn();

const originalFontFace = (globalThis as { FontFace?: unknown }).FontFace;
const originalDocumentFonts = (document as { fonts?: unknown }).fonts;

beforeAll(() => {
  (globalThis as { FontFace?: unknown }).FontFace = MockFontFace;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: fontsAdd, delete: fontsDelete },
  });
});

afterAll(() => {
  (globalThis as { FontFace?: unknown }).FontFace = originalFontFace;
  if (originalDocumentFonts === undefined) {
    Reflect.deleteProperty(document, 'fonts');
  } else {
    Object.defineProperty(document, 'fonts', { configurable: true, value: originalDocumentFonts });
  }
});

beforeEach(() => {
  shouldFailToLoad = false;
  fontsAdd.mockClear();
  fontsDelete.mockClear();
});

describe('FontFactory', () => {
  test('rejects clearly when font data is too short', async () => {
    const factory = new FontFactory();

    await expect(
      factory.create(
        new ArrayBuffer(3),
        factoryContext({
          family: 'TestFont',
        }),
      ),
    ).rejects.toThrow('expected at least 4 bytes');
  });

  test('rejects clearly when no options are supplied', async () => {
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8), factoryContext())).rejects.toThrow('requires a "family" option');
  });

  test('rejects clearly when family is missing from options', async () => {
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8), factoryContext({} as unknown as FontAssetOptions))).rejects.toThrow('requires a "family" option');
  });

  test('create() resolves with a FontFace and registers it with document.fonts by default', async () => {
    const factory = new FontFactory();

    const fontFace = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'TestFont' }));

    expect(fontFace).toBeInstanceOf(MockFontFace);
    expect(fontsAdd).toHaveBeenCalledWith(fontFace);
  });

  test('create() skips document.fonts registration when addToDocument is false', async () => {
    const factory = new FontFactory();

    await factory.create(new ArrayBuffer(8), factoryContext({ family: 'TestFont', addToDocument: false }));

    expect(fontsAdd).not.toHaveBeenCalled();
  });

  test('create() forwards descriptors to the FontFace constructor', async () => {
    const factory = new FontFactory();

    const fontFace = (await factory.create(
      new ArrayBuffer(8),
      factoryContext({
        family: 'TestFont',
        descriptors: { weight: '700' },
      }),
    )) as unknown as MockFontFace;

    expect(fontFace.descriptors).toEqual({ weight: '700' });
  });

  test('rejects with a clear message when the underlying FontFace fails to load', async () => {
    shouldFailToLoad = true;
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8), factoryContext({ family: 'TestFont' }))).rejects.toThrow('Invalid font data in ArrayBuffer');
  });

  test('destroy() removes every registered font face from document.fonts', async () => {
    const factory = new FontFactory();

    const first = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'First' }));
    const second = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Second' }));

    factory.destroy();

    expect(fontsDelete).toHaveBeenCalledWith(first);
    expect(fontsDelete).toHaveBeenCalledWith(second);
    expect(fontsDelete).toHaveBeenCalledTimes(2);
  });

  test('dispose() unregisters the released face, and only that one', async () => {
    const factory = new FontFactory();

    const released = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Released' }));
    const kept = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Kept' }));

    factory.dispose(released);

    // Releasing a font has to take it out of document.fonts: while it is
    // registered there, CSS and Canvas still resolve the family it declares.
    expect(fontsDelete).toHaveBeenCalledExactlyOnceWith(released);

    factory.destroy();

    expect(fontsDelete).toHaveBeenCalledTimes(2);
    expect(fontsDelete).toHaveBeenLastCalledWith(kept);
  });

  test('dispose() tolerates a face that was never added to the document, and a second release', async () => {
    const factory = new FontFactory();

    const untracked = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Untracked', addToDocument: false }));
    const added = await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Added' }));

    factory.dispose(untracked);
    factory.dispose(added);
    factory.dispose(added);

    expect(fontsDelete).toHaveBeenCalledExactlyOnceWith(added);
  });

  test('destroy() does not remove fonts that were created with addToDocument: false', async () => {
    const factory = new FontFactory();

    await factory.create(new ArrayBuffer(8), factoryContext({ family: 'Untracked', addToDocument: false }));
    factory.destroy();

    expect(fontsDelete).not.toHaveBeenCalled();
  });
});
