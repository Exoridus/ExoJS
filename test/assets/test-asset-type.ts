import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { textSourceCodec } from '#assets/AssetSourceCodec';
import type { AnyAssetType, AssetLeaf, AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';

/** Everything a test wants to vary about an ad-hoc asset type, with a text codec as the default. */
export interface TestAssetTypeSpec<Source = string, Resource = unknown, Options = undefined> {
  readonly id: string;
  readonly extensions?: readonly string[];
  readonly leaf?: AssetLeaf<Resource>;
  readonly token?: AssetConstructor;
  readonly codec?: AssetSourceCodec<Source, unknown>;
  /** `false` installs a type the loader acquires nothing for, so its factory runs with no network in the path. */
  readonly acquires?: boolean;
  readonly create: (source: Source, context: AssetFactoryContext<Options>) => Promise<Resource>;
  readonly dispose?: (resource: Resource) => void;
  readonly destroy?: () => void;
  readonly resourceIdentity?: (request: AssetRequest<Options>) => string;
  readonly sourceIdentity?: (request: AssetRequest<Options>) => string;
  readonly unacquiredSource?: (request: AssetRequest<Options>, url: string) => { readonly source: Source } | undefined;
}

/**
 * Builds one ad-hoc {@link AssetType} for a test, so a case that only cares
 * about how the loader treats a type does not have to spell out a class.
 */
export function testAssetType<Source = string, Resource = unknown, Options = undefined>(spec: TestAssetTypeSpec<Source, Resource, Options>): AnyAssetType {
  class TestAssetType extends AssetType<Source, Resource, Options, unknown> {
    public readonly id = spec.id;
    public override readonly extensions = spec.extensions ?? [];
    public override readonly leaf = spec.leaf ?? ('ref' as AssetLeaf<Resource>);
    public override readonly codec = (spec.codec ?? (textSourceCodec as unknown as AssetSourceCodec<Source, unknown>)) as AssetSourceCodec<Source, unknown>;

    public createFactory(): AssetFactory<Source, Resource, Options> {
      return {
        create: spec.create,
        ...(spec.dispose && { dispose: spec.dispose }),
        ...(spec.destroy && { destroy: spec.destroy }),
      };
    }
  }

  const type = new TestAssetType();

  if (spec.token) {
    (type as { _token?: AssetConstructor })._token = spec.token;
  }

  if (spec.resourceIdentity) {
    type.resourceIdentity = spec.resourceIdentity;
  }

  if (spec.sourceIdentity) {
    type.sourceIdentity = spec.sourceIdentity;
  }

  if (spec.unacquiredSource) {
    type.unacquiredSource = spec.unacquiredSource;
  } else if (spec.acquires === false) {
    type.unacquiredSource = () => ({ source: '' as unknown as Source });
  }

  return type as AnyAssetType;
}
