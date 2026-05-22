import type { AudioSpriteClip } from '@/audio/Sound';
import type { Music } from '@/audio/Music';
import type { Sound } from '@/audio/Sound';
import type { PlaybackOptions, StreamingLoadEvent } from '@/core/types';
import type { BmFont } from '@/rendering/text/BmFont';
import type { SamplerOptions } from '@/rendering/texture/Sampler';
import type { Texture } from '@/rendering/texture/Texture';
import type { Video } from '@/rendering/video/Video';

import type { Asset } from './Asset';

export interface AssetDefinitions {
  bmFont:  { resource: BmFont;            config: { source: string } };
  texture: { resource: Texture;           config: { source: string; mimeType?: string; samplerOptions?: SamplerOptions } };
  sound:   { resource: Sound;             config: { source: string; playbackOptions?: Partial<PlaybackOptions>; poolSize?: number; sprites?: Readonly<Record<string, AudioSpriteClip>> } };
  music:   { resource: Music;             config: { source: string; mimeType?: string; loadEvent?: StreamingLoadEvent; playbackOptions?: Partial<PlaybackOptions>; stallTimeout?: number } };
  json:    { resource: unknown;           config: { source: string } };
  image:   { resource: HTMLImageElement;  config: { source: string; mimeType?: string } };
  video:   { resource: Video;             config: { source: string; mimeType?: string; loadEvent?: StreamingLoadEvent; playbackOptions?: Partial<PlaybackOptions>; samplerOptions?: Partial<SamplerOptions>; stallTimeout?: number } };
  svg:     { resource: HTMLImageElement;  config: { source: string; width?: number; height?: number } };
  text:    { resource: string;            config: { source: string } };
  font:    { resource: FontFace;          config: { source: string; family: string; descriptors?: FontFaceDescriptors; addToDocument?: boolean } };
  binary:  { resource: ArrayBuffer;        config: { source: string } };
  vtt:     { resource: VTTCue[];           config: { source: string } };
  wasm:    { resource: WebAssembly.Module; config: { source: string } };
  xml:     { resource: Document;           config: { source: string } };
  csv:     { resource: string[][];         config: { source: string; delimiter?: string } };
  srt:     { resource: VTTCue[];           config: { source: string } };
}

export type AnyAssetConfig = {
  [K in keyof AssetDefinitions]: { type: K } & AssetDefinitions[K]['config'];
}[keyof AssetDefinitions];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AssetInput = AnyAssetConfig | Asset<any>;

export type InferAssetResource<I extends AssetInput> =
  I extends Asset<infer T> ? T :
  I extends { type: infer K extends keyof AssetDefinitions } ? AssetDefinitions[K]['resource'] : never;
