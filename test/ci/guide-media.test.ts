// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedCatalog } from '../../packages/exojs-demo-assets/scripts/catalog.ts';

const fixture = vi.hoisted(() => ({ root: '', catalog: undefined as ResolvedCatalog | undefined }));

vi.mock('../../packages/exojs-demo-assets/scripts/catalog.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../packages/exojs-demo-assets/scripts/catalog.ts')>()),
  get packageRoot() {
    return fixture.root;
  },
  resolveCatalog: () => fixture.catalog!,
}));

const prepared = Symbol.for('exojs.test.guide-media-prepared');
const processState = globalThis as typeof globalThis & { [prepared]?: boolean };
const bytes = 'standard media bytes';
const sha256 = createHash('sha256').update(bytes).digest('hex');

describe('guide-owned browser media preparation', () => {
  beforeEach(() => {
    vi.resetModules();
    delete processState[prepared];
    fixture.root = mkdtempSync(join(tmpdir(), 'exojs-guide-media-'));
    const sourceRoot = join(fixture.root, 'source');
    mkdirSync(sourceRoot);
    writeFileSync(join(sourceRoot, 'standard.png'), bytes);
    writeFileSync(join(sourceRoot, 'extended.png'), bytes);
    fixture.catalog = {
      sourceRoot,
      source: { sourceRoot, provenance: {}, media: {}, entries: [], blocked: [] },
      entries: [],
      files: [
        { path: 'standard.png', bytes: bytes.length, sha256, role: 'entry', profile: 'standard', provenance: 'fixture' },
        { path: 'extended.png', bytes: bytes.length, sha256, role: 'entry', profile: 'extended', provenance: 'fixture' },
      ],
    };
  });

  afterEach(() => {
    delete processState[prepared];
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('copies and verifies real standard files once across command-module imports', async () => {
    const { prepareGuideMedia } = await import('../rendering/browser/guideMediaCommand.ts');
    prepareGuideMedia();

    expect(readFileSync(join(fixture.root, 'media/standard.png'), 'utf8')).toBe(bytes);
    expect(existsSync(join(fixture.root, 'media/extended.png'))).toBe(false);
    writeFileSync(join(fixture.root, 'media/preserve.txt'), 'already prepared');
    vi.resetModules();
    (await import('../rendering/browser/guideMediaCommand.ts')).prepareGuideMedia();

    expect(readFileSync(join(fixture.root, 'media/preserve.txt'), 'utf8')).toBe('already prepared');
  });

  it('fails on a changed source hash and does not mark failed preparation complete', async () => {
    const { prepareGuideMedia } = await import('../rendering/browser/guideMediaCommand.ts');
    writeFileSync(join(fixture.root, 'source/standard.png'), 'unexpected content');

    expect(prepareGuideMedia).toThrow('copy does not match its manifest hash');
    expect(processState[prepared]).toBeUndefined();
    writeFileSync(join(fixture.root, 'source/standard.png'), bytes);
    prepareGuideMedia();

    expect(readFileSync(join(fixture.root, 'media/standard.png'), 'utf8')).toBe(bytes);
    expect(processState[prepared]).toBe(true);
  });

  it('leaves dynamic guides cold until media exists, then transforms their real asset URLs', async () => {
    const transformed: string[] = [];
    writeFileSync(join(fixture.root, 'entry.ts'), "export const load = () => import('./guide.ts');\n");
    writeFileSync(join(fixture.root, 'guide.ts'), "export { asset } from './catalog.ts';\n");
    writeFileSync(join(fixture.root, 'catalog.ts'), "export const asset = new URL('./media/standard.png', import.meta.url).href;\n");
    const server = await createServer({
      root: fixture.root,
      configFile: false,
      envFile: false,
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [{ name: 'record-transforms', transform: (_code, id) => void transformed.push(id) }],
    });

    try {
      await server.transformRequest('/entry.ts');

      expect(existsSync(join(fixture.root, 'media/standard.png'))).toBe(false);
      expect(transformed).not.toContain(join(fixture.root, 'guide.ts').replaceAll('\\', '/'));
      expect(transformed).not.toContain(join(fixture.root, 'catalog.ts').replaceAll('\\', '/'));
      (await import('../rendering/browser/guideMediaCommand.ts')).prepareGuideMedia();
      await server.transformRequest('/guide.ts');
      const catalog = await server.transformRequest('/catalog.ts');

      expect(catalog?.code).toContain('new URL("/media/standard.png",');
      expect(readFileSync(join(fixture.root, 'media/standard.png'), 'utf8')).toBe(bytes);
    } finally {
      await server.close();
    }
  });

  it('registers media preparation for both WebGL browsers and awaits it before guide imports', () => {
    const config = readFileSync(resolve('vitest.config.ts'), 'utf8');
    const guide = readFileSync(resolve('test/rendering/browser/webgl2-guide-workflows.test.ts'), 'utf8');

    expect(config).not.toContain("globalSetup: ['./test/rendering/browser/_setup-demo-media.ts']");
    expect(config.match(/commands: \{ prepareGuideMedia(?:,| \})/g)).toHaveLength(2);
    expect(guide).toMatch(/beforeAll\(async \(\) => \{\s*await mediaCommands\.prepareGuideMedia\(\);/);
    expect(guide.indexOf('await mediaCommands.prepareGuideMedia()')).toBeLessThan(guide.indexOf("import('../../../examples/guides/"));
  });
});
