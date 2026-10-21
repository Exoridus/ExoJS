import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkArchiveEntries,
  checkTreeSafety,
  extractTar,
  extractZip,
  readTarEntries,
  readZipEntries,
  readZipFile,
} from '../../scripts/pages/archive-safety';
import { evaluateSiteSize, SITE_SIZE_REFUSE_BYTES, SITE_SIZE_WARN_BYTES } from '../../scripts/pages/site-budget';
import { createTar, createZip } from '../support/archive-fixtures';

/**
 * Candidate artifacts are downloaded by a workflow that can deploy, so every
 * archive is inspected before a single byte is written, and the composed tree
 * is inspected again before it is uploaded.
 */

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'exo-archive-'));
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

const limits = { maxUnpackedBytes: 1_000_000 };

describe('zip archives', () => {
  it('reads and extracts a well-formed archive', () => {
    const zip = createZip([
      { name: 'en/' },
      { name: 'en/index.html', data: '<p>hi</p>' },
      { name: 'index.html', data: 'root', store: true },
    ]);
    expect(readZipEntries(zip).map(entry => [entry.name, entry.type])).toEqual([
      ['en', 'directory'],
      ['en/index.html', 'file'],
      ['index.html', 'file'],
    ]);
    extractZip(zip, work, limits);
    expect(readFileSync(join(work, 'en/index.html'), 'utf8')).toBe('<p>hi</p>');
    expect(readFileSync(join(work, 'index.html'), 'utf8')).toBe('root');
  });

  it('reads one named file without extracting anything', () => {
    const zip = createZip([{ name: 'artifact.tar', data: 'tar bytes' }]);
    expect(readZipFile(zip, 'artifact.tar', limits).toString('utf8')).toBe('tar bytes');
    expect(() => readZipFile(zip, 'other.tar', limits)).toThrow(/other\.tar/);
  });

  it.each([
    ['an absolute path', '/etc/cron.d/x'],
    ['a parent traversal', '../outside.html'],
    ['a nested traversal', 'en/../../outside.html'],
    ['a Windows drive', 'C:/Windows/x.dll'],
    ['a backslash', 'en\\..\\x.html'],
  ])('refuses %s before writing anything', (_label, name) => {
    const zip = createZip([
      { name: 'ok.html', data: 'ok' },
      { name, data: 'evil' },
    ]);
    expect(() => extractZip(zip, work, limits)).toThrow(/path/i);
    expect(existsSync(join(work, 'ok.html'))).toBe(false);
  });

  it('refuses symbolic links and special files', () => {
    expect(() => extractZip(createZip([{ name: 'link', data: '/etc/passwd', mode: 0o120777 }]), work, limits)).toThrow(/symlink/);
    expect(() => extractZip(createZip([{ name: 'fifo', mode: 0o010644 }]), work, limits)).toThrow(/special/);
  });

  it('refuses duplicate entries and encrypted entries', () => {
    expect(() =>
      extractZip(
        createZip([
          { name: 'a.html', data: '1' },
          { name: 'a.html', data: '2' },
        ]),
        work,
        limits,
      ),
    ).toThrow(/duplicate/);
    expect(() => extractZip(createZip([{ name: 'a.html', data: '1', encrypted: true }]), work, limits)).toThrow(/encrypt/);
  });

  it('refuses an archive whose declared unpacked size exceeds the budget', () => {
    const zip = createZip([{ name: 'big.bin', data: Buffer.alloc(2048) }]);
    expect(() => extractZip(zip, work, { maxUnpackedBytes: 1024 })).toThrow(/budget/);
  });

  it('refuses an entry that inflates past its declared size', () => {
    const bomb = createZip([{ name: 'bomb.bin', data: Buffer.alloc(500_000), declaredSize: 10 }]);
    expect(checkArchiveEntries(readZipEntries(bomb), limits)).toEqual([]);
    expect(() => extractZip(bomb, work, limits)).toThrow(/size/);
  });

  it('refuses a truncated or foreign file', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all'))).toThrow(/zip/i);
    const zip = createZip([{ name: 'a.html', data: 'x' }]);
    expect(() => readZipEntries(zip.subarray(0, zip.length - 4))).toThrow();
  });
});

describe('tar archives', () => {
  it('reads and extracts the shape the Pages upload action writes', () => {
    const tar = createTar([{ name: './' }, { name: './en/' }, { name: './en/index.html', data: 'hello' }, { name: './.nojekyll' }]);
    expect(readTarEntries(tar).map(entry => [entry.name, entry.type])).toEqual([
      ['en', 'directory'],
      ['en/index.html', 'file'],
      ['.nojekyll', 'file'],
    ]);
    extractTar(tar, work, limits);
    expect(readFileSync(join(work, 'en/index.html'), 'utf8')).toBe('hello');
  });

  it('honours a pax path and still validates it', () => {
    const long = `${'deep/'.repeat(30)}file.html`;
    expect(readTarEntries(createTar([{ name: long, data: 'x', pax: true }]))[0]?.name).toBe(long);
    expect(() => extractTar(createTar([{ name: '../escape.html', data: 'x', pax: true }]), work, limits)).toThrow(/path/i);
  });

  it('refuses symlinks, hardlinks and special files', () => {
    expect(() => extractTar(createTar([{ name: 'a', type: '2', linkName: '/etc/passwd' }]), work, limits)).toThrow(/symlink/);
    expect(() => extractTar(createTar([{ name: 'b', type: '1', linkName: 'a' }]), work, limits)).toThrow(/hardlink/);
    expect(() => extractTar(createTar([{ name: 'c', type: '3' }]), work, limits)).toThrow(/special/);
  });

  it('refuses an archive past the unpacked budget', () => {
    expect(() => extractTar(createTar([{ name: 'big.bin', data: Buffer.alloc(4096) }]), work, { maxUnpackedBytes: 1000 })).toThrow(
      /budget/,
    );
  });
});

describe('checkTreeSafety', () => {
  it('passes a tree of plain files and directories', () => {
    mkdirSync(join(work, 'en'));
    writeFileSync(join(work, 'en/index.html'), 'x');
    expect(checkTreeSafety(work)).toEqual([]);
  });

  it('reports a hardlinked file', () => {
    writeFileSync(join(work, 'a.html'), 'x');
    linkSync(join(work, 'a.html'), join(work, 'b.html'));
    expect(checkTreeSafety(work).join('\n')).toMatch(/hardlink/);
  });

  it('reports a linked directory', () => {
    mkdirSync(join(work, 'target'));
    // A junction needs no privilege on Windows and is a plain symlink elsewhere.
    symlinkSync(join(work, 'target'), join(work, 'link'), 'junction');
    expect(checkTreeSafety(work).join('\n')).toMatch(/symlink/);
  });
});

describe('evaluateSiteSize', () => {
  it('measures against the project budget in unpacked bytes', () => {
    expect(SITE_SIZE_WARN_BYTES).toBe(750_000_000);
    expect(SITE_SIZE_REFUSE_BYTES).toBe(900_000_000);
    expect(evaluateSiteSize(749_999_999).level).toBe('ok');
    expect(evaluateSiteSize(750_000_000).level).toBe('warn');
    expect(evaluateSiteSize(899_999_999).level).toBe('warn');
    expect(evaluateSiteSize(900_000_000).level).toBe('refuse');
  });
});
