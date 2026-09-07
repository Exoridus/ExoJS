import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

/**
 * Writer for the ExoJS binary asset container (`.exoa`).
 *
 * A container packs N assets into one file so a single HTTP request yields all
 * of them. Layout:
 *
 * ```
 * magic "EXOA" (4B) | version u32 LE | indexLength u32 LE | index (JSON, UTF-8)
 * data: concatenated asset bytes [slice0][slice1]...[sliceN]
 * ```
 *
 * The index is a small JSON table of contents read once - zero-copy matters
 * only for the asset data, not the table. `offset` and `length` address an
 * entry's *stored* bytes within the data section, which are the asset's own
 * bytes unless `codec` says otherwise.
 *
 * The reader is `Loader.loadContainer` in `@codexo/exojs`. Neither package may
 * depend on the other (the engine must not pull in build tooling, and this
 * package must not pull in the engine), so the header constants are stated on
 * both sides and the round-trip specs are what keeps them equal: the engine's
 * container spec parses what `encodeContainer` writes, and the CLI's `assets
 * pack` spec loads a packed file through `Loader.loadContainer`. A change to
 * the magic, the version, the header size or the index shape on either side
 * fails both.
 */

/** Magic bytes at the start of every container: ASCII `"EXOA"`. */
export const CONTAINER_MAGIC = 'EXOA';

/**
 * Container format version written by {@link encodeContainer}.
 *
 * Version 3 added the per-entry `codec`, `decodedLength` and `hash` fields.
 * Earlier versions are not migrated: a container is build output, so it is
 * rebuilt.
 */
export const CONTAINER_VERSION = 3;

/** Fixed header size: magic (4) + version (4) + indexLength (4). */
export const CONTAINER_HEADER_SIZE = 12;

/**
 * How an entry's stored bytes are encoded.
 *
 * `gzip` is the only value: it decodes through the browser's
 * `DecompressionStream`, which needs no dependency and no WebAssembly. The
 * field exists so a decoder that arrives for another reason can be added
 * without a format break.
 */
export type ContainerCodec = 'gzip';

/** One asset to pack, with the metadata its index entry carries. */
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
  /** MIME hint recorded in the index; informational, the factory decides from the bytes. */
  readonly mime?: string;
  /** Per-asset options forwarded to the asset handler at unpack time. */
  readonly options?: unknown;
}

/** One entry in a written container's index. `offset` is relative to the data section. */
export interface ContainerIndexEntry {
  readonly source: string;
  readonly type: string;
  readonly offset: number;
  /** Stored byte length: what `offset` addresses, before decoding. */
  readonly length: number;
  /** Absent when the stored bytes are the asset's own. */
  readonly codec?: ContainerCodec;
  /** Byte length after decoding. Present exactly when `codec` is. */
  readonly decodedLength?: number;
  readonly mime?: string;
  /** SHA-256 of the asset's own bytes, lowercase hex. Independent of how they are stored. */
  readonly hash?: string;
  readonly options?: unknown;
}

/** Packing decisions {@link encodeContainer} takes per entry. */
export interface EncodeContainerOptions {
  /**
   * Try gzip on every entry, keeping the compressed bytes only where they are
   * actually smaller. Off by default: most real payload (PNG, KTX2, audio,
   * video) is already compressed, and wrapping it again costs decode time for
   * nothing.
   */
  readonly compress?: boolean;
}

const toUint8 = (bytes: ArrayBuffer | Uint8Array): Uint8Array => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Pack assets into a container buffer, in the order given.
 *
 * Every entry records a `hash` of the asset's own bytes, so a later manifest can
 * address an asset by content regardless of how a particular pack stored it.
 *
 * Duplicate sources are not rejected here; the reader refuses them, because one
 * source is one asset identity and a second payload for it would leak whatever
 * device resource the losing one owns.
 */
export const encodeContainer = (inputs: readonly ContainerInput[], options: EncodeContainerOptions = {}): ArrayBuffer => {
  const compress = options.compress ?? false;
  const slices: Uint8Array[] = [];
  const index: ContainerIndexEntry[] = [];
  let offset = 0;

  for (const input of inputs) {
    const plain = toUint8(input.bytes);
    // Compressing an already-compressed payload usually grows it, so the
    // comparison decides per entry rather than per pack.
    const gzipped = compress ? new Uint8Array(gzipSync(plain)) : undefined;
    const useGzip = gzipped !== undefined && gzipped.byteLength < plain.byteLength;
    const stored = useGzip ? gzipped : plain;

    index.push({
      source: input.source,
      type: input.type,
      offset,
      length: stored.byteLength,
      ...(useGzip && { codec: 'gzip' as const, decodedLength: plain.byteLength }),
      ...(input.mime !== undefined && { mime: input.mime }),
      hash: sha256Hex(plain),
      ...(input.options !== undefined && { options: input.options }),
    });
    slices.push(stored);
    offset += stored.byteLength;
  }

  const indexBytes = new TextEncoder().encode(JSON.stringify(index));
  const total = CONTAINER_HEADER_SIZE + indexBytes.byteLength + offset;
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
    bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
  }

  view.setUint32(4, CONTAINER_VERSION, true);
  view.setUint32(8, indexBytes.byteLength, true);

  bytes.set(indexBytes, CONTAINER_HEADER_SIZE);

  let cursor = CONTAINER_HEADER_SIZE + indexBytes.byteLength;
  for (const slice of slices) {
    bytes.set(slice, cursor);
    cursor += slice.byteLength;
  }

  return buffer;
};
