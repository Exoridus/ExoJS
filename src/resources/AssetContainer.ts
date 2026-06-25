/**
 * Binary asset container (`.exoa`) — format constants, reader, and writer.
 *
 * A container packs N assets into one file so a single HTTP request yields all
 * of them (the FFX VBF / Unreal `.pak` model). Layout:
 *
 * ```
 * magic "EXOA" (4B) │ version u32 LE │ indexLength u32 LE │ index (JSON, UTF-8)
 * data: concatenated asset bytes [slice0][slice1]…[sliceN]
 * ```
 *
 * The index is a small JSON table of contents read once — zero-copy matters only
 * for the asset *data*, not the TOC, so JSON keeps it trivial to build, parse,
 * and extend. `offset`/`length` are relative to the start of the data section.
 *
 * `encodeContainer` (writer) and `parseContainer` (reader) share these constants
 * so the build tooling and the runtime never drift. The writer is exported for
 * the `scripts/build-container` tool and tests; it is tree-shaken out of the
 * runtime bundle, which only pulls in the reader via `Loader.loadContainer`.
 *
 * @internal
 */

/** Magic bytes at the start of every container: ASCII `"EXOA"`. */
export const CONTAINER_MAGIC = 'EXOA';

/** Current container format version written by {@link encodeContainer}. */
export const CONTAINER_VERSION = 1;

/** Fixed header size: magic (4) + version (4) + indexLength (4). */
export const CONTAINER_HEADER_SIZE = 12;

/**
 * One entry in a container's index. `offset`/`length` address the asset's bytes
 * within the data section (after the header + index). `type` is the asset type
 * name resolved against the loader's type map; `options` are forwarded to the
 * handler's `createFromBytes`.
 */
export interface ContainerEntry {
  /** Loader alias the unpacked resource is stored under. */
  readonly alias: string;
  /** Asset type name (resolved to a constructor via the loader's type map). */
  readonly type: string;
  /** Byte offset of this asset within the data section. */
  readonly offset: number;
  /** Byte length of this asset's slice. */
  readonly length: number;
  /** Optional MIME hint (informational; the factory determines type from bytes). */
  readonly mime?: string;
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

/** Input for {@link encodeContainer}: an asset's bytes plus its index metadata. */
export interface ContainerInput {
  readonly alias: string;
  readonly type: string;
  readonly bytes: ArrayBuffer | Uint8Array;
  readonly mime?: string;
  readonly options?: unknown;
}

function toUint8(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * Pack assets into a container `ArrayBuffer`. The inverse of
 * {@link parseContainer}; used by the build tooling and the roundtrip test.
 */
export function encodeContainer(inputs: readonly ContainerInput[]): ArrayBuffer {
  const slices: Uint8Array[] = [];
  const index: ContainerEntry[] = [];
  let offset = 0;

  for (const input of inputs) {
    const slice = toUint8(input.bytes);
    index.push({
      alias: input.alias,
      type: input.type,
      offset,
      length: slice.byteLength,
      ...(input.mime !== undefined && { mime: input.mime }),
      ...(input.options !== undefined && { options: input.options }),
    });
    slices.push(slice);
    offset += slice.byteLength;
  }

  const indexBytes = new TextEncoder().encode(JSON.stringify(index));
  const dataLength = offset;
  const total = CONTAINER_HEADER_SIZE + indexBytes.byteLength + dataLength;
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Header.
  for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
    bytes[i] = CONTAINER_MAGIC.charCodeAt(i);
  }
  view.setUint32(4, CONTAINER_VERSION, true);
  view.setUint32(8, indexBytes.byteLength, true);

  // Index, then concatenated data slices.
  bytes.set(indexBytes, CONTAINER_HEADER_SIZE);
  let cursor = CONTAINER_HEADER_SIZE + indexBytes.byteLength;
  for (const slice of slices) {
    bytes.set(slice, cursor);
    cursor += slice.byteLength;
  }

  return buffer;
}

function fail(detail: string): never {
  throw new Error(`Invalid asset container: ${detail}.`);
}

function readEntry(value: unknown, i: number, dataLength: number): ContainerEntry {
  if (typeof value !== 'object' || value === null) {
    fail(`index entry ${i} is not an object`);
  }

  const record = value as Record<string, unknown>;
  const { alias, type, offset, length, mime } = record;

  if (typeof alias !== 'string') fail(`index entry ${i} has a non-string "alias"`);
  if (typeof type !== 'string') fail(`index entry ${i} ("${alias}") has a non-string "type"`);
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) fail(`index entry "${alias}" has an invalid "offset"`);
  if (typeof length !== 'number' || !Number.isFinite(length) || length < 0) fail(`index entry "${alias}" has an invalid "length"`);
  if (offset + length > dataLength) fail(`index entry "${alias}" runs past the data section (offset ${offset} + length ${length} > ${dataLength})`);
  if (mime !== undefined && typeof mime !== 'string') fail(`index entry "${alias}" has a non-string "mime"`);

  return {
    alias,
    type,
    offset,
    length,
    ...(typeof mime === 'string' && { mime }),
    ...(record.options !== undefined && { options: record.options }),
  };
}

/**
 * Parse and validate a container's header and index. Throws (never returns
 * partial/garbage data) on a bad magic, unsupported version, truncated buffer,
 * malformed index, or an entry whose slice runs past the data section.
 */
export function parseContainer(buffer: ArrayBuffer): ParsedContainer {
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
  if (version > CONTAINER_VERSION) {
    fail(`unsupported version ${version} (this build reads up to ${CONTAINER_VERSION})`);
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

  return { version, entries, dataStart };
}
