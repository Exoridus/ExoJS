import { assets as rawAssets } from '../../../examples/assets/assets.js';
import { resolveAssetCatalog } from '../../../examples/assets/resolver.js';

const SITE_BASE = import.meta.env.BASE_URL;
const ASSET_BASE = `${SITE_BASE}assets/`;

export const assets = resolveAssetCatalog(rawAssets as unknown as Record<string, unknown>, ASSET_BASE);

export function assetUrl(path: string): string {
    return `${ASSET_BASE}${path.startsWith('/') ? path.slice(1) : path}`;
}
