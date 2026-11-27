import { expect, it } from 'vitest';

import * as navigation from '../../site/src/lib/playground-nav';

it('launches examples directly, preserving aliases and the standalone Asset Browser', () => {
  expect(navigation).toHaveProperty('buildPlaygroundLaunchHref');
  const launch = navigation.buildPlaygroundLaunchHref;
  expect(launch('tilemap/hexagonal-grid.js', 'en', '/ExoJS/')).toBe('/ExoJS/en/playground/?version=current&example=tilemap/hexagonal-grid');
  expect(launch('getting-started/hello-world.js', 'en', '/ExoJS/')).toBe(
    '/ExoJS/en/playground/?version=current&example=getting-started/hello-world',
  );
  expect(launch('getting-started/game-loop.js', 'de', '/ExoJS/')).toBe(
    '/ExoJS/de/playground/?version=current&example=getting-started/hello-world',
  );
  expect(launch('debug-layer/asset-browser.js', 'de', '/ExoJS/')).toBe('/ExoJS/de/tools/asset-browser/');
});
