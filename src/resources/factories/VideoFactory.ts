import { AbstractResourceFactory } from './AbstractResourceFactory';
import type { ISamplerOptions } from 'rendering/texture/Sampler';
import type { IPlaybackOptions } from 'types/types';
import { determineMimeType } from 'utils/resources';
import { StorageNames } from 'types/types';
import { Video } from 'rendering/Video';

const onceListenerOption = { once: true };

interface IVideoFactoryOptions {
    mimeType?: string;
    loadEvent?: string;
    playbackOptions?: Partial<IPlaybackOptions>;
    samplerOptions?: Partial<ISamplerOptions>;
}

export class VideoFactory extends AbstractResourceFactory<ArrayBuffer, Video> {

    public readonly storageName: StorageNames = StorageNames.video;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: IVideoFactoryOptions = {}): Promise<Video> {
        const { mimeType, loadEvent, playbackOptions, samplerOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const video = document.createElement('video');

            video.addEventListener('error', () => reject(Error('Video loading error.')), onceListenerOption);
            video.addEventListener('abort', () => reject(Error('Video loading error: cancelled.')), onceListenerOption);
            video.addEventListener('emptied', () => reject(Error('Video loading error: emptied.')), onceListenerOption);
            video.addEventListener('stalled', () => reject(Error('Video loading error: stalled.')), onceListenerOption);
            video.addEventListener(loadEvent ?? 'canplaythrough', () => resolve(new Video(video, playbackOptions, samplerOptions)), onceListenerOption);

            video.preload = 'auto';
            video.src = this.createObjectUrl(blob);
        });
    }
}
