// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { expect, it, vi } from 'vitest';

import { getPlaygroundNavigation } from '../../site/src/lib/curation-catalog';
import type { ExamplesMap } from '../../site/src/lib/types';

interface NavigationProps {
  activeExample: null;
  examples: ExamplesMap;
  loaded: boolean;
  loadError: null;
  selectedVersion: { id: string; track: 'stable' };
  onSelectExample(path: string): void;
}

const siteRequire = createRequire(resolve('site/package.json'));
const { act, createElement } = siteRequire('react');
const { createRoot } = siteRequire('react-dom/client');
const { Navigation } = await vi.importActual<{ Navigation(props: NavigationProps): unknown }>('../../site/src/components/Navigation');

it('renders examples and the standalone tool together, selecting only runnable example links', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const select = vi.fn();
  const examples = getPlaygroundNavigation();
  const preventNavigation = (event: MouseEvent) => event.preventDefault();
  document.body.append(host);
  document.addEventListener('click', preventNavigation);

  try {
    await act(async () =>
      root.render(
        createElement(Navigation, {
          activeExample: null,
          examples,
          loaded: true,
          loadError: null,
          selectedVersion: { id: 'current', track: 'stable' },
          onSelectExample: select,
        }),
      ),
    );
    const links = [...host.querySelectorAll<HTMLAnchorElement>('nav a')];
    expect(links).toHaveLength([...examples.values()].flat().length);
    const assetBrowser = links.find(link => link.textContent === 'Asset Browser')!;
    expect(assetBrowser.pathname).toBe('/en/tools/asset-browser/');
    await act(async () => assetBrowser.click());
    expect(select).not.toHaveBeenCalled();
    const hexagonal = links.find(link => link.hash.includes('tilemap/hexagonal-grid'))!;
    await act(async () => hexagonal.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('tilemap/hexagonal-grid.js');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.removeEventListener('click', preventNavigation);
    vi.unstubAllGlobals();
  }
});
