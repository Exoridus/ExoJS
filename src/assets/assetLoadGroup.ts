import type { AnyAssetConfig, KindByPath, ResourceForKind } from './AssetDefinitions';
import type { AssetDescriptor, AssetDescriptorResource, ValidatedAssetDescriptor } from './AssetDescriptor';
import type { CatalogLeafBrand } from './assetMeta';

/** A path-backed asset handle or a catalog leaf with a loader-owned readiness promise. */
export interface AssetLoadHandle {
  readonly loaded: PromiseLike<unknown>;
}

/**
 * One entry of a load: a path, a handle, a catalog leaf or an asset descriptor.
 * The built-in descriptor shapes are listed so a literal's options are
 * contextually typed.
 */
export type AssetLoadEntry = string | AssetLoadHandle | CatalogLeafBrand<unknown> | AnyAssetConfig | AssetDescriptor;

/** A single entry, or an array, tuple or named object of entries whose shape a load preserves. Named groups reserve `type` for descriptors. */
export type AssetLoadInput = AssetLoadEntry | readonly AssetLoadEntry[] | Readonly<Record<string, AssetLoadEntry>>;

/** The value one {@link AssetLoadEntry} resolves to. */
export type LoadedAssetEntry<E> = E extends string
  ? [KindByPath<E>] extends [never]
    ? unknown
    : ResourceForKind<KindByPath<E>>
  : E extends CatalogLeafBrand<infer T>
    ? T
    : E extends AssetLoadHandle
      ? Awaited<E['loaded']>
      : E extends AssetDescriptor
        ? AssetDescriptorResource<E>
        : never;

/** Replaces each entry of an {@link AssetLoadInput} with the value loading it produces. */
export type LoadedAssets<Input> = Input extends AssetLoadEntry
  ? LoadedAssetEntry<Input>
  : { -readonly [Key in keyof Input]: LoadedAssetEntry<Input[Key]> };

/**
 * The diagnostic a literal path with an unclaimed suffix turns into. The
 * offending string is not assignable to it, so the error names the path and the
 * way out.
 */
export type UnclaimedAssetPath<S extends string> =
  `ExoJS: no asset type claims the suffix of "${S}". Name its type explicitly, for example { type: Video, source: "${S}" }.`;

type ValidatedEntry<E> = E extends string
  ? string extends E
    ? E
    : [KindByPath<E>] extends [never]
      ? UnclaimedAssetPath<E>
      : E
  : E extends CatalogLeafBrand<unknown> | AssetLoadHandle
    ? E
    : E extends AssetDescriptor
      ? ValidatedAssetDescriptor<E>
      : E;

/** {@link AssetLoadInput} with every literal path and descriptor checked against what its type accepts. */
export type ValidatedAssetLoadInput<Input> = Input extends AssetLoadEntry
  ? ValidatedEntry<Input>
  : { readonly [Key in keyof Input]: Key extends 'type' ? never : ValidatedEntry<Input[Key]> };
