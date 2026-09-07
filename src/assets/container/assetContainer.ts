import { AssetDecodeError } from '#assets/AssetDecodeError';

/**
 * Binary asset container (`.exoa`) - format constants and reader.
 *
 * A container packs N assets into one file so a single request yields all of
 * them, and compresses that file in **blocks** rather than per asset or as one
 * stream. A block is a bounded run of the data section, compressed on its own
 * and addressable on its own, which is what lets one file serve three demands
 * at once: fewer requests than one file per asset, fewer bytes than an
 * uncompressed archive, and a re-fetch proportional to what changed.
 *
 * ```
 * offset  contents
 * 0       "EXOA"                     magic
 * 4       version    u32 LE
 * 8       flags      u32 LE          reserved, zero
 * 12      headLength u32 LE          bytes of the JSON head that follows
 * 16      dataOffset u32 LE          first byte of the block area
 * 20      blockSize  u32 LE          uncompressed bytes a block aims for
 * 24      reserved   u32 LE x2       zero
 * 32      head                       JSON, UTF-8, uncompressed
 * dataOffset
 *         block 0, block 1, ...      each independently compressed
 * ```
 *
 * The head stays JSON and stays uncompressed because it is what a client reads
 * first, and being able to read it with `curl` is worth the bytes it costs.
 *
 * An entry addresses the **uncompressed** data section: `offset` and `length`
 * are the asset's own bytes once every block covering them is decoded. A block
 * records where it lives in the file (`storedOffset`/`storedLength`), which
 * region of the uncompressed section it covers (`offset`/`length`), how it is
 * encoded, and the hash of its stored bytes.
 *
 * The writer lives in `@codexo/exojs-build`, so packing a container never drags
 * build tooling into an application bundle and the engine never depends on it.
 * The two halves are held together by round-trip specs rather than by a shared
 * module: this package's container spec parses what that writer produces.
 *
 * @internal
 */

/** Magic bytes at the start of every container: ASCII `"EXOA"`. */
export const CONTAINER_MAGIC = 'EXOA';

/**
 * Container format version this build reads. Anything else is rejected rather
 * than migrated: a container is build output, so it is rebuilt.
 */
export const CONTAINER_VERSION = 3;

/** Fixed header size, in bytes, ahead of the JSON head. */
export const CONTAINER_HEADER_SIZE = 32;

/**
 * Boundary every entry starts on inside the uncompressed data section, so a
 * decoded block yields typed-array views over its entries without a copy.
 */
export const CONTAINER_ALIGNMENT = 8;

/**
 * How a block's stored bytes are encoded.
 *
 * `deflate-raw` decodes through the browser's `DecompressionStream` with no
 * dependency and no WebAssembly; `none` is what a block of already-compressed
 * payload (PNG, KTX2, H.264, AAC, Opus) stores, where deflating a second time
 * costs decode time and wins nothing. The field exists so a decoder that
 * arrives for another reason can be added without a format break.
 */
export type ContainerCodec = 'deflate-raw' | 'none';

const CODECS: ReadonlySet<string> = new Set<ContainerCodec>(['deflate-raw', 'none']);

/** Length of a SHA-256 digest written as lowercase hex. */
const HASH_HEX_LENGTH = 64;

const HASH_PATTERN = /^[\da-f]+$/;

/**
 * One asset in a container's head. `offset` and `length` address the asset's
 * own bytes within the uncompressed data section. `type` is the asset type name
 * resolved against the loader's type map; `options` are forwarded to the
 * handler's `createFromBytes`.
 */
export interface ContainerEntry {
  /**
   * The logical source this entry stands in for - the very same relative path a
   * network load would use. The loader canonicalizes it with its own base path,
   * so an entry resolves to the same asset identity whether it arrived through
   * the container or over the network, and a container is never welded to the
   * path it was built at.
   */
  readonly source: string;
  /** Asset type name (resolved to a constructor via the loader's type map). */
  readonly type: string;
  /** Byte offset within the uncompressed data section; a multiple of {@link CONTAINER_ALIGNMENT}. */
  readonly offset: number;
  /** Byte length of the asset's own bytes. */
  readonly length: number;
  /** Optional MIME hint (informational; the factory determines type from bytes). */
  readonly mime?: string;
  /**
   * SHA-256 of the asset's own bytes, lowercase hex. It identifies the asset
   * rather than one particular packing of it, so repacking leaves it unchanged.
   */
  readonly hash?: string;
  /** Optional per-asset options forwarded to the handler. */
  readonly options?: unknown;
}

