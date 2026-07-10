import type { AudioStream } from '#audio/AudioStream';
import type { AudioSpriteClip } from '#audio/Sound';
import type { Sound } from '#audio/Sound';
import type { PlaybackOptions, StreamingLoadEvent } from '#core/types';
import type { BmFont } from '#rendering/text/BmFont';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import type { Texture } from '#rendering/texture/Texture';
import type { Video } from '#rendering/video/Video';

import type { Asset, ValueAsset } from './Asset';
import type { AssetRef } from './AssetRef';
import type { ExtensionTypeMap } from './Loader';

export interface AssetDefinitions {
  bmFont: { resource: BmFont; config: { source: string } };
  texture: { resource: Texture; config: { source: string; mimeType?: string; samplerOptions?: Partial<SamplerOptions> } };
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
  [K in keyof AssetDefinitions]: { kind: K } & AssetDefinitions[K]['config'] &
    // `parse` is a value-kind-only post-load transform (delta §4/§5).
    (K extends ValueAssetKind ? { parse?: (raw: AssetDefinitions[K]['resource']) => unknown } : object);
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
  I extends Asset<infer T>
    ? T
    : I extends { parse: (raw: never) => infer R }
      ? R
      : I extends { kind: infer K extends keyof AssetDefinitions }
        ? AssetDefinitions[K]['resource']
        : never;

// ---------------------------------------------------------------------------
// Type-level bare-path inference (mirror of the runtime extensionKindRegistry)
// ---------------------------------------------------------------------------

/**
 * Type-level twin of the runtime `extensionKindRegistry`: file suffix → asset
 * kind, for bare-string path inference in `Assets.from()`/`get()`/`load()`
 * (asset-system v2 §5). Restricted to LEAF-CAPABLE kinds, exactly mirroring the
 * runtime `registerExtensionKind` calls in `seamless.ts`. Extend by declaration
 * merging, like {@link ExtensionTypeMap}:
 * ```ts
 * declare module '@codexo/exojs' {
 *   interface ExtensionKindMap { 'atlas.json': 'spriteAtlas'; }
 * }
 * ```
 */
export interface ExtensionKindMap {
  png: 'texture';
  jpg: 'texture';
  jpeg: 'texture';
  webp: 'texture';
  avif: 'texture';
  gif: 'texture';
  ogg: 'sound';
  mp3: 'sound';
  wav: 'sound';
  m4a: 'sound';
  aac: 'sound';
  json: 'json';
  txt: 'text';
  csv: 'csv';
  xml: 'xml';
  vtt: 'vtt';
  srt: 'srt';
  bin: 'binary';
  wasm: 'wasm';
}

/** Last path segment (after the final `/`). */
type KindBasename<S extends string> = S extends `${string}/${infer R}` ? KindBasename<R> : S;
/** Strip a trailing `?query`/`#fragment`. */
type KindStripQuery<S extends string> = S extends `${infer P}?${string}` ? P : S extends `${infer P}#${string}` ? P : S;
/** Longest registered dot-suffix of a basename, or `never`. */
type MatchKind<S extends string> = S extends `${string}.${infer Rest}`
  ? Lowercase<Rest> extends keyof ExtensionKindMap
    ? ExtensionKindMap[Lowercase<Rest>]
    : MatchKind<Rest>
  : never;

/** The asset kind inferred from a path literal, or `never` when unregistered. */
export type KindByPath<S extends string> = MatchKind<KindBasename<KindStripQuery<S>>>;

/** The resource type of a kind. */
export type ResourceForKind<K extends keyof AssetDefinitions> = AssetDefinitions[K]['resource'];

/** The per-kind option bag: that kind's config minus the `source` field. */
export type OptionsForKind<K extends keyof AssetDefinitions> = Omit<AssetDefinitions[K]['config'], 'source'>;

/**
 * The handle-hybrid leaf type a bare path string materializes as: a resource
 * kind yields its resource (`Texture`/`Sound`), a {@link ValueAssetKind} yields
 * a deferred `AssetRef<resource>`. `unknown` when the suffix is unregistered.
 */
export type LeafForPath<S extends string> = [KindByPath<S>] extends [never]
  ? unknown
  : KindByPath<S> extends ValueAssetKind
    ? AssetRef<ResourceForKind<KindByPath<S>>>
    : ResourceForKind<KindByPath<S>>;

/** A single catalog field input: a bare path string, an `Asset.kind(...)` descriptor, or an explicit config. */
export type CatalogEntry = string | Asset<unknown> | AnyAssetConfig;

/**
 * The leaf type a {@link CatalogEntry} materializes as. A {@link ValueAsset}
 * brand (from `Asset.kind<T>('json', …)`) classifies as `AssetRef<T>` FIRST,
 * before the `T extends object` heuristic that (only) the unbranded legacy
 * `Asset.kind(...)` descriptors still rely on.
 */
export type InferCatalogLeaf<E extends CatalogEntry> = E extends string
  ? LeafForPath<E>
  : E extends ValueAsset<infer V>
    ? AssetRef<V>
    : E extends Asset<infer T>
      ? T extends object
        ? T
        : AssetRef<T>
      : E extends { kind: infer K extends keyof AssetDefinitions }
        ? E extends { parse: (raw: never) => infer R }
          ? K extends ValueAssetKind
            ? AssetRef<R>
            : AssetDefinitions[K]['resource']
          : K extends ValueAssetKind
            ? AssetRef<AssetDefinitions[K]['resource']>
            : AssetDefinitions[K]['resource']
        : never;

// Compile-time guard: every ExtensionKindMap value is a real AssetDefinitions kind.
type AssertKindMapValid = ExtensionKindMap[keyof ExtensionKindMap] extends keyof AssetDefinitions ? true : never;
const _extensionKindMapIsValid: AssertKindMapValid = true;
void _extensionKindMapIsValid;

// Compile-time cross-check: {@link ExtensionKindMap} (suffix→kind, this file) and
// {@link ExtensionTypeMap} (suffix→resource, Loader.ts) are hand-maintained twins
// of one runtime `defineAsset` binding. On every suffix they SHARE, the kind's
// resource must be the type map's resource — otherwise `Assets.from('x.png')`
// (kind-driven) and `loader.load('x.png')` (type-driven) would disagree. A drift
// (e.g. mapping `png` to a non-Texture kind in one map only) turns the offending
// entry to `false` and fails this assignment.
type SharedSuffix = keyof ExtensionKindMap & keyof ExtensionTypeMap;
type KindResourceForSuffix<K extends SharedSuffix> = AssetDefinitions[ExtensionKindMap[K]]['resource'];
type KindTypeAgreement = {
  [K in SharedSuffix]: [KindResourceForSuffix<K>, ExtensionTypeMap[K]] extends [ExtensionTypeMap[K], KindResourceForSuffix<K>] ? true : false;
};
type AssertKindTypeMapsAgree = KindTypeAgreement extends Record<SharedSuffix, true> ? true : never;
const _kindTypeMapsAgree: AssertKindTypeMapsAgree = true;
void _kindTypeMapsAgree;
