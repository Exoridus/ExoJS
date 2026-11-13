import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { BmFontChar, BmFontData, BmFontDistanceField } from '#rendering/text/BmFont';

// ── Parser helpers ────────────────────────────────────────────────────────────

// Attribute names are a fixed set of literals in this parser, so the patterns are
// interned: a 300-glyph descriptor made ~3900 `new RegExp` allocations for the same
// few dozen sources. V8 caches the compiled program per source, so this saves the
// objects, not the compilation.
const patterns = new Map<string, RegExp>();

const pattern = (source: string): RegExp => {
  let compiled = patterns.get(source);

  if (compiled === undefined) {
    compiled = new RegExp(source);
    patterns.set(source, compiled);
  }

  return compiled;
};

const intVal = (line: string, key: string): number => {
  const match = pattern(`\\b${key}=(-?\\d+)`).exec(line);

  return match?.[1] !== undefined ? parseInt(match[1], 10) : 0;
};

const strVal = (line: string, key: string): string => {
  const match = pattern(`\\b${key}="([^"]*)"`).exec(line);

  if (match?.[1] !== undefined) {
    return match[1];
  }

  const bare = pattern(`\\b${key}=(\\S+)`).exec(line);

  return bare?.[1] ?? '';
};

const attribute = (line: string, key: string): string | undefined => {
  const match = pattern(`(?:^|\\s)${key}=(?:"([^"]*)"|([^\\s]*))`).exec(line);

  return match?.[1] ?? match?.[2];
};

const parseError = (message: string): AssetDecodeError =>
  new AssetDecodeError({ message: `BMFont parse error: ${message}`, assetType: 'bmFont' });

const numberValue = (value: unknown, key: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw parseError(`${key} must be a finite number.`);
  }

  return value;
};

const optionalNumber = (value: unknown, key: string): number | undefined => (value === undefined ? undefined : numberValue(value, key));

const numberAttribute = (line: string, key: string): number | undefined => {
  const value = attribute(line, key);

  return value === undefined ? undefined : numberValue(value.trim() === '' ? NaN : Number(value), key);
};

function numberList(value: unknown, key: string, count: 2): [number, number];
function numberList(value: unknown, key: string, count: 4): [number, number, number, number];

function numberList(value: unknown, key: string, count: number): number[] {
  if (!Array.isArray(value) || value.length !== count) {
    throw parseError(`${key} must contain ${count} numbers.`);
  }

  return value.map(entry => numberValue(entry, key));
}

const setAtlasMetadata = (data: Partial<BmFontData>, info: Record<string, unknown>, common: Record<string, unknown>): void => {
  const width = optionalNumber(common.scaleW, 'scaleW');
  const height = optionalNumber(common.scaleH, 'scaleH');

  if (width !== undefined) {
    data.atlasWidth = width;
  }

  if (height !== undefined) {
    data.atlasHeight = height;
  }

  if (info.padding !== undefined) {
    const [top, right, bottom, left] = numberList(info.padding, 'padding', 4);

    data.padding = { top, right, bottom, left };
  }

  if (info.spacing !== undefined) {
    const [x, y] = numberList(info.spacing, 'spacing', 2);

    data.spacing = { x, y };
  }
};

// msdf-bmfont-xml defines a symmetric -pxrange, not a radius. Its JSON
// extension and the equivalent text tag therefore establish zero at 0.5.
const distanceField = (fieldType: unknown, range: unknown): BmFontDistanceField => {
  if (fieldType !== 'sdf' && fieldType !== 'msdf' && fieldType !== 'mtsdf') {
    throw parseError('distanceField.fieldType must be sdf, msdf or mtsdf.');
  }

  const distanceRange = optionalNumber(range, 'distanceRange') ?? null;

  if (distanceRange !== null && distanceRange <= 0) {
    throw parseError('distanceRange must be positive.');
  }

  return { fieldType, distanceRange, zeroDistanceValue: 0.5 };
};

/**
 * Parse an AngelCode BMFont `.fnt` text file and return structured
 * {@link BmFontData}. Also accepts the symmetric `distanceField` compatibility
 * tag (`fieldType`, optional `distanceRange`); it is not a standard BMFont tag.
 * Binary and XML formats are not implemented.
 */
