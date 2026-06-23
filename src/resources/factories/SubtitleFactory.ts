import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type SubtitleFormat = 'vtt' | 'srt';

interface SubtitleIntermediate {
  fmt: SubtitleFormat;
  text: string;
}

/**
 * The narrow slice of `Response` that {@link SubtitleFactory.process} actually
 * reads. A real `Response` satisfies it structurally, so the network/cache
 * strategies still pass their fetched response unchanged — but an in-memory
 * `{ text, url }` source (see `coreAssetBindings`) also fits without a cast.
 */
interface SubtitleSource {
  text(): Promise<string>;
  url: string;
}

// ---------------------------------------------------------------------------
// VTT helpers
// ---------------------------------------------------------------------------

/**
 * Converts a WebVTT timestamp string (`HH:MM:SS.mmm`, `MM:SS.mmm`, or
 * `SS.mmm`) into a floating-point number of seconds.
 *
 * @internal
 */
const parseVttTimestamp = (value: string): number => {
  const parts = value.split(':');
  let seconds: number;

  if (parts.length === 3) {
    seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  } else if (parts.length === 2) {
    seconds = Number(parts[0]) * 60 + Number(parts[1]);
  } else {
    seconds = Number(parts[0]);
  }

  return seconds;
};

const validAlignValues = new Set<string>(['start', 'center', 'end', 'left', 'right']);
const validLineAlignValues = new Set<string>(['start', 'center', 'end']);
const validPositionAlignValues = new Set<string>(['auto', 'line-left', 'center', 'line-right']);

/**
 * Parses the WebVTT cue-settings tail (`align:center line:80% position:50%`)
 * and applies each recognized setting to the supplied {@link VTTCue}.
 *
 * Unknown keys, malformed values, and unknown enum members are silently
 * skipped so that one bad token does not invalidate an otherwise valid cue.
 * Percent signs on numeric values are tolerated and stripped.
 *
 * @internal
 */
const applyCueSettings = (cue: VTTCue, settings: string): void => {
  if (!settings) {
    return;
  }

  for (const token of settings.split(/\s+/)) {
    const colonIndex = token.indexOf(':');

    if (colonIndex === -1) {
      continue;
    }

    const name = token.slice(0, colonIndex);
    const value = token.slice(colonIndex + 1);

    switch (name) {
      case 'vertical':
        if (value === 'rl' || value === 'lr' || value === '') {
          cue.vertical = value;
        }
        break;
      case 'line': {
        if (value === 'auto') {
          cue.line = 'auto';
        } else {
          const [linePart, alignPart] = value.split(',');
          const num = parseFloat(linePart);

          if (!Number.isNaN(num)) {
            cue.line = num;
          }

          if (alignPart !== undefined && validLineAlignValues.has(alignPart)) {
            cue.lineAlign = alignPart as VTTCue['lineAlign'];
          }
        }
        break;
      }
      case 'position': {
        const [posPart, alignPart] = value.split(',');
        const num = parseFloat(posPart);

        if (!Number.isNaN(num)) {
          cue.position = num;
        }

        if (alignPart !== undefined && validPositionAlignValues.has(alignPart)) {
          cue.positionAlign = alignPart as VTTCue['positionAlign'];
        }
        break;
      }
      case 'size': {
        const num = parseFloat(value);

        if (!Number.isNaN(num)) {
          cue.size = num;
        }
        break;
      }
      case 'align':
        if (validAlignValues.has(value)) {
          cue.align = value as VTTCue['align'];
        }
        break;
    }
  }
};

const parseVtt = (source: string): VTTCue[] => {
  const cues: VTTCue[] = [];
  const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  let i = 0;

  // Skip header and any blank lines/metadata before first cue
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const arrowIndex = line.indexOf('-->');
      const startString = line.slice(0, arrowIndex).trim();
      const rest = line.slice(arrowIndex + 3).trim();
      const restTokens = rest.split(/\s+/);
      const endString = restTokens[0];
      const settingsString = restTokens.slice(1).join(' ');
      const start = parseVttTimestamp(startString);
      const end = parseVttTimestamp(endString);

      i++;
      const textLines: string[] = [];

      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i]);
        i++;
      }

      const cue = new VTTCue(start, end, textLines.join('\n'));

      applyCueSettings(cue, settingsString);
      cues.push(cue);
    } else {
      i++;
    }
  }

  return cues;
};

// ---------------------------------------------------------------------------
// SRT helpers
// ---------------------------------------------------------------------------

/**
 * Converts an SRT timestamp string (`HH:MM:SS,mmm`) into a floating-point
 * number of seconds.
 *
 * @internal
 */
const parseSrtTimestamp = (value: string): number => {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');

  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
};

const parseSrt = (source: string): VTTCue[] => {
  const cues: VTTCue[] = [];
  const normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const blocks = normalized.split(/\n[ \t]*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    if (lines.length < 2) continue;

    let timingIndex = 0;

    if (/^\d+$/.test(lines[0].trim())) {
      timingIndex = 1;
    }

    const timingLine = lines[timingIndex];

    if (!timingLine?.includes('-->')) continue;

    const arrowIndex = timingLine.indexOf('-->');
    const start = parseSrtTimestamp(timingLine.slice(0, arrowIndex));
    const end = parseSrtTimestamp(timingLine.slice(arrowIndex + 3));
    const text = lines.slice(timingIndex + 1).join('\n');

    cues.push(new VTTCue(start, end, text));
  }

  return cues;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * {@link AssetFactory} implementation that parses WebVTT (`.vtt`) and SubRip
 * (`.srt`) subtitle files and produces an array of {@link VTTCue} instances.
 *
 * Format is detected from the file extension of the response URL; unknown
 * extensions default to VTT parsing. VTT cue settings (`align`, `line`,
 * `position`, `size`, `vertical`) are applied; SRT cues retain default
 * positional properties.
 */
export class SubtitleFactory extends AbstractAssetFactory<VTTCue[]> {
  public readonly storageName = 'subtitle';

  /**
   * Reads the response body as UTF-8 text and records the subtitle format
   * derived from the response URL's file extension.
   */
  public async process(response: SubtitleSource): Promise<SubtitleIntermediate> {
    const text = await response.text();
    const url = response.url.split('?')[0].toLowerCase();
    const fmt: SubtitleFormat = url.endsWith('.srt') ? 'srt' : 'vtt';

    return { fmt, text };
  }

  /**
   * Parses the subtitle text into an ordered array of {@link VTTCue} instances.
   */
  public async create(source: SubtitleIntermediate): Promise<VTTCue[]> {
    return source.fmt === 'srt' ? parseSrt(source.text) : parseVtt(source.text);
  }
}
