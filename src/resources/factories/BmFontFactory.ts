import type { BmFontChar, BmFontData } from '#rendering/text/BmFont';
import { BmFont } from '#rendering/text/BmFont';
import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';
import { Asset } from '#resources/Asset';
import type { Loader } from '#resources/Loader';

// ── Parser helpers ────────────────────────────────────────────────────────────

function intVal(line: string, key: string): number {
  const match = line.match(new RegExp(`\\b${key}=(-?\\d+)`));
  return match?.[1] !== undefined ? parseInt(match[1], 10) : 0;
}

function strVal(line: string, key: string): string {
  const match = line.match(new RegExp(`\\b${key}="([^"]*)"`));
  if (match?.[1] !== undefined) return match[1];
  const bare = line.match(new RegExp(`\\b${key}=(\\S+)`));
  return bare?.[1] ?? '';
}

/**
 * Parse an AngelCode BMFont `.fnt` text file and return structured
 * {@link BmFontData}. Supports the `text` format; the binary and XML
 * formats are not implemented.
 */
export function parseBmFontText(text: string): BmFontData {
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
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Factory that loads a {@link BmFont} bundle: parses the `.fnt` descriptor
 * and loads all referenced page textures via the owning {@link Loader} so
 * they benefit from the same caching and IDB strategy as other assets.
 */
export class BmFontLoaderFactory extends AbstractAssetFactory<BmFont> {
  public readonly storageName = 'bmfont';
  private readonly _loader: Loader;

  public constructor(loader: Loader) {
    super();
    this._loader = loader;
  }

  public async process(response: Response): Promise<{ text: string; url: string }> {
    return { text: await response.text(), url: response.url };
  }

  public async create(source: unknown): Promise<BmFont> {
    const { text, url } = source as { text: string; url: string };
    const fontData = parseBmFontText(text);
    const textures = await Promise.all(fontData.pages.map(page => this._loader.load(Asset.kind('texture', new URL(page, url).href))));
    return new BmFont(fontData, textures);
  }
}
