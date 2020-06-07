import type { IPlaybackOptions } from 'types/types';
import { AbstractResourceFactory } from './AbstractResourceFactory';
import { determineMimeType } from 'utils/resources';
import { StorageNames } from 'types/types';
import { Music } from 'audio/Music';

const onceListenerOption = { once: true };

interface IMusicFactoryOptions {
    mimeType?: string;
    loadEvent?: string;
    playbackOptions?: Partial<IPlaybackOptions>;
}

export class MusicFactory extends AbstractResourceFactory<ArrayBuffer, Music> {

    public readonly storageName: StorageNames = StorageNames.music;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: IMusicFactoryOptions = {}): Promise<Music> {
        const { mimeType, loadEvent, playbackOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const audio = document.createElement('audio');

            audio.addEventListener('error', () => reject(Error('Error loading audio source.')), onceListenerOption);
            audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')), onceListenerOption);
            audio.addEventListener(loadEvent ?? 'canplaythrough', () => resolve(new Music(audio, playbackOptions)), onceListenerOption);

            audio.preload = 'auto';
            audio.src = this.createObjectUrl(blob);
        });
    }
}
