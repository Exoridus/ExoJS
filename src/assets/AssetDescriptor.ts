import type { AssetConstructor } from './AssetConstructor';
import type {
  AnyAssetConfig,
  AssetDefinitions,
  AssetTypeName,
  LeaflessAssetKind,
  LeaflessCatalogEntry,
  ValueAssetKind,
} from './AssetDefinitions';
import type { CatalogResourceLeaf, CatalogValueLeaf } from './assetMeta';
import { _readMeta } from './assetMeta';
import type { AnyAssetType } from './AssetType';
import { AssetType } from './AssetType';
import type { SeamlessAdapter } from './seamless';

/**
 * What a descriptor's `type` names: the id of an installed asset type, the
 * class an installed type produces (`Texture`, `Music`, ...), or an
 * {@link AssetType} instance.
 */
export type AssetTypeReference = AssetTypeName | AssetConstructor | AnyAssetType;

/**
 * One asset, described as a plain object: its type, an optional source, and the
 * type's options as further properties.
 *
 * - A string `source` is a locator. It goes through variant selection, the base
 *   path, the cache and the network, and two descriptors with the same type,
 *   locator and identity-relevant options share one resource.
 * - Any other `source` value is handed to the type's factory as it is: nothing
 *   is fetched or cached. Descriptors sharing the same source object (or the
 *   same primitive value) share one resource.
 * - Without a `source`, the factory builds from the options alone. Such a
 *   descriptor is identified by its type's `resourceIdentity` when the type
 *   defines one, and otherwise by the descriptor object itself: release it with
 *   the same object, or release the loaded resource.
 *
 * Only a locator can be held by a catalog, handed out by `get()`, loaded at
 * background priority or saved as a portable reference.
 *
 * A plain object with an own `type` property is always read as a descriptor,
 * never as a named load group.
 *
 * @example
 * ```ts
 * await scene.load({ type: 'font', source: 'fonts/ui.woff2', family: 'UI' });
 * await scene.load({ type: Music, source: 'audio/theme.ogg', loadEvent: 'canplay' });
 * await scene.load({ type: heightFieldType, source: bytes });
 * await scene.load({ type: noiseType, seed: 7 });
 * ```
 */
export interface AssetDescriptor {
  readonly type: AssetTypeReference;
  readonly source?: unknown;
}

/** A descriptor whose source is a locator - the form a catalog, `get()` and background loading accept. */
export type LocatorAssetDescriptor = AssetDescriptor & { readonly source: string };

type IsExactly<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/** The built-in or declaration-merged asset type whose resource is exactly `R`, or `never`. */
export type KindForResource<R> = {
  [K in keyof AssetDefinitions]: IsExactly<AssetDefinitions[K]['resource'], R> extends true ? K : never;
}[keyof AssetDefinitions];

/** The {@link AssetDefinitions} entry a descriptor names, by id or by the class its type produces. */
type DescriptorKind<D> = D extends { readonly type: infer K extends keyof AssetDefinitions }
  ? K
  : D extends { readonly type: AssetConstructor<infer R> }
    ? KindForResource<R>
    : never;

/** The source, resource and option types of an {@link AssetType} instance. */
type AssetTypeParts<T> = T extends AnyAssetType ? NonNullable<T['_typeParameters']> : never;

/** The value loading a descriptor resolves to. */
export type AssetDescriptorResource<D> = D extends { readonly parse: (raw: never) => infer R }
  ? R
  : D extends { readonly type: infer T extends AnyAssetType }
    ? AssetTypeParts<T>['resource']
    : D extends { readonly type: infer K extends keyof AssetDefinitions }
      ? AssetDefinitions[K]['resource']
      : D extends { readonly type: AssetConstructor<infer R> }
        ? R
        : unknown;

type PolicyOfLeaf<Leaf> = [Leaf] extends ['none'] ? 'none' : [Leaf] extends [SeamlessAdapter<unknown>] ? 'resource' : 'ref';

/**
 * What a catalog or `get()` hands out for a descriptor: `'ref'` for a deferred
 * `AssetRef`, `'resource'` for a heal-in-place resource, `'none'` for a type
 * without a placeholder, and `'unknown'` when the type is not visible to the
 * type system (an id or class that no {@link AssetDefinitions} entry declares).
 */
export type AssetDescriptorLeafPolicy<D> = D extends { readonly type: infer T extends AnyAssetType }
  ? 0 extends 1 & AssetTypeParts<T>['resource']
    ? 'unknown'
    : PolicyOfLeaf<T['leaf']>
  : [DescriptorKind<D>] extends [never]
    ? 'unknown'
    : DescriptorKind<D> extends ValueAssetKind
      ? 'ref'
      : DescriptorKind<D> extends LeaflessAssetKind
        ? 'none'
        : 'resource';

