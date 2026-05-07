import type { PlaybackOptions, StreamingLoadEvent } from '@/core/types';
import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';
import { determineMimeType } from '@/resources/utils';
import { Music } from '@/audio/Music';

const onceListenerOption = { once: true };

interface MusicFactoryOptions {
    /**
     * MIME type for the audio blob. Inferred from magic bytes when omitted.
     */
    mimeType?: string;
    /**
     * The `HTMLAudioElement` event that signals the asset is ready. Defaults
     * to `'canplaythrough'`. Use `'loadedmetadata'` or `'canplay'` for faster
     * (but potentially less buffered) readiness.
     */
    loadEvent?: StreamingLoadEvent;
    /** Initial playback settings forwarded to the {@link Music} instance. */
    playbackOptions?: Partial<PlaybackOptions>;
}

/**
 * {@link AssetFactory} implementation that loads streaming audio assets
 * (MP3, OGG, WAV, AAC, and other browser-supported formats) and produces a
 * {@link Music} instance backed by an `<audio>` element.
 *
 * Unlike {@link SoundFactory}, music assets are decoded lazily via the browser's
 * streaming audio pipeline rather than being fully decoded into an
 * {@link AudioBuffer} up-front, making them appropriate for long-form
 * background tracks. The underlying `<audio>` elements are paused and detached
 * when {@link MusicFactory.destroy} is called.
 */
export class MusicFactory extends AbstractAssetFactory<Music> {

    public readonly storageName = 'music';

    private readonly _audioElements: Array<HTMLAudioElement> = [];

    /**
     * Reads the full response body as an {@link ArrayBuffer} for blob
     * construction.
     */
    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    /**
     * Wraps audio bytes in an `<audio>` element and resolves with a
     * {@link Music} instance once the configured `loadEvent` fires.
     *
     * Rejects if the element emits an `error` or `abort` event before the
     * load event is received.
     */
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

    /**
     * Pauses and resets all `<audio>` elements created by this factory to
     * release media resources, then delegates to the base
     * {@link AbstractAssetFactory.destroy} to revoke any object URLs.
     */
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
