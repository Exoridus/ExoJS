import { type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';
import { containerPackFileName, describeContainerPack } from '@codexo/exojs-build/asset-manifest';

import { Asset } from '#assets/Asset';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import { AssetNetworkError } from '#assets/AssetNetworkError';
import { AssetCache } from '#assets/cache/AssetCache';
import { parseContainer } from '#assets/container/assetContainer';
import { AssetManifest } from '#assets/container/AssetManifest';
import type { ContainerBlockStore } from '#assets/container/containerBlockStore';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, type LoaderOptions } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

import { createCacheStoreDouble } from './cache-test-doubles';

/** Distinct, incompressible bytes, so a block is stored uncoded and two entries never coincide. */
const noise = (length: number, seed: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  let state = seed * 2654435761 + 1;

  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }

  return bytes;
};

/** Three entries big enough to land in blocks of their own at a 1 KiB block size. */
const threePacked = (secondSeed: number): ArrayBuffer => {
  const inputs: ContainerInput[] = [
    { source: 'a.bin', type: 'binary', bytes: noise(1500, 1) },
    { source: 'b.bin', type: 'binary', bytes: noise(1500, secondSeed) },
    { source: 'c.bin', type: 'binary', bytes: noise(1500, 3) },
  ];

  return encodeContainer(inputs, { blockSize: 1024 });
};

interface ServedRequest {
  readonly path: string;
  readonly range: string | undefined;
  readonly cache: RequestCache | undefined;
}

interface Deployment {
  /** The manifest document, as the writer produced it. */
  readonly document: { version: number; packs: Record<string, Record<string, unknown>> };
  /** Served files, keyed by their path under `/assets/`. */
  readonly files: Map<string, Uint8Array>;
}

const MANIFEST_PATH = '/assets/assets.json';

/** Describe packs exactly as `exo assets pack --manifest` does, and lay the files out under `/assets/`. */
const deploy = (packs: Record<string, ArrayBuffer>): Deployment => {
  const document = { version: 1, packs: {} as Record<string, Record<string, unknown>> };
  const files = new Map<string, Uint8Array>();

  for (const [name, container] of Object.entries(packs)) {
    const described = describeContainerPack(container);
    const file = containerPackFileName(name, described.hash);

    document.packs[name] = { file, ...described };
    files.set(`/assets/${file}`, new Uint8Array(container));
  }

  return { document, files };
};

/** A `fetch` stub over one deployment, honouring byte ranges the way `exo serve` does. */
const serve = (deployment: Deployment, document: unknown = deployment.document): { requests: ServedRequest[] } => {
  const requests: ServedRequest[] = [];

  global.fetch = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(input), globalThis.location.href).pathname;
    const range = new Headers(init?.headers).get('Range') ?? undefined;

    requests.push({ path, range, cache: init?.cache });

    if (path === MANIFEST_PATH) {
      return new Response(JSON.stringify(document), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const file = deployment.files.get(path);

    if (file === undefined) {
      return new Response(null, { status: 404 });
    }

    const match = range === undefined ? null : /^bytes=(\d+)-(\d+)$/.exec(range);

    if (match === null) {
      return new Response(file.slice().buffer, { status: 200 });
    }

    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), file.byteLength - 1);
    const headers = { 'content-range': `bytes ${start}-${end}/${file.byteLength}` };

    return new Response(file.slice(start, end + 1).buffer, { status: 206, headers });
  }) as unknown as typeof fetch;

  return { requests };
};

/** A block store in memory, plus a record of which hashes it answered. */
const recordingStore = (): ContainerBlockStore & { readonly held: Map<string, Uint8Array>; readonly hits: string[] } => {
  const held = new Map<string, Uint8Array>();
  const hits: string[] = [];

  return {
    held,
    hits,
    get: async hash => {
      const bytes = held.get(hash);

      if (bytes !== undefined) hits.push(hash);

      return bytes === undefined ? undefined : new Uint8Array(bytes.slice().buffer);
    },
    put: async (hash, bytes) => {
      held.set(hash, new Uint8Array(bytes.slice().buffer));
    },
  };
};

