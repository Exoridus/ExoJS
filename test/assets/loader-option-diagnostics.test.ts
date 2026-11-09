import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Asset } from '#assets/Asset';
import { Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import type { Sound } from '#audio/Sound';
import { logger, LogSeverity } from '#core/Logger';
import { materializeAssetTypes } from '#extensions/materialize';

import { testAssetType } from './test-asset-type';

vi.mock('#audio/audioContext', () => ({
  decodeAudioData: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

type Route = 'bare-get' | 'descriptor-get' | 'descriptor-load' | 'catalog-get' | 'catalog-load' | 'leaf-get' | 'leaf-load';

const routes: Route[] = ['bare-get', 'descriptor-get', 'descriptor-load', 'catalog-get', 'catalog-load', 'leaf-get', 'leaf-load'];

const acquire = (owner: Loader | LoaderScope, route: Route, poolSize: number): Promise<Sound> => {
  const asset = Asset.type('sound', 'diagnostic.wav', { poolSize });

  switch (route) {
    case 'bare-get':
      return owner.get('diagnostic.wav', { poolSize }).loaded;
    case 'descriptor-get':
      return owner.get(asset).loaded;
    case 'descriptor-load':
      return Promise.resolve(owner.load(asset));
    case 'catalog-get':
      return owner.get(Assets.from({ sound: asset })).sound.loaded;
    case 'catalog-load':
      return Promise.resolve(owner.load(Assets.from({ sound: asset }))).then(value => value.sound);
    case 'leaf-get':
      return owner.get(Assets.from({ sound: asset }).sound).loaded;
    case 'leaf-load':
      return Promise.resolve(owner.load(Assets.from({ sound: asset }).sound));
  }
};

const fixture = (): { loader: Loader; release(): void } => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });

  vi.stubGlobal('fetch', vi.fn(async () => {
    await gate;

    return new Response(new ArrayBuffer(8));
  }));

  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);

  return { loader, release };
};

let warnings: string[];
let removeSink: () => void;

beforeEach(() => {
  warnings = [];
  logger._resetOnce();
  removeSink = logger.addSink(entry => {
    if (entry.severity === LogSeverity.Warning && entry.message.includes('ignored')) {
      warnings.push(entry.message);
    }
  });
});

afterEach(() => {
  removeSink();
  logger._resetOnce();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([false, true])('ignored options (scope=%s)', scoped => {
  test.each(routes)('reports %s conflicts while loading without duplicating a warning', async route => {
    const { loader, release } = fixture();
    const owner = scoped ? loader.createScope() : loader;
    const first = acquire(owner, route, 2);
    const second = acquire(owner, route, 5);
    const third = acquire(owner, route, 7);

    release();

    try {
      const [original, later] = await Promise.all([first, second, third]);
      const canonical = loader.get('diagnostic.wav');

      expect(canonical.poolSize).toBe(2);
      expect(later.audioBuffer).toBe(original.audioBuffer);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('diagnostic.wav');
    } finally {
      loader.destroy();
    }
  });

  test.each(routes)('reports %s conflicts after loading without changing the canonical resource', async route => {
    const { loader, release } = fixture();
    const owner = scoped ? loader.createScope() : loader;
    release();

    try {
      const first = await acquire(owner, route, 2);
      const second = await acquire(owner, route, 5);
      await acquire(owner, route, 7);

      expect(loader.get('diagnostic.wav').poolSize).toBe(2);
      expect(second.audioBuffer).toBe(first.audioBuffer);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(warnings).toHaveLength(1);

      if (route === 'bare-get' || route === 'descriptor-load') {
        expect(second).toBe(first);
      } else {
        expect(second).not.toBe(first);
        expect(second.poolSize).toBe(5);
      }
    } finally {
      loader.destroy();
    }
  });
});

test('equal reordered options and omitted options do not warn', async () => {
  const { loader, release } = fixture();
  release();

  try {
    await loader.load(Asset.type('sound', 'equal.wav', { poolSize: 2, playbackOptions: { volume: 0.5, loop: true } }));
    await loader.load(Asset.type('sound', './equal.wav', { playbackOptions: { loop: true, volume: 0.5 }, poolSize: 2 }));
    loader.get('equal.wav');

    expect(warnings).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  } finally {
    loader.destroy();
  }
});

test('a queued first acquisition keeps its options when a descriptor load boosts it', async () => {
  const { loader, release } = fixture();
  loader.setConcurrency(0);
  const catalog = Assets.from({ sound: Asset.type('sound', 'queued.wav', { poolSize: 2 }) });
  const background = loader.load(catalog, { priority: LoadPriority.Background });
  const foreground = loader.load(Asset.type('sound', 'queued.wav', { poolSize: 5 }));
  release();

  try {
    const [first, second] = await Promise.all([background, foreground]);

    expect(second.poolSize).toBe(2);
    expect(first.sound.audioBuffer).toBe(second.audioBuffer);
    expect(warnings).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  } finally {
    loader.destroy();
  }
});

test.each(['resource', 'source'])('options in %s identity create distinct acquisitions without ignored-option warnings', async identity => {
  const loader = new Loader();
  const type = testAssetType<string, string, { variant: string }>({
    id: 'text',
    extensions: ['txt'],
    acquires: false,
    create: async (_source, context) => context.options!.variant,
    ...(identity === 'resource'
      ? { resourceIdentity: ({ options }: { options?: { variant: string } }) => options?.variant ?? '' }
      : { sourceIdentity: ({ options }: { options?: { variant: string } }) => options?.variant ?? '' }),
  });
  materializeAssetTypes(loader, [type]);

  try {
    const a = Asset.type('text', 'identity.txt', { variant: 'a' } as never);
    const b = Asset.type('text', 'identity.txt', { variant: 'b' } as never);

    expect(loader.identify(a).resourceKey).not.toBe(loader.identify(b).resourceKey);
    expect(await loader.load(a)).toBe('a');
    expect(await loader.load(b)).toBe('b');
    expect(warnings).toEqual([]);
  } finally {
    loader.destroy();
  }
});
