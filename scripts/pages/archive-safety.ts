import { lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

import { validateSitePath } from './site-manifest.ts';

/**
 * Inspection and extraction of the archives the Pages publisher handles: the
 * zip of a channel candidate artifact and the tar inside a Pages artifact.
 *
 * Every entry is inspected before anything is written, and extraction trusts
 * nothing it inspected: sizes and checksums are re-checked while inflating, so
 * a header that lies about its size cannot unpack past the budget.
 *
 * Dependency-free and erasable TypeScript, run by the publisher with plain
 * `node`.
 */

export type ArchiveEntryType = 'file' | 'directory' | 'symlink' | 'hardlink' | 'special';

export interface ArchiveEntry {
  /** Normalized root-relative path, without a trailing slash. */
  name: string;
  type: ArchiveEntryType;
  /** Declared unpacked size. */
  size: number;
}

export interface ZipEntry extends ArchiveEntry {
  method: number;
  compressedSize: number;
  crc32: number;
  encrypted: boolean;
  localHeaderOffset: number;
  rawName: Buffer;
}

export interface TarEntry extends ArchiveEntry {
  dataOffset: number;
}

export interface ArchiveLimits {
  /** Largest total of declared unpacked sizes accepted. */
  maxUnpackedBytes: number;
  /** Largest number of entries accepted. */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 250_000;

export class ArchiveSafetyError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`[archive-safety] archive refused:\n  ${problems.join('\n  ')}`);
    this.name = 'ArchiveSafetyError';
    this.problems = problems;
  }
}

const S_IFMT = 0o170000;

const typeFromMode = (mode: number): ArchiveEntryType | null => {
  switch (mode & S_IFMT) {
    case 0:
      return null;
    case 0o100000:
      return 'file';
    case 0o040000:
      return 'directory';
    case 0o120000:
      return 'symlink';
    default:
      return 'special';
  }
};

const ZIP_END = 0x06054b50;
const ZIP64_END = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

const readU64 = (buffer: Buffer, offset: number): number => {
  const value = buffer.readBigUInt64LE(offset);

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ArchiveSafetyError([`zip field at ${offset} exceeds the safe integer range`]);
  }

  return Number(value);
};

const findZipEnd = (zip: Buffer): number => {
  const lowest = Math.max(0, zip.length - 22 - U16_MAX);

  for (let offset = zip.length - 22; offset >= lowest; offset--) {
    if (zip.readUInt32LE(offset) === ZIP_END) {
      return offset;
    }
  }

  throw new ArchiveSafetyError(['not a zip archive: no end of central directory record']);
};

