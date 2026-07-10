import '#resources/coreAssetBindings';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

function mockJson(payload: unknown): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  ) as typeof fetch;
}

interface Config {
  readonly hp: number;
  readonly label: string;
}

describe('parse post-load transform', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('applies parse to the raw JSON on fill', async () => {
    mockJson({ hp: 3 });
    const loader = createCoreLoader();

    const assets = Assets.from({
      config: {
        kind: 'json',
        source: 'c.json',
        parse: (raw): Config => ({ hp: (raw as { hp: number }).hp, label: `hp:${(raw as { hp: number }).hp}` }),
      },
    });

    const loaded = await loader.load(assets);

    expect(loaded.config).toEqual({ hp: 3, label: 'hp:3' });
    expect(assets.config.value).toEqual({ hp: 3, label: 'hp:3' });
  });

  it('a throwing parse fails only its own ref — a sibling sharing the source stays ready', async () => {
    mockJson({ hp: 3 });
    const loader = createCoreLoader();

    const assets = Assets.from({
      good: { kind: 'json', source: 'c.json', parse: (raw): Config => ({ hp: (raw as { hp: number }).hp, label: 'ok' }) },
      bad: {
        kind: 'json',
        source: 'c.json',
        parse: (): Config => {
          throw new Error('bad parse');
        },
      },
    });

    await loader.load(assets).catch(() => undefined); // `bad` rejects; `good` resolves

    expect(assets.good.state).toBe('ready');
    expect(assets.good.value).toEqual({ hp: 3, label: 'ok' });
    expect(assets.bad.state).toBe('failed');
    expect(assets.bad.error?.message).toBe('bad parse');
  });
});