/** The branded catalog leaf a descriptor materializes as, or `never` for a type without one. */
export type AssetDescriptorLeaf<D> =
  AssetDescriptorLeafPolicy<D> extends 'ref'
    ? CatalogValueLeaf<AssetDescriptorResource<D>>
    : AssetDescriptorLeafPolicy<D> extends 'resource'
      ? CatalogResourceLeaf<AssetDescriptorResource<D>>
      : AssetDescriptorLeafPolicy<D> extends 'none'
        ? never
        : CatalogResourceLeaf<AssetDescriptorResource<D>> | CatalogValueLeaf<AssetDescriptorResource<D>>;

/**
 * The descriptor shape an {@link AssetType} instance accepts: a locator or
 * factory source - optional only when the type's source admits `undefined` -
 * its options, and a `parse` transform for a value type. An existential
 * {@link AnyAssetType} declares no options, so its descriptor is not checked.
 */
type TypeObjectShape<T, D> = 0 extends 1 & AssetTypeParts<T>['options']
  ? D
  : { readonly type: T } & (undefined extends AssetTypeParts<T>['source']
      ? { readonly source?: string | AssetTypeParts<T>['source'] }
      : { readonly source: string | AssetTypeParts<T>['source'] }) &
      (T extends AnyAssetType
        ? PolicyOfLeaf<T['leaf']> extends 'ref'
          ? { readonly parse?: (raw: AssetTypeParts<T>['resource']) => unknown }
          : unknown
        : unknown) &
      ([AssetTypeParts<T>['options']] extends [undefined] ? unknown : AssetTypeParts<T>['options']);

/** The shape a descriptor is checked against, or the descriptor itself when its type is not visible to the type system. */
type DescriptorShape<D> = D extends { readonly type: infer T extends AnyAssetType }
  ? TypeObjectShape<T, D>
  : [DescriptorKind<D>] extends [never]
    ? D
    : D extends { readonly type: infer Type }
      ? Omit<Extract<AnyAssetConfig, { type: DescriptorKind<D> }>, 'type'> & { readonly type: Type }
      : never;

type NoExtraKeys<D, Shape> = { readonly [K in keyof D]: K extends keyof Shape ? D[K] : never };

/**
 * A descriptor checked against the shape its type accepts: a missing or
 * mistyped option, or an option the type does not take, is a compile error.
 * Descriptors whose type is not visible to the type system pass unchecked.
 */
export type ValidatedAssetDescriptor<D> = D extends DescriptorShape<D> ? NoExtraKeys<D, DescriptorShape<D>> : DescriptorShape<D>;

/**
 * {@link ValidatedAssetDescriptor} for an input that must hand out a catalog
 * leaf - a catalog field or `get()`: a type without a placeholder becomes the
 * {@link LeaflessCatalogEntry} diagnostic.
 */
export type ValidatedLeafDescriptor<D> =
  AssetDescriptorLeafPolicy<D> extends 'none'
    ? LeaflessCatalogEntry<D extends { readonly type: infer K extends string } ? K : string>
    : ValidatedAssetDescriptor<D>;

/**
 * Whether `value` is read as a descriptor: a plain object with an own `type`
 * that is a string, a constructor or an {@link AssetType}.
 * @internal
 */
export const _isAssetDescriptor = (value: unknown): value is AssetDescriptor => {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || _readMeta(value) !== undefined) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  if ((prototype !== Object.prototype && prototype !== null) || !Object.hasOwn(value, 'type')) {
    return false;
  }

  const type: unknown = (value as { type: unknown }).type;

  return typeof type === 'string' || typeof type === 'function' || type instanceof AssetType;
};

/** A descriptor taken apart into its type reference, its source and its option bag. @internal */
export interface SplitAssetDescriptor {
  readonly type: AssetTypeReference;
  /** Whether the descriptor has an own `source`; `source: undefined` counts as omitted. */
  readonly hasSource: boolean;
  readonly source: unknown;
  /** Every other own enumerable property, or `undefined` when there are none. */
  readonly options: Readonly<Record<string, unknown>> | undefined;
}

/** @internal */
export const _splitAssetDescriptor = (descriptor: AssetDescriptor): SplitAssetDescriptor => {
  const { type, source, ...rest } = descriptor as AssetDescriptor & Readonly<Record<string, unknown>>;

  return { type, hasSource: source !== undefined, source, options: Object.keys(rest).length > 0 ? rest : undefined };
};

/** How a type reference reads in a diagnostic. @internal */
export const _describeTypeReference = (type: unknown): string => {
  if (typeof type === 'string') {
    return `"${type}"`;
  }

  if (type instanceof AssetType) {
    return `"${type.id}"`;
  }

  return typeof type === 'function' && type.name !== '' ? type.name : String(type);
};
