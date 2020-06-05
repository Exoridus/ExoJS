import { AbstractResourceFactory } from "./AbstractResourceFactory";
import type { SamplerOptions } from "rendering/texture/Sampler";
import type { PlaybackOptions } from "types/types";
import { determineMimeType } from "utils/resources";
import { StorageNames } from "types/types";
import { Video } from "rendering/Video";

const onceListenerOption = { once: true };

interface VideoFactoryOptions {
    mimeType?: string;
    loadEvent?: string;
    playbackOptions?: Partial<PlaybackOptions>;
    samplerOptions?: Partial<SamplerOptions>;
}

export class VideoFactory extends AbstractResourceFactory<ArrayBuffer, Video> {

    public readonly storageName: StorageNames = StorageNames.Video;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: VideoFactoryOptions = {}): Promise<Video> {
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
            video.src = this.createObjectURL(blob);
        });
    }
}
