/**
 * Node-lane coverage for the shared per-node data packer both text renderers
 * call (`WebGl2TextRenderer._packNodeData` / `WebGpuTextRenderer._packNodeData`
 * and their own-transform-move row patches). Neither backend needs a GL/GPU
 * context to pack these ~40 floats - this test asserts the packed bytes
 * directly, without a mock device or a screenshot, closing the gap the rest of
 * the row (transform, snap flag, outline/shadow parameters) had: only the
 * gradient box was covered end to end, by `webgl2-text-gradient.test.ts`.
 */

import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { PixelSnapMode } from '#rendering/pixelSnap';
import { BitmapText } from '#rendering/text/BitmapText';
import type { BmFontData } from '#rendering/text/BmFont';
import { BmFont } from '#rendering/text/BmFont';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { packTextNodeData, packTextNodeTransform, textNodeDataFloats, textNodeDataTexels } from '#rendering/text/nodeDataPacker';
import { Text } from '#rendering/text/Text';
import type { GlyphInfo } from '#rendering/text/types';
import type { Texture } from '#rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Mock GlyphAtlasPool - Text's layout pass reads glyph metrics from the pool,
// never a real canvas, so this suffices to lay a Text node out headlessly
// (mirrors test/rendering/text/text.test.ts).
// ---------------------------------------------------------------------------

// Asymmetric width/height/bearings - the ink box this produces has x != y and
// width != height, so an assertion that swaps either axis is caught even
// before the transform (which is applied uniformly, x and y alike) enters
// the picture.
const fixedGlyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 16,
  height: 32,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0,
  uvTop: 0,
  uvRight: 0.01,
  uvBottom: 0.02,
  xBearing: -4,
  yBearing: -9,
};

const mockPage = {
  texture: { width: 1024, height: 1024 },
  index: 0,
  mode: 'sdf' as const,
};

const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
  onCleared: new Signal(),
};

const mockMetrics = {
  getGlyph: vi.fn(() => ({ ...fixedGlyphInfo, width: 0, height: 0, xBearing: 0, yBearing: 0 })),
  advance: vi.fn(() => fixedGlyphInfo.advance),
  clear: vi.fn(),
};

