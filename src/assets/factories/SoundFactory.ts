import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { decodeAudioData } from '#audio/audio-context';
import { type AudioSpriteClip, Sound } from '#audio/Sound';
import type { PlaybackOptions } from '#core/types';

/** Options accepted by an asset of the built-in `sound` type. */
export interface SoundAssetOptions {
  /** Initial playback settings forwarded to the {@link Sound} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Concurrent voices the {@link Sound} pre-allocates; {@link Sound}'s own default when omitted. */
  poolSize?: number;
  /** Named sub-regions of the decoded buffer, for use as an audio sprite sheet. */
  sprites?: Readonly<Record<string, AudioSpriteClip>>;
}

/**
 * Fully decodes short audio into an `AudioBuffer` and wraps it in a
 * {@link Sound} ready for low-latency playback.
 *
 * Long-form audio belongs to the `music` type, which streams instead of
 * decoding up front.
 * @internal
 */
export class SoundFactory implements AssetFactory<ArrayBuffer, Sound, SoundAssetOptions> {
  public async create(source: ArrayBuffer, context: AssetFactoryContext<SoundAssetOptions>): Promise<Sound> {
    const options = context.options ?? {};

    let audioBuffer: AudioBuffer;

    try {
      audioBuffer = await decodeAudioData(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to decode audio data: ${message} (if loaded as the wrong asset type, this file may not be an audio format at all).`, {
        cause: error,
      });
    }

    return new Sound(audioBuffer, {
      ...options.playbackOptions,
      ...(options.poolSize !== undefined && { poolSize: options.poolSize }),
      ...(options.sprites !== undefined && { sprites: options.sprites }),
    });
  }
}
