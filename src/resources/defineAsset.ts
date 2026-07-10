import type { AssetBinding, AssetHandler } from '#extensions/Extension';

import type { AssetDefinitions } from './AssetDefinitions';
import { registerAssetKind } from './assetKindRegistry';
import { registerExtensionKind } from './extensionKindRegistry';
import type { AssetConstructor } from './FactoryRegistry';
import type { Loader } from './Loader';
import type { SeamlessAdapter } from './seamless';

/**
 * One descriptor for a built-in asset type. Feeds three consumers from a single
 * source: the per-Loader {@link AssetBinding} returned for `materializeAssetBindings`,
 * the global kind→placeholder strategy, and the global suffix→kind inference.
 * @advanced
 */
export interface DefineAssetDescriptor<Result, Options> {
  /** The runtime constructor the produced asset is an instance of. */
  readonly type: AssetConstructor<Result>;
  /** The {@link AssetDefinitions} key this type registers under. */
  readonly kind: keyof AssetDefinitions;
  /** File suffixes that map to this type. Feeds the per-loader map and — for a leaf-capable kind — global bare-path inference. */
  readonly extensions?: readonly string[];
  /**
   * Config-map type names resolving to this handler. Defaults to `[kind]`.
   * @internal — internal alias-compat only; not part of the public extension
   * surface (extensions should rely on `kind`).
   */
  readonly typeNames?: readonly string[];
  /** Seamless placeholder adapter for a resource kind that heals in place. */
  readonly seamless?: SeamlessAdapter<Result>;
  /** Whether the catalog leaf is a deferred `AssetRef` (value kind). Defaults to `seamless === undefined`. */
  readonly isValue?: boolean;
  /** Loader-local handler factory, called once per Loader by `materializeAssetBindings`. */
  readonly create: (loader: Loader) => AssetHandler<Result, Options>;
}

/**
 * Declare a built-in asset type in one place. For a **leaf-capable** kind — one
 * with a {@link SeamlessAdapter} (resource) or `isValue: true` (value) — this
 * registers its placeholder strategy and suffix→kind inference GLOBALLY at import
 * time, so a loader-free `Assets.from` resolves it before any Application exists.
 *
 * A **non-leaf** resource kind (`isValue: false` and no adapter — e.g. `bmFont`,
 * `font`) has no placeholder strategy, so it is deliberately NOT registered
 * globally: its bare path cannot be inferred and must be declared via `Asset.kind(...)`
 * or an explicit config. Its `extensions` still travel on the returned binding
 * for the per-Loader map.
 *
 * The returned {@link AssetBinding} flows through the unchanged
 * `materializeAssetBindings` path exactly like any extension package's binding —
 * `defineAsset` adds no second per-loader registration channel.
 * @advanced
 */
export function defineAsset<Result = unknown, Options = undefined>(descriptor: DefineAssetDescriptor<Result, Options>): AssetBinding<Result, Options> {
  const isValue = descriptor.isValue ?? descriptor.seamless === undefined;
  const leafCapable = descriptor.seamless !== undefined || isValue;

  if (leafCapable) {
    registerAssetKind(descriptor.kind, {
      ...(descriptor.seamless !== undefined && { adapter: descriptor.seamless }),
      isValue,
    });
    for (const ext of descriptor.extensions ?? []) {
      registerExtensionKind(ext, descriptor.kind);
    }
  }

  return {
    type: descriptor.type,
    kind: descriptor.kind,
    typeNames: descriptor.typeNames ?? [descriptor.kind],
    ...(descriptor.extensions !== undefined && { extensions: descriptor.extensions }),
    ...(descriptor.seamless !== undefined && { seamless: descriptor.seamless }),
    create: descriptor.create,
  };
}
