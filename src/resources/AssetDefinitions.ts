import type { Music } from '@/audio/Music';
import type { Sound } from '@/audio/Sound';
import type { Texture } from '@/rendering/texture/Texture';

import type { Asset } from './Asset';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AssetDefinitions {
  texture: { resource: Texture; config: { source: string } };
  sound:   { resource: Sound;   config: { source: string } };
  music:   { resource: Music;   config: { source: string } };
  json:    { resource: unknown; config: { source: string } };
}

export type AnyAssetConfig = {
  [K in keyof AssetDefinitions]: { type: K } & AssetDefinitions[K]['config'];
}[keyof AssetDefinitions];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AssetInput = AnyAssetConfig | Asset<any>;

export type InferAssetResource<I extends AssetInput> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  I extends Asset<infer T> ? T :
  I extends { type: infer K extends keyof AssetDefinitions } ? AssetDefinitions[K]['resource'] : never;
