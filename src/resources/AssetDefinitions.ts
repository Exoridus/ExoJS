import type { AudioStream } from '#audio/AudioStream';
import type { AudioSpriteClip } from '#audio/Sound';
import type { Sound } from '#audio/Sound';
import type { PlaybackOptions, StreamingLoadEvent } from '#core/types';
import type { BmFont } from '#rendering/text/BmFont';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import type { Texture } from '#rendering/texture/Texture';
import type { Video } from '#rendering/video/Video';

import type { Asset } from './Asset';

export interface AssetDefinitions {
  bmFont: { resource: BmFont; config: { source: string } };
  texture: { resource: Texture; config: { source: string; mimeType?: string; samplerOptions?: SamplerOptions } };
  sound: {
    resource: Sound;
    config: { source: string; playbackOptions?: Partial<PlaybackOptions>; poolSize?: number; sprites?: Readonly<Record<string, AudioSpriteClip>> };
  };
  music: {
    resource: AudioStream;
    config: { source: string; mimeType?: string; loadEvent?: StreamingLoadEvent; playbackOptions?: Partial<PlaybackOptions>; stallTimeout?: number };
  };
  json: { resource: unknown; config: { source: string } };
  image: { resource: HTMLImageElement; config: { source: string; mimeType?: string } };
  video: {
    resource: Video;
    config: {
      source: string;
      mimeType?: string;
      loadEvent?: StreamingLoadEvent;
      playbackOptions?: Partial<PlaybackOptions>;
      samplerOptions?: Partial<SamplerOptions>;
      stallTimeout?: number;
    };
  };
  svg: { resource: HTMLImageElement; config: { source: string; width?: number; height?: number } };
  text: { resource: string; config: { source: string } };
  font: { resource: FontFace; config: { source: string; family: string; descriptors?: FontFaceDescriptors; addToDocument?: boolean } };
  binary: { resource: ArrayBuffer; config: { source: string } };
  vtt: { resource: VTTCue[]; config: { source: string } };
  wasm: { resource: WebAssembly.Module; config: { source: string } };
  xml: { resource: Document; config: { source: string } };
  csv: { resource: string[][]; config: { source: string; delimiter?: string } };
  srt: { resource: VTTCue[]; config: { source: string } };
}

export type AnyAssetConfig = {
  [K in keyof AssetDefinitions]: { type: K } & AssetDefinitions[K]['config'];
}[keyof AssetDefinitions];

/**
 * Kinds whose catalog leaf is a deferred {@link AssetRef} rather than a
 * heal-in-place resource handle. This is the type-level mirror of the
 * `isValue: true` registrations in `seamless.ts` — keep the two in sync.
 *
 * A structural `R extends object` heuristic cannot classify these, because
 * several value resources (`Document`, `VTTCue[]`, `ArrayBuffer`,
 * `WebAssembly.Module`) are object types; only an explicit kind list is correct.
 */
export type ValueAssetKind = 'json' | 'text' | 'csv' | 'xml' | 'srt' | 'vtt' | 'binary' | 'wasm';

export type AssetInput = AnyAssetConfig | Asset<unknown>;

export type InferAssetResource<I extends AssetInput> =
  I extends Asset<infer T> ? T : I extends { type: infer K extends keyof AssetDefinitions } ? AssetDefinitions[K]['resource'] : never;
