// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createRequest, createUniqueRequest } from '../../site/src/lib/request-manager';

const url = 'https://example.test/source.ts';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([404, 500])('rejects HTTP %s before consuming a source error body', async status => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<h1>error page</h1>', { status })),
  );
  await expect(createRequest(url).getText()).rejects.toMatchObject({ kind: 'http', url, status });
});

it('distinguishes an empty valid source from a failed request', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('')),
  );
  await expect(createRequest(url).getText()).resolves.toBe('');
});

it('reports a network failure with its resource', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline');
    }),
  );
  await expect(createRequest(url).getText()).rejects.toMatchObject({ kind: 'network', url });
});

it('settles a stalled request after the finite deadline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const result = createRequest(url)
    .getText()
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(15001);
  await expect(result).resolves.toMatchObject({ kind: 'timeout', url });
});

it('cancels an obsolete unique request without cancelling its replacement', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const first = createUniqueRequest(url);
  const obsolete = first.getText().catch((error: unknown) => error);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('new source')),
  );
  const replacement = createUniqueRequest(url);
  await expect(replacement.getText()).resolves.toBe('new source');
  await expect(obsolete).resolves.toMatchObject({ kind: 'cancelled', url });
});
