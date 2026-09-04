import type { AudioStream } from '#audio/AudioStream';
import type { AudioSpriteClip } from '#audio/Sound';
import type { Sound } from '#audio/Sound';
import type { MediaCrossOrigin, PlaybackOptions, StreamingLoadEvent } from '#core/types';
import type { BmFont } from '#rendering/text/BmFont';
import type { Texture } from '#rendering/texture/Texture';
import type { TextureOptions } from '#rendering/texture/TextureOptions';
import type { Video } from '#rendering/video/Video';

import type { Asset, ValueAsset } from './Asset';
import type { CatalogResourceLeaf, CatalogValueLeaf } from './assetMeta';
import type { AssetRef } from './AssetRef';

/**
 * Every built-in asset type, keyed by its id, plus whatever extension packages
 * declaration-merge into it.
 *
 * An entry declares the runtime `resource` it produces and the `config` it
 * accepts; it may also carry `isValue: true` to mirror a type whose leaf is a
 * deferred {@link AssetRef} rather than a heal-in-place handle - required for
 * every type that ships no seamless adapter (see {@link ValueAssetKind}).
 */
export interface AssetDefinitions {
  bmFont: { resource: BmFont; config: { source: string } };
  texture: { resource: Texture; config: { source: string; mimeType?: string; textureOptions?: Partial<TextureOptions> } };
  sound: {
    resource: Sound;
    config: { source: string; playbackOptions?: Partial<PlaybackOptions>; poolSize?: number; sprites?: Readonly<Record<string, AudioSpriteClip>> | string };
  };
  music: {
    resource: AudioStream;
    config: {
      source: string;
      mimeType?: string;
      crossOrigin?: MediaCrossOrigin;
      loadEvent?: StreamingLoadEvent;
      playbackOptions?: Partial<PlaybackOptions>;
      stallTimeout?: number;
    };
  };
  json: { resource: unknown; config: { source: string } };
  image: { resource: HTMLImageElement; config: { source: string; mimeType?: string } };
  video: {
    resource: Video;
    config: {
      source: string;
      mimeType?: string;
      crossOrigin?: MediaCrossOrigin;
      loadEvent?: StreamingLoadEvent;
      playbackOptions?: Partial<PlaybackOptions>;
      textureOptions?: Partial<TextureOptions>;
      stallTimeout?: number;
    };
  };
  svg: { resource: HTMLImageElement; config: { source: string; width?: number; height?: number } };
  text: { resource: string; config: { source: string } };
  font: { resource: FontFace; config: { source: string; family: string; descriptors?: FontFaceDescriptors; addToDocument?: boolean } };
  binary: { resource: ArrayBuffer; config: { source: string } };
  subtitle: { resource: VTTCue[]; config: { source: string } };
  wasm: { resource: WebAssembly.Module; config: { source: string } };
  xml: { resource: Document; config: { source: string } };
  csv: { resource: string[][]; config: { source: string; delimiter?: string } };
}

/**
 * The name a request dispatches on: a built-in {@link AssetDefinitions} key, or
 * the stable {@link AssetType.id} of a type installed on this application.
 *
 * The open half is what lets an application install a fully typed custom asset
 * type without declaring it to the module system first; the literal half keeps
 * the built-in keys autocompleting.
 */
export type AssetTypeName = keyof AssetDefinitions | (string & {});

export type AnyAssetConfig = {
  [K in keyof AssetDefinitions]: { type: K } & AssetDefinitions[K]['config'] &
    // `parse` is a value-type-only, SYNCHRONOUS post-load transform:
    // it maps the decoded raw value and may not return a Promise (async parse is a
    // follow-up - it would need the fill/store flow to await).
    (K extends ValueAssetKind ? { parse?: (raw: AssetDefinitions[K]['resource']) => unknown } : object);
}[keyof AssetDefinitions];

/**
 * The built-in types whose catalog leaf is a deferred {@link AssetRef} rather
 * than a heal-in-place resource handle - the type-level mirror of the built-in
 * types whose `leaf` is `'ref'`.
 *
 * A structural `R extends object` heuristic cannot classify these, because
 * several value resources (`Document`, `VTTCue[]`, `ArrayBuffer`,
 * `WebAssembly.Module`) are object types; only an explicit type list is correct.
 */
export type CoreValueAssetKind = 'json' | 'text' | 'csv' | 'xml' | 'subtitle' | 'binary' | 'wasm';

