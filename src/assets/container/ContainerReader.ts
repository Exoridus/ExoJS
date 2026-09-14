import { AssetDecodeError } from '#assets/AssetDecodeError';

import {
  CONTAINER_HEADER_SIZE,
  type ContainerBlock,
  type ContainerEntry,
  containerHeadLength,
  decodeContainerBlock,
  parseContainerHead,
  type ParsedContainer,
} from './assetContainer';
import type { ContainerBlockStore } from './containerBlockStore';
import { bufferContainerSource, type ContainerSource, openContainerSource } from './containerSource';

/** How a {@link ContainerReader} is opened. */
export interface ContainerReaderOptions {
  /**
   * Where to keep blocks between visits. Given one, a reader consults it before
   * the network and offers it every block it fetches, which is what makes a
   * second load of a changed pack cost only the blocks that changed.
   */
  readonly store?: ContainerBlockStore;
  /** Forwarded to every request the reader makes - `signal`, credentials, headers. */
  readonly init?: RequestInit;
}

type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset container: ${detail}.`, assetType: 'container' });
};

/**
 * Reads assets out of a `.exoa` container, fetching only the blocks it needs.
 *
 * A container's data section is tiled by independently compressed blocks, and a
 * block boundary always falls on an entry boundary. Reading an entry is
 * therefore: find the blocks covering it, obtain each one, decode, slice. Where
 * a block comes from - a byte range, a block store, or a buffer already held -
 * changes the cost but not the result.
 *
 * Decoded blocks are held for the reader's lifetime, so entries sharing a block
 * decode it once. That is the whole reason {@link readEntries} exists: reading
 * entries one at a time through separate readers would decompress a shared
 * block once per entry.
 *
 * A reader is not thread-safe across `await` boundaries in the sense of
 * cancellation: pass a `signal` through `init` to abandon in-flight requests.
 */
export class ContainerReader {
  private readonly _decoded = new Map<number, Uint8Array<ArrayBuffer>>();
  /** In-flight decodes, so two entries sharing a block await one fetch rather than two. */
  private readonly _pending = new Map<number, Promise<Uint8Array<ArrayBuffer>>>();

  private constructor(
    /** The validated head: entries, blocks and where the data section begins. */
    public readonly container: ParsedContainer,
    private readonly _source: ContainerSource,
    private readonly _store: ContainerBlockStore | undefined,
  ) {}

  /**
   * Open the container at `url`, reading its head and nothing else where the
   * server allows it.
   *
   * Costs one request. A server that honours byte ranges leaves the reader able
   * to fetch blocks individually; one that does not - or one that
   * content-encodes its responses, where offsets could not be trusted - hands
   * over the whole file, and the reader serves every later read from memory.
   *
   * Throws when the file cannot be fetched, or is not a container this build
   * reads.
   */
  public static async open(url: string, options: ContainerReaderOptions = {}): Promise<ContainerReader> {
    const { source, headPrefix } = await openContainerSource(url, options.init);
    const prefix = headPrefix ?? (await ContainerReader._readHead(source));

    return new ContainerReader(parseContainerHead(prefix, source.byteLength), source, options.store);
  }

  /** Open a container already held whole in memory - the single-request path. */
  public static fromBuffer(buffer: ArrayBuffer, options: ContainerReaderOptions = {}): ContainerReader {
    const source = bufferContainerSource(buffer);

    return new ContainerReader(parseContainerHead(buffer, buffer.byteLength), source, options.store);
  }

  /** Read header, then the head it declares. Two reads, only on a probe that fell short. */
  private static async _readHead(source: ContainerSource): Promise<ArrayBuffer> {
    const header = await source.read(0, Math.min(CONTAINER_HEADER_SIZE, source.byteLength));
    const headLength = containerHeadLength(header.buffer);

    if (headLength > source.byteLength) {
      fail(`head length ${headLength} runs past the container (size ${source.byteLength})`);
    }

    const head = await source.read(0, headLength);

    return head.buffer;
  }

  /** Whether reads cost only the bytes they need, rather than being served from a buffer already fetched whole. */
  public get ranged(): boolean {
    return this._source.ranged;
  }

  /** The entry for `source`, or `undefined` when the container does not hold it. */
  public entry(source: string): ContainerEntry | undefined {
    return this.container.entries.find(entry => entry.source === source);
  }

  /**
   * Read one entry's asset bytes.
   *
   * Prefer {@link readEntries} for several: entries commonly share a block, and
   * reading them together is what keeps a shared block fetched and decoded
   * once.
   */
  public async readEntry(entry: ContainerEntry): Promise<ArrayBuffer> {
    const [bytes] = await this.readEntries([entry]);

    if (bytes === undefined) fail(`entry "${entry.source}" produced no bytes`);

    return bytes;
  }

  /**
   * Read several entries, in the order given.
   *
   * Every block the entries touch is obtained once, concurrently, and each
   * entry is then sliced out of the decoded regions. An entry spanning two
   * blocks is joined across them.
   */
  public async readEntries(entries: readonly ContainerEntry[]): Promise<ArrayBuffer[]> {
    const needed = new Set<number>();

    for (const entry of entries) {
      for (const index of this._blocksCovering(entry)) needed.add(index);
    }

    await Promise.all([...needed].map(async index => this._block(index)));

    return entries.map(entry => this._slice(entry));
  }

  /**
   * Read part of one entry - a video segment, a region of a large buffer -
   * without the rest of it.
   *
   * This only avoids work for an entry stored uncompressed, which is what the
   * writer's "keep the compression only if it shrinks" rule already decides for
   * H.264, AAC, Opus and KTX2. A compressed entry still has its covering blocks
   * decoded whole, because that is the unit the codec framing allows.
   */
  public async readEntryRange(entry: ContainerEntry, offset: number, length: number): Promise<ArrayBuffer> {
    if (offset < 0 || length < 0 || offset + length > entry.length) {
      fail(`range ${offset}..${offset + length} lies outside entry "${entry.source}" (${entry.length} bytes)`);
    }

    const start = entry.offset + offset;
    const covering = this._blocksInRange(start, length);
    const first = covering.length === 0 ? undefined : this._blockAt(covering[0] ?? 0);

    // Uncompressed and range-capable: the region maps straight onto a byte
    // range of the file, so neither the block nor its neighbours are touched.
    if (first !== undefined && this._source.ranged && covering.every(index => this._blockAt(index).codec === 'none')) {
      const bytes = await this._source.read(this.container.dataOffset + first.storedOffset + (start - first.offset), length);

      return bytes.buffer;
    }

    await Promise.all(covering.map(async index => this._block(index)));

    return this._sliceRegion(start, length, `entry "${entry.source}"`);
  }

  /** Drop every decoded block. The reader stays usable and will decode again on the next read. */
  public release(): void {
    this._decoded.clear();
    this._pending.clear();
  }

  /** Indices of the blocks covering an entry's region. */
  private _blocksCovering(entry: ContainerEntry): number[] {
    return this._blocksInRange(entry.offset, entry.length);
  }

  private _blocksInRange(offset: number, length: number): number[] {
    const covering: number[] = [];
    const end = offset + length;

    for (const [index, block] of this.container.blocks.entries()) {
      if (block.offset < end && block.offset + block.length > offset) covering.push(index);
    }

    // A zero-length region covers nothing by the half-open test above, yet it
    // still has to name the block it starts in so a caller gets an empty slice
    // rather than a failure.
    if (covering.length === 0 && length === 0) {
      const index = this.container.blocks.findIndex(block => block.offset <= offset && offset <= block.offset + block.length);

      if (index !== -1) covering.push(index);
    }

    return covering;
  }

  /** Obtain and decode one block, from the store when it holds it and from the source otherwise. */
  private async _block(index: number): Promise<Uint8Array<ArrayBuffer>> {
    const held = this._decoded.get(index);

    if (held !== undefined) return held;

    const inFlight = this._pending.get(index);

    if (inFlight !== undefined) return inFlight;

    const decoding = this._fetchAndDecode(index).then(bytes => {
      this._decoded.set(index, bytes);
      this._pending.delete(index);

      return bytes;
    });

    this._pending.set(index, decoding);

    return decoding;
  }

  private async _fetchAndDecode(index: number): Promise<Uint8Array<ArrayBuffer>> {
    const block = this._blockAt(index);

    return decodeContainerBlock(block, await this._stored(block), index);
  }

  private _blockAt(index: number): ContainerBlock {
    const block = this.container.blocks[index];

    if (block === undefined) fail(`block ${index} does not exist`);

    return block;
  }

  /** A block's stored bytes: the store first, then the source, and the store is offered what was fetched. */
  private async _stored(block: ContainerBlock): Promise<Uint8Array<ArrayBuffer>> {
    const cached = await this._store?.get(block.hash);

    // A store answers by hash, so a hit whose length disagrees with the head is
    // a collision or a corrupted entry - fetch rather than decode it.
    if (cached?.byteLength === block.storedLength) return cached;

    const fetched = await this._source.read(this.container.dataOffset + block.storedOffset, block.storedLength);

    void this._store?.put(block.hash, fetched);

    return fetched;
  }

  private _slice(entry: ContainerEntry): ArrayBuffer {
    return this._sliceRegion(entry.offset, entry.length, `entry "${entry.source}"`);
  }

  /** Join `length` bytes from `offset` out of the decoded blocks covering them. */
  private _sliceRegion(offset: number, length: number, what: string): ArrayBuffer {
    const out = new Uint8Array(new ArrayBuffer(length));
    let written = 0;

    for (const index of this._blocksInRange(offset, length)) {
      const block = this._blockAt(index);
      const decoded = this._decoded.get(index);

      if (decoded === undefined) fail(`${what} needs block ${index}, which was not read`);

      const from = Math.max(offset, block.offset);
      const to = Math.min(offset + length, block.offset + block.length);

      out.set(decoded.subarray(from - block.offset, to - block.offset), written);
      written += to - from;
    }

    if (written !== length) {
      fail(`${what} covers ${written} of its ${length} bytes; the block table does not tile it`);
    }

    return out.buffer;
  }
}
