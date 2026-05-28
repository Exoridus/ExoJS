export { rawAssets } from './catalog.js';
export { assetManifest } from './manifest.js';
export { createAssetUrl, resolveAssetCatalog } from './resolver.js';
export type AssetCatalog = typeof import('./catalog.js').rawAssets;
export type ResolvedAssetCatalog = ReturnType<typeof import('./resolver.js').resolveAssetCatalog<AssetCatalog>>;
