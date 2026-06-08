export { assets } from './assets.js';
export type { Assets } from './assets.js';

// Legacy exports kept for Asset Browser and resolver infrastructure.
// New code should import from `assets` directly.
export { rawAssets } from './catalog.js';
export { assetManifest } from './manifest.js';
export { createAssetUrl, resolveAssetCatalog } from './resolver.js';
export type AssetCatalog = typeof import('./catalog.js').rawAssets;
export type ResolvedAssetCatalog = ReturnType<typeof import('./resolver.js').resolveAssetCatalog<AssetCatalog>>;
