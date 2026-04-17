import type { PlaybackOptions } from 'core/types';
import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';
import { Sound } from 'audio/Sound';
import { decodeAudioData } from 'audio/audio-context';

interface SoundFactoryOptions {
    playbackOptions?: Partial<PlaybackOptions>;
}

export class SoundFactory extends AbstractAssetFactory<Sound> {

    public readonly storageName = 'sound';

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: SoundFactoryOptions = {}): Promise<Sound> {
        const audioBuffer = await decodeAudioData(source);

        return new Sound(audioBuffer, options.playbackOptions);
    }
}
