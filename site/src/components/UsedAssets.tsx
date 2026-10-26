import { useEffect, useState } from 'react';

import { buildPublicUrl } from '../lib/url-builder';
import { findUsedAssets } from '../lib/used-assets';

export const UsedAssets = ({ sources }: { sources: readonly string[] | null }): JSX.Element | null => {
  const [entries, setEntries] = useState<Array<{ key: string; path: string }>>([]);
  const hasSources = Boolean(sources?.length);
  useEffect(() => {
    if (!hasSources) {
      return;
    }

    const request = new AbortController();
    void fetch(buildPublicUrl('vendor/exojs-demo-assets/manifest.json'), { signal: request.signal })
      .then(async response => {
        if (!response.ok) {
          return;
        }

        const manifest = (await response.json()) as { entries?: Array<{ key: string; path: string }> };

        if (!request.signal.aborted && Array.isArray(manifest.entries)) {
          setEntries(manifest.entries);
        }
      })
      .catch(() => undefined);

    return () => request.abort();
  }, [hasSources]);

  if (!sources?.length) {
    return null;
  }

  const assets = findUsedAssets(sources, entries, buildPublicUrl(''));

  if (!assets.length) {
    return null;
  }

  const locale = document.documentElement.lang === 'de' ? 'de' : 'en';

  return (
    <details data-used-assets>
      <summary>Used assets ({assets.length})</summary>
      <ul>
        {assets.map(asset => (
          <li key={asset.source}>
            <a
              href={asset.key ? buildPublicUrl(`${locale}/tools/asset-browser/`, { asset: asset.key }) : asset.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              {asset.path}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
};
