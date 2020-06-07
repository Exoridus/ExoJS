import { StorageNames } from 'types/types';
import type { IPlaybackOptions } from 'types/types';
import { AbstractResourceFactory } from './AbstractResourceFactory';
import { Sound } from 'audio/Sound';
import { decodeAudioData } from 'utils/audio-context';

interface ISoundFactoryOptions {
    playbackOptions?: Partial<IPlaybackOptions>;
}

export class SoundFactory extends AbstractResourceFactory<ArrayBuffer, Sound> {

    public readonly storageName: StorageNames = StorageNames.sound;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: ISoundFactoryOptions = {}): Promise<Sound> {
        const audioBuffer = await decodeAudioData(source);

        return new Sound(audioBuffer, options.playbackOptions);
    }
}
