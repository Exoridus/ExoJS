import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Hand-built archives for the Pages archive-safety suites. The writers emit
 * exactly what they are told, including entries no well-behaved archiver
 * would produce, so the readers can be tested against hostile input.
 */

export interface ZipFixtureEntry {
  name: string;
  data?: Buffer | string;
  /** Unix mode including the file-type bits; defaults to a regular file or a directory by name. */
  mode?: number;
  /** Stored instead of deflated. */
  store?: boolean;
  /** Overrides the uncompressed size written to the headers. */
  declaredSize?: number;
  /** Sets the encryption flag. */
  encrypted?: boolean;
}

const u16 = (value: number): Buffer => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);

  return buffer;
};

const u32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);

  return buffer;
};

export const createZip = (entries: readonly ZipFixtureEntry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
    const isDirectory = entry.name.endsWith('/');
    const method = entry.store || isDirectory ? 0 : 8;
    const payload = method === 8 ? deflateRawSync(raw) : raw;
    const size = entry.declaredSize ?? raw.length;
    const mode = entry.mode ?? (isDirectory ? 0o040755 : 0o100644);
    const flags = 0x0800 | (entry.encrypted ? 0x0001 : 0);
    const crc = crc32(raw);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      payload,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16((3 << 8) | 20),
      u16(20),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(mode << 16),
      u32(offset),
      name,
    ]);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDirectory, end]);
};

export interface TarFixtureEntry {
  name: string;
  data?: Buffer | string;
  /** Tar type flag: `0` file, `5` directory, `2` symlink, `1` hardlink, `3`-`7` special. */
  type?: string;
  linkName?: string;
  /** Emits the path through a pax extended header instead of the ustar name field. */
  pax?: boolean;
}

const octal = (value: number, width: number): string => `${value.toString(8).padStart(width - 1, '0')}\0`;

const tarHeader = (name: string, size: number, type: string, linkName = ''): Buffer => {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, 'utf8');
  header.write(octal(type === '5' ? 0o755 : 0o644, 8), 100, 'ascii');
  header.write(octal(0, 8), 108, 'ascii');
  header.write(octal(0, 8), 116, 'ascii');
  header.write(octal(size, 12), 124, 'ascii');
  header.write(octal(0, 12), 136, 'ascii');
  header.write('        ', 148, 'ascii');
  header.write(type, 156, 'ascii');
  header.write(linkName.slice(0, 100), 157, 'utf8');
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');

  let sum = 0;

  for (const byte of header) {
    sum += byte;
  }

  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');

  return header;
};

const padded = (data: Buffer): Buffer => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

export const createTar = (entries: readonly TarFixtureEntry[]): Buffer => {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
    const type = entry.type ?? (entry.name.endsWith('/') ? '5' : '0');

    if (entry.pax) {
      const body = ` path=${entry.name}\n`;
      let length = body.length;

      while (`${length}${body}`.length !== length) {
        length = `${length}${body}`.length;
      }

      const record = Buffer.from(`${length}${body}`, 'utf8');
      blocks.push(tarHeader('PaxHeader', record.length, 'x'), padded(record));
      blocks.push(tarHeader('placeholder', type === '0' ? data.length : 0, type, entry.linkName));
    } else {
      blocks.push(tarHeader(entry.name, type === '0' ? data.length : 0, type, entry.linkName));
    }

    if (type === '0') {
      blocks.push(padded(data));
    }
  }

  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
};
