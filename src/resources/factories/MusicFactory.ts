import type { PlaybackOptions, StreamingLoadEvent } from 'core/types';
import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';
import { determineMimeType } from 'resources/utils';
import { Music } from 'audio/Music';

const onceListenerOption = { once: true };

interface MusicFactoryOptions {
    mimeType?: string;
    loadEvent?: StreamingLoadEvent;
    playbackOptions?: Partial<PlaybackOptions>;
}

export class MusicFactory extends AbstractAssetFactory<Music> {

    public readonly storageName = 'music';

    private readonly _audioElements: Array<HTMLAudioElement> = [];

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: MusicFactoryOptions = {}): Promise<Music> {
        const { mimeType, loadEvent, playbackOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const audio = document.createElement('audio');
            this._audioElements.push(audio);

            audio.addEventListener('error', () => reject(Error('Error loading audio source.')), onceListenerOption);
            audio.addEventListener('abort', () => reject(Error('Audio loading was canceled.')), onceListenerOption);
            audio.addEventListener(loadEvent ?? 'canplaythrough', () => resolve(new Music(audio, playbackOptions)), onceListenerOption);

            audio.preload = 'auto';
            audio.src = this.createObjectUrl(blob);
        });
    }

    public override destroy(): void {
        for (const audio of this._audioElements) {
            audio.pause();
            audio.src = '';
            audio.load();
        }
        this._audioElements.length = 0;
        super.destroy();
    }
}