const createLoader = (options: Omit<LoaderOptions, 'basePath'> = {}): Loader => {
  const loader = new Loader({ basePath: '/assets/', ...options });

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

/** Flip one byte inside the first block's stored region, which the head locates exactly. */
const corruptFirstBlock = (container: ArrayBuffer): Uint8Array => {
  const parsed = parseContainer(container);
  const block = parsed.blocks[0]!;
  const bytes = new Uint8Array(container.slice(0));
  const at = parsed.dataOffset + block.storedOffset;

  expect(block.codec).toBe('none');
  bytes[at] = bytes[at]! ^ 0xff;

  return bytes;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetManifest', () => {
  test('names its packs and addresses each pack file relative to itself', async () => {
    const deployment = deploy({ level1: threePacked(2) });

    serve(deployment);

    const manifest = await AssetManifest.open(MANIFEST_PATH);
    const pack = manifest.pack('level1');
    const record = deployment.document.packs['level1']!;

    expect(manifest.packs.map(entry => entry.name)).toEqual(['level1']);
    expect(manifest.has('level1')).toBe(true);
    expect(manifest.has('level2')).toBe(false);
    expect(pack.url).toMatch(new RegExp(`/assets/${record.file as string}$`));
    expect(pack.hash).toBe(record.hash);
    expect(pack.byteLength).toBe(record.byteLength);
    expect(pack.blockCount).toBe(3);
    expect(pack.entries).toEqual(['a.bin', 'b.bin', 'c.bin']);
  });

  test('finds the pack carrying a source', async () => {
    serve(deploy({ level1: threePacked(2), boot: encodeContainer([{ source: 'boot.bin', type: 'binary', bytes: noise(64, 9) }]) }));

    const manifest = await AssetManifest.open(MANIFEST_PATH);

    expect(manifest.packFor('b.bin')?.name).toBe('level1');
    expect(manifest.packFor('boot.bin')?.name).toBe('boot');
    expect(manifest.packFor('absent.bin')).toBeUndefined();
  });

  test('is fetched with revalidation, because it is the one URL that changes', async () => {
    const { requests } = serve(deploy({ level1: threePacked(2) }));

    await AssetManifest.open(MANIFEST_PATH);

    expect(requests[0]?.cache).toBe('no-cache');
  });

  test('an unknown pack name names the packs the manifest does carry', async () => {
    serve(deploy({ level1: threePacked(2) }));

    const manifest = await AssetManifest.open(MANIFEST_PATH);

    expect(() => manifest.pack('level2')).toThrow(/"level2".*level1/s);
  });

  test('refuses a manifest version this build does not read', async () => {
    const deployment = deploy({ level1: threePacked(2) });

    serve(deployment, { ...deployment.document, version: 99 });

    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(AssetDecodeError);
    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(/version 99/);
  });

  test('refuses a document that is not a manifest', async () => {
    serve(deploy({}), []);

    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(AssetDecodeError);
  });

  test('refuses a pack record that is missing what addresses it', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const { file, ...rest } = deployment.document.packs['level1']!;

    serve(deployment, { version: 1, packs: { level1: rest } });

    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(/"file"/);
    expect(file).toBeDefined();
  });

  test('a manifest that cannot be fetched is a transport failure, not a decode failure', async () => {
    serve(deploy({}));

    await expect(AssetManifest.open('/assets/absent.json')).rejects.toThrow(AssetNetworkError);
  });

  test('carries a pack named __proto__ as an ordinary entry, without reaching any prototype', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const record = deployment.document.packs['level1']!;

    serve(deployment, { version: 1, packs: { ['__proto__']: record, level1: record } });

    const manifest = await AssetManifest.open(MANIFEST_PATH);
    const probe = {} as Record<string, unknown>;

    expect(manifest.packs.map(pack => pack.name).sort()).toEqual(['__proto__', 'level1']);
    expect(probe.file).toBeUndefined();
    expect(probe.hash).toBeUndefined();
  });
});

