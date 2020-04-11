import Sound from '../../audio/Sound';
import { GlobalAudioContext, StorageNames } from '../../const/core';
import { PlaybackOptions } from "../../const/types";
import { AbstractResourceFactory } from "./AbstractResourceFactory";

interface SoundFactoryOptions {
    playbackOptions?: PlaybackOptions;
}

export default class SoundFactory extends AbstractResourceFactory<ArrayBuffer, Sound> {

    public readonly storageName: StorageNames = StorageNames.Sound;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: SoundFactoryOptions = {}): Promise<Sound> {
        const audioBuffer = await GlobalAudioContext.decodeAudioData(source);

        return new Sound(audioBuffer, options.playbackOptions);
    }
}
