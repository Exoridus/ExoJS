import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';
import type { SamplerOptions } from '@/rendering/texture/Sampler';
import type { PlaybackOptions, StreamingLoadEvent } from '@/core/types';
import { determineMimeType } from '@/resources/utils';
import { Video } from '@/rendering/video/Video';

const onceListenerOption = { once: true };

interface VideoFactoryOptions {
    mimeType?: string;
    loadEvent?: StreamingLoadEvent;
    playbackOptions?: Partial<PlaybackOptions>;
    samplerOptions?: Partial<SamplerOptions>;
}

export class VideoFactory extends AbstractAssetFactory<Video> {

    public readonly storageName = 'video';

    private readonly _videoElements: Array<HTMLVideoElement> = [];

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: VideoFactoryOptions = {}): Promise<Video> {
        const { mimeType, loadEvent, playbackOptions, samplerOptions } = options;
        const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            this._videoElements.push(video);

            video.addEventListener('error', () => reject(Error('Video loading error.')), onceListenerOption);
            video.addEventListener('abort', () => reject(Error('Video loading error: cancelled.')), onceListenerOption);
            video.addEventListener('emptied', () => reject(Error('Video loading error: emptied.')), onceListenerOption);
            // 'stalled' is intentionally omitted: it fires transiently during normal buffering
            // and would cause spurious rejections for large files on slow connections.
            video.addEventListener(loadEvent ?? 'canplaythrough', () => resolve(new Video(video, playbackOptions, samplerOptions)), onceListenerOption);

            video.preload = 'auto';
            video.src = this.createObjectUrl(blob);
        });
    }

    public override destroy(): void {
        for (const video of this._videoElements) {
            video.pause();
            video.src = '';
            video.load();
        }
        this._videoElements.length = 0;
        super.destroy();
    }
}
