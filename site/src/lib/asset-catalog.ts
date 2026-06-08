import { rawAssets, resolveAssetCatalog } from '../../../examples/assets/catalog.js';

const SITE_BASE = import.meta.env.BASE_URL;
const ASSET_BASE = `${SITE_BASE}assets/`;

export const assets = resolveAssetCatalog(rawAssets, ASSET_BASE);

export function assetUrl(path: string): string {
    return `${ASSET_BASE}${path.startsWith('/') ? path.slice(1) : path}`;
}
