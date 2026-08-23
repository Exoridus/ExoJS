import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = join(import.meta.dirname, '..');
const SOURCE_ROOT = join(PACKAGE_ROOT, 'src');

/** Packages that translate an editor's file format into runtime tilemap data. */
const FORMAT_ADAPTERS = ['@codexo/exojs-tiled', '@codexo/exojs-ldtk', '@codexo/exojs-aseprite'];

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);

    return entry.name.endsWith('.ts') ? [path] : [];
  });

describe('format agnosticism', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('declares no format adapter as a dependency or peer', () => {
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });

    expect(declared.filter(name => FORMAT_ADAPTERS.includes(name))).toEqual([]);
  });

  it('names no format adapter anywhere in its sources', () => {
    const offenders = sourceFiles(SOURCE_ROOT).filter(path => {
      const source = readFileSync(path, 'utf8');

      return FORMAT_ADAPTERS.some(name => source.includes(name));
    });

    expect(offenders).toEqual([]);
  });

  it('never resolves a format adapter from the production compile', () => {
    // The end-to-end tests map the adapters in tsconfig.test.json on purpose.
    // The production program must stay unable to see them at all, so a src
    // import fails to compile rather than quietly resolving.
    const production = readFileSync(join(PACKAGE_ROOT, 'tsconfig.json'), 'utf8');

    expect(FORMAT_ADAPTERS.filter(name => production.includes(name))).toEqual([]);
  });

  it('branches on no format-specific concept', () => {
    // The bridge consumes classification strings; it must never recognise one.
    const forbidden = [/\bintGrid/i, /\bldtk/i, /\btiled\b/i, /\baseprite/i];
    const offenders = sourceFiles(SOURCE_ROOT).flatMap(path => {
      const source = readFileSync(path, 'utf8');

      return forbidden.filter(pattern => pattern.test(source)).map(pattern => `${path}: ${String(pattern)}`);
    });

    expect(offenders).toEqual([]);
  });
});
