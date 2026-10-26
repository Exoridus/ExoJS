/**
 * The authored catalog and everything generated from it: file closure against
 * the real content tree, hash correctness, profile budgets and generated-file
 * drift. These run without Core so the content package can be verified before
 * the engine is built.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { bytesOf, filesFor, packageRoot, resolveCatalog, sha256Of } from '../scripts/catalog.ts';
import { renderAll, renderNotices } from '../scripts/generate.ts';

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

  test('the standard profile with full-length music stays under the 30 MB media budget', () => {
    expect(bytesOf(standard)).toBeLessThan(30_000_000);
  });

  test('the extended profile contains only the HDR candidate and is not smuggled into standard', () => {
    expect(extended.map(file => file.path)).toEqual(['video/hdr10.webm']);
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

describe('source layout', () => {
  test('the authoring tree contains exactly the catalog files in six flat directories', () => {
    const directories = readdirSync(catalog.sourceRoot);

    expect(directories.sort()).toEqual(['audio', 'fonts', 'images', 'licenses', 'maps', 'video']);

    const paths = directories.flatMap(directory =>
      readdirSync(resolve(catalog.sourceRoot, directory), { withFileTypes: true }).map(file => {
        expect(file.isFile()).toBe(true);

        return `${directory}/${file.name}`;
      }),
    );

    expect(paths.sort()).toEqual(catalog.files.map(file => file.path).sort());
  });

  test('published files use one directory level by media type', () => {
    for (const file of catalog.files) {
      expect(file.path).toMatch(/^(?:images|audio|fonts|maps|video|licenses)\/[^/]+$/);
    }
  });

  test('isometric map images retain their upstream license', () => {
    const images = catalog.files.filter(file => file.path.startsWith('images/isometric-landscape-tile-'));

    expect(images).toHaveLength(6);
    expect(images.every(file => file.provenance === 'kenney-isometric-tiles-landscape')).toBe(true);
    expect(catalog.files.some(file => file.path === 'licenses/kenney-isometric-tiles-landscape.txt')).toBe(true);
  });

  test('unknown provenance for a transitive image is rejected', () => {
    expect(() =>
      resolveCatalog({
        ...catalog.source,
        fileProvenance: { ...catalog.source.fileProvenance, 'images/isometric-landscape-tile-000.png': 'missing-owner' },
      }),
    ).toThrow(/unknown provenance/);
  });

  test('atlas image names resolve beside their JSON files', () => {
    const atlases = catalog.entries.filter(entry => entry.path.startsWith('images/') && entry.path.endsWith('.json'));

    expect(atlases.length).toBeGreaterThan(0);

    for (const entry of atlases) {
      const atlas = JSON.parse(readFileSync(resolve(catalog.sourceRoot, entry.path), 'utf8')) as { meta: { image: string } };

      expect(atlas.meta.image).not.toContain('/');
      expect(existsSync(resolve(catalog.sourceRoot, 'images', atlas.meta.image))).toBe(true);
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
describe('collected license texts', () => {
  test('standard notices include each original license text once', () => {
    const notices = renderNotices(catalog, ['standard']);

    for (const file of filesFor(catalog, 'standard').filter(file => file.role === 'license')) {
      const text = readFileSync(resolve(catalog.sourceRoot, file.path), 'utf8')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n*$/, '');

      expect(notices.split(`### ${file.path}`).length - 1).toBe(1);
      expect(notices).toContain(`\`\`\`text\n${text}\n\`\`\``);
    }
  });

  test('extended notices exclude standard license texts', () => {
    const notices = renderNotices(catalog, ['extended']);

    for (const file of filesFor(catalog, 'standard').filter(file => file.role === 'license')) {
      expect(notices).not.toContain(`### ${file.path}`);
    }
  });

  test('license sources use LF so byte hashes are reproducible across checkouts', () => {
    for (const file of catalog.files.filter(file => file.role === 'license')) {
      expect(readFileSync(resolve(catalog.sourceRoot, file.path), 'utf8')).not.toContain('\r');
    }
  });
});
