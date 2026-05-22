import { decodeAudioData } from '@/audio/audio-context';
import { type AudioSpriteClip, Sound } from '@/audio/Sound';
import type { PlaybackOptions } from '@/core/types';
import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/** Construction options for {@link SoundFactory.create}. */
export interface SoundFactoryOptions {
  /** Initial playback settings forwarded to the {@link Sound} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /**
   * Number of concurrent voices the {@link Sound} instance pre-allocates.
   * Higher values allow more simultaneous plays of the same clip. Default
   * 8 (chosen by {@link Sound} when omitted).
   */
  poolSize?: number;
  /**
   * Named sub-regions of the decoded {@link AudioBuffer} for use as an audio
   * sprite sheet. Each entry maps a clip name to a {@link AudioSpriteClip}
   * descriptor.
   */
  sprites?: Readonly<Record<string, AudioSpriteClip>>;
}

/**
 * {@link AssetFactory} implementation that loads short audio assets
 * (MP3, OGG, WAV, AAC, and other Web Audio API-supported formats), fully
 * decodes them into an {@link AudioBuffer}, and produces a {@link Sound}
 * instance ready for low-latency playback.
 *
 * For long-form background music use {@link MusicFactory} instead, which
 * streams audio without up-front decoding. Supports audio sprite sheets via
 * the `sprites` option.
 */
export class SoundFactory extends AbstractAssetFactory<Sound> {
  public readonly storageName = 'sound';

  /**
   * Reads the full response body as an {@link ArrayBuffer} for decoding
   * by the Web Audio API.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Fully decodes the audio buffer via the shared `AudioContext` and
   * constructs a {@link Sound} with the given options.
   */
  public async create(source: ArrayBuffer, options: SoundFactoryOptions = {}): Promise<Sound> {
    const audioBuffer = await decodeAudioData(source);

    const sound = new Sound(audioBuffer, {
      ...options.playbackOptions,
      poolSize: options.poolSize,
      sprites: options.sprites,
    });

    return sound;
  }
}
