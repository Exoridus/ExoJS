import type { AnyAssetConfig, AssetTypeName } from './AssetDefinitions';
import type { AssetRef } from './AssetRef';

/** Descriptor metadata stamped onto a handle-hybrid catalog leaf. */
export interface AssetMeta {
  /** The id of the type that minted the leaf: a built-in key, or a type an application installed of its own. */
  readonly kind: AssetTypeName;
  readonly src: string;
  readonly opts?: unknown;
}

/** Symbol under which {@link AssetMeta} rides on a handle-hybrid leaf. */
export const _assetMeta: unique symbol = Symbol('exo.assetMeta');

/**
 * The type-level mirror of the runtime `_assetMeta` stamp: what makes an object
 * a MATERIALIZED catalog leaf rather than a bare resource that happens to have
 * the same shape.
 *
 * `_resolvedType` is a phantom - never written at runtime, and `AssetMeta`
 * itself is unchanged. It exists so an overload can recover the payload a leaf
 * resolves to: a naked type parameter inside an intersection is skipped for
 * inference, so `T & CatalogLeafBrand<T>` infers `T` from THIS field alone and
 * yields the plain resource (`Texture`), not the branded leaf type.
 */
export interface CatalogLeafBrand<T> {
  readonly [_assetMeta]: AssetMeta & { readonly _resolvedType?: T };
}

/**
 * A resource type's catalog leaf: the heal-in-place placeholder resource itself
 * (`Texture`, `Sound`, ...), branded. Stays assignable to the bare resource, so
 * `const texture: Texture = bag.player` keeps working.
 */
export type CatalogResourceLeaf<T> = T & CatalogLeafBrand<T>;

/**
 * A value type's catalog leaf: a deferred {@link AssetRef}, branded with the
 * DECODED payload type - which is what loading it resolves to.
 */
export type CatalogValueLeaf<T> = AssetRef<T> & CatalogLeafBrand<T>;

/** Any materialized catalog leaf, whatever it resolves to. @internal */
export type AnyCatalogLeaf = CatalogLeafBrand<unknown>;

/** What stamping `T` produces: an `AssetRef` leaf resolves to its payload, a resource leaf to itself. */
type LeafPayloadOf<T> = T extends AssetRef<infer V> ? V : T;

/**
 * Stamp {@link AssetMeta} onto a handle (non-enumerable); returns the handle,
 * typed as the branded leaf it has just become.
 *
 * The stamp is intentionally immutable (non-configurable, non-writable): a leaf's
 * asset meta never changes after creation, so no task re-stamps it.
 *
 * @internal
 */
export const _stampMeta = <T extends object>(target: T, meta: AssetMeta): T & CatalogLeafBrand<LeafPayloadOf<T>> => {
  Object.defineProperty(target, _assetMeta, { value: meta, enumerable: false, configurable: false, writable: false });
  return target as T & CatalogLeafBrand<LeafPayloadOf<T>>;
};

/** Read the {@link AssetMeta} off a value, or `undefined` if not stamped. @internal */
export const _readMeta = (value: unknown): AssetMeta | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as { [_assetMeta]?: AssetMeta })[_assetMeta];
};

/** Option keys a descriptor's request owns; an option bag may not set them. */
const RESERVED_OPTION_KEYS = ['type', 'source'] as const;

/**
 * Build a descriptor's request config from its type, source and option bag.
 *
 * The request identity is never taken from the option bag: an option object
 * typed loosely enough to carry `type` or `source` - an `object` variable,
 * untyped JSON - would otherwise silently redirect the request to another type
 * or file. Such a bag throws instead, and every other option passes through
 * unchanged.
 * @internal
 */
export const _requestConfig = (type: string, source: string, options: unknown): AnyAssetConfig => {
  if (options === undefined || options === null) {
    return { type, source } as unknown as AnyAssetConfig;
  }

  if (typeof options !== 'object') {
    throw new TypeError(`Asset "${source}" (${type}): options must be an object, got ${typeof options}.`);
  }

  for (const key of RESERVED_OPTION_KEYS) {
    if (Object.hasOwn(options, key)) {
      throw new TypeError(
        `Asset "${source}" (${type}): "${key}" is reserved for the request and cannot be passed as an option. ` +
          'Name the asset type and source through the descriptor arguments instead.',
      );
    }
  }

  return { ...options, type, source } as unknown as AnyAssetConfig;
};