const mockPool = {
  getAtlas: vi.fn(() => mockAtlas),
  getMetrics: vi.fn(() => mockMetrics),
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// BitmapText fixture (no canvas involved at all - metrics come from BMFont data).
// ---------------------------------------------------------------------------

const makeBmFontData = (): BmFontData => {
  const chars = new Map([
    [72, { x: 0, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 0 }], // H
    [105, { x: 8, y: 0, width: 4, height: 12, xOffset: 0, yOffset: 2, xAdvance: 6, page: 0 }], // i
  ]);
  return { pages: ['font_0.png'], chars, kernings: new Map(), lineHeight: 16, base: 12 };
};

const makeBmFont = (): BmFont => {
  return new BmFont(makeBmFontData(), [{ width: 64, height: 64 } as unknown as Texture]);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a Text node with a distinctive, fully-populated style + transform so every packed field is non-degenerate and no two fields share a value. */
const buildStyledText = (): Text => {
  const text = new Text('Hi', {
    fontSize: 16,
    pixelRatio: 2.5,
    sdfRadius: 6,
    fillColor: new Color(10, 20, 30, 0.41),
    outlineColor: new Color(40, 50, 60, 0.52),
    outlineWidth: 0.15,
    shadowColor: new Color(70, 80, 90, 0.63),
    shadowOffsetX: 3,
    shadowOffsetY: -5,
    shadowAlpha: 0.74,
    shadowBlur: 2,
    gradient: {
      stops: [
        { offset: 0, color: new Color(100, 110, 120, 0.85) },
        { offset: 1, color: new Color(130, 140, 150, 0.96) },
      ],
      angle: 90,
    },
  });

  text.setPosition(12, 34);
  text.setScale(2, 3);
  text.setRotation(20); // degrees — non-zero so a,b,c,d are all distinct and nonzero
  text.pixelSnapMode = PixelSnapMode.Geometry;

  return text;
};

describe('shared text node-data packer', () => {
  test('layout constants', () => {
    expect(textNodeDataTexels).toBe(20);
    expect(textNodeDataFloats).toBe(80);
  });

  describe('packTextNodeData — Text', () => {
    test('packs every field at the documented texel offset', () => {
      const text = buildStyledText();
      const base = 7; // arbitrary non-zero, non-texel-aligned base proves indexing, not just a lucky offset=0
      const target = new Float32Array(base + textNodeDataFloats + 3);

      packTextNodeData(target, base, text);

      // Transform (texels 0-1): mapping only - the matrix math itself belongs to Matrix.
      const m = text.getGlobalTransform().toArray(false);
      expect(target[base + 0]).toBe(m[0]); // a
      expect(target[base + 1]).toBe(m[1]); // c
      expect(target[base + 3]).toBe(m[6]); // tx
      expect(target[base + 4]).toBe(m[3]); // b
      expect(target[base + 5]).toBe(m[4]); // d
      expect(target[base + 6]).toBe(m[5]); // 0
      expect(target[base + 7]).toBe(m[7]); // ty
      // The matrix must actually be non-degenerate, or the assertions above
      // would hold even with swapped indices.
      expect(m[0]).not.toBeCloseTo(m[3]!);
      expect(m[1]).not.toBeCloseTo(m[4]!);

      // Snap-mode flag (texel 0's spare .z)
      expect(target[base + 2]).toBe(PixelSnapMode.Geometry);

      // Fill color (texel 2)
      expect(target[base + 8]).toBeCloseTo(10 / 255);
      expect(target[base + 9]).toBeCloseTo(20 / 255);
      expect(target[base + 10]).toBeCloseTo(30 / 255);
      expect(target[base + 11]).toBeCloseTo(0.41);

      // Outline color (texel 3)
      expect(target[base + 12]).toBeCloseTo(40 / 255);
      expect(target[base + 13]).toBeCloseTo(50 / 255);
      expect(target[base + 14]).toBeCloseTo(60 / 255);
      expect(target[base + 15]).toBeCloseTo(0.52);

      // Params (texel 4): outlineMin, shadowAlpha, shadowBlur, gradientStopCount
      expect(target[base + 16]).toBeCloseTo(0.5 - 0.15); // outlineMin
      expect(target[base + 17]).toBeCloseTo(0.74); // shadowAlpha
      expect(target[base + 18]).toBeCloseTo(2 * 0.1); // shadowBlur * 0.1
      expect(target[base + 19]).toBe(2); // two gradient stops

      // Shadow color (texel 5)
      expect(target[base + 20]).toBeCloseTo(70 / 255);
      expect(target[base + 21]).toBeCloseTo(80 / 255);
      expect(target[base + 22]).toBeCloseTo(90 / 255);
      expect(target[base + 23]).toBeCloseTo(0.63);

      // Shadow offset (texel 6)
      expect(target[base + 24]).toBeCloseTo(3 * text.rasterPixelRatio);
      expect(target[base + 25]).toBeCloseTo(-5 * text.rasterPixelRatio);
      expect(target[base + 26]).toBe(0); // reserved
      expect(target[base + 27]).toBe(6); // sdfRadius

      // Gradient ramp (texel 7): 90 degrees is a left-to-right ramp, which
      // resolves to t = gradUV.x with no bias.
      expect(target[base + 28]).toBeCloseTo(1);
      expect(target[base + 29]).toBeCloseTo(0);
      expect(target[base + 30]).toBeCloseTo(0);

      // Texel 8 is reserved and must stay zeroed.
      expect(Array.from(target.slice(base + 32, base + 36))).toEqual([0, 0, 0, 0]);

      // Gradient stop colours (texels 10-11) and their offsets (texel 18)
      expect(target[base + 40]).toBeCloseTo(100 / 255);
      expect(target[base + 41]).toBeCloseTo(110 / 255);
      expect(target[base + 42]).toBeCloseTo(120 / 255);
      expect(target[base + 43]).toBeCloseTo(0.85);
      expect(target[base + 44]).toBeCloseTo(130 / 255);
      expect(target[base + 45]).toBeCloseTo(140 / 255);
      expect(target[base + 46]).toBeCloseTo(150 / 255);
      expect(target[base + 47]).toBeCloseTo(0.96);
      expect(target[base + 72]).toBeCloseTo(0);
      expect(target[base + 73]).toBeCloseTo(1);

      // Ink bounds (texel 9)
      const ink = text.getLocalBounds();
      expect(target[base + 36]).toBe(ink.x);
      expect(target[base + 37]).toBe(ink.y);
      expect(target[base + 38]).toBe(ink.width);
      expect(target[base + 39]).toBe(ink.height);
      // Ink must differ from a degenerate/zero box, or the assertions above
      // would pass even with the wrong rectangle wired in.
      expect(ink.width).toBeGreaterThan(0);
      expect(ink.height).toBeGreaterThan(0);

      // Nothing outside [base, base + 40) is touched.
      for (let i = 0; i < base; i++) expect(target[i]).toBe(0);
      for (let i = base + textNodeDataFloats; i < target.length; i++) expect(target[i]).toBe(0);
    });

    test('no outline, shadow or gradient produces the disabled sentinels', () => {
      const text = new Text('Hi');
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      expect(target[16]).toBe(0.5); // outlineMin disabled (outlineWidth === 0)
      expect(target[19]).toBe(0); // no gradient stops
      // A disabled gradient still zeroes the ramp and every stop slot, so a
      // recycled row cannot leak a previous node's colours.
      expect(Array.from(target.slice(28, 32))).toEqual([0, 0, 0, 0]);
      expect(Array.from(target.slice(40, 80))).toEqual(new Array(40).fill(0));
    });

    test('an explicit decoration colour sets the override flag and its texel', () => {
      const text = new Text('Hi', { underline: true, decorationColor: new Color(9, 19, 29, 0.39) });
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      expect(target[26]).toBe(1);
      expect(target[32]).toBeCloseTo(9 / 255);
      expect(target[33]).toBeCloseTo(19 / 255);
      expect(target[34]).toBeCloseTo(29 / 255);
      expect(target[35]).toBeCloseTo(0.39);
    });

    test('no decoration colour leaves the rule taking the fill', () => {
      const text = new Text('Hi', { underline: true });
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      expect(target[26]).toBe(0);
      expect(Array.from(target.slice(32, 36))).toEqual([0, 0, 0, 0]);
    });

    test('the default angle runs the ramp top to bottom', () => {
      const text = new Text('Hi', {
        gradient: {
          stops: [
            { offset: 0, color: Color.white },
            { offset: 1, color: Color.black },
          ],
        },
      });
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      // t = gradUV.y: zero horizontal component, unit vertical one, no bias.
      expect(target[28]).toBeCloseTo(0);
      expect(target[29]).toBeCloseTo(1);
      expect(target[30]).toBeCloseTo(0);
    });

    test('packs every stop colour and offset of a multi-stop ramp', () => {
      const text = new Text('Hi', {
        gradient: {
          stops: [
            { offset: 0, color: new Color(255, 0, 0, 1) },
            { offset: 0.25, color: new Color(0, 255, 0, 1) },
            { offset: 1, color: new Color(0, 0, 255, 1) },
          ],
        },
      });
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      expect(target[19]).toBe(3);
      expect(Array.from(target.slice(40, 52))).toEqual([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
      expect(Array.from(target.slice(72, 76))).toEqual([0, 0.25, 1, 0]);
      // The unused stop slots stay zeroed rather than holding whatever the row
      // carried before.
      expect(Array.from(target.slice(52, 72))).toEqual(new Array(20).fill(0));
    });

    test('an angle of 0 runs the ramp bottom to top', () => {
      const text = new Text('Hi', {
        gradient: {
          stops: [
            { offset: 0, color: Color.white },
            { offset: 1, color: Color.black },
          ],
          angle: 0,
        },
      });
      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, text);

      // t = 1 - gradUV.y, so the last stop lands on the top edge.
      expect(target[28]).toBeCloseTo(0);
      expect(target[29]).toBeCloseTo(-1);
      expect(target[30]).toBeCloseTo(1);
    });
  });

  describe('packTextNodeData — BitmapText', () => {
    test('packs the same layout as Text (sdfRadius sentinel excepted)', () => {
      const font = makeBmFont();
      const bmp = new BitmapText('Hi', font, {
        fillColor: new Color(11, 21, 31, 0.42),
        outlineColor: new Color(41, 51, 61, 0.53),
        outlineWidth: 0.2,
        shadowColor: new Color(71, 81, 91, 0.64),
        shadowOffsetX: 4,
        shadowOffsetY: -6,
        shadowAlpha: 0.75,
        shadowBlur: 3,
        gradient: {
          stops: [
            { offset: 0, color: new Color(101, 111, 121, 0.86) },
            { offset: 1, color: new Color(131, 141, 151, 0.97) },
          ],
        },
      });

      bmp.setPosition(5, 6);
      bmp.pixelSnapMode = PixelSnapMode.Position;

      const target = new Float32Array(textNodeDataFloats);

      packTextNodeData(target, 0, bmp);

      const m = bmp.getGlobalTransform().toArray(false);
      expect(target[0]).toBe(m[0]);
      expect(target[2]).toBe(PixelSnapMode.Position);
      expect(target[3]).toBe(m[6]);
      expect(target[7]).toBe(m[7]);

      expect(target[8]).toBeCloseTo(11 / 255);
      expect(target[11]).toBeCloseTo(0.42);
      expect(target[12]).toBeCloseTo(41 / 255);
      expect(target[15]).toBeCloseTo(0.53);
      expect(target[16]).toBeCloseTo(0.5 - 0.2);
      expect(target[17]).toBeCloseTo(0.75);
      expect(target[18]).toBeCloseTo(3 * 0.1);
      expect(target[19]).toBe(2);
      expect(target[20]).toBeCloseTo(71 / 255);
      expect(target[23]).toBeCloseTo(0.64);
      // BitmapText.rasterPixelRatio is always 1 (offline atlas - see AbstractText).
      expect(target[24]).toBeCloseTo(4);
      expect(target[25]).toBeCloseTo(-6);
      expect(target[26]).toBe(0); // reserved

      // sdfRadius sentinel: 0 for anything that is not a `Text` (an offline
      // MSDF atlas carries no distance range).
      expect(target[27]).toBe(0);

      expect(target[40]).toBeCloseTo(101 / 255);
      expect(target[47]).toBeCloseTo(0.97);

      const ink = bmp.getLocalBounds();
      expect(target[36]).toBe(ink.x);
      expect(target[39]).toBe(ink.height);
    });
  });

  describe('packTextNodeTransform — own-transform-move row patch primitive', () => {
    test('writes exactly the 8-float transform + snap-flag pair used by _packNodeData, nothing else', () => {
      const text = buildStyledText();
      const full = new Float32Array(textNodeDataFloats);
      packTextNodeData(full, 0, text);

      const row = new Float32Array(8 + 2); // 2 extra guard floats past the row
      packTextNodeTransform(row, 0, text);

      expect(Array.from(row.slice(0, 8))).toEqual(Array.from(full.slice(0, 8)));
      // Guard floats past the 8-float row are untouched.
      expect(row[8]).toBe(0);
      expect(row[9]).toBe(0);
    });

    test('reflects a moved node — this is what backs the O(1) retained-batch patch', () => {
      const text = buildStyledText();
      const before = new Float32Array(8);
      packTextNodeTransform(before, 0, text);

      text.setPosition(100, 200);

      const after = new Float32Array(8);
      packTextNodeTransform(after, 0, text);

      expect(after[3]).not.toBe(before[3]); // tx moved
      expect(after[7]).not.toBe(before[7]); // ty moved
      expect(after[0]).toBe(before[0]); // scale/rotation (a) unaffected by a pure move
    });
  });
});
