import type { AssetBinding, AssetHandler, AssetLoadRequest } from '#extensions/Extension';

import type { AssetConstructor } from './AssetConstructor';
import type { AssetFactory, AssetFactoryContext } from './AssetFactory';
import type { AssetSourceCodec, SourceCodecContext } from './AssetSourceCodec';
import type { AnyAssetType } from './AssetType';
import type { AssetLoaderContext, Loader } from './Loader';

/**
 * An {@link AssetBinding} that also names the stable identity its resource keys
 * use. Only bindings minted for an {@link AssetType} carry one.
 * @internal
 */
export type IdentifiedAssetBinding = AssetBinding & { readonly typeIdentity: string };

/**
 * A dispatch token for an installed {@link AssetType}.
 *
 * The loader's residency, claims and diagnostics are keyed by a constructor, so
 * a type that brings none is given one at install time. The token is
 * loader-local and carries no behaviour: the identity that survives a reload is
 * the type's own `id`, which the registry records alongside it.
 */
function createTypeToken(id: string): AssetConstructor {
  const token = class {};

  // The token appears verbatim in loader diagnostics; an anonymous class would
  // report every dynamic type under the same empty name.
  Object.defineProperty(token, 'name', { value: id, configurable: true });

  return token;
}

/** The context a factory sees, assembled from what the loader already resolved for this request. */
function factoryContext(context: AssetLoaderContext, options: unknown): AssetFactoryContext<unknown> {
  return {
    options,
    signal: context.signal,
    locator: context.locator,
    resourceKey: context.resourceKey,
    sourceKey: context.sourceKey,
    // A `LoaderScope` is structurally wider than the dependency seam; the
    // narrowing is what keeps release and teardown of the parent's scope out of
    // a factory's reach.
    dependencies: context.scope,
  };
}

/**
 * Drive one load through the type's own three steps: acquire a representation,
 * read it back as source, build the resource.
 */
function createAssetTypeHandler(assetType: AnyAssetType, loader: Loader): AssetHandler {
  const codec: AssetSourceCodec<unknown, unknown> = assetType.codec;
  const fromBytes = codec.fromBytes?.bind(codec);
  const factory: AssetFactory<unknown, unknown, unknown> = assetType.createFactory();
  const resourceIdentity = assetType.resourceIdentity?.bind(assetType);
  const sourceIdentity = assetType.sourceIdentity?.bind(assetType);

  const codecContext = (context: AssetLoaderContext, source: string): SourceCodecContext => ({
    locator: context.resolveUrl(source),
    signal: context.signal,
  });

  return {
    ...(resourceIdentity && { getIdentityDiscriminator: (request: AssetLoadRequest) => resourceIdentity(request) }),
    ...(sourceIdentity && { getSourceIdentity: (request: AssetLoadRequest) => sourceIdentity(request) }),

    async load({ source, options }: AssetLoadRequest, context: AssetLoaderContext): Promise<unknown> {
      const forCodec = codecContext(context, source);
      // The representation the codec reads off the response is what a cache gets
      // to keep, so it is acquired through the loader's own policy rather than
      // decoded first and handed over afterwards.
      const stored = await loader._fetchRepresentation(source, response => codec.fromResponse(response, forCodec), assetType.id, context.signal);

      return factory.create(await codec.decode(stored, forCodec), factoryContext(context, options));
    },

    ...(fromBytes && {
      async createFromBytes(bytes: ArrayBuffer, options: unknown, context: AssetLoaderContext): Promise<unknown> {
        const forCodec: SourceCodecContext = { locator: context.locator, signal: context.signal };
        const stored = await fromBytes(bytes, forCodec);

        return factory.create(await codec.decode(stored, forCodec), factoryContext(context, options));
      },
    }),

    ...(factory.dispose && { dispose: (resource: unknown) => factory.dispose?.(resource) }),
    ...(factory.destroy && { destroy: () => factory.destroy?.() }),
  };
}

/**
 * Adapt a first-class {@link AssetType} to the binding shape the loader
 * installs, so both kinds of asset entry go through one install path with one
 * set of conflict checks.
 *
 * The type's `id` becomes its dispatch name, its resource-key identity and its
 * storage namespace at once - three places that must agree, and would drift if
 * each were named separately.
 * @internal
 */
export function assetTypeBinding(assetType: AnyAssetType): IdentifiedAssetBinding {
  if (typeof assetType.id !== 'string' || assetType.id.length === 0) {
    throw new Error(`AssetType: "id" must be a non-empty string, got ${JSON.stringify(assetType.id)}.`);
  }

  return {
    ctor: createTypeToken(assetType.id),
    type: assetType.id,
    typeNames: [assetType.id],
    typeIdentity: assetType.id,
    extensions: assetType.extensions,
    storageName: assetType.id,
    create: (loader: Loader) => createAssetTypeHandler(assetType, loader),
  };
}
