import type { UrlParams } from './types';

let _baseUrl = '';
let _iframeUrl = 'preview.html';
let _publicDir = '.';
let _assetsDir = 'assets';
let _examplesDir = 'examples';

export function configureUrls(config: {
  baseUrl: string;
  iframeUrl?: string;
  publicDir?: string;
  assetsDir?: string;
  examplesDir?: string;
}): void {
  _baseUrl = config.baseUrl;
  if (config.iframeUrl) _iframeUrl = config.iframeUrl;
  if (config.publicDir) _publicDir = config.publicDir;
  if (config.assetsDir) _assetsDir = config.assetsDir;
  if (config.examplesDir) _examplesDir = config.examplesDir;
}

function buildUrl(path: string, params?: UrlParams): string {
  const url = new URL(path, _baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

export function buildIframeUrl(params?: UrlParams): string {
  return buildUrl(_iframeUrl, params);
}

export function buildPublicUrl(path: string, params?: UrlParams): string {
  return buildUrl(`${_publicDir}/${path}`, params);
}

export function buildAssetUrl(path: string, params?: UrlParams): string {
  return buildUrl(`${_assetsDir}/${path}`, params);
}

export function buildExampleUrl(path: string, params?: UrlParams): string {
  return buildUrl(`${_examplesDir}/${path}`, params);
}

// Resolves to the example source on raw.githubusercontent.com at the matching
// release tag (e.g. v0.5.1). Used for non-current versions; the current
// development build is served locally via `buildExampleUrl`. The repo root
// path is hardcoded — it has not changed since the project's pre-1.0 line and
// changing it would be a deliberate architectural move.
export function buildGithubRawExampleUrl(
  versionId: string,
  filePath: string,
  params?: UrlParams,
): string {
  const url = new URL(
    `https://raw.githubusercontent.com/Exoridus/ExoJS/v${versionId}/examples/public/examples/${filePath}`,
  );

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}
