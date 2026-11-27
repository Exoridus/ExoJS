/**
 * One Core, one instance per module: a consumer that installs Core next to
 * adapters and imports Core's root, every runtime subpath and the adapters gets
 * the same class objects everywhere, loads each shipped file once from the one
 * installed Core, and a bundler sees the same single Core. A Core-only
 * production bundle carries no runtime module or debug code at all.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { rolldown } from 'rolldown';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runNodeCheck } from '../../scripts/release/external-consumers';
import { type InstalledConsumer, installHybridConsumer, repoRoot, runsAgainstBuild } from '../support/hybrid-runtime-package';

const RUNTIME_SUBPATHS = ['tilemap', 'particles', 'audio-fx', 'physics', 'tilemap-physics', 'lighting', 'pathfinding'] as const;
const ADAPTERS = ['packages/exojs-tiled', 'packages/exojs-ldtk', 'packages/exojs-aseprite'] as const;
const OPTIONAL_TREES = [...RUNTIME_SUBPATHS, 'debug'] as const;

const IDENTITY_PROBE = `import { registerHooks } from 'node:module';

const loaded = new Set();
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    loaded.add(result.url);
    return result;
  },
});

const specifiers = ['@codexo/exojs', ${[...RUNTIME_SUBPATHS, 'debug', 'renderer-sdk'].map(subpath => `'@codexo/exojs/${subpath}'`).join(', ')}, '@codexo/exojs-tiled', '@codexo/exojs-ldtk', '@codexo/exojs-aseprite'];
const namespaces = Object.fromEntries(await Promise.all(specifiers.map(async specifier => [specifier, await import(specifier)])));

// Every exported value, by name, across all entries: a name exported from two
// entries must be the same object, or a second copy is loaded.
const byName = new Map();
const problems = [];
for (const [specifier, namespace] of Object.entries(namespaces)) {
  for (const [name, value] of Object.entries(namespace)) {
    if (!byName.has(name)) byName.set(name, { specifier, value });
    else if (byName.get(name).value !== value) problems.push('duplicate ' + name + ' in ' + specifier + ' and ' + byName.get(name).specifier);
  }
}

// Every ancestor class of every exported class that some entry also exports
// must be that very export: \`instanceof\` across entries depends on it.
let ancestry = 0;
for (const [specifier, namespace] of Object.entries(namespaces)) {
  for (const [name, value] of Object.entries(namespace)) {
    if (typeof value !== 'function') continue;
    for (let base = Object.getPrototypeOf(value); base && base !== Function.prototype; base = Object.getPrototypeOf(base)) {
      const exported = byName.get(base.name);
      if (exported === undefined) continue;
      ancestry += 1;
      if (exported.value !== base) problems.push(specifier + ' ' + name + ' extends a second ' + base.name);
    }
  }
}

const core = namespaces['@codexo/exojs'];
const tilemap = namespaces['@codexo/exojs/tilemap'];
const layer = new tilemap.TileMapNode(new tilemap.TileMap({ width: 1, height: 1, tileWidth: 1, tileHeight: 1 }));
if (!(layer instanceof core.Container)) problems.push('TileMapNode is not a Core Container');

const files = [...loaded].filter(url => url.startsWith('file:'));
const coreRoot = new URL('./node_modules/@codexo/exojs/', import.meta.url).href;
const foreign = files.filter(url => url.includes('/@codexo/') && !url.startsWith(coreRoot) && !/\\/@codexo\\/exojs-(tiled|ldtk|aseprite)\\//.test(url));
const shipped = files.filter(url => url.startsWith(coreRoot)).map(url => url.slice(coreRoot.length));
if (foreign.length > 0) problems.push('foreign @codexo files: ' + foreign.join(', '));
if (new Set(shipped).size !== shipped.length) problems.push('a Core file was loaded twice');

if (problems.length > 0) {
  console.log('IDENTITY_BAD ' + JSON.stringify(problems));
  process.exit(1);
}
console.log('IDENTITY_OK ' + JSON.stringify({ names: byName.size, ancestry, coreFiles: shipped.length }));
`;

interface BundleReport {
  readonly name: string;
  readonly bytes: number;
  readonly moduleIds: readonly string[];
}

const posix = (path: string): string => path.replaceAll('\\', '/');

describe.runIf(runsAgainstBuild(['dist/esm/index.js']))('hybrid runtime: one Core across entries, adapters and bundles', () => {
  let consumer: InstalledConsumer;
  const reports: BundleReport[] = [];

  const bundle = async (name: string, source: string): Promise<BundleReport> => {
    const entry = join(consumer.dir, `bundle-${name}.js`);
    writeFileSync(entry, source);
    const build = await rolldown({ input: entry, cwd: consumer.dir, platform: 'browser', logLevel: 'silent' });
    const { output } = await build.generate({ format: 'es', minify: true });
    await build.close();
    const chunks = output.filter(item => item.type === 'chunk');
    const report = {
      name,
      bytes: chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
      moduleIds: chunks.flatMap(chunk => chunk.moduleIds).map(posix),
    };
    reports.push(report);

    return report;
  };

  const shippedTrees = (report: BundleReport): string[] => [
    ...new Set(
      report.moduleIds.flatMap(id => {
        const match = /\/node_modules\/@codexo\/exojs\/dist\/esm\/([^/]+)\//.exec(id);

        return match && (OPTIONAL_TREES as readonly string[]).includes(match[1]!) ? [match[1]!] : [];
      }),
    ),
  ];

  /** The installed Core roots a bundle drew shipped files from, and how often it drew `Application`. */
  const coreCopies = (report: BundleReport): { roots: number; applications: number } => {
    const shipped = report.moduleIds.filter(id => id.includes('/@codexo/exojs/dist/esm/'));

    return {
      roots: new Set(shipped.map(id => id.slice(0, id.indexOf('/@codexo/exojs/dist/esm/')))).size,
      applications: shipped.filter(id => id.endsWith('/dist/esm/core/Application.js')).length,
    };
  };

  beforeAll(() => {
    consumer = installHybridConsumer(ADAPTERS);
  }, 240_000);

  afterAll(() => {
    // The bundle sizes are evidence a reviewer compares against a baseline build;
    // they are written next to the other test reports rather than asserted.
    if (reports.length > 0) {
      const directory = join(repoRoot, 'test-results');
      const summary = reports.map(report => ({
        name: report.name,
        minifiedBytes: report.bytes,
        modules: report.moduleIds.length,
        trees: shippedTrees(report),
      }));
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'hybrid-runtime-bundles.json'), `${JSON.stringify(summary, null, 2)}\n`);
    }

    consumer?.dispose();
  });

  it('shares every class across the root, the subpaths and the adapters, and loads each file once', () => {
    const check = runNodeCheck(consumer.dir, 'identity', 'identity.mjs', IDENTITY_PROBE, 'IDENTITY_OK');

    expect(check.detail ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
  });

  it('keeps every runtime module and debug code out of a Core-only production bundle', async () => {
    const whole = await bundle('core-all', "export * from '@codexo/exojs';\n");
    const app = await bundle(
      'core-app',
      "import { Application, Scene, Sprite } from '@codexo/exojs';\nexport const app = new Application();\nexport { Scene, Sprite };\n",
    );

    expect(shippedTrees(whole)).toEqual([]);
    expect(shippedTrees(app)).toEqual([]);
  });

  it('bundles Core exactly once next to one module and next to several', async () => {
    const one = await bundle(
      'core-tilemap',
      "import { Application } from '@codexo/exojs';\nimport { TileMap } from '@codexo/exojs/tilemap';\nexport { Application, TileMap };\n",
    );
    const several = await bundle(
      'core-modules-debug',
      [
        "export { Application } from '@codexo/exojs';",
        "export { TileMap } from '@codexo/exojs/tilemap';",
        "export { PhysicsWorld } from '@codexo/exojs/physics';",
        "export { TileColliderStreamer } from '@codexo/exojs/tilemap-physics';",
        "export { ParticleSystem } from '@codexo/exojs/particles';",
        "export { PhysicsDebugDraw } from '@codexo/exojs/debug';",
        "export { TiledMap } from '@codexo/exojs-tiled';",
        '',
      ].join('\n'),
    );

    const shape = (report: BundleReport): object => ({
      ...coreCopies(report),
      duplicateModules: report.moduleIds.length - new Set(report.moduleIds).size,
      nestedInstalls: report.moduleIds.filter(id => /\/@codexo\/exojs\/.*\/node_modules\//.test(id)),
    });
    const single = { roots: 1, applications: 1, duplicateModules: 0, nestedInstalls: [] };

    expect({ one: shape(one), several: shape(several) }).toEqual({ one: single, several: single });

    expect(shippedTrees(one)).toEqual(['tilemap']);
    expect(shippedTrees(several).sort()).toEqual(['debug', 'particles', 'physics', 'tilemap', 'tilemap-physics']);
  }, 120_000);
});
