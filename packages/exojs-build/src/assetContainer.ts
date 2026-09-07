import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

/**
 * Writer for the ExoJS binary asset container (`.exoa`).
 *
 * A container packs N assets into one file so a single request yields all of
 * them, and compresses that file in **blocks**: a bounded run of the data
 * section, compressed on its own and addressable on its own.
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
 * An entry addresses the **uncompressed** data section; a block records where
 * its stored bytes live in the file and which region of that section they
 * produce. Block boundaries fall on entry boundaries and never inside an entry,
 * so changing one asset dirties that asset's blocks and no others - which is
 * what lets a client that already holds an older pack fetch only the blocks
 * whose hash it does not have.
 *
 * The reader is `Loader.loadContainer` in `@codexo/exojs`. Neither package may
 * depend on the other (the engine must not pull in build tooling, and this
 * package must not pull in the engine), so the header constants are stated on
 * both sides and the round-trip specs are what keeps them equal: the engine's
 * container spec parses what `encodeContainer` writes, and the CLI's `assets
 * pack` spec loads a packed file through `Loader.loadContainer`. A change to
 * the magic, the version, the header size or the head shape on either side
 * fails both.
 */

/** Magic bytes at the start of every container: ASCII `"EXOA"`. */
export const CONTAINER_MAGIC = 'EXOA';

/**
 * Container format version written by {@link encodeContainer}.
 *
 * Earlier versions are not migrated: a container is build output, so it is
 * rebuilt.
 */
export const CONTAINER_VERSION = 3;

/** Fixed header size, in bytes, ahead of the JSON head. */
export const CONTAINER_HEADER_SIZE = 32;

/**
 * Boundary every entry starts on inside the uncompressed data section, so a
 * decoded block yields typed-array views over its entries without a copy. The
 * head is padded to the same boundary, which is why `dataOffset` is stated in
 * the header rather than derived from `headLength`.
 */
export const CONTAINER_ALIGNMENT = 8;

/**
 * Uncompressed bytes a block aims for when {@link EncodeContainerOptions} names
 * no other size.
 *
 * Large enough that compression sees shared context across many small assets,
 * small enough that a client re-fetching one changed asset pays for a block
 * rather than for the pack.
 */
export const CONTAINER_DEFAULT_BLOCK_SIZE = 262_144;

/**
 * How a block's stored bytes are encoded.
 *
 * `deflate-raw` decodes through the browser's `DecompressionStream` with no
 * dependency and no WebAssembly; `none` is what a block of already-compressed
 * payload (PNG, KTX2, H.264, AAC, Opus) stores, where deflating a second time
 * costs decode time and wins nothing.
 */
export type ContainerCodec = 'deflate-raw' | 'none';

/** One asset to pack, with the metadata its head entry carries. */
export interface ContainerInput {
  /**
   * The logical source this entry stands in for - the same relative path a
   * network load of the asset would use. The loader canonicalizes it against
   * its own base path, so a packed asset and a loose one are one identity.
   */
  readonly source: string;
  /** Asset type name, lowercase, as the loader's type map spells it (`texture`, `sound`, `json`). */
  readonly type: string;
  readonly bytes: ArrayBuffer | Uint8Array;
  /** MIME hint recorded in the head; informational, the factory decides from the bytes. */
  readonly mime?: string;
  /** Per-asset options forwarded to the asset handler at unpack time. */
  readonly options?: unknown;
}

/** One asset in a written container's head. `offset` addresses the uncompressed data section. */
export interface ContainerHeadEntry {
  readonly source: string;
  readonly type: string;
  /** Byte offset within the uncompressed data section; a multiple of {@link CONTAINER_ALIGNMENT}. */
  readonly offset: number;
  /** Byte length of the asset's own bytes. */
  readonly length: number;
  readonly mime?: string;
  /** SHA-256 of the asset's own bytes, lowercase hex. Independent of how a pack stored them. */
  readonly hash: string;
  readonly options?: unknown;
}

/** One independently compressed run of the data section, as written into the head. */
export interface ContainerHeadBlock {
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
   * SHA-256 of the **stored** bytes, lowercase hex. It names the bytes that
   * travel, so a client can tell a block it already holds from one it has to
   * fetch, and can verify what arrived before decoding it.
   */
  readonly hash: string;
}

/** The uncompressed JSON head {@link encodeContainer} writes between the header and the block area. */
export interface ContainerHead {
  readonly entries: readonly ContainerHeadEntry[];
  readonly blocks: readonly ContainerHeadBlock[];
}

/** Packing decisions {@link encodeContainer} takes. */
export interface EncodeContainerOptions {
  /**
   * Uncompressed bytes a block aims for, defaulting to
   * {@link CONTAINER_DEFAULT_BLOCK_SIZE}. A block always holds whole entries, so
   * an asset larger than this gets a block of its own and the size is a target
   * rather than a limit.
   *
   * Smaller blocks make an update cheaper and compression weaker; larger blocks
   * do the reverse.
   */
  readonly blockSize?: number;
}

