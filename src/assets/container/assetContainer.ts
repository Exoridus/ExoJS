import { AssetDecodeError } from '#assets/AssetDecodeError';

/**
 * Binary asset container (`.exoa`) - format constants and reader.
 *
 * A container packs N assets into one file so a single HTTP request yields all
 * of them (the FFX VBF / Unreal `.pak` model). Layout:
 *
 * ```
 * magic "EXOA" (4B) │ version u32 LE │ indexLength u32 LE │ index (JSON, UTF-8)
 * data: concatenated asset bytes [slice0][slice1]...[sliceN]
 * ```
 *
 * The index is a small JSON table of contents read once - zero-copy matters only
 * for the asset *data*, not the TOC, so JSON keeps it trivial to build, parse,
 * and extend. `offset`/`length` are relative to the start of the data section
 * and address an entry's *stored* bytes, which are the asset's own bytes unless
 * `codec` says otherwise.
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

/** Fixed header size: magic (4) + version (4) + indexLength (4). */
export const CONTAINER_HEADER_SIZE = 12;

/** The only encoding a container may store bytes in; it decodes through `DecompressionStream`. */
export type ContainerCodec = 'gzip';

/** Length of a SHA-256 digest written as lowercase hex. */
const HASH_HEX_LENGTH = 64;

const HASH_PATTERN = /^[\da-f]+$/;

/**
 * One entry in a container's index. `offset`/`length` address the entry's
 * stored bytes within the data section (after the header + index). `type` is
 * the asset type name resolved against the loader's type map; `options` are
 * forwarded to the handler's `createFromBytes`.
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
  /** Byte offset of this entry's stored bytes within the data section. */
  readonly offset: number;
  /** Stored byte length: what `offset` addresses, before decoding. */
  readonly length: number;
  /** Absent when the stored bytes are the asset's own. */
  readonly codec?: ContainerCodec;
  /** Byte length after decoding. Present exactly when `codec` is. */
  readonly decodedLength?: number;
  /** Optional MIME hint (informational; the factory determines type from bytes). */
  readonly mime?: string;
  /**
   * SHA-256 of the asset's own bytes, lowercase hex. It identifies the asset
   * rather than one particular encoding of it, so repacking with a different
   * codec leaves it unchanged.
   */
  readonly hash?: string;
  /** Optional per-asset options forwarded to the handler. */
  readonly options?: unknown;
}

/** Result of {@link parseContainer}: the validated index plus where data begins. */
export interface ParsedContainer {
  readonly version: number;
  readonly entries: readonly ContainerEntry[];
  /** Byte offset where the data section starts (header size + index length). */
  readonly dataStart: number;
}

