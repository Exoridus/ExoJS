import { type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';

import { AssetDecodeError } from '#assets/AssetDecodeError';
import { parseContainer } from '#assets/container/assetContainer';
import type { ContainerBlockStore } from '#assets/container/containerBlockStore';
import { ContainerReader } from '#assets/container/ContainerReader';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

/** Distinct, incompressible bytes, so a block never collapses to nothing and two entries never coincide. */
const noise = (length: number, seed: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  let state = seed * 2654435761 + 1;

  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }

  return bytes;
};

interface ServedRequest {
  readonly range: string | undefined;
}

/** A `fetch` stub over one container file, honouring byte ranges the way `exo serve` now does. */
const serve = (container: ArrayBuffer, options: { ranges?: boolean; contentEncoding?: string } = {}): { requests: ServedRequest[] } => {
  const ranges = options.ranges ?? true;
  const requests: ServedRequest[] = [];
  const file = new Uint8Array(container);

  global.fetch = vi.fn(async (_url: unknown, init?: RequestInit): Promise<Response> => {
    const range = new Headers(init?.headers).get('Range') ?? undefined;

    requests.push({ range });

    const headers = new Headers(options.contentEncoding === undefined ? {} : { 'Content-Encoding': options.contentEncoding });
    const match = ranges && range !== undefined ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;

    if (match === null) {
      return { ok: true, status: 200, headers, arrayBuffer: async () => container } as unknown as Response;
    }

    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), file.byteLength - 1);

    headers.set('Content-Range', `bytes ${start}-${end}/${file.byteLength}`);

    return {
      ok: true,
      status: 206,
      headers,
      arrayBuffer: async () => file.slice(start, end + 1).buffer,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { requests };
};

/** A block store in memory, plus a record of what it was asked for. */
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

/** Three entries big enough to land in blocks of their own at a 1 KiB block size. */
const threeBlockInputs = (): ContainerInput[] => [
  { source: 'a.bin', type: 'binary', bytes: noise(1500, 1) },
  { source: 'b.bin', type: 'binary', bytes: noise(1500, 2) },
  { source: 'c.bin', type: 'binary', bytes: noise(1500, 3) },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ContainerReader over a range-capable server', () => {
  test('opens on one request and reads the head from its prefix', async () => {
    const container = encodeContainer([{ source: 'note', type: 'text', bytes: utf8('hello') }]);
    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa');

    expect(requests).toHaveLength(1);
    expect(reader.ranged).toBe(true);
    expect(reader.container.entries.map(entry => entry.source)).toEqual(['note']);
  });

  test('reading one entry fetches only the blocks covering it', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });
    const parsed = parseContainer(container);

    expect(parsed.blocks.length).toBeGreaterThan(1);

    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa');
    const entry = reader.entry('b.bin')!;

    await reader.readEntry(entry);

    // The open, then exactly the one block that covers this entry.
    expect(parsed.blocks).toHaveLength(3);
    expect(requests).toHaveLength(2);
  });

  test('an entry round-trips byte for byte', async () => {
    const inputs = threeBlockInputs();
    const container = encodeContainer(inputs, { blockSize: 1024 });

    serve(container);

    const reader = await ContainerReader.open('/pack.exoa');
    const bytes = await reader.readEntry(reader.entry('c.bin')!);

    expect(new Uint8Array(bytes)).toEqual(inputs[2]!.bytes);
  });

  test('entries sharing a block decode it once', async () => {
    // Small entries pack into one block, so reading both must not fetch twice.
    const container = encodeContainer([
      { source: 'one', type: 'text', bytes: utf8('first') },
      { source: 'two', type: 'text', bytes: utf8('second') },
    ]);
    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa');
    const [first, second] = await reader.readEntries([reader.entry('one')!, reader.entry('two')!]);

    expect(text(first!)).toBe('first');
    expect(text(second!)).toBe('second');
    expect(requests.filter(request => request.range?.startsWith('bytes=') === true)).toHaveLength(2);
  });

  test('a concurrent read of one block fetches it once', async () => {
    const container = encodeContainer([
      { source: 'one', type: 'text', bytes: utf8('first') },
      { source: 'two', type: 'text', bytes: utf8('second') },
    ]);
    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa');

    await Promise.all([reader.readEntry(reader.entry('one')!), reader.readEntry(reader.entry('two')!)]);

    expect(requests).toHaveLength(2);
  });
});