const toUint8 = (bytes: ArrayBuffer | Uint8Array): Uint8Array => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const alignUp = (value: number): number => Math.ceil(value / CONTAINER_ALIGNMENT) * CONTAINER_ALIGNMENT;

/** One entry laid out in the uncompressed data section, before blocks are cut. */
interface PlacedEntry {
  readonly entry: ContainerHeadEntry;
  readonly bytes: Uint8Array;
  /** Bytes this entry occupies including the padding that aligns the next one. */
  readonly span: number;
}

const placeEntries = (inputs: readonly ContainerInput[]): PlacedEntry[] => {
  const placed: PlacedEntry[] = [];
  let offset = 0;

  for (const input of inputs) {
    const bytes = toUint8(input.bytes);
    const span = alignUp(bytes.byteLength);

    placed.push({
      entry: {
        source: input.source,
        type: input.type,
        offset,
        length: bytes.byteLength,
        ...(input.mime !== undefined && { mime: input.mime }),
        hash: sha256Hex(bytes),
        ...(input.options !== undefined && { options: input.options }),
      },
      bytes,
      span,
    });
    offset += span;
  }

  return placed;
};

/**
 * Cut the placed entries into runs of at most `blockSize` uncompressed bytes.
 *
 * An entry never straddles a boundary: that is what makes a changed asset dirty
 * only its own blocks, and it costs nothing because a block that would overflow
 * simply starts at the next entry instead.
 */
const cutBlocks = (placed: readonly PlacedEntry[], blockSize: number): Array<{ offset: number; length: number }> => {
  const runs: Array<{ offset: number; length: number }> = [];
  let offset = 0;
  let length = 0;

  for (const { span } of placed) {
    if (length > 0 && length + span > blockSize) {
      runs.push({ offset, length });
      offset += length;
      length = 0;
    }

    length += span;
  }

  if (length > 0) runs.push({ offset, length });

  return runs;
};

/**
 * Pack assets into a container buffer, in the order given.
 *
 * Every entry records a `hash` of the asset's own bytes, so a manifest above the
 * container can address an asset by content regardless of how a particular pack
 * stored it; every block records a hash of its stored bytes, so a client can
 * re-use the blocks it already holds.
 *
 * Compression is not a flag: each block is deflated and the result kept only
 * where it is actually smaller, so a block of already-compressed payload is
 * stored as it is and no caller has to know which of their assets those are.
 *
 * Duplicate sources are not rejected here; the reader refuses them, because one
 * source is one asset identity and a second payload for it would leak whatever
 * device resource the losing one owns.
 */
export const encodeContainer = (inputs: readonly ContainerInput[], options: EncodeContainerOptions = {}): ArrayBuffer => {
  const blockSize = options.blockSize ?? CONTAINER_DEFAULT_BLOCK_SIZE;

  // The header states the block size in a u32, so a size it cannot hold would
  // be written back as a different number than the one the blocks were cut at.
  if (!Number.isInteger(blockSize) || blockSize < CONTAINER_ALIGNMENT || blockSize > 0xffff_ffff) {
    throw new Error(`encodeContainer: blockSize must be an integer between ${CONTAINER_ALIGNMENT} and 4294967295, got ${blockSize}`);
  }

  const placed = placeEntries(inputs);
  const dataLength = placed.reduce((total, { span }) => total + span, 0);
  const data = new Uint8Array(dataLength);

  for (const { entry, bytes } of placed) {
    data.set(bytes, entry.offset);
  }

  const blocks: ContainerHeadBlock[] = [];
  const stored: Uint8Array[] = [];
  let storedOffset = 0;

  for (const run of cutBlocks(placed, blockSize)) {
    const plain = data.subarray(run.offset, run.offset + run.length);
    const deflated = deflateRawSync(plain);
    // Deflating an already-compressed run grows it, so the comparison decides
    // per block rather than per pack.
    const useDeflate = deflated.byteLength < plain.byteLength;
    const bytes = useDeflate ? new Uint8Array(deflated) : plain;

    blocks.push({
      offset: run.offset,
      length: run.length,
      storedOffset,
      storedLength: bytes.byteLength,
      codec: useDeflate ? 'deflate-raw' : 'none',
      hash: sha256Hex(bytes),
    });
    stored.push(bytes);
    storedOffset += bytes.byteLength;
  }

  const head: ContainerHead = { entries: placed.map(({ entry }) => entry), blocks };
  const headBytes = new TextEncoder().encode(JSON.stringify(head));
  const dataOffset = alignUp(CONTAINER_HEADER_SIZE + headBytes.byteLength);
  const buffer = new ArrayBuffer(dataOffset + storedOffset);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
    bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
  }

  view.setUint32(4, CONTAINER_VERSION, true);
  view.setUint32(12, headBytes.byteLength, true);
  view.setUint32(16, dataOffset, true);
  view.setUint32(20, blockSize, true);

  bytes.set(headBytes, CONTAINER_HEADER_SIZE);

  let cursor = dataOffset;
  for (const slice of stored) {
    bytes.set(slice, cursor);
    cursor += slice.byteLength;
  }

  return buffer;
};
