import type { BmFontChar, BmFontData } from '#rendering/text/BmFont';

// ── Parser helpers ────────────────────────────────────────────────────────────

const intVal = (line: string, key: string): number => {
  const match = new RegExp(`\\b${key}=(-?\\d+)`).exec(line);
  return match?.[1] !== undefined ? parseInt(match[1], 10) : 0;
};

const strVal = (line: string, key: string): string => {
  const match = new RegExp(`\\b${key}="([^"]*)"`).exec(line);
  if (match?.[1] !== undefined) return match[1];
  const bare = new RegExp(`\\b${key}=(\\S+)`).exec(line);
  return bare?.[1] ?? '';
};

/**
 * Parse an AngelCode BMFont `.fnt` text file and return structured
 * {@link BmFontData}. Supports the `text` format; the binary and XML
 * formats are not implemented.
 */
export const parseBmFontText = (text: string): BmFontData => {
  const lines = text.split(/\r?\n/);
  const pages: string[] = [];
  const chars = new Map<number, BmFontChar>();
  const kernings = new Map<string, number>();
  let lineHeight = 0;
  let base = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    const tag = line.split(/\s/)[0] ?? '';

    switch (tag) {
      case 'common': {
        lineHeight = intVal(line, 'lineHeight');
        base = intVal(line, 'base');
        break;
      }
      case 'page': {
        const id = intVal(line, 'id');
        const file = strVal(line, 'file');
        pages[id] = file;
        break;
      }
      case 'char': {
        const id = intVal(line, 'id');
        chars.set(id, {
          x: intVal(line, 'x'),
          y: intVal(line, 'y'),
          width: intVal(line, 'width'),
          height: intVal(line, 'height'),
          xOffset: intVal(line, 'xoffset'),
          yOffset: intVal(line, 'yoffset'),
          xAdvance: intVal(line, 'xadvance'),
          page: intVal(line, 'page'),
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

  return { pages, chars, kernings, lineHeight, base };
};