/** The central directory of `zip`, with entry types and normalized names. */
export const readZipEntries = (zip: Buffer): ZipEntry[] => {
  if (zip.length < 22) {
    throw new ArchiveSafetyError(['not a zip archive: too short']);
  }

  const end = findZipEnd(zip);
  let count = zip.readUInt16LE(end + 10);
  let directorySize = zip.readUInt32LE(end + 12);
  let directoryOffset = zip.readUInt32LE(end + 16);

  if (count === U16_MAX || directorySize === U32_MAX || directoryOffset === U32_MAX) {
    const locator = end - 20;

    if (locator < 0 || zip.readUInt32LE(locator) !== ZIP64_LOCATOR) {
      throw new ArchiveSafetyError(['zip64 archive without a zip64 end locator']);
    }

    const record = readU64(zip, locator + 8);

    if (record + 56 > zip.length || zip.readUInt32LE(record) !== ZIP64_END) {
      throw new ArchiveSafetyError(['zip64 end record missing']);
    }

    count = readU64(zip, record + 32);
    directorySize = readU64(zip, record + 40);
    directoryOffset = readU64(zip, record + 48);
  }

  if (directoryOffset + directorySize > zip.length) {
    throw new ArchiveSafetyError(['zip central directory lies outside the archive']);
  }

  const entries: ZipEntry[] = [];
  let offset = directoryOffset;

  for (let index = 0; index < count; index++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== ZIP_CENTRAL) {
      throw new ArchiveSafetyError([`zip central directory entry ${index} is corrupt`]);
    }

    const madeBy = zip.readUInt16LE(offset + 4) >> 8;
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    let compressedSize = zip.readUInt32LE(offset + 20);
    let size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const external = zip.readUInt32LE(offset + 38);
    let localHeaderOffset = zip.readUInt32LE(offset + 42);
    const rawName = zip.subarray(offset + 46, offset + 46 + nameLength);
    const extra = zip.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);

    if (size === U32_MAX || compressedSize === U32_MAX || localHeaderOffset === U32_MAX) {
      for (let cursor = 0; cursor + 4 <= extra.length;) {
        const id = extra.readUInt16LE(cursor);
        const length = extra.readUInt16LE(cursor + 2);

        if (id === 0x0001) {
          let field = cursor + 4;

          if (size === U32_MAX) {
            size = readU64(extra, field);
            field += 8;
          }

          if (compressedSize === U32_MAX) {
            compressedSize = readU64(extra, field);
            field += 8;
          }

          if (localHeaderOffset === U32_MAX) {
            localHeaderOffset = readU64(extra, field);
          }
        }

        cursor += 4 + length;
      }
    }

    const decoded = rawName.toString('utf8');
    const isDirectoryName = decoded.endsWith('/');
    const modeType = madeBy === 3 ? typeFromMode(external >>> 16) : null;
    const type: ArchiveEntryType = modeType ?? ((external & 0x10) !== 0 || isDirectoryName ? 'directory' : 'file');

    entries.push({
      name: isDirectoryName ? decoded.slice(0, -1) : decoded,
      type: type === 'file' && isDirectoryName ? 'directory' : type,
      size,
      method,
      compressedSize,
      crc32: crc,
      encrypted: (flags & 0x0001) !== 0,
      localHeaderOffset,
      rawName,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const parseTarNumber = (field: Buffer): number => {
  if ((field[0]! & 0x80) !== 0) {
    let value = 0;

    for (let index = 1; index < field.length; index++) {
      value = value * 256 + field[index]!;
    }

    return value;
  }

  const text = field
    .toString('ascii')
    .replace(/[\0 ]+$/, '')
    .trim();

  return text === '' ? 0 : Number.parseInt(text, 8);
};

const tarString = (field: Buffer): string => {
  const end = field.indexOf(0);

  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
};

const parsePax = (data: Buffer): Record<string, string> => {
  const records: Record<string, string> = {};
  let cursor = 0;

  while (cursor < data.length) {
    const space = data.indexOf(0x20, cursor);
    const length = Number.parseInt(data.subarray(cursor, space).toString('ascii'), 10);

    if (space === -1 || !Number.isFinite(length) || length <= 0 || cursor + length > data.length) {
      throw new ArchiveSafetyError(['corrupt pax extended header']);
    }

    const record = data.subarray(space + 1, cursor + length - 1).toString('utf8');
    const equals = record.indexOf('=');

    if (equals > 0) {
      records[record.slice(0, equals)] = record.slice(equals + 1);
    }

    cursor += length;
  }

  return records;
};

const normalizeTarName = (name: string): string => {
  let normalized = name;

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};

/** The members of a ustar/pax/GNU tar, without the `./` root entry. */
export const readTarEntries = (tar: Buffer): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pending: Record<string, string> = {};
  let longName: string | null = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);

    if (header.every(byte => byte === 0)) {
      return entries;
    }

    let sum = 0;

    for (let index = 0; index < 512; index++) {
      sum += index >= 148 && index < 156 ? 0x20 : header[index]!;
    }

    if (sum !== parseTarNumber(header.subarray(148, 156))) {
      throw new ArchiveSafetyError([`tar header at ${offset} has a bad checksum`]);
    }

    const flag = String.fromCharCode(header[156]!);
    let size = parseTarNumber(header.subarray(124, 136));
    const dataOffset = offset + 512;

    if (dataOffset + size > tar.length) {
      throw new ArchiveSafetyError([`tar member at ${offset} is truncated`]);
    }

    const data = tar.subarray(dataOffset, dataOffset + size);
    offset = dataOffset + Math.ceil(size / 512) * 512;

    if (flag === 'x') {
      pending = { ...pending, ...parsePax(data) };
      continue;
    }

    if (flag === 'g') {
      continue;
    }

    if (flag === 'L') {
      longName = tarString(data);
      continue;
    }

    if (flag === 'K') {
      continue;
    }

    const magic = header.subarray(257, 262).toString('ascii');
    const prefix = magic === 'ustar' ? tarString(header.subarray(345, 500)) : '';
    const baseName = tarString(header.subarray(0, 100));
    const name = pending['path'] ?? longName ?? (prefix === '' ? baseName : `${prefix}/${baseName}`);

    if (pending['size'] !== undefined) {
      size = Number.parseInt(pending['size'], 10);
    }

    pending = {};
    longName = null;

    const type: ArchiveEntryType =
      flag === '0' || flag === '\0' ? 'file' : flag === '5' ? 'directory' : flag === '2' ? 'symlink' : flag === '1' ? 'hardlink' : 'special';
    const normalized = normalizeTarName(name);

    if (normalized === '' || normalized === '.') {
      continue;
    }

    entries.push({ name: normalized, type, size: type === 'file' ? size : 0, dataOffset });
  }

  throw new ArchiveSafetyError(['tar archive ends without its end-of-archive blocks']);
};

