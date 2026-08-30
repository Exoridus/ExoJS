import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { decodeAudioData } from '#audio/audioContext';
import { type AudioSpriteClip, Sound } from '#audio/Sound';
import type { PlaybackOptions } from '#core/types';

import { loadSoundSpriteSheet } from './soundSprites';

/** Options accepted by an asset of the built-in `sound` type. */
export interface SoundAssetOptions {
  /** Initial playback settings forwarded to the {@link Sound} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Concurrent voices the {@link Sound} pre-allocates; {@link Sound}'s own default when omitted. */
  poolSize?: number;
  /**
   * Named sub-regions of the decoded buffer, for use as an audio sprite sheet.
   *
   * A string is the source of a sidecar JSON document holding the same map (see
   * {@link SoundSpriteSheet}). It is loaded through the sound's own dependency
   * scope, so the sidecar is released with the sound, and it is resolved against
   * the loader's base path like any other asset source - not relative to the
   * audio file.
   */
  sprites?: Readonly<Record<string, AudioSpriteClip>> | string;
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

      throw new AssetDecodeError({
        message: `Failed to decode audio data: ${message} (if loaded as the wrong asset type, this file may not be an audio format at all).`,
        assetType: 'sound',
        cause: error,
      });
    }

    const sidecar = typeof options.sprites === 'string' ? options.sprites : null;
    const sprites = typeof options.sprites === 'string' ? await loadSoundSpriteSheet(options.sprites, context.dependencies) : options.sprites;

    try {
      return new Sound(audioBuffer, {
        ...options.playbackOptions,
        ...(options.poolSize !== undefined && { poolSize: options.poolSize }),
        ...(sprites !== undefined && { sprites }),
      });
    } catch (error) {
      // A clip that the sheet's own shape check accepts can still be rejected
      // by `Sound` - only it knows the buffer duration. From a sidecar that is
      // a content failure, not a caller mistake.
      if (sidecar === null) throw error;

      const message = error instanceof Error ? error.message : String(error);

      throw new AssetDecodeError({ message: `Invalid sound sprite sheet "${sidecar}": ${message}`, assetType: 'sound', cause: error });
    }
  }
}
