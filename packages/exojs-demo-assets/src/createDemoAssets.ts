import { resolveBaseUrl, urlResolver } from './baseUrl.js';
import { buildDemoAssets, type DemoAssetDefinitions } from './catalog.generated.js';

/**
 * Creates the standard demo descriptors for media served from another location,
 * such as a copy made with the package's `exojs-demo-assets-copy` command or a
 * CDN.
 *
 * `baseUrl` is the directory that holds the media tree (the contents of the
 * package's `media/` directory). A string must be an absolute URL; resolve a
 * relative location first with `new URL(path, import.meta.url)` or against the
 * page URL. Nothing is fetched until a loader receives a descriptor.
 *
 * @throws If `baseUrl` is not an absolute URL.
 *
 * @example
 * ```ts
 * const assets = createDemoAssets(new URL('./demo-media/', import.meta.url));
 * const ship = await this.loader.load(assets.ship);
 * ```
 */
export const createDemoAssets = (baseUrl: string | URL): DemoAssetDefinitions =>
  buildDemoAssets(urlResolver(resolveBaseUrl(baseUrl, 'createDemoAssets')));
