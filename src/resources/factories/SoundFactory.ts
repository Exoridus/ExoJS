import { StorageNames } from 'types/types';
import { PlaybackOptions } from "types/types";
import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { Sound } from "audio/Sound";
import { decodeAudioData } from "utils/audio-context";

interface SoundFactoryOptions {
    playbackOptions?: Partial<PlaybackOptions>;
}

export class SoundFactory extends AbstractResourceFactory<ArrayBuffer, Sound> {

    public readonly storageName: StorageNames = StorageNames.Sound;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: SoundFactoryOptions = {}): Promise<Sound> {
        const audioBuffer = await decodeAudioData(source);

        return new Sound(audioBuffer, options.playbackOptions);
    }
}
