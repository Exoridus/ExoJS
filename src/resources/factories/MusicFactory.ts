import { PlaybackOptions } from "../../const/types";
import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { determineMimeType } from "../../utils/resources";
import { onceListenerOption, StorageNames } from "../../const/core";
import { Music } from "../../audio/Music";

interface MusicFactoryOptions {
    mimeType?: string;
    loadEvent?: string;
    playbackOptions?: Partial<PlaybackOptions>;
}

export class MusicFactory extends AbstractResourceFactory<ArrayBuffer, Music> {

    public readonly storageName: StorageNames = StorageNames.Music;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: MusicFactoryOptions = {}): Promise<Music> {
        const { mimeType, loadEvent, playbackOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const audio = document.createElement('audio');

            audio.addEventListener('error', () => reject(Error('Error loading audio source.')), onceListenerOption);
            audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')), onceListenerOption);
            audio.addEventListener(loadEvent ?? 'canplaythrough', () => resolve(new Music(audio, playbackOptions)), onceListenerOption);

            audio.preload = 'auto';
            audio.src = this.createObjectURL(blob);
        });
    }
}
