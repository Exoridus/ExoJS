import type { AssetDependencyScope, AssetFactoryContext } from '#assets/AssetFactory';

/**
 * A minimal {@link AssetFactoryContext} for exercising one factory directly.
 *
 * The dependency scope throws by default: a factory that reaches for one in a
 * test that did not supply it is a fact worth failing on, not one to paper over
 * with a stub that resolves to nothing.
 */
export const factoryContext = <Options>(options?: Options, overrides: Partial<AssetFactoryContext<Options>> = {}): AssetFactoryContext<Options> => {
  const dependencies = {
    get: () => {
      throw new Error('factoryContext: this test supplied no dependency scope.');
    },
    load: () => {
      throw new Error('factoryContext: this test supplied no dependency scope.');
    },
    createScope: () => {
      throw new Error('factoryContext: this test supplied no dependency scope.');
    },
  } as unknown as AssetDependencyScope;

  return {
    ...(options !== undefined && { options }),
    source: 'asset.bin',
    locator: 'url:https://example.test/asset.bin',
    resourceKey: 'test-resource-key',
    sourceKey: 'test-source-key',
    dependencies,
    ...overrides,
  };
};