/**
 * A manifest is fetched from the network, so every field in it is input a
 * hostile deployment could have written. Each row is a document the reader has
 * to refuse rather than address.
 */
describe.each([
  ['a percent-encoded traversal', { file: '%2e%2e/%2e%2e/secret.exoa' }],
  ['a half-encoded traversal', { file: '.%2e/secret.exoa' }],
  ['a plain traversal', { file: '../secret.exoa' }],
  ['an absolute URL', { file: 'http://evil.example/secret.exoa' }],
  ['a protocol-relative URL', { file: '//evil.example/secret.exoa' }],
  ['a root-relative path', { file: '/secret.exoa' }],
  ['a backslash path', { file: 'sub\\secret.exoa' }],
  ['no file at all', { file: undefined }],
  ['a negative byteLength', { byteLength: -1 }],
  ['a fractional byteLength', { byteLength: 12.5 }],
  ['a byteLength that is not a number', { byteLength: Number.NaN }],
  ['a negative blockCount', { blockCount: -3 }],
  ['a hash that is not 64 hex characters', { hash: 'abc' }],
  ['a hash in upper case', { hash: 'A'.repeat(64) }],
  ['entries that are not strings', { entries: [1, 2] }],
  ['no entries at all', { entries: undefined }],
])('a manifest with %s', (_what, overrides: Record<string, unknown>) => {
  test('is refused', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const record = { ...deployment.document.packs['level1'], ...overrides };

    serve(deployment, { version: 1, packs: { level1: record } });

    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(AssetDecodeError);
  });
});

test('a manifest whose pack record is not an object is refused', async () => {
  const deployment = deploy({ level1: threePacked(2) });

  serve(deployment, { version: 1, packs: { level1: 'level1.exoa' } });

  await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(AssetDecodeError);
});

