import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

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

export class VttFactory extends AbstractAssetFactory<Array<VTTCue>> {

    public readonly storageName = 'vtt';

    public async process(response: Response): Promise<string> {
        return response.text();
    }

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
                // rest may have cue settings after the end timestamp
                const endStr = rest.split(/\s+/)[0];
                const start = parseTimestamp(startStr);
                const end = parseTimestamp(endStr);

                i++;
                const textLines: Array<string> = [];

                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i]);
                    i++;
                }

                cues.push(new VTTCue(start, end, textLines.join('\n')));
            } else {
                i++;
            }
        }

        return cues;
    }
}
