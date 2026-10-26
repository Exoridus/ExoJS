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
    expect(host.querySelector('img, audio, video')).toBeNull();
    const details = host.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const card = host.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(card).not.toBeNull();
    const thumbnail = card!.querySelector('img');
    expect(thumbnail?.getAttribute('loading')).toBe('lazy');
    expect(thumbnail?.alt).toBe('');
    expect(host.querySelector('[aria-label="Asset preview"] img')).toBeNull();
    await act(async () => card!.click());
    expect(host.querySelector<HTMLImageElement>('[aria-label="Asset preview"] img')?.src).toBe(
      'https://example.test/ExoJS/vendor/exojs-demo-assets/media/images/ship.png',
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

it('loads only the selected preview and releases media and pending text when it closes or changes', async () => {
  const base = 'https://example.test/ExoJS/';
  const sources = ['audio/loop.ogg', 'video/clip.mp4', 'maps/world.json', 'fonts/sample.ttf'].map(path => base + path);
  const requests: AbortSignal[] = [];
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('manifest.json')) {
      return new Response(JSON.stringify({ entries: [] }));
    }

    requests.push(options.signal!);

    return new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const host = document.createElement('div');
  const root = createRoot(host);
  configureUrls({ baseUrl: base });

  try {
    await act(async () => root.render(createElement(UsedAssets, { sources })));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(host.querySelector('audio, video')).toBeNull();
    const details = host.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const cards = host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    expect(cards).toHaveLength(4);
    await act(async () => cards[0].click());
    const audio = host.querySelector('audio')!;
    expect(audio.controls).toBe(true);
    expect(audio.autoplay).toBe(false);
    expect(audio.preload).toBe('metadata');
    await act(async () => cards[1].click());
    expect(audio.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    const video = host.querySelector('video')!;
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    await act(async () => {
      details.open = false;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(video.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[2].click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requests[0].aborted).toBe(false);
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[3].click());
    expect(requests[0].aborted).toBe(true);
    expect(host.textContent).toContain('Inline font preview is unavailable.');
    expect(host.querySelector('audio, video, img, pre')).toBeNull();
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[0].click());
    const lastAudio = host.querySelector('audio')!;
    const pausedBeforeUnmount = pause.mock.calls.length;
    await act(async () => root.render(createElement('div')));
    expect(lastAudio.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(pausedBeforeUnmount + 1);
  } finally {
    await act(async () => root.unmount());
    pause.mockRestore();
    load.mockRestore();
    vi.unstubAllGlobals();
  }
});

it.each([
  { body: 'Plain text is valid too.', status: 200, selector: 'pre', expected: 'Plain text is valid too.' },
  { body: 'Missing', status: 404, selector: '[role="alert"]', expected: 'Could not load this preview.' },
])('shows an honest text preview for HTTP $status', async ({ body, status, selector, expected }) => {
  const base = 'https://example.test/ExoJS/';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(url.endsWith('manifest.json') ? '{"entries":[]}' : body, { status: url.endsWith('manifest.json') ? 200 : status }),
    ),
  );
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  configureUrls({ baseUrl: base });

  try {
    await act(async () => root.render(createElement(UsedAssets, { sources: [`${base}document.json`] })));
    const details = host.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click());
    expect(host.querySelector(selector)?.textContent).toBe(expected);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows formatted JSON inline and discards it when the asset is no longer loaded', async () => {
  const base = 'https://example.test/ExoJS/';
  const fetch = vi.fn(async (url: string) => new Response(url.endsWith('manifest.json') ? '{"entries":[]}' : '{"layers":["ground"]}'));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  configureUrls({ baseUrl: base });

  try {
    await act(async () => root.render(createElement(UsedAssets, { sources: [`${base}world.json`] })));
    const details = host.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const card = host.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(card).not.toBeNull();
    await act(async () => card!.click());
    expect(host.querySelector('pre')?.textContent).toBe('{\n  "layers": [\n    "ground"\n  ]\n}');
    await act(async () => root.render(createElement(UsedAssets, { sources: [`${base}other.png`] })));
    expect(host.querySelector('pre')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
