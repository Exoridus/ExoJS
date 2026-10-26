export interface UsedAsset {
  path: string;
  key?: string;
  source: string;
}

export const findUsedAssets = (
  sources: readonly string[],
  entries: readonly { key: string; path: string }[],
  base: string,
): UsedAsset[] => {
  const assets = new Map<string, UsedAsset>();

  for (const source of sources) {
    let url: URL;

    try {
      url = new URL(source.startsWith('url:') ? source.slice(4) : source, base);
    } catch {
      continue;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      continue;
    }

    const entry = entries.find(item =>
      ['vendor/exojs-demo-assets/media/', 'examples/assets/'].some(prefix => {
        const catalogUrl = new URL(prefix + item.path, base);

        return url.origin === catalogUrl.origin && url.pathname === catalogUrl.pathname;
      }),
    );
    const path = entry?.path ?? url.pathname.split('/').pop() ?? source;
    assets.set(url.origin + url.pathname, { path, key: entry?.key, source: url.href });
  }

  return [...assets.values()];
};
