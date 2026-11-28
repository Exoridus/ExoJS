import { Signal } from '#core/Signal';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { GlyphInfo } from '#rendering/text/types';

const fixedGlyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 8,
  height: 16,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0,
  uvTop: 0,
  uvRight: 0.01,
  uvBottom: 0.02,
};

const mockPage = {
  texture: {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockPage.texture,
    removeDestroyListener: () => mockPage.texture,
    destroy: () => {},
  },
  index: 0,
  mode: 'sdf' as const,
};

/**
 * Installs a deterministic glyph atlas for every test in the calling file, so
 * Text-backed nodes (Label, Button) construct under jsdom, which has no canvas
 * text measurement. Every glyph advances 10 pixels.
 */
export const useMockGlyphAtlas = (): void => {
  const atlas: Partial<GlyphAtlas> = {
    getGlyph: vi.fn(() => fixedGlyphInfo),
    pages: [mockPage] as unknown as GlyphAtlas['pages'],
    mode: 'sdf',
    clear: vi.fn(),
    onCleared: new Signal(),
  };
  const pool = { getAtlas: vi.fn(() => atlas) };

  beforeEach(() => resetDefaultGlyphAtlasPool(pool as unknown as GlyphAtlasPool));
  afterEach(() => resetDefaultGlyphAtlasPool());
};