describe('loading a pack through a manifest', () => {
  test('loads the pack the manifest addresses', async () => {
    serve(deploy({ level1: threePacked(2) }));

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    await loader.loadContainer(manifest.pack('level1'));

    expect(new Uint8Array(loader.get(Asset.type('binary', 'b.bin')).value)).toEqual(noise(1500, 2));
  });

  test('refuses pack bytes whose hash is not the one the manifest states', async () => {
    const container = threePacked(2);
    const deployment = deploy({ level1: container });
    const [path] = [...deployment.files.keys()];

    // One byte inside an uncoded block, located through the head: the container
    // still parses and still decodes, so nothing but the manifest's digest can
    // tell these bytes from the right ones.
    deployment.files.set(path!, corruptFirstBlock(container));
    serve(deployment);

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    await expect(loader.loadContainer(manifest.pack('level1'))).rejects.toThrow(AssetDecodeError);
    await expect(loader.loadContainer(manifest.pack('level1'))).rejects.toThrow(/hash/);
  });

  test('refuses a pack whose length is not the one the manifest states', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const record = deployment.document.packs['level1']!;

    serve(deployment, { version: 1, packs: { level1: { ...record, byteLength: (record.byteLength as number) + 16 } } });

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    await expect(loader.loadContainer(manifest.pack('level1'), { store: recordingStore() })).rejects.toThrow(AssetDecodeError);
  });

  test('a re-pack with one changed asset is a new pack name, and the unchanged blocks come from the store', async () => {
    const store = recordingStore();
    const first = deploy({ level1: threePacked(2) });

    serve(first);

    const before = await createLoader().loadManifest('assets.json');

    await createLoader().loadContainer(before.pack('level1'), { store });

    expect(store.held.size).toBe(3);

    const second = deploy({ level1: threePacked(7) });
    const { requests } = serve(second);

    expect(second.document.packs['level1']!.file).not.toBe(first.document.packs['level1']!.file);

    const loader = createLoader();
    const after = await loader.loadManifest('assets.json');

    await loader.loadContainer(after.pack('level1'), { store });

    expect(new Uint8Array(loader.get(Asset.type('binary', 'b.bin')).value)).toEqual(noise(1500, 7));
    // The manifest, the pack head, and exactly the one block that changed.
    expect(requests.filter(request => request.path.endsWith('.exoa'))).toHaveLength(2);
    expect(store.hits).toHaveLength(2);
    expect(store.held.size).toBe(4);
  });

  test('bytes that fail the digest are never cached, so a corrected pack still loads', async () => {
    const container = threePacked(2);
    const deployment = deploy({ level1: container });
    const [path] = [...deployment.files.keys()];
    const good = deployment.files.get(path!)!;
    const store = createCacheStoreDouble();

    deployment.files.set(path!, corruptFirstBlock(container));
    serve(deployment);

    const loader = createLoader({ cache: new AssetCache({ stores: store }) });
    const manifest = await loader.loadManifest('assets.json');

    await expect(loader.loadContainer(manifest.pack('level1'))).rejects.toThrow(AssetDecodeError);
    // Nothing was persisted: a record under a content-addressed key would be
    // served to every later load, where no network answer could correct it.
    expect(store.records.size).toBe(0);

    deployment.files.set(path!, good);

    await loader.loadContainer(manifest.pack('level1'));

    expect(new Uint8Array(loader.get(Asset.type('binary', 'b.bin')).value)).toEqual(noise(1500, 2));
  });

  test('checks the length even where crypto.subtle is unavailable', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const record = deployment.document.packs['level1']!;

    serve(deployment, { version: 1, packs: { level1: { ...record, byteLength: (record.byteLength as number) + 16 } } });
    vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue({ subtle: undefined } as unknown as Crypto);

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    await expect(loader.loadContainer(manifest.pack('level1'))).rejects.toThrow(/bytes, but the manifest states/);
  });

  test('accepts bytes an insecure context cannot hash, having checked what it can', async () => {
    const container = threePacked(2);
    const deployment = deploy({ level1: container });
    const [path] = [...deployment.files.keys()];

    deployment.files.set(path!, corruptFirstBlock(container));
    serve(deployment);
    vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue({ subtle: undefined } as unknown as Crypto);

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    // The digest is the only thing that could have caught this, and without
    // `crypto.subtle` there is none: degrading beats refusing to load at all.
    await loader.loadContainer(manifest.pack('level1'));

    expect(loader.get(Asset.type('binary', 'b.bin')).value.byteLength).toBe(1500);
  });

  test('a pack the server does not have is a transport failure on the block path too', async () => {
    const deployment = deploy({ level1: threePacked(2) });
    const record = deployment.document.packs['level1']!;

    serve(deployment, { version: 1, packs: { level1: { ...record, file: 'level1.0000000000000000.exoa' } } });

    const loader = createLoader();
    const manifest = await loader.loadManifest('assets.json');

    await expect(loader.loadContainer(manifest.pack('level1'), { store: recordingStore() })).rejects.toThrow(AssetNetworkError);
  });

  test("the application's fetchOptions cannot pin the manifest to the HTTP cache", async () => {
    const { requests } = serve(deploy({ level1: threePacked(2) }));

    await createLoader({ fetchOptions: { cache: 'force-cache' } }).loadManifest('assets.json');

    expect(requests[0]?.cache).toBe('no-cache');
  });

  test('a caller that asks for a cache mode on the manifest gets it', async () => {
    const { requests } = serve(deploy({ level1: threePacked(2) }));

    await createLoader().loadManifest('assets.json', { cache: 'reload' });

    expect(requests[0]?.cache).toBe('reload');
  });
});