/**
 * One independently compressed run of the data section.
 *
 * Blocks tile the uncompressed section in order and without gaps, and a block
 * boundary always falls on an entry boundary: a changed asset dirties its own
 * blocks and no others, which is what makes an update proportional to what
 * changed rather than to the size of the pack.
 */
export interface ContainerBlock {
  /** Byte offset of the region this block covers within the uncompressed data section. */
  readonly offset: number;
  /** Uncompressed byte length of that region. */
  readonly length: number;
  /** Byte offset of the stored bytes, relative to the header's `dataOffset`. */
  readonly storedOffset: number;
  /** Stored byte length; equal to `length` when the codec is `none`. */
  readonly storedLength: number;
  readonly codec: ContainerCodec;
  /**
   * SHA-256 of the **stored** bytes, lowercase hex, as the writer computed it.
   * It names the bytes that travel, which is what lets a client tell a block it
   * already holds from one it has to fetch.
   *
   * Reading a container checks the shape of this field and nothing more: the
   * digest is not recomputed, so it identifies a block rather than attesting to
   * it. What guards a decode is the block's own framing.
   */
  readonly hash: string;
}

/** Result of {@link parseContainer}: the validated head plus where the block area begins. */
export interface ParsedContainer {
  readonly version: number;
  readonly entries: readonly ContainerEntry[];
  readonly blocks: readonly ContainerBlock[];
  /** Uncompressed bytes a block aims for; the writer's packing target, not a limit. */
  readonly blockSize: number;
  /** Byte offset of the first block within the container file. */
  readonly dataOffset: number;
  /** Byte length of the uncompressed data section, which is what entry offsets address. */
  readonly dataLength: number;
}