/**
 * Types that a declaration-merged {@link AssetDefinitions} entry marks as value
 * types with `isValue: true`.
 *
 * A type decides this at RUNTIME through its `leaf`, which defaults to `'ref'`
 * - the common case for a package type like `tileMap` or `ldtkMap`. The type
 * system cannot see a runtime leaf strategy, so an extension package whose type
 * hands out an `AssetRef` must say so here, or `get(...)` would be typed as the
 * bare resource while returning an `AssetRef` wrapper at runtime.
 *
 * ```ts
 * declare module '@codexo/exojs' {
 *   interface AssetDefinitions {
 *     tileMap: { resource: TileMap; config: { source: string }; isValue: true };
 *   }
 * }
 * ```
 */
type DeclaredValueAssetKind = {
  [K in keyof AssetDefinitions]: AssetDefinitions[K] extends { isValue: true } ? K : never;
}[keyof AssetDefinitions];

/**
 * Types whose catalog leaf is a deferred {@link AssetRef}: the built-in
 * {@link CoreValueAssetKind}s plus every declaration-merged type that opts in
 * with `isValue: true`.
 */
// `DeclaredValueAssetKind` collapses to `never` in a build that sees no
// declaration-merged entries (the engine's own `tsc --noEmit`, which compiles
// `src/` alone), which is exactly when the union member is redundant - but it is
// load-bearing for any consumer build that DOES see a package augmentation.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ValueAssetKind = CoreValueAssetKind | DeclaredValueAssetKind;

export type AssetInput = AnyAssetConfig | Asset<unknown>;

export type InferAssetResource<I extends AssetInput> =
  I extends Asset<infer T>
    ? T
    : I extends { parse: (raw: never) => infer R }
      ? R
      : I extends { type: infer K extends keyof AssetDefinitions }
        ? AssetDefinitions[K]['resource']
        : never;

// ---------------------------------------------------------------------------
// Type-level bare-path inference (mirror of the runtime built-in suffix table)
// ---------------------------------------------------------------------------

/**
 * Type-level twin of the built-in suffix table: file suffix to asset type, for
 * bare-string path inference in `Assets.from()`/`get()`/`load()`. Restricted to
 * types that hand out a catalog leaf, exactly mirroring the runtime table built
 * from the built-in types' own `extensions`. This is the single
 * declaration-merging surface for bare-path suffix inference:
 * ```ts
 * declare module '@codexo/exojs' {
 *   interface ExtensionKindMap { 'atlas.json': 'spriteAtlas'; }
 * }
 * ```
 */