// A `never` return only ends control flow for the caller when the callee is a
// function declaration or a constant with an explicit type annotation.
type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset container: ${detail}.`, assetType: 'container' });
};

const isSize = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * The encoding fields travel together: `decodedLength` is what lets the reader
 * size its output once instead of growing a buffer, and what tells a truncated
 * payload from a complete one, so it is meaningless without a `codec` and
 * mandatory with one.
 */
const readEncoding = (record: Record<string, unknown>, source: string): Pick<ContainerEntry, 'codec' | 'decodedLength'> => {
  const { codec, decodedLength } = record;

  if (codec === undefined) {
    if (decodedLength !== undefined) fail(`index entry "${source}" has a "decodedLength" but no "codec"`);

    return {};
  }

  if (codec !== 'gzip') fail(`index entry "${source}" has an unsupported codec ${JSON.stringify(codec)} (this build decodes "gzip")`);
  if (!isSize(decodedLength)) fail(`index entry "${source}" is "${codec}"-encoded but has no valid "decodedLength"`);

  return { codec, decodedLength };
};

const readHash = (record: Record<string, unknown>, source: string): Pick<ContainerEntry, 'hash'> => {
  const { hash } = record;

  if (hash === undefined) return {};
  if (typeof hash !== 'string' || hash.length !== HASH_HEX_LENGTH || !HASH_PATTERN.test(hash)) {
    fail(`index entry "${source}" has a "hash" that is not a ${HASH_HEX_LENGTH}-character lowercase hex SHA-256`);
  }

  return { hash };
};

const readEntry = (value: unknown, i: number, dataLength: number): ContainerEntry => {
  if (typeof value !== 'object' || value === null) {
    fail(`index entry ${i} is not an object`);
  }

  const record = value as Record<string, unknown>;
  const { source, type, offset, length, mime } = record;

  if (typeof source !== 'string') fail(`index entry ${i} has a non-string "source"`);
  if (typeof type !== 'string') fail(`index entry ${i} ("${source}") has a non-string "type"`);
  if (!isSize(offset)) fail(`index entry "${source}" has an invalid "offset"`);
  if (!isSize(length)) fail(`index entry "${source}" has an invalid "length"`);
  if (offset + length > dataLength) fail(`index entry "${source}" runs past the data section (offset ${offset} + length ${length} > ${dataLength})`);
  if (mime !== undefined && typeof mime !== 'string') fail(`index entry "${source}" has a non-string "mime"`);

  return {
    source,
    type,
    offset,
    length,
    ...readEncoding(record, source),
    ...(typeof mime === 'string' && { mime }),
    ...readHash(record, source),
    ...(record.options !== undefined && { options: record.options }),
  };
};

/**
 * Read one entry's asset bytes out of a container buffer, decoding them when
 * the entry declares a codec.
 *
 * Throws when a decoded payload does not match the entry's `decodedLength`,
 * which is the only signal that a stored slice is truncated or corrupt.
 */
export const decodeContainerEntry = async (entry: ContainerEntry, buffer: ArrayBuffer, dataStart: number): Promise<ArrayBuffer> => {
  const start = dataStart + entry.offset;
  const stored = buffer.slice(start, start + entry.length);

  if (entry.codec === undefined) return stored;

  const decodedLength = entry.decodedLength ?? 0;
  // A `DecompressionStream` writes `BufferSource`, so the source has to be
  // declared over that rather than over the narrower `Uint8Array`.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(stored));
      controller.close();
    },
  });

  const reader = source.pipeThrough(new DecompressionStream(entry.codec)).getReader();
  const decoded = new Uint8Array(decodedLength);
  let written = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;
    if (written + value.byteLength > decodedLength) {
      await reader.cancel();
      fail(`index entry "${entry.source}" decodes to more than its "decodedLength" of ${decodedLength} bytes`);
    }

    decoded.set(value, written);
    written += value.byteLength;
  }

  if (written !== decodedLength) {
    fail(`index entry "${entry.source}" decodes to ${written} bytes, but its "decodedLength" says ${decodedLength}`);
  }

  return decoded.buffer;
};

/**
 * Parse and validate a container's header and index. Throws (never returns
 * partial/garbage data) on a bad magic, unsupported version, truncated buffer,
 * malformed index, or an entry whose slice runs past the data section.
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
    // Earlier versions are not read partially: version 1 indexed entries by an
    // opaque alias that cannot be resolved to an asset identity at all, and
    // version 2 predates the per-entry codec, so a reader cannot tell stored
    // bytes from asset bytes. Rebuild the container.
    fail(`unsupported version ${version} (this build reads version ${CONTAINER_VERSION}) - rebuild it with \`exo assets pack\``);
  }

  const indexLength = view.getUint32(8, true);
  const dataStart = CONTAINER_HEADER_SIZE + indexLength;
  if (dataStart > buffer.byteLength) {
    fail(`index length ${indexLength} runs past the buffer (size ${buffer.byteLength})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(CONTAINER_HEADER_SIZE, dataStart)));
  } catch {
    fail('index is not valid JSON');
  }

  if (!Array.isArray(parsed)) {
    fail('index is not an array');
  }

  const dataLength = buffer.byteLength - dataStart;
  const entries = parsed.map((entry, i) => readEntry(entry, i, dataLength));
  const sources = new Set<string>();

  for (const entry of entries) {
    // One source is one asset identity, so a repeated source would unpack a
    // second payload for it - and for a texture or a media element the losing
    // one owns a device resource nothing would ever release.
    if (sources.has(entry.source)) {
      fail(`index entry "${entry.source}" is packed twice; a container holds one payload per source`);
    }

    sources.add(entry.source);
  }

  return { version, entries, dataStart };
};