/** Every reason the listed entries may not be unpacked; empty when they may. */
export const checkArchiveEntries = (entries: readonly ArchiveEntry[], limits: ArchiveLimits): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  let total = 0;

  if (entries.length > (limits.maxEntries ?? DEFAULT_MAX_ENTRIES)) {
    problems.push(`${entries.length} entries exceed the limit of ${limits.maxEntries ?? DEFAULT_MAX_ENTRIES}`);
  }

  for (const entry of entries) {
    const pathProblem = validateSitePath(entry.name);

    if (pathProblem !== null) {
      problems.push(`unsafe path: ${pathProblem}`);
      continue;
    }

    if (seen.has(entry.name)) {
      problems.push(`duplicate entry ${entry.name}`);
    }

    seen.add(entry.name);

    if (entry.type === 'symlink') {
      problems.push(`symlink entry ${entry.name}`);
    } else if (entry.type === 'hardlink') {
      problems.push(`hardlink entry ${entry.name}`);
    } else if (entry.type === 'special') {
      problems.push(`special file entry ${entry.name}`);
    }

    const zip = entry as Partial<ZipEntry>;

    if (zip.encrypted) {
      problems.push(`encrypted entry ${entry.name}`);
    }

    if (zip.method !== undefined && entry.type === 'file' && zip.method !== 0 && zip.method !== 8) {
      problems.push(`entry ${entry.name} uses unsupported compression method ${zip.method}`);
    }

    total += entry.type === 'file' ? entry.size : 0;
  }

  if (total > limits.maxUnpackedBytes) {
    problems.push(`declared unpacked size ${total} exceeds the budget of ${limits.maxUnpackedBytes} bytes`);
  }

  return problems;
};

const assertSafe = (entries: readonly ArchiveEntry[], limits: ArchiveLimits): void => {
  const problems = checkArchiveEntries(entries, limits);

  if (problems.length > 0) {
    throw new ArchiveSafetyError(problems);
  }
};