export interface ExtensionKindMap {
  png: 'texture';
  apng: 'texture';
  jpg: 'texture';
  jpeg: 'texture';
  jpe: 'texture';
  jfif: 'texture';
  webp: 'texture';
  avif: 'texture';
  avifs: 'texture';
  gif: 'texture';
  bmp: 'texture';
  ico: 'texture';
  ktx2: 'texture';
  ogg: 'sound';
  mp3: 'sound';
  wav: 'sound';
  m4a: 'sound';
  aac: 'sound';
  json: 'json';
  txt: 'text';
  csv: 'csv';
  xml: 'xml';
  vtt: 'subtitle';
  srt: 'subtitle';
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

/** The asset type inferred from a path literal, or `never` when unregistered. */
export type KindByPath<S extends string> = MatchKind<KindBasename<KindStripQuery<S>>>;

/** The resource type of an asset type. */
export type ResourceForKind<K extends keyof AssetDefinitions> = AssetDefinitions[K]['resource'];

/**
 * The leaf type an asset type materializes as inside a CATALOG: a value type
 * yields a branded `AssetRef` over its resource, a resource type the branded
 * placeholder resource itself.
 *
 * The brand is what the loader's single-leaf overloads match on - it mirrors the
 * runtime `_assetMeta` stamp `createLeaf` applies, so a raw `new Texture()` (or
 * an `AudioStream`, a `BmFont`, ...) is correctly rejected where a materialized
 * leaf is required.
 *
 * Deliberately NOT the type of a bare-path `loader.get(path)` result (that is
 * {@link LeafForPath}): the bare-path branch resolves through the source-keyed
 * dedup rather than `createLeaf`, so a freshly minted handle there carries no
 * stamp - and claiming otherwise would let `load(loader.get('x.png'))` compile
 * into the record fallback at runtime.
 */
export type CatalogLeafForKind<K extends keyof AssetDefinitions> = K extends ValueAssetKind
  ? CatalogValueLeaf<ResourceForKind<K>>
  : CatalogResourceLeaf<ResourceForKind<K>>;

/** The per-type option bag: that type's config minus the `source` field. */
export type OptionsForKind<K extends keyof AssetDefinitions> = Omit<AssetDefinitions[K]['config'], 'source'>;

/**
 * The handle-hybrid type a bare path resolves to through `loader.get(path)`: a
 * resource type yields its resource (`Texture`/`Sound`), a
 * {@link ValueAssetKind} a deferred `AssetRef<resource>`. `unknown` when the
 * suffix is unregistered.
 *
 * Unbranded on purpose - see {@link CatalogLeafForKind}. The CATALOG twin (what
 * `Assets.from({ ship: 'ship.png' }).ship` is) is {@link CatalogLeafForPath}.
 */
export type LeafForPath<S extends string> = [KindByPath<S>] extends [never]
  ? unknown
  : KindByPath<S> extends ValueAssetKind
    ? AssetRef<ResourceForKind<KindByPath<S>>>
    : ResourceForKind<KindByPath<S>>;

/** {@link LeafForPath}, branded - the leaf a bare path materializes as inside a catalog. */
export type CatalogLeafForPath<S extends string> = [KindByPath<S>] extends [never] ? unknown : CatalogLeafForKind<KindByPath<S>>;

/** A single catalog field input: a bare path string, an `Asset.type(...)` descriptor, or an explicit config. */
export type CatalogEntry = string | Asset<unknown> | AnyAssetConfig;

/**
 * The diagnostic a bare path with an unregistered suffix turns into at the
 * catalog literal. The failure branch IS the message: the offending string is
 * not assignable to it, so the error names the path and the way out.
 */
export type UnrecognisedAssetSuffix<S extends string> =
  `ExoJS: no built-in asset type claims the suffix of "${S}". Name it with Asset.type(...) or use a compound suffix.`;

/**
 * A catalog entry checked at the literal: a bare path keeps its type when its
 * suffix resolves to a registered asset type and becomes
 * {@link UnrecognisedAssetSuffix} when it does not. Non-literal strings pass
 * through untouched, so a path that only exists at runtime is still accepted.
 */
export type ValidatedCatalogEntry<E extends CatalogEntry> = E extends string
  ? string extends E
    ? E
    : [KindByPath<E>] extends [never]
      ? UnrecognisedAssetSuffix<E>
      : E
  : E;

/** {@link ValidatedCatalogEntry} applied to every field of a catalog literal. */
export type ValidatedCatalog<M extends Record<string, CatalogEntry>> = { readonly [K in keyof M]: ValidatedCatalogEntry<M[K]> };

/**
 * The leaf type a {@link CatalogEntry} materializes as - always BRANDED (see
 * {@link LeafForKind}), because every one of these is produced by `createLeaf`
 * and therefore carries the runtime `_assetMeta` stamp. A {@link ValueAsset}
 * brand (from `Asset.type<T>('json', ...)`) classifies as `AssetRef<T>` FIRST,
 * before the `T extends object` heuristic that (only) the unbranded legacy
 * `Asset.type(...)` descriptors still rely on.
 */
export type InferCatalogLeaf<E extends CatalogEntry> = E extends string
  ? CatalogLeafForPath<E>
  : E extends ValueAsset<infer V>
    ? CatalogValueLeaf<V>
    : E extends Asset<infer T>
      ? T extends object
        ? CatalogResourceLeaf<T>
        : CatalogValueLeaf<T>
      : E extends { type: infer K extends keyof AssetDefinitions }
        ? E extends { parse: (raw: never) => infer R }
          ? K extends ValueAssetKind
            ? CatalogValueLeaf<R>
            : CatalogResourceLeaf<AssetDefinitions[K]['resource']>
          : CatalogLeafForKind<K>
        : never;

/**
 * The LOADED payload a {@link CatalogEntry} resolves to - what a
 * `loader.load(catalog)` result map holds, as opposed to the handle-hybrid leaf
 * {@link InferCatalogLeaf} materializes on the catalog itself.
 *
 * A bare path string is classified by its file suffix exactly as
 * {@link LeafForPath} does, but resolves to the raw resource for every type: a
 * value type's LOAD result is its decoded value (`unknown` for `json`), not the
 * `AssetRef` wrapper its catalog property holds. Descriptors and explicit
 * configs delegate to {@link InferAssetResource} unchanged.
 */
export type InferLoadedEntry<E extends CatalogEntry> = E extends string
  ? [KindByPath<E>] extends [never]
    ? unknown
    : ResourceForKind<KindByPath<E>>
  : E extends AssetInput
    ? InferAssetResource<E>
    : never;

// Compile-time guard: every ExtensionKindMap value is a real AssetDefinitions type.
type AssertKindMapValid = ExtensionKindMap[keyof ExtensionKindMap] extends keyof AssetDefinitions ? true : never;
const _extensionKindMapIsValid: AssertKindMapValid = true;
void _extensionKindMapIsValid;
