import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import { AssetType } from '#assets/AssetType';
import { type SoundAssetOptions, SoundFactory } from '#assets/factories/SoundFactory';
import { soundSeamlessAdapter } from '#assets/seamless';
import { Sound } from '#audio/Sound';

/** Short audio clips, fully decoded for low-latency playback. */
export class SoundAssetType extends AssetType<ArrayBuffer, Sound, SoundAssetOptions> {
  public readonly id = 'sound';
  public override readonly extensions = ['ogg', 'mp3', 'wav', 'm4a', 'aac'];
  public override readonly leaf = soundSeamlessAdapter;
  public override readonly _token: AssetConstructor = Sound;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  public createFactory(): AssetFactory<ArrayBuffer, Sound, SoundAssetOptions> {
    return new SoundFactory();
  }
}

/** The built-in `sound` asset type. */
export const soundType = new SoundAssetType();