// A `never` return only ends control flow for the caller when the callee is a
// function declaration or a constant with an explicit type annotation.
type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset container: ${detail}.`, assetType: 'container' });
};

/**
 * A byte count has to be a non-negative integer, not merely a non-negative
 * number: a fractional `length` would survive every bounds check and then be
 * truncated by `ArrayBuffer.slice`, handing out an asset one byte short instead
 * of rejecting the container that declared it.
 */
const isSize = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * DEFLATE's maximum compression ratio: a 258-byte match costs at least two bits,
 * so no stored byte can produce more than 1032 uncompressed ones. A block
 * claiming more than that is provably lying about its own bytes, which is what
 * lets the reader reject a head that would otherwise size an allocation from a
 * number an attacker chose.
 */
const DEFLATE_MAX_EXPANSION = 1032;

const isHash = (value: unknown): value is string => typeof value === 'string' && value.length === HASH_HEX_LENGTH && HASH_PATTERN.test(value);

const readHash = (record: Record<string, unknown>, source: string): Pick<ContainerEntry, 'hash'> => {
  const { hash } = record;

  if (hash === undefined) return {};
  if (!isHash(hash)) fail(`entry "${source}" has a "hash" that is not a ${HASH_HEX_LENGTH}-character lowercase hex SHA-256`);

  return { hash };
};

const readEntry = (value: unknown, i: number, dataLength: number): ContainerEntry => {
  if (typeof value !== 'object' || value === null) {
    fail(`entry ${i} is not an object`);
  }

  const record = value as Record<string, unknown>;
  const { source, type, offset, length, mime } = record;

  if (typeof source !== 'string') fail(`entry ${i} has a non-string "source"`);
  if (typeof type !== 'string') fail(`entry ${i} ("${source}") has a non-string "type"`);
  if (!isSize(offset)) fail(`entry "${source}" has an invalid "offset"`);
  if (!isSize(length)) fail(`entry "${source}" has an invalid "length"`);
  if (offset % CONTAINER_ALIGNMENT !== 0) fail(`entry "${source}" starts at ${offset}, which is not a multiple of ${CONTAINER_ALIGNMENT}`);
  if (offset + length > dataLength) fail(`entry "${source}" runs past the data section (offset ${offset} + length ${length} > ${dataLength})`);
  if (mime !== undefined && typeof mime !== 'string') fail(`entry "${source}" has a non-string "mime"`);

  return {
    source,
    type,
    offset,
    length,
    ...(typeof mime === 'string' && { mime }),
    ...readHash(record, source),
    ...(record.options !== undefined && { options: record.options }),
  };
};

/**
 * Blocks are read as a contiguous ordered tiling rather than as an unordered
 * set: a reader locating the blocks that cover an entry has to be able to stop
 * at the first block past it, and a gap between two blocks would leave a region
 * of the data section that nothing can produce.
 */
const readBlock = (value: unknown, i: number, expectedOffset: number, storedLimit: number): ContainerBlock => {
  if (typeof value !== 'object' || value === null) {
    fail(`block ${i} is not an object`);
  }

  const record = value as Record<string, unknown>;
  const { offset, length, storedOffset, storedLength, codec, hash } = record;

  if (!isSize(offset)) fail(`block ${i} has an invalid "offset"`);
  if (!isSize(length)) fail(`block ${i} has an invalid "length"`);
  if (!isSize(storedOffset)) fail(`block ${i} has an invalid "storedOffset"`);
  if (!isSize(storedLength)) fail(`block ${i} has an invalid "storedLength"`);
  if (offset !== expectedOffset) fail(`block ${i} covers the data section from ${offset}, but the previous block ends at ${expectedOffset}`);
  if (typeof codec !== 'string' || !CODECS.has(codec)) {
    fail(`block ${i} has an unsupported codec ${JSON.stringify(codec)} (this build decodes ${[...CODECS].map(name => `"${name}"`).join(' and ')})`);
  }
  if (codec === 'none' && storedLength !== length) fail(`block ${i} stores ${storedLength} bytes uncoded but covers ${length} bytes`);
  if (codec === 'deflate-raw' && length > storedLength * DEFLATE_MAX_EXPANSION) {
    fail(`block ${i} claims ${length} bytes from ${storedLength} stored ones, past what ${codec} can produce`);
  }
  if (!isHash(hash)) fail(`block ${i} has no ${HASH_HEX_LENGTH}-character lowercase hex SHA-256 "hash"`);
  if (storedOffset + storedLength > storedLimit) fail(`block ${i} runs past the container (${storedOffset} + ${storedLength} > ${storedLimit} bytes)`);

  return { offset, length, storedOffset, storedLength, codec: codec as ContainerCodec, hash };
};

// `BufferSource` excludes a view over a `SharedArrayBuffer`, so the stored
// bytes have to be declared over the plain `ArrayBuffer` the container is in.
const decodeBlock = async (block: ContainerBlock, stored: Uint8Array<ArrayBuffer>, into: Uint8Array, index: number): Promise<void> => {
  if (block.codec === 'none') {
    into.set(stored, block.offset);

    return;
  }

  // A `DecompressionStream` writes `BufferSource`, so the source has to be
  // declared over that rather than over the narrower `Uint8Array`.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(stored);
      controller.close();
    },
  });

  const reader = source.pipeThrough(new DecompressionStream(block.codec)).getReader();
  let written = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;
      if (written + value.byteLength > block.length) {
        await reader.cancel();
        fail(`block ${index} decodes to more than the ${block.length} bytes it covers`);
      }

      into.set(value, block.offset + written);
      written += value.byteLength;
    }
  } catch (error: unknown) {
    // A corrupt stream rejects with whatever the platform's decompressor
    // throws. Callers branch on the container being unreadable, not on which
    // engine reported it, so the failure keeps the type every other malformed
    // container has.
    if (error instanceof AssetDecodeError) throw error;

    fail(`block ${index} is not readable as "${block.codec}"`);
  }

  if (written !== block.length) {
    fail(`block ${index} decodes to ${written} bytes, but covers ${block.length}`);
  }
};

/**
 * Decode every block of a container into its uncompressed data section, which
 * is the buffer an entry's `offset` and `length` address.
 *
 * This is the whole-file path: it takes the entire container in memory and
 * produces the entire data section, which is what a single-request load wants.
 *
 * Throws when a block is unreadable or does not decode to the region it claims
 * to cover, the only signal that stored bytes are truncated or corrupt.
 */
export const decodeContainerData = async (container: ParsedContainer, buffer: ArrayBuffer): Promise<ArrayBuffer> => {
  let data: ArrayBuffer;

  // The size comes from the head, so it is attacker-controlled even after the
  // per-block expansion bound: a container the runtime cannot hold is a bad
  // container, not a crash.
  try {
    data = new ArrayBuffer(container.dataLength);
  } catch {
    fail(`data section of ${container.dataLength} bytes cannot be allocated`);
  }

  const into = new Uint8Array(data);

  await Promise.all(
    container.blocks.map(async (block, i) =>
      decodeBlock(block, new Uint8Array(buffer, container.dataOffset + block.storedOffset, block.storedLength), into, i),
    ),
  );

  return data;
};

/** Read one entry's asset bytes out of a decoded data section. */
export const readContainerEntry = (entry: ContainerEntry, data: ArrayBuffer): ArrayBuffer => data.slice(entry.offset, entry.offset + entry.length);

/**
 * Parse and validate a container's header and JSON head. Throws (never returns
 * partial or garbage data) on a bad magic, unsupported version, truncated
 * buffer, malformed head, a block table that does not tile the data section, or
 * an entry whose slice runs past it.
 */
export const parseContainer = (buffer: ArrayBuffer): ParsedContainer => {
  if (buffer.byteLength < CONTAINER_HEADER_SIZE) {
    fail(`buffer too small for a ${CONTAINER_HEADER_SIZE}-byte header (got ${buffer.byteLength})`);
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
    if (bytes[i] !== CONTAINER_MAGIC.charCodeAt(i)) {
      fail(`bad magic (expected "${CONTAINER_MAGIC}")`);
    }
  }

  const version = view.getUint32(4, true);
  if (version !== CONTAINER_VERSION) {
    // Earlier versions are not read partially: each of them framed the file
    // differently, so a reader cannot tell where anything is. A container is
    // build output, so it is rebuilt rather than migrated.
    fail(`unsupported version ${version} (this build reads version ${CONTAINER_VERSION}) - rebuild it with \`exo assets pack\``);
  }

  const flags = view.getUint32(8, true);
  if (flags !== 0) {
    fail(`header flags ${flags} are set, but this version defines none`);
  }

  const headLength = view.getUint32(12, true);
  const headEnd = CONTAINER_HEADER_SIZE + headLength;
  if (headEnd > buffer.byteLength) {
    fail(`head length ${headLength} runs past the buffer (size ${buffer.byteLength})`);
  }

  const dataOffset = view.getUint32(16, true);
  if (dataOffset < headEnd || dataOffset > buffer.byteLength) {
    fail(`data offset ${dataOffset} is outside the container (head ends at ${headEnd}, size ${buffer.byteLength})`);
  }
  if (dataOffset % CONTAINER_ALIGNMENT !== 0) {
    fail(`data offset ${dataOffset} is not a multiple of ${CONTAINER_ALIGNMENT}`);
  }

  const blockSize = view.getUint32(20, true);
  if (blockSize === 0) {
    fail('block size is zero');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(CONTAINER_HEADER_SIZE, headEnd)));
  } catch {
    fail('head is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('head is not a JSON object');
  }

  const head = parsed as Record<string, unknown>;

  if (!Array.isArray(head.entries)) fail('head has no "entries" array');
  if (!Array.isArray(head.blocks)) fail('head has no "blocks" array');

  const storedLimit = buffer.byteLength - dataOffset;
  const blocks: ContainerBlock[] = [];
  let dataLength = 0;

  for (const [i, value] of head.blocks.entries()) {
    const block = readBlock(value, i, dataLength, storedLimit);

    blocks.push(block);
    dataLength += block.length;
  }

  const entries = head.entries.map((entry, i) => readEntry(entry, i, dataLength));
  const sources = new Set<string>();

  for (const entry of entries) {
    // One source is one asset identity, so a repeated source would unpack a
    // second payload for it - and for a texture or a media element the losing
    // one owns a device resource nothing would ever release.
    if (sources.has(entry.source)) {
      fail(`entry "${entry.source}" is packed twice; a container holds one payload per source`);
    }

    sources.add(entry.source);
  }

  return { version, entries, blocks, blockSize, dataOffset, dataLength };
};
