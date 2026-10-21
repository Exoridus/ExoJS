import { resolveBaseUrl, urlResolver } from './baseUrl.js';
import { buildExtendedDemoAssets, type ExtendedDemoAssetDefinitions } from './catalog.generated.js';

export type { ExtendedDemoAssetDefinitions } from './catalog.generated.js';

/**
 * Creates the descriptors for the extended demo media, which the npm package
 * does not contain.
 *
 * `baseUrl` is the directory the extended media archive was extracted to and
 * served from. There is no default location and nothing is fetched until a
 * loader receives a descriptor. A string must be an absolute URL.
 *
 * The HDR10 clip carries BT.2020/PQ metadata; whether it is shown as HDR depends
 * on the browser, the display and the rendering path, not on this descriptor.
 *
 * @throws If `baseUrl` is not an absolute URL.
 *
 * @example
 * ```ts
 * const extended = createExtendedDemoAssets('https://media.example.com/exojs-demo-extended/');
 * const video = await this.loader.load(extended.videoHdr10);
 * ```
 */
export const createExtendedDemoAssets = (baseUrl: string | URL): ExtendedDemoAssetDefinitions =>
  buildExtendedDemoAssets(urlResolver(resolveBaseUrl(baseUrl, 'createExtendedDemoAssets')));
