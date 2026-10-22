/**
 * The authored catalog and everything generated from it: file closure against
 * the real content tree, hash correctness, profile budgets and generated-file
 * drift. These run without Core so the content package can be verified before
 * the engine is built.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { bytesOf, filesFor, packageRoot, resolveCatalog, sha256Of } from '../scripts/catalog.ts';
import { renderAll } from '../scripts/generate.ts';

const catalog = resolveCatalog();

describe('closure: every published file exists under examples/assets and hashes match', () => {
  test.each(catalog.files.map(file => [file.path, file] as const))('%s', (_path, file) => {
    const absolute = resolve(catalog.sourceRoot, file.path);

    expect(existsSync(absolute)).toBe(true);
    expect(sha256Of(absolute)).toBe(file.sha256);
    expect(statSync(absolute).size).toBe(file.bytes);
  });
});

describe('profiles: standard and extended are separate deliveries', () => {
  const standard = filesFor(catalog, 'standard');
  const extended = filesFor(catalog, 'extended');

  test('the standard profile stays under the 20 MB media budget', () => {
    expect(bytesOf(standard)).toBeLessThan(20_000_000);
  });

  test('the extended profile contains only the HDR candidate and is not smuggled into standard', () => {
    expect(extended.map(file => file.path)).toEqual(['demo/video/clips/hdr10.webm']);
    expect(standard.some(file => file.path.includes('hdr10'))).toBe(false);
    expect(bytesOf(standard) + bytesOf(extended)).toBeGreaterThan(34_000_000);
  });

  test('no file ships in both profiles at once', () => {
    const standardPaths = new Set(standard.map(file => file.path));

    for (const file of extended) {
      expect(standardPaths.has(file.path)).toBe(false);
    }
  });
});

describe('blocked sources: unrecorded-provenance files stay unpublished', () => {
  test('no entry or transitive file under blocked paths is published', () => {
    const blocked = new Set(catalog.source.blocked.map(item => item.path));

    for (const file of catalog.files) {
      expect(blocked.has(file.path)).toBe(false);
    }
  });
});

describe('sound sprite sidecars: the format the sound loader reads', () => {
  const sidecars = catalog.entries.flatMap(entry =>
    Object.entries(entry.options ?? {}).flatMap(([option, value]) =>
      option === 'sprites' && typeof value === 'object' ? [[entry.key, value.$path] as const] : [],
    ),
  );

  test('the catalog has sound sprite sidecars to check', () => {
    expect(sidecars.length).toBeGreaterThan(0);
  });

  test.each(sidecars)('%s: %s maps each clip name to finite start and end seconds', (_key, path) => {
    const sheet: unknown = JSON.parse(readFileSync(resolve(catalog.sourceRoot, path), 'utf8'));

    expect(sheet).toBeTypeOf('object');
    expect(Array.isArray(sheet)).toBe(false);
    expect(Object.keys(sheet as object).length).toBeGreaterThan(0);

    for (const clip of Object.values(sheet as Record<string, unknown>)) {
      const { start, end } = clip as { start?: unknown; end?: unknown };

      expect(Number.isFinite(start)).toBe(true);
      expect(Number.isFinite(end)).toBe(true);
      expect(end as number).toBeGreaterThan(start as number);
    }
  });
});

describe('generated artifacts: no drift against the authored catalog', () => {
  test.each(Object.entries(renderAll(catalog)))('%s', (path, rendered) => {
    expect(readFileSync(resolve(packageRoot, path), 'utf8')).toBe(rendered);
  });

  test('every generated descriptor names a shipped file', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'manifest.json'), 'utf8')) as {
      readonly files: ReadonlyArray<{ readonly path: string }>;
    };
    const shipped = new Set(manifest.files.map(file => file.path));

    for (const entry of catalog.entries) {
      expect(shipped.has(entry.path)).toBe(true);
    }
  });
});
