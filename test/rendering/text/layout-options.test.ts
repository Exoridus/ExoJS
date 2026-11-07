import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

import { Color } from '#core/Color';
import { logger } from '#core/Logger';
import { pickLayoutOptions } from '#core/serialization/serializerHelpers';
import { Signal } from '#core/Signal';
import { Drawable } from '#rendering/Drawable';
import { BmFont } from '#rendering/text/BmFont';
import * as canvasTextState from '#rendering/text/canvasTextState';
import { SDF_RADIUS } from '#rendering/text/GlyphAtlas';
import type { LayoutOptions } from '#rendering/text/LayoutOptions';
import * as segmentation from '#rendering/text/segmentation';
import { ShapedTextSource } from '#rendering/text/ShapedTextSource';
import * as shaping from '#rendering/text/shaping';
import type { GlyphInfo, GlyphProvider, TextLayoutStyle } from '#rendering/text/types';

const loadModule = <T>(file: string, dev: boolean, dependencies: Record<string, unknown>): T => {
  const source = readFileSync(resolve(import.meta.dirname!, '../../../src', file), 'utf8');
  const code = ts.transpileModule(source.replaceAll('__DEV__', String(dev)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};

  runInNewContext(code, {
    exports,
    RangeError,
    require: (id: string) => {
      if (!(id in dependencies)) {
        throw new Error(`Unexpected dependency: ${id}`);
      }

      return dependencies[id];
    },
  });

  return exports as T;
};

const style: TextLayoutStyle = { fontSize: 16, lineHeight: 1, leading: 0, align: 'left' };
const font = new BmFont({ pages: [], chars: new Map(), kernings: new Map(), lineHeight: 16, base: 12 }, []);
const glyph: GlyphInfo = {
  x: 0,
  y: 0,
  width: 10,
  height: 16,
  advance: 10,
  ascent: 12,
  page: 0,
  uvLeft: 0,
  uvTop: 0,
  uvRight: 1,
  uvBottom: 1,
};

describe.each([false, true])('layout option validation (__DEV__=%s)', dev => {
  const diagnostics = loadModule<typeof import('#core/dev')>('core/dev.ts', dev, {});
  const dependencies: Record<string, unknown> = {
    '#core/Color': { Color },
    '#core/dev': diagnostics,
    '#core/Logger': { logger },
    '#core/serialization/serializerHelpers': { pickLayoutOptions },
    '#core/Signal': { Signal },
    '#rendering/Drawable': { Drawable },
    './canvasTextState': canvasTextState,
    './GlyphAtlas': { SDF_RADIUS },
    './segmentation': segmentation,
    './ShapedTextSource': { ShapedTextSource },
    './shaping': shaping,
  };
  const load = <T>(name: string): T => loadModule<T>(`rendering/text/${name}.ts`, dev, dependencies);

  dependencies['./TextStyle'] = load<typeof import('#rendering/text/TextStyle')>('TextStyle');
  // Validation must survive the same constant substitution that strips diagnostics.
  test('uses the requested diagnostic mode', () => {
    if (dev) {
      expect(() => diagnostics.assert(false)).toThrow();
    } else {
      expect(() => diagnostics.assert(false)).not.toThrow();
    }
  });

  const layout = load<typeof import('#rendering/text/textLayout')>('textLayout');
  dependencies['./textLayout'] = layout;
  dependencies['./AbstractText'] = load<typeof import('#rendering/text/AbstractText')>('AbstractText');
  const getPool = vi.fn(() => {
    throw new Error('Unexpected metrics or atlas acquisition');
  });
  dependencies['./GlyphAtlasPool'] = { getDefaultGlyphAtlasPool: getPool };
  const { Text } = load<typeof import('#rendering/text/Text')>('Text');
  const { BitmapText } = load<typeof import('#rendering/text/BitmapText')>('BitmapText');

  test.each([
    { maxLines: 0 },
    { maxLines: -1 },
    { maxLines: 1.5 },
    { maxLines: 2.7 },
    { maxLines: Number.NaN },
    { maxLines: Number.POSITIVE_INFINITY },
    { maxLines: Number.NEGATIVE_INFINITY },
    { maxLines: Number.MAX_SAFE_INTEGER + 1 },
    { tabSize: 0 },
    { tabSize: -1 },
    { tabSize: Number.NaN },
    { tabSize: Number.POSITIVE_INFINITY },
    { tabSize: Number.NEGATIVE_INFINITY },
  ])('rejects %j at every public boundary before doing layout work', options => {
    const getGlyph = vi.fn(() => {
      throw new Error('Unexpected glyph acquisition');
    });
    const provider: GlyphProvider = { getGlyph };
    const option = 'maxLines' in options ? 'maxLines' : 'tabSize';
    const shaper = { measureLine: vi.fn(), shapeLine: vi.fn() };

    for (const text of ['', 'A', 'A\tB']) {
      expect(() => layout.layoutText(text, style, options, provider)).toThrow(RangeError);
      expect(() => layout.layoutText(text, style, options, provider)).toThrow(new RegExp(option));
      expect(() => new Text(text, options)).toThrow(RangeError);
      expect(() => new BitmapText(text, font, { layout: options })).toThrow(RangeError);
      expect(() => Text.measure(text, options)).toThrow(RangeError);
      expect(() => BitmapText.measure(text, font, { layout: options })).toThrow(RangeError);
    }

    expect(() => layout.layoutText('A\tB', style, { ...options, shaping: 'browser' }, provider, shaper)).toThrow(RangeError);
    expect(shaper.measureLine).not.toHaveBeenCalled();
    expect(shaper.shapeLine).not.toHaveBeenCalled();

    for (const node of [new Text(''), new BitmapText('', font)]) {
      const previous = node.layout;

      expect(() => {
        node.layout = options;
      }).toThrow(RangeError);
      expect(node.layout).toBe(previous);
      expect(node.textBounds).toEqual({ width: 0, height: 0 });
      node.destroy();
    }

    expect(getGlyph).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });

  test.each<LayoutOptions>([
    {},
    { maxLines: 1 },
    { maxLines: Number.MAX_SAFE_INTEGER },
    { tabSize: 0.5 },
    { tabSize: 8 },
    { tabSize: Number.MIN_VALUE },
    { tabSize: Number.MAX_VALUE },
  ])('accepts %j without changing supplied values', options => {
    for (const node of [new Text('', options), new BitmapText('', font, { layout: options })]) {
      expect(node.layout).toEqual(options);
      expect(node.textBounds).toEqual({ width: 0, height: 0 });
      node.layout = options;
      expect(node.layout).toEqual(options);
      node.destroy();
    }

    expect(Text.measure('', options)).toEqual({ width: 0, height: 0 });
    expect(BitmapText.measure('', font, { layout: options })).toEqual({ width: 0, height: 0 });
    expect(layout.layoutText('', style, options, { getGlyph: vi.fn() }).placements).toEqual([]);
  });

  test('keeps default flow, exact line caps and fractional tab stops', () => {
    const provider: GlyphProvider = { getGlyph: () => glyph };

    expect(layout.layoutText('A\nB', style, {}, provider).lines).toHaveLength(2);
    expect(layout.layoutText('A\nB', style, { maxLines: 1 }, provider).lines).toHaveLength(1);
    expect(layout.layoutText('A\nB', style, { maxLines: Number.MAX_SAFE_INTEGER }, provider).lines).toHaveLength(2);
    expect(layout.layoutText('A\tB', style, { whiteSpace: 'pre' }, provider).placements.at(-1)!.x).toBe(80);
    expect(layout.layoutText('A\tB', style, { whiteSpace: 'pre', tabSize: 0.5 }, provider).placements.at(-1)!.x).toBe(15);
  });
});