describe('ContainerReader degradation', () => {
  test('a server that ignores ranges leaves the reader on the whole file', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });
    const { requests } = serve(container, { ranges: false });
    const reader = await ContainerReader.open('/pack.exoa');

    expect(reader.ranged).toBe(false);

    await reader.readEntry(reader.entry('a.bin')!);

    // The open fetched everything; no read may go back to the network.
    expect(requests).toHaveLength(1);
  });

  test('a content-encoded response is refused for range use', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });
    const { requests } = serve(container, { contentEncoding: 'gzip' });
    const reader = await ContainerReader.open('/pack.exoa');

    // Offsets would address the encoded stream, so the reader must not trust them.
    expect(reader.ranged).toBe(false);
    expect(requests).toHaveLength(1);

    const bytes = await reader.readEntry(reader.entry('b.bin')!);

    expect(new Uint8Array(bytes)).toEqual(threeBlockInputs()[1]!.bytes);
  });

  test('fromBuffer reads a container already in hand without any request', async () => {
    global.fetch = vi.fn(() => {
      throw new Error('no request may be made');
    }) as unknown as typeof fetch;

    const container = encodeContainer([{ source: 'note', type: 'text', bytes: utf8('hello') }]);
    const reader = ContainerReader.fromBuffer(container);

    expect(text(await reader.readEntry(reader.entry('note')!))).toBe('hello');
  });
});

describe('ContainerReader block store', () => {
  test('a block already stored is not fetched again', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });
    const store = recordingStore();

    serve(container);

    const first = await ContainerReader.open('/pack.exoa', { store });
    await first.readEntry(first.entry('a.bin')!);

    expect(store.held.size).toBe(1);

    const { requests } = serve(container);
    const second = await ContainerReader.open('/pack.exoa', { store });

    await second.readEntry(second.entry('a.bin')!);

    expect(store.hits).toHaveLength(1);
    // Only the open; the block itself came out of the store.
    expect(requests).toHaveLength(1);
  });

  test('an entry whose stored bytes changed length is fetched rather than trusted', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });
    const parsed = parseContainer(container);
    const store = recordingStore();

    store.held.set(parsed.blocks[0]!.hash, new Uint8Array([1, 2, 3]));

    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa', { store });
    const bytes = await reader.readEntry(reader.entry('a.bin')!);

    expect(new Uint8Array(bytes)).toEqual(threeBlockInputs()[0]!.bytes);
    expect(requests.length).toBeGreaterThan(1);
  });

  test('a store that answers nothing changes only the traffic, never the result', async () => {
    const container = encodeContainer(threeBlockInputs(), { blockSize: 1024 });

    serve(container);

    const reader = await ContainerReader.open('/pack.exoa', {
      store: { get: async () => undefined, put: async () => undefined },
    });

    expect(new Uint8Array(await reader.readEntry(reader.entry('b.bin')!))).toEqual(threeBlockInputs()[1]!.bytes);
  });
});

describe('ContainerReader fragments', () => {
  test('a region of an uncompressed entry is fetched directly', async () => {
    // Noise does not shrink, so the writer stores these blocks uncoded.
    const inputs = threeBlockInputs();
    const expected = inputs[1]!.bytes as Uint8Array;
    const container = encodeContainer(inputs, { blockSize: 1024 });

    expect(parseContainer(container).blocks.every(block => block.codec === 'none')).toBe(true);

    const { requests } = serve(container);
    const reader = await ContainerReader.open('/pack.exoa');
    const region = await reader.readEntryRange(reader.entry('b.bin')!, 100, 16);

    expect(new Uint8Array(region)).toEqual(expected.subarray(100, 116));
    expect(requests[1]!.range).toBe(
      `bytes=${reader.container.dataOffset + reader.container.blocks[1]!.storedOffset + 100}-${reader.container.dataOffset + reader.container.blocks[1]!.storedOffset + 115}`,
    );
  });

  test('a region of a compressed entry decodes its block and slices', async () => {
    const compressible = new Uint8Array(4000).fill(0x41);
    const container = encodeContainer([{ source: 'flat.bin', type: 'binary', bytes: compressible }], { blockSize: 1024 });

    expect(parseContainer(container).blocks.some(block => block.codec === 'deflate-raw')).toBe(true);

    serve(container);

    const reader = await ContainerReader.open('/pack.exoa');
    const region = await reader.readEntryRange(reader.entry('flat.bin')!, 10, 8);

    expect(new Uint8Array(region)).toEqual(compressible.subarray(10, 18));
  });

  test('a range outside the entry is refused', async () => {
    const container = encodeContainer([{ source: 'note', type: 'text', bytes: utf8('hello') }]);

    serve(container);

    const reader = await ContainerReader.open('/pack.exoa');

    await expect(reader.readEntryRange(reader.entry('note')!, 3, 10)).rejects.toThrow(AssetDecodeError);
  });
});