export const parseBmFontText = (text: string): BmFontData => {
  const lines = text.split(/\r?\n/);
  const pages = new Map<number, string>();
  const chars = new Map<number, BmFontChar>();
  const kernings = new Map<string, number>();
  let lineHeight = 0;
  let base = 0;
  const metadata: Partial<BmFontData> = {};

  for (const raw of lines) {
    const line = raw.trim();

    if (line.length === 0) {
      continue;
    }

    const tag = line.split(/\s/)[0] ?? '';

    switch (tag) {
      case 'info': {
        const padding = attribute(line, 'padding');
        const spacing = attribute(line, 'spacing');

        setAtlasMetadata(
          metadata,
          {
            ...(padding === undefined ? {} : { padding: padding.split(',').map(value => (value.trim() === '' ? NaN : Number(value))) }),
            ...(spacing === undefined ? {} : { spacing: spacing.split(',').map(value => (value.trim() === '' ? NaN : Number(value))) }),
          },
          {},
        );
        break;
      }

      case 'common': {
        lineHeight = intVal(line, 'lineHeight');
        base = intVal(line, 'base');
        setAtlasMetadata(metadata, {}, { scaleW: numberAttribute(line, 'scaleW'), scaleH: numberAttribute(line, 'scaleH') });
        break;
      }

      case 'distanceField': {
        if (metadata.distanceField !== undefined) {
          throw parseError('duplicate distanceField declaration.');
        }

        metadata.distanceField = distanceField(strVal(line, 'fieldType'), numberAttribute(line, 'distanceRange'));
        break;
      }

      case 'page': {
        const id = intVal(line, 'id');
        const file = strVal(line, 'file');

        if (pages.has(id)) {
          throw new Error(`BmFont parse error: duplicate page id ${id}; page ids must be unique.`);
        }

        pages.set(id, file);
        break;
      }

      case 'char': {
        const id = intVal(line, 'id');
        const channel = numberAttribute(line, 'chnl');
        chars.set(id, {
          x: intVal(line, 'x'),
          y: intVal(line, 'y'),
          width: intVal(line, 'width'),
          height: intVal(line, 'height'),
          xOffset: intVal(line, 'xoffset'),
          yOffset: intVal(line, 'yoffset'),
          xAdvance: intVal(line, 'xadvance'),
          page: intVal(line, 'page'),
          ...(channel === undefined ? {} : { channel }),
        });
        break;
      }

      case 'kerning': {
        const first = intVal(line, 'first');
        const second = intVal(line, 'second');
        const amount = intVal(line, 'amount');
        kernings.set(`${first},${second}`, amount);
        break;
      }

      default:
        break;
    }
  }

  // A glyph indexes its atlas by `page`, which is a position in the pages list
  // rather than a lookup by id, so the ids must form 0..n-1. Checked after the
  // parse because descriptors are free to declare their page lines in any order.
  const ordered = [...pages.entries()].sort(([left], [right]) => left - right);

  for (const [index, [id]] of ordered.entries()) {
    if (id !== index) {
      throw new Error(
        `BmFont parse error: page id ${id} leaves a gap; page ids must be contiguous from 0 so a glyph's page indexes its page file.`,
      );
    }
  }

  return { pages: ordered.map(([, file]) => file), chars, kernings, lineHeight, base, ...metadata };
};

const record = (value: unknown, key: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw parseError(`${key} must be an object in a BMFont JSON descriptor.`);
  }

  return value as Record<string, unknown>;
};

const parseBmFontJson = (text: string): BmFontData => {
  const input = record(JSON.parse(text), 'descriptor');
  const common = record(input.common, 'common');

  if (!Array.isArray(input.pages) || !input.pages.every(page => typeof page === 'string') || !Array.isArray(input.chars)) {
    throw parseError('BMFont JSON requires pages (filenames) and chars arrays; native msdf-atlas-gen JSON is not supported.');
  }

  const data: BmFontData = {
    pages: input.pages,
    chars: new Map(),
    kernings: new Map(),
    lineHeight: numberValue(common.lineHeight, 'lineHeight'),
    base: numberValue(common.base, 'base'),
  };

  setAtlasMetadata(data, input.info === undefined ? {} : record(input.info, 'info'), common);

  if (input.distanceField !== undefined) {
    const field = record(input.distanceField, 'distanceField');

    data.distanceField = distanceField(field.fieldType, field.distanceRange);
  }

  for (const entry of input.chars) {
    const char = record(entry, 'char');
    const channel = optionalNumber(char.chnl, 'chnl');

    data.chars.set(numberValue(char.id, 'char.id'), {
      x: numberValue(char.x, 'char.x'),
      y: numberValue(char.y, 'char.y'),
      width: numberValue(char.width, 'char.width'),
      height: numberValue(char.height, 'char.height'),
      xOffset: numberValue(char.xoffset, 'char.xoffset'),
      yOffset: numberValue(char.yoffset, 'char.yoffset'),
      xAdvance: numberValue(char.xadvance, 'char.xadvance'),
      page: numberValue(char.page, 'char.page'),
      ...(channel === undefined ? {} : { channel }),
    });
  }

  if (input.kernings !== undefined) {
    if (!Array.isArray(input.kernings)) {
      throw parseError('kernings must be an array.');
    }

    for (const entry of input.kernings) {
      const kerning = record(entry, 'kerning');

      data.kernings.set(
        `${numberValue(kerning.first, 'kerning.first')},${numberValue(kerning.second, 'kerning.second')}`,
        numberValue(kerning.amount, 'kerning.amount'),
      );
    }
  }

  return data;
};

/** Parse BMFont text or the BMFont JSON shape emitted by msdf-bmfont-xml. @internal */
export const parseBmFont = (text: string): BmFontData =>
  /^(?:\{|\[|"|-?\d|null\b|true\b|false\b)/u.test(text.trimStart()) ? parseBmFontJson(text) : parseBmFontText(text);