const inflateZipEntry = (zip: Buffer, entry: ZipEntry): Buffer => {
  const local = entry.localHeaderOffset;

  if (local + 30 > zip.length || zip.readUInt32LE(local) !== ZIP_LOCAL) {
    throw new ArchiveSafetyError([`local header of ${entry.name} is corrupt`]);
  }

  const nameLength = zip.readUInt16LE(local + 26);
  const extraLength = zip.readUInt16LE(local + 28);

  if (!zip.subarray(local + 30, local + 30 + nameLength).equals(entry.rawName)) {
    throw new ArchiveSafetyError([`local header of ${entry.name} names a different file`]);
  }

  const start = local + 30 + nameLength + extraLength;

  if (start + entry.compressedSize > zip.length) {
    throw new ArchiveSafetyError([`data of ${entry.name} lies outside the archive`]);
  }

  const data = zip.subarray(start, start + entry.compressedSize);
  let output: Buffer;

  if (entry.method === 0) {
    output = data;
  } else {
    try {
      output = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.size) });
    } catch {
      throw new ArchiveSafetyError([`entry ${entry.name} inflates past its declared size of ${entry.size} bytes or is corrupt`]);
    }
  }

  if (output.length !== entry.size) {
    throw new ArchiveSafetyError([`entry ${entry.name} unpacks to ${output.length} bytes, not its declared size of ${entry.size}`]);
  }

  if (crc32(output) !== entry.crc32) {
    throw new ArchiveSafetyError([`entry ${entry.name} fails its CRC-32 check`]);
  }

  return output;
};

const insideDestination = (dest: string, name: string): string => {
  const root = resolve(dest);
  const target = resolve(root, ...name.split('/'));

  if (!target.startsWith(root + sep)) {
    throw new ArchiveSafetyError([`entry ${name} resolves outside the destination`]);
  }

  return target;
};

const writeEntries = (dest: string, entries: readonly ArchiveEntry[], read: (entry: ArchiveEntry) => Buffer): void => {
  mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    const target = insideDestination(dest, entry.name);

    if (entry.type === 'directory') {
      mkdirSync(target, { recursive: true });
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, read(entry), { flag: 'wx' });
  }
};

/** Unpacks `zip` into `dest` after inspecting every entry. */
export const extractZip = (zip: Buffer, dest: string, limits: ArchiveLimits): void => {
  const entries = readZipEntries(zip);
  assertSafe(entries, limits);
  writeEntries(dest, entries, entry => inflateZipEntry(zip, entry as ZipEntry));
};

/** The bytes of the single file `name` in `zip`, after inspecting every entry. */
export const readZipFile = (zip: Buffer, name: string, limits: ArchiveLimits): Buffer => {
  const entries = readZipEntries(zip);
  assertSafe(entries, limits);
  const entry = entries.find(candidate => candidate.name === name && candidate.type === 'file');

  if (entry === undefined) {
    throw new ArchiveSafetyError([`archive has no file ${name}`]);
  }

  return inflateZipEntry(zip, entry);
};

/** Unpacks `tar` into `dest` after inspecting every member. */
export const extractTar = (tar: Buffer, dest: string, limits: ArchiveLimits): void => {
  const entries = readTarEntries(tar);
  assertSafe(entries, limits);
  writeEntries(dest, entries, entry => {
    const member = entry as TarEntry;

    return tar.subarray(member.dataOffset, member.dataOffset + member.size);
  });
};

/**
 * Every entry below `root` the Pages artifact must not contain: a symbolic
 * link, a hardlinked file, a special file or a name that is not a site path.
 */
export const checkTreeSafety = (root: string): string[] => {
  const problems: string[] = [];

  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const rel = prefix === '' ? name : `${prefix}/${name}`;
      const pathProblem = validateSitePath(rel);

      if (pathProblem !== null) {
        problems.push(`unsafe path: ${pathProblem}`);
        continue;
      }

      const abs = join(directory, name);
      const stats = lstatSync(abs);

      if (stats.isSymbolicLink()) {
        problems.push(`symlink ${rel}`);
      } else if (stats.isDirectory()) {
        visit(abs, rel);
      } else if (!stats.isFile()) {
        problems.push(`special file ${rel}`);
      } else if (stats.nlink > 1) {
        problems.push(`hardlink ${rel} (${stats.nlink} links)`);
      }
    }
  };

  visit(root, '');

  return problems;
};
