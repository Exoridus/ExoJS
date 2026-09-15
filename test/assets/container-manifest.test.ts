import { type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';
import { containerPackFileName, describeContainerPack } from '@codexo/exojs-build/asset-manifest';

import { Asset } from '#assets/Asset';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import { AssetManifest } from '#assets/container/AssetManifest';
import type { ContainerBlockStore } from '#assets/container/containerBlockStore';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

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

const createLoader = (): Loader => {
  const loader = new Loader({ basePath: '/assets/' });

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
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

  test('refuses a pack file that would escape the manifest directory', async () => {
    const deployment = deploy({ level1: threePacked(2) });

    serve(deployment, { version: 1, packs: { level1: { ...deployment.document.packs['level1'], file: '../secret.exoa' } } });

    await expect(AssetManifest.open(MANIFEST_PATH)).rejects.toThrow(AssetDecodeError);
  });

  test('a manifest that cannot be fetched says so', async () => {
    serve(deploy({}));

    await expect(AssetManifest.open('/assets/absent.json')).rejects.toThrow(AssetDecodeError);
  });
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
    const deployment = deploy({ level1: threePacked(2) });
    const [path, file] = [...deployment.files.entries()][0]!;

    // One byte inside an uncoded block: the container still parses and decodes,
    // so nothing but the manifest's digest can tell these bytes from the right ones.
    file[file.byteLength - 1] = file[file.byteLength - 1]! ^ 0xff;
    deployment.files.set(path, file);
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
});
