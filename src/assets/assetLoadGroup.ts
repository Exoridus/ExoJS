import type { Asset } from './Asset';
import type { AssetConstructor } from './AssetConstructor';
import type { AssetDefinitions, KindByPath, ResourceForKind } from './AssetDefinitions';
import type { CatalogLeafBrand } from './assetMeta';

/** A path-backed asset handle or a catalog leaf with a loader-owned readiness promise. */
export interface AssetLoadHandle {
  readonly loaded: PromiseLike<unknown>;
}

/**
 * An explicitly typed request: the class an installed asset type produces, the
 * source, and that type's options.
 *
 * Use it where a path's suffix does not name the type (`.mp4`, a computed path,
 * a custom format), or where a request needs options.
 *
 * @example
 * ```ts
 * const { intro, palette } = await this.assets.load({
 *   intro: [Video, 'video/intro.mp4'],
 *   palette: [Palette, 'palettes/sunset.json'],
 * });
 * ```
 */
export type AssetTypeRequest<T = unknown> = readonly [type: AssetConstructor<T>, source: string, options?: object];

/**
 * Direct typed input for an application asset factory. A source can be a path,
 * an arbitrary value (passed to the factory without fetching), or omitted.
 * Every other property becomes a factory option. The object identity scopes
 * pathless/non-string requests until it is released.
 */
export type AssetObjectRequest<T = unknown> = Readonly<{ type: AssetConstructor<T> | string; source?: unknown } & Record<string, unknown>>;

/** One entry of a load: a path, a handle, descriptor, typed object or legacy tuple request. */
export type AssetLoadEntry = string | AssetLoadHandle | CatalogLeafBrand<unknown> | Asset<unknown> | AssetTypeRequest | AssetObjectRequest;

/** A single entry, or an array, tuple or named object of entries whose shape a load preserves. */
export type AssetLoadInput = AssetLoadEntry | readonly AssetLoadEntry[] | Readonly<Record<string, AssetLoadEntry>>;

/** The value one {@link AssetLoadEntry} resolves to. */
export type LoadedAssetEntry<E> = E extends string
  ? [KindByPath<E>] extends [never]
    ? unknown
    : ResourceForKind<KindByPath<E>>
  : E extends AssetTypeRequest<infer T>
    ? T
    : E extends { readonly type: infer Type extends AssetConstructor }
      ? InstanceType<Type>
      : E extends { readonly type: infer Kind extends keyof AssetDefinitions }
        ? AssetDefinitions[Kind]['resource']
        : E extends Asset<infer T>
          ? T
          : E extends CatalogLeafBrand<infer T>
            ? T
            : E extends AssetLoadHandle
              ? Awaited<E['loaded']>
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
  `ExoJS: no asset type claims the suffix of "${S}". Name its type explicitly, for example [Video, "${S}"].`;

type ValidatedEntry<E> = E extends string ? (string extends E ? E : [KindByPath<E>] extends [never] ? UnclaimedAssetPath<E> : E) : E;

/** {@link AssetLoadInput} with every literal path checked against the registered suffixes. */
export type ValidatedAssetLoadInput<Input> = Input extends AssetLoadEntry
  ? ValidatedEntry<Input>
  : { readonly [Key in keyof Input]: ValidatedEntry<Input[Key]> };
