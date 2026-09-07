import { CONTAINER_DEFAULT_BLOCK_SIZE, type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';

import { Asset } from '#assets/Asset';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import {
  CONTAINER_ALIGNMENT,
  CONTAINER_HEADER_SIZE,
  CONTAINER_MAGIC,
  CONTAINER_VERSION,
  decodeContainerData,
  parseContainer,
  readContainerEntry,
} from '#assets/container/assetContainer';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

import { testAssetType } from './test-asset-type';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

/** A fetch stub whose single `arrayBuffer()` body is `container`. */
const mockContainerFetch = (container: ArrayBuffer): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response);
  global.fetch = spy;

  return spy;
};

/** Parse `container` and decode its whole data section, the way a single-request load does. */
const readAll = async (container: ArrayBuffer): Promise<{ parsed: ReturnType<typeof parseContainer>; data: ArrayBuffer }> => {
  const parsed = parseContainer(container);

  return { parsed, data: await decodeContainerData(parsed, container) };
};

/** The bytes one packed source decodes to. */
const readSource = async (container: ArrayBuffer, source: string): Promise<Uint8Array> => {
  const { parsed, data } = await readAll(container);
  const entry = parsed.entries.find(candidate => candidate.source === source);

  expect(entry).toBeDefined();

  return new Uint8Array(readContainerEntry(entry!, data));
};

