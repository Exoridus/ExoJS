import { materializeAssetBindings } from '#extensions/materialize';
import { CONTAINER_HEADER_SIZE, CONTAINER_MAGIC, type ContainerInput, encodeContainer, parseContainer } from '#resources/AssetContainer';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { BinaryAsset, Json, TextAsset } from '#resources/tokens';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function createCoreLoader(): Loader {
  const loader = new Loader({ basePath: '/' });
  materializeAssetBindings(loader, coreAssetBindings);

  return loader;
}

/** A fetch stub whose single `arrayBuffer()` body is `container`. */
function mockContainerFetch(container: ArrayBuffer): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response);
  global.fetch = spy;

  return spy;
}

describe('asset container format', () => {
  test('encode → parse round-trips the index and data offsets', () => {
    const inputs: ContainerInput[] = [
      { alias: 'level', type: 'json', bytes: utf8('{"score":1}'), mime: 'application/json' },
      { alias: 'note', type: 'text', bytes: utf8('hello') },
    ];

    const { version, entries, dataStart } = parseContainer(encodeContainer(inputs));

    expect(version).toBe(1);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ alias: 'level', type: 'json', offset: 0, length: 11, mime: 'application/json' });
    expect(entries[1]).toMatchObject({ alias: 'note', type: 'text', offset: 11, length: 5 });

    const buffer = encodeContainer(inputs);
    const second = entries[1]!;
    const slice = buffer.slice(dataStart + second.offset, dataStart + second.offset + second.length);

    expect(new TextDecoder().decode(slice)).toBe('hello');
  });

  test('preserves arbitrary binary bytes (no JSON coercion of data)', () => {
    const raw = new Uint8Array([0, 255, 1, 254, 128]);
    const { entries, dataStart } = parseContainer(encodeContainer([{ alias: 'b', type: 'binary', bytes: raw }]));
    const buffer = encodeContainer([{ alias: 'b', type: 'binary', bytes: raw }]);
    const first = entries[0]!;

    expect(new Uint8Array(buffer.slice(dataStart + first.offset, dataStart + first.offset + first.length))).toEqual(raw);
  });

  test('an empty container round-trips', () => {
    expect(parseContainer(encodeContainer([])).entries).toHaveLength(0);
  });

  test('rejects a buffer smaller than the header', () => {
    expect(() => parseContainer(new ArrayBuffer(4))).toThrow(/too small/);
  });

  test('rejects bad magic', () => {
    const buffer = encodeContainer([{ alias: 'a', type: 'text', bytes: utf8('x') }]);
    new Uint8Array(buffer)[0] = 'Z'.charCodeAt(0);

    expect(() => parseContainer(buffer)).toThrow(/bad magic/);
  });

  test('rejects an unsupported (future) version', () => {
    const buffer = encodeContainer([]);
    new DataView(buffer).setUint32(4, 999, true);

    expect(() => parseContainer(buffer)).toThrow(/unsupported version/);
  });

  test('rejects an index length that runs past the buffer', () => {
    const buffer = encodeContainer([{ alias: 'a', type: 'text', bytes: utf8('x') }]);
    new DataView(buffer).setUint32(8, 0xffff, true);

    expect(() => parseContainer(buffer)).toThrow(/runs past the buffer/);
  });

  test('rejects an entry whose slice runs past the data section', () => {
    const indexBytes = utf8(JSON.stringify([{ alias: 'a', type: 'text', offset: 0, length: 999 }]));
    const buffer = new ArrayBuffer(CONTAINER_HEADER_SIZE + indexBytes.byteLength + 2);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
      bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
    }
    view.setUint32(4, 1, true);
    view.setUint32(8, indexBytes.byteLength, true);
    bytes.set(indexBytes, CONTAINER_HEADER_SIZE);

    expect(() => parseContainer(buffer)).toThrow(/runs past the data section/);
  });

  test('rejects a non-array index', () => {
    const indexBytes = utf8(JSON.stringify({ not: 'an array' }));
    const buffer = new ArrayBuffer(CONTAINER_HEADER_SIZE + indexBytes.byteLength);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
      bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
    }
    view.setUint32(4, 1, true);
    view.setUint32(8, indexBytes.byteLength, true);
    bytes.set(indexBytes, CONTAINER_HEADER_SIZE);

    expect(() => parseContainer(buffer)).toThrow(/index is not an array/);
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
      { alias: 'level', type: 'json', bytes: utf8('{"score":42}') },
      { alias: 'readme', type: 'text', bytes: utf8('hello world') },
      { alias: 'blob', type: 'binary', bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const fetchSpy = mockContainerFetch(container);

    const loader = createCoreLoader();
    await loader.loadContainer('assets/pack.exoa');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loader.get(Json, 'level')).toEqual({ score: 42 });
    expect(loader.get(TextAsset, 'readme')).toBe('hello world');
    expect(new Uint8Array(loader.get(BinaryAsset, 'blob') as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('throws on an unknown asset type and stores nothing', async () => {
    const container = encodeContainer([{ alias: 'x', type: 'nonsense', bytes: utf8('x') }]);
    mockContainerFetch(container);

    const loader = createCoreLoader();

    await expect(loader.loadContainer('x.exoa')).rejects.toThrow(/unknown asset type "nonsense"/);
  });

  test('throws on a malformed container', async () => {
    mockContainerFetch(new ArrayBuffer(4));

    const loader = createCoreLoader();

    await expect(loader.loadContainer('bad.exoa')).rejects.toThrow(/Invalid asset container/);
  });
});
