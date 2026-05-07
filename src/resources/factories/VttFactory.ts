import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * Converts a WebVTT timestamp string (`HH:MM:SS.mmm`, `MM:SS.mmm`, or
 * `SS.mmm`) into a floating-point number of seconds.
 *
 * @internal
 */
const parseTimestamp = (value: string): number => {
    const parts = value.split(':');
    let seconds = 0;

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

/**
 * {@link AssetFactory} implementation that parses WebVTT (`.vtt`) subtitle and
 * caption files and produces an array of {@link VTTCue} instances.
 *
 * The parser handles CRLF and CR line endings, skips the `WEBVTT` header and
 * any metadata blocks, and applies optional cue settings (`align`, `line`,
 * `position`, `size`, `vertical`) on the timestamp line directly to the
 * resulting {@link VTTCue}.
 */
export class VttFactory extends AbstractAssetFactory<Array<VTTCue>> {

    public readonly storageName = 'vtt';

    /**
     * Reads the response body as a UTF-8 string containing the raw VTT markup.
     */
    public async process(response: Response): Promise<string> {
        return response.text();
    }

    /**
     * Parses VTT markup into an ordered array of {@link VTTCue} instances.
     *
     * Line endings are normalised before parsing. Cues are emitted in document
     * order; overlapping or out-of-order timestamps are preserved as-is.
     */
    public async create(source: string): Promise<Array<VTTCue>> {
        const cues: Array<VTTCue> = [];
        const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        let i = 0;

        // Skip header and any blank lines/metadata before first cue
        while (i < lines.length && !lines[i].includes('-->')) {
            i++;
        }

        while (i < lines.length) {
            const line = lines[i].trim();

            if (line.includes('-->')) {
                const arrowIndex = line.indexOf('-->');
                const startStr = line.slice(0, arrowIndex).trim();
                const rest = line.slice(arrowIndex + 3).trim();
                // rest contains the end timestamp followed by optional cue
                // settings (align, line, position, size, vertical).
                const restTokens = rest.split(/\s+/);
                const endStr = restTokens[0];
                const settingsString = restTokens.slice(1).join(' ');
                const start = parseTimestamp(startStr);
                const end = parseTimestamp(endStr);

                i++;
                const textLines: Array<string> = [];

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
    }
}