// The writer ships in `@codexo/exojs-build` and the reader here, so the header
// constants are stated twice on purpose - neither package may depend on the
// other. This suite is one of the two guards that keeps them equal: it parses
// what the published writer produces. The other is the CLI's `assets pack`
// spec, which loads a packed file through `Loader.loadContainer`.
describe('asset container format', () => {
  test('encode -> parse round-trips the head and the data section', async () => {
    const inputs: ContainerInput[] = [
      { source: 'level', type: 'json', bytes: utf8('{"score":1}'), mime: 'application/json' },
      { source: 'note', type: 'text', bytes: utf8('hello') },
    ];
    const container = encodeContainer(inputs);
    const { parsed, data } = await readAll(container);

    expect(parsed.version).toBe(CONTAINER_VERSION);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({ source: 'level', type: 'json', offset: 0, length: 11, mime: 'application/json' });
    // 11 bytes of the first entry, padded up to the next 8-byte boundary.
    expect(parsed.entries[1]).toMatchObject({ source: 'note', type: 'text', offset: 16, length: 5 });

    expect(new TextDecoder().decode(readContainerEntry(parsed.entries[1]!, data))).toBe('hello');
  });

  test('the header states a block size, an aligned data offset and no flags', () => {
    const container = encodeContainer([{ source: 'a', type: 'text', bytes: utf8('x') }]);
    const view = new DataView(container);
    const parsed = parseContainer(container);

    expect(view.getUint32(8, true)).toBe(0);
    expect(view.getUint32(16, true)).toBe(parsed.dataOffset);
    expect(parsed.dataOffset % CONTAINER_ALIGNMENT).toBe(0);
    expect(parsed.dataOffset).toBeGreaterThanOrEqual(CONTAINER_HEADER_SIZE + view.getUint32(12, true));
    expect(parsed.blockSize).toBe(CONTAINER_DEFAULT_BLOCK_SIZE);
    expect(view.getUint32(24, true)).toBe(0);
    expect(view.getUint32(28, true)).toBe(0);
  });

  test('every entry starts on an 8-byte boundary inside the data section', () => {
    const inputs: ContainerInput[] = [
      { source: 'a', type: 'binary', bytes: new Uint8Array(1) },
      { source: 'b', type: 'binary', bytes: new Uint8Array(3) },
      { source: 'c', type: 'binary', bytes: new Uint8Array(9) },
      { source: 'd', type: 'binary', bytes: new Uint8Array(16) },
    ];
    const { entries, dataLength } = parseContainer(encodeContainer(inputs));

    expect(entries.map(entry => entry.offset)).toEqual([0, 8, 16, 32]);
    expect(dataLength % CONTAINER_ALIGNMENT).toBe(0);
  });

  test('blocks tile the data section in order and hold whole entries', () => {
    // Four entries of 512 bytes against a 1 KiB block: two entries per block.
    const inputs: ContainerInput[] = ['a', 'b', 'c', 'd'].map(source => ({ source, type: 'binary', bytes: new Uint8Array(512) }));
    const { entries, blocks, dataLength } = parseContainer(encodeContainer(inputs, { blockSize: 1024 }));

    expect(blocks.map(block => [block.offset, block.length])).toEqual([
      [0, 1024],
      [1024, 1024],
    ]);
    expect(blocks.reduce((total, block) => total + block.length, 0)).toBe(dataLength);

    // Every entry lies inside exactly one block, which is what makes a changed
    // asset dirty its own blocks and nothing else.
    for (const entry of entries) {
      const holder = blocks.find(block => entry.offset >= block.offset && entry.offset + entry.length <= block.offset + block.length);

      expect(holder).toBeDefined();
    }
  });

  test('an entry larger than the block size gets a block of its own', () => {
    const inputs: ContainerInput[] = [
      { source: 'small', type: 'binary', bytes: new Uint8Array(64) },
      { source: 'huge', type: 'binary', bytes: new Uint8Array(4096) },
      { source: 'after', type: 'binary', bytes: new Uint8Array(64) },
    ];
    const { blocks } = parseContainer(encodeContainer(inputs, { blockSize: 1024 }));

    expect(blocks.map(block => block.length)).toEqual([64, 4096, 64]);
  });

  test('a compressible block is deflated and decodes back byte for byte', async () => {
    const text = 'compress me '.repeat(512);
    const container = encodeContainer([{ source: 'big.txt', type: 'text', bytes: utf8(text) }]);
    const { blocks } = parseContainer(container);

    expect(blocks[0]).toMatchObject({ codec: 'deflate-raw' });
    expect(blocks[0]!.storedLength).toBeLessThan(blocks[0]!.length);
    expect(new TextDecoder().decode(await readSource(container, 'big.txt'))).toBe(text);
  });

  test('an incompressible block is stored as it is', async () => {
    // Random bytes stand in for PNG, KTX2, audio and video: deflate grows them,
    // so the writer keeps the plain bytes rather than wrap them twice.
    const random = new Uint8Array(4096);

    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);

    const container = encodeContainer([{ source: 'noise.bin', type: 'binary', bytes: random }]);
    const { blocks } = parseContainer(container);

    expect(blocks[0]).toMatchObject({ codec: 'none', length: 4096, storedLength: 4096 });
    expect(await readSource(container, 'noise.bin')).toEqual(random);
  });

  test('preserves arbitrary binary bytes (no JSON coercion of data)', async () => {
    const raw = new Uint8Array([0, 255, 1, 254, 128]);

    expect(await readSource(encodeContainer([{ source: 'b', type: 'binary', bytes: raw }]), 'b')).toEqual(raw);
  });

  test('an empty container round-trips', async () => {
    const { parsed, data } = await readAll(encodeContainer([]));

    expect(parsed.entries).toHaveLength(0);
    expect(parsed.blocks).toHaveLength(0);
    expect(data.byteLength).toBe(0);
  });

  test('a block hash names its stored bytes, so an unchanged block keeps its hash', () => {
    const inputs = (payload: string): ContainerInput[] => [
      { source: 'stable.txt', type: 'text', bytes: utf8('stable '.repeat(200)) },
      { source: 'changing.txt', type: 'text', bytes: utf8(payload.repeat(200)) },
    ];
    const before = parseContainer(encodeContainer(inputs('before '), { blockSize: 1024 }));
    const after = parseContainer(encodeContainer(inputs('after!! '), { blockSize: 1024 }));

    // The first block holds only the unchanged asset, so a client already
    // holding it re-fetches the second block alone.
    expect(after.blocks[0]!.hash).toBe(before.blocks[0]!.hash);
    expect(after.blocks[1]!.hash).not.toBe(before.blocks[1]!.hash);
  });

  test('encodeContainer records a SHA-256 of the asset bytes', () => {
    const { entries } = parseContainer(encodeContainer([{ source: 'a', type: 'text', bytes: utf8('hello') }]));

    // Known digest of "hello": the hash identifies the asset, so it must not
    // depend on how this build happens to store it.
    expect(entries[0]?.hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  test('encodeContainer round-trips per-asset "options"', () => {
    const inputs: ContainerInput[] = [{ source: 'a', type: 'json', bytes: utf8('{}'), options: { strict: true } }];

    const { entries } = parseContainer(encodeContainer(inputs));

    expect(entries[0]).toMatchObject({ options: { strict: true } });
  });

  test('rejects a block size the header cannot state', () => {
    expect(() => encodeContainer([], { blockSize: 0 })).toThrow(/blockSize must be an integer/);
    expect(() => encodeContainer([], { blockSize: 2 ** 32 })).toThrow(/blockSize must be an integer/);
  });

  test('rejects a buffer smaller than the header', () => {
    expect(() => parseContainer(new ArrayBuffer(4))).toThrow(/too small/);
  });

  test('rejects bad magic', () => {
    const buffer = encodeContainer([{ source: 'a', type: 'text', bytes: utf8('x') }]);
    new Uint8Array(buffer)[0] = 'Z'.charCodeAt(0);

    expect(() => parseContainer(buffer)).toThrow(/bad magic/);
  });

  test('rejects an unsupported (future) version', () => {
    const buffer = encodeContainer([]);
    new DataView(buffer).setUint32(4, 999, true);

    expect(() => parseContainer(buffer)).toThrow(/unsupported version/);
  });

  test('rejects an earlier version instead of misreading its frame', () => {
    for (const version of [1, 2]) {
      const buffer = encodeContainer([]);
      new DataView(buffer).setUint32(4, version, true);

      // Every earlier version framed the file differently, so there is nothing
      // to read partially. Containers are build output: rebuild, do not migrate.
      expect(() => parseContainer(buffer)).toThrow(new RegExp(`unsupported version ${version}`));
      expect(() => parseContainer(buffer)).toThrow(/exo assets pack/);
    }
  });

  test('rejects a header that sets a reserved flag', () => {
    const buffer = encodeContainer([]);
    new DataView(buffer).setUint32(8, 1, true);

    expect(() => parseContainer(buffer)).toThrow(/flags 1 are set/);
  });

  test('rejects a head length that runs past the buffer', () => {
    const buffer = encodeContainer([{ source: 'a', type: 'text', bytes: utf8('x') }]);
    new DataView(buffer).setUint32(12, 0xffff, true);

    expect(() => parseContainer(buffer)).toThrow(/runs past the buffer/);
  });

  test('rejects a data offset that is not aligned', () => {
    const buffer = encodeContainer([{ source: 'a', type: 'text', bytes: utf8('x') }]);
    const view = new DataView(buffer);

    view.setUint32(16, view.getUint32(16, true) + 1, true);

    expect(() => parseContainer(buffer)).toThrow(/not a multiple of 8/);
  });

  test('rejects a data offset inside the head', () => {
    const buffer = encodeContainer([{ source: 'a', type: 'text', bytes: utf8('x') }]);

    new DataView(buffer).setUint32(16, 0, true);

    expect(() => parseContainer(buffer)).toThrow(/is outside the container/);
  });

  test('rejects a zero block size', () => {
    const buffer = encodeContainer([]);
    new DataView(buffer).setUint32(20, 0, true);

    expect(() => parseContainer(buffer)).toThrow(/block size is zero/);
  });

  // -------------------------------------------------------------------------
  // Hand-built heads - exercises the field-level validation guards directly,
  // bypassing encodeContainer's own type safety.
  // -------------------------------------------------------------------------

  /** Builds a container (header + head) with an arbitrary raw head, and no block area. */
  const encodeRawHeadBuffer = (headBytes: Uint8Array): ArrayBuffer => {
    const dataOffset = Math.ceil((CONTAINER_HEADER_SIZE + headBytes.byteLength) / CONTAINER_ALIGNMENT) * CONTAINER_ALIGNMENT;
    const buffer = new ArrayBuffer(dataOffset);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
      bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
    }
    view.setUint32(4, CONTAINER_VERSION, true);
    view.setUint32(12, headBytes.byteLength, true);
    view.setUint32(16, dataOffset, true);
    view.setUint32(20, CONTAINER_DEFAULT_BLOCK_SIZE, true);
    bytes.set(headBytes, CONTAINER_HEADER_SIZE);

    return buffer;
  };

  const encodeRawHead = (head: unknown): ArrayBuffer => encodeRawHeadBuffer(utf8(JSON.stringify(head)));

  const HASH_A = 'a'.repeat(64);

  /** A head whose single block covers `length` bytes of data that is not actually there. */
  const headWithBlock = (entries: unknown[], block: Record<string, unknown>): ArrayBuffer =>
    encodeRawHead({ entries, blocks: [{ offset: 0, length: 0, storedOffset: 0, storedLength: 0, codec: 'none', hash: HASH_A, ...block }] });

  test('rejects a head region that is not valid JSON', () => {
    expect(() => parseContainer(encodeRawHeadBuffer(utf8('{not valid json')))).toThrow(/head is not valid JSON/);
  });

  test('rejects a head that is not a JSON object', () => {
    expect(() => parseContainer(encodeRawHead([]))).toThrow(/head is not a JSON object/);
  });

  test('rejects a head without entries or blocks', () => {
    expect(() => parseContainer(encodeRawHead({ blocks: [] }))).toThrow(/no "entries" array/);
    expect(() => parseContainer(encodeRawHead({ entries: [] }))).toThrow(/no "blocks" array/);
  });

  test('rejects a block table with a gap', () => {
    const head = {
      entries: [],
      blocks: [
        { offset: 0, length: 0, storedOffset: 0, storedLength: 0, codec: 'none', hash: HASH_A },
        { offset: 8, length: 0, storedOffset: 0, storedLength: 0, codec: 'none', hash: HASH_A },
      ],
    };

    expect(() => parseContainer(encodeRawHead(head))).toThrow(/block 1 covers the data section from 8, but the previous block ends at 0/);
  });

  test('rejects a block whose codec this build cannot decode', () => {
    expect(() => parseContainer(headWithBlock([], { codec: 'zstd' }))).toThrow(/unsupported codec "zstd"/);
  });

  test('rejects an uncoded block whose stored length disagrees with what it covers', () => {
    expect(() => parseContainer(headWithBlock([], { length: 8, storedLength: 4 }))).toThrow(/stores 4 bytes uncoded but covers 8/);
  });

  test('rejects a block with no usable hash', () => {
    expect(() => parseContainer(headWithBlock([], { hash: 'ABC' }))).toThrow(/lowercase hex SHA-256 "hash"/);
  });

  test('rejects a block whose stored bytes run past the container', () => {
    expect(() => parseContainer(headWithBlock([], { codec: 'deflate-raw', storedLength: 64 }))).toThrow(/block 0 runs past the container/);
  });

  test('rejects an entry that is not an object', () => {
    expect(() => parseContainer(encodeRawHead({ entries: [42], blocks: [] }))).toThrow(/entry 0 is not an object/);
  });

  test('rejects an entry with a non-string source', () => {
    expect(() => parseContainer(encodeRawHead({ entries: [{ source: 42, type: 'text', offset: 0, length: 0 }], blocks: [] }))).toThrow(/non-string "source"/);
  });

  test('rejects an entry with a non-string type', () => {
    expect(() => parseContainer(encodeRawHead({ entries: [{ source: 'a', type: 42, offset: 0, length: 0 }], blocks: [] }))).toThrow(/non-string "type"/);
  });

  test('rejects an entry with an invalid (negative) offset', () => {
    expect(() => parseContainer(encodeRawHead({ entries: [{ source: 'a', type: 'text', offset: -8, length: 0 }], blocks: [] }))).toThrow(/invalid "offset"/);
  });

  test('rejects an entry with an invalid (non-numeric) length', () => {
    expect(() => parseContainer(encodeRawHead({ entries: [{ source: 'a', type: 'text', offset: 0, length: 'x' }], blocks: [] }))).toThrow(/invalid "length"/);
  });

  test('rejects an entry that does not start on an alignment boundary', () => {
    const head = { entries: [{ source: 'a', type: 'text', offset: 4, length: 0 }], blocks: [] };

    expect(() => parseContainer(encodeRawHead(head))).toThrow(/starts at 4, which is not a multiple of 8/);
  });

  test('rejects an entry whose slice runs past the data section', () => {
    const head = { entries: [{ source: 'a', type: 'text', offset: 0, length: 999 }], blocks: [] };

    expect(() => parseContainer(encodeRawHead(head))).toThrow(/runs past the data section/);
  });

  test('rejects an entry with a non-string mime', () => {
    const head = { entries: [{ source: 'a', type: 'text', offset: 0, length: 0, mime: 123 }], blocks: [] };

    expect(() => parseContainer(encodeRawHead(head))).toThrow(/non-string "mime"/);
  });

  test('rejects an entry hash that is not a lowercase hex SHA-256', () => {
    const head = { entries: [{ source: 'a', type: 'text', offset: 0, length: 0, hash: 'ABC' }], blocks: [] };

    expect(() => parseContainer(encodeRawHead(head))).toThrow(/lowercase hex SHA-256/);
  });

  test('rejects a head that packs one source twice', () => {
    const duplicated = encodeContainer([
      { source: 'cfg.json', type: 'json', bytes: utf8('{"which":"first"}') },
      { source: 'cfg.json', type: 'json', bytes: utf8('{"which":"second"}') },
    ]);

    // Both entries resolve to one asset identity, so the second unpack would
    // build a payload for it that no owner can ever release.
    expect(() => parseContainer(duplicated)).toThrow(/entry "cfg.json" is packed twice/);
  });

  test('an entry carrying "options" round-trips through a raw head', () => {
    const head = { entries: [{ source: 'a', type: 'text', offset: 0, length: 0, options: { mode: 'fast' } }], blocks: [] };

    expect(parseContainer(encodeRawHead(head)).entries[0]).toMatchObject({ options: { mode: 'fast' } });
  });

  test('rejects stored bytes that do not decode to the region their block covers', async () => {
    const container = encodeContainer([{ source: 'big.txt', type: 'text', bytes: utf8('shrink me '.repeat(512)) }]);
    const parsed = parseContainer(container);

    expect(parsed.blocks[0]!.codec).toBe('deflate-raw');

    const block = parsed.blocks[0]!;
    const understated = { ...parsed, dataLength: parsed.dataLength - 8, blocks: [{ ...block, length: block.length - 8 }] };

    await expect(decodeContainerData(understated, container)).rejects.toThrow(AssetDecodeError);
    await expect(decodeContainerData(understated, container)).rejects.toThrow(/decodes to more than/);
  });
});

describe('Loader.loadContainer', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('loads N assets from one container in a single request', async () => {
    const container = encodeContainer([
      { source: 'data/level.json', type: 'json', bytes: utf8('{"score":42}') },
      { source: 'docs/readme.txt', type: 'text', bytes: utf8('hello world') },
      { source: 'data/blob.bin', type: 'binary', bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const fetchSpy = mockContainerFetch(container);

    const loader = createCoreLoader();
    await loader.loadContainer('assets/pack.exoa');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loader.get(Asset.type('json', 'data/level.json')).value).toEqual({ score: 42 });
    expect(loader.get(Asset.type('text', 'docs/readme.txt')).value).toBe('hello world');
    expect(new Uint8Array(loader.get(Asset.type('binary', 'data/blob.bin')).value)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('loads assets spread across several blocks', async () => {
    const container = encodeContainer(
      [
        { source: 'data/level.json', type: 'json', bytes: utf8(`{"score":42,"pad":"${'x'.repeat(600)}"}`) },
        { source: 'docs/readme.txt', type: 'text', bytes: utf8('hello world') },
      ],
      { blockSize: 256 },
    );

    expect(parseContainer(container).blocks.length).toBeGreaterThan(1);

    mockContainerFetch(container);

    const loader = createCoreLoader();
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Asset.type('json', 'data/level.json')).value).toMatchObject({ score: 42 });
    expect(loader.get(Asset.type('text', 'docs/readme.txt')).value).toBe('hello world');
  });

  test('container entries are ordinary claimed assets, visible and releasable', async () => {
    const container = encodeContainer([
      { source: 'data/level.json', type: 'json', bytes: utf8('{"score":42}') },
      { source: 'docs/readme.txt', type: 'text', bytes: utf8('hello world') },
    ]);
    mockContainerFetch(container);

    const loader = createCoreLoader();
    const pack = await loader.loadContainer('assets/pack.exoa');

    // The old container path stored payloads with no claim at all, so they were
    // invisible to inspect() and could never be freed.
    expect(loader.inspect()).toHaveLength(2);
    expect(loader.inspect().every(row => row.claims === 1)).toBe(true);

    pack.destroy();

    expect(loader.inspect()).toHaveLength(0);
    expect(loader.peek(Asset.type('json', 'data/level.json'))).toBeUndefined();
  });

  test('a container entry and a network load of the same source are one asset', async () => {
    const container = encodeContainer([{ source: 'data/level.json', type: 'json', bytes: utf8('{"score":42}') }]);
    mockContainerFetch(container);

    const loader = createCoreLoader();
    const pack = await loader.loadContainer('assets/pack.exoa');
    const scope = loader.createScope({ name: 'gameplay' });

    const ref = scope.get('data/level.json');

    expect(ref.value).toEqual({ score: 42 });
    expect(loader.inspect()).toHaveLength(1);
    expect(loader.inspect()[0]?.claims).toBe(2);

    // The container going away must not strip an asset a live consumer holds.
    pack.destroy();

    expect(loader.peek(Asset.type('json', 'data/level.json'))).toEqual({ score: 42 });
    expect(loader.inspect()[0]?.claims).toBe(1);
  });

  test('loadContainer on a scope claims the entries under that scope', async () => {
    const container = encodeContainer([{ source: 'data/level.json', type: 'json', bytes: utf8('{"score":42}') }]);
    mockContainerFetch(container);

    const loader = createCoreLoader();
    const level = loader.createScope({ name: 'level-1' });

    await level.loadContainer('assets/pack.exoa');

    expect(loader.inspect()).toHaveLength(1);

    level.destroy();

    expect(loader.inspect()).toHaveLength(0);
  });

  test('throws on an unknown asset type and stores nothing', async () => {
    const container = encodeContainer([{ source: 'x.dat', type: 'nonsense', bytes: utf8('x') }]);
    mockContainerFetch(container);

    const loader = createCoreLoader();

    await expect(loader.loadContainer('x.exoa')).rejects.toThrow(/unknown asset type "nonsense"/);
  });

  test('a load reaching an entry mid-unpack joins it instead of fetching it again', async () => {
    class Gated {}

    let entered!: () => void;
    let release!: () => void;
    const enteredCreate = new Promise<void>(resolve => (entered = resolve));
    const gate = new Promise<void>(resolve => (release = resolve));

    const container = encodeContainer([{ source: 'level.gated', type: 'gated', bytes: utf8('from-container') }]);
    const fetchSpy = mockContainerFetch(container);
    const loader = createCoreLoader();

    loader._installAssetTypes([
      testAssetType<string, { body: string }>({
        id: 'gated',
        token: Gated,
        extensions: ['gated'],
        create: async source => {
          entered();
          await gate;

          return { body: source };
        },
      }),
    ]);

    const unpacking = loader.loadContainer('pack.exoa');

    await enteredCreate;

    // The container is parsed and the entry is being built, but nothing is
    // stored yet - the window in which the key used to look completely unknown.
    const joined = loader.load(Asset.type('gated' as never, 'level.gated'));

    release();
    await unpacking;

    // One request, for the container itself: the load joined the unpack rather
    // than starting a competing acquisition whose payload would overwrite it.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(joined).resolves.toEqual({ body: 'from-container' });
    expect(loader.peek(Asset.type('gated' as never, 'level.gated'))).toEqual({ body: 'from-container' });
  });

  test('a container that fails while unpacking leaves nothing claimed', async () => {
    const container = encodeContainer([
      { source: 'ok.json', type: 'json', bytes: utf8('{"ok":true}') },
      { source: 'broken.json', type: 'json', bytes: utf8('{not json') },
    ]);
    mockContainerFetch(container);

    const loader = createCoreLoader();

    loader.onError.add(() => undefined);

    await expect(loader.loadContainer('pack.exoa')).rejects.toThrow();

    // The caller never receives the scope that claimed the entries, so a claim
    // surviving the failure could never be released.
    expect(loader.inspect()).toHaveLength(0);
    expect(loader.peek('ok.json')).toBeUndefined();
  });

  test('throws on a malformed container', async () => {
    mockContainerFetch(new ArrayBuffer(4));

    const loader = createCoreLoader();

    await expect(loader.loadContainer('bad.exoa')).rejects.toThrow(/Invalid asset container/);
    // Broken bytes stay broken: the caller has to drop the container, not retry
    // it, so the failure keeps its own type instead of a generic Error.
    await expect(loader.loadContainer('bad.exoa')).rejects.toBeInstanceOf(AssetDecodeError);
  });
});
