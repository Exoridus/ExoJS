// Auto-generated from manifest.ts — edit the .ts source, not this file.
import { rawAssets } from './catalog.js';
function collectPaths(obj) {
    if (typeof obj === 'string') {
        return [obj];
    }
    if (obj && typeof obj === 'object') {
        return Object.values(obj).flatMap(v => collectPaths(v));
    }
    return [];
}
export const assetManifest = {
    paths: collectPaths(rawAssets),
    basePath: 'assets/',
};
