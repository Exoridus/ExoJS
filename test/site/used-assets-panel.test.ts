// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { expect, it, vi } from 'vitest';

import { configureUrls } from '../../site/src/lib/url-builder';

const siteRequire = createRequire(resolve('site/package.json'));
const { act, createElement } = siteRequire('react');
const { createRoot } = siteRequire('react-dom/client');
const { UsedAssets } = await vi.importActual<{ UsedAssets(props: { sources: readonly string[] | null }): unknown }>(
  '../../site/src/components/UsedAssets',
);

it('waits for loaded assets before using the parent URL configuration', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ entries: [{ key: 'ship', path: 'images/ship.png' }] })));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);

  try {
    configureUrls({ baseUrl: '' });
    await act(async () => root.render(createElement(UsedAssets, { sources: null })));
    expect(fetch).not.toHaveBeenCalled();
    configureUrls({ baseUrl: 'https://example.test/ExoJS/' });
    await act(async () =>
      root.render(createElement(UsedAssets, { sources: ['https://example.test/ExoJS/vendor/exojs-demo-assets/media/images/ship.png'] })),
    );
    const link = host.querySelector('a');
    expect(link?.href).toBe('https://example.test/ExoJS/en/tools/asset-browser/?asset=ship');
    expect(link?.target).toBe('_blank');
    expect(fetch).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
