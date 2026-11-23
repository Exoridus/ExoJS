// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

it('makes current available before the registry request has settled', async () => {
  const versions = await import('../../site/src/lib/versions');
  expect(versions.getVersionById('current')?.id).toBe('current');
});

it('settles a stalled registry with current still available and an explicit error', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const versions = await import('../../site/src/lib/versions');
  const done = versions.loadVersionCatalog();
  await vi.advanceTimersByTimeAsync(15001);
  await done;
  expect(versions.getVersionById('current')?.id).toBe('current');
  expect(versions.getVersionLoadError()).toMatch(/timeout/i);
}, 1000);

it('keeps failed historical source retrieval explicit instead of substituting current', async () => {
  const { configureUrls } = await import('../../site/src/lib/url-builder');
  const { loadExampleSource } = await import('../../site/src/lib/example-store');
  configureUrls({ baseUrl: 'https://example.test/ExoJS/' });
  const fetch = vi.fn(async (input: string) => {
    if (input.includes('raw.githubusercontent.com')) {
      return new Response('historical source missing', { status: 404 });
    }

    return new Response('current source');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(loadExampleSource('0.19.0', 'getting-started/hello-world.ts')).rejects.toThrow(/404/);
  expect(fetch.mock.calls.some(([url]) => url.includes('example.test'))).toBe(false);
});

it('does not reuse a current catalog under a historical version', async () => {
  const { configureUrls } = await import('../../site/src/lib/url-builder');
  const store = await import('../../site/src/lib/example-store');
  configureUrls({ baseUrl: 'https://example.test/ExoJS/' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline');
    }),
  );
  await store.loadExamples('0.19.0');
  expect(store.hasExamplesFor('0.19.0')).toBe(false);
  expect(store.getLoadErrorFor('0.19.0')).toMatch(/raw.githubusercontent.com/);
});
