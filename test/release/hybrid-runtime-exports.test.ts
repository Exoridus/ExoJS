/**
 * The Core tarball alone carries every runtime module: installed with nothing
 * else, it resolves all seven subpaths and the debug entry at runtime and under
 * both TypeScript module resolutions, ships every file its `exports` map names,
 * and its module declarations need no source checkout to resolve.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findModuleSpecifiers } from '../../scripts/lib/module-specifiers';
import { CORE_CONSUMER_TS, runNodeCheck, subpathConsumerSource, typecheckConsumer } from '../../scripts/release/external-consumers';
import { RUNTIME_MODULES } from '../../scripts/release/lockstep-packages';
import { type InstalledConsumer, installHybridConsumer, runsAgainstBuild } from '../support/hybrid-runtime-package';

const RUNTIME_SUBPATHS = ['tilemap', 'particles', 'audio-fx', 'physics', 'tilemap-physics', 'lighting', 'pathfinding'] as const;
const RETIRED_PACKAGES = RUNTIME_SUBPATHS.map(subpath => `@codexo/exojs-${subpath}`);

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const collectTargets = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return [value];
  }

  return value !== null && typeof value === 'object' ? Object.values(value as Record<string, unknown>).flatMap(collectTargets) : [];
};

const ENTRY_IMPORTS = `const entries = ['@codexo/exojs', ${[...RUNTIME_SUBPATHS, 'debug', 'renderer-sdk'].map(subpath => `'@codexo/exojs/${subpath}'`).join(', ')}];`;

const importOrderScript = (physicsDebugFirst: boolean): string => `${ENTRY_IMPORTS}
const physicsDebugUrl = new URL('./node_modules/@codexo/exojs/dist/esm/physics/debug/index.js', import.meta.url);
${physicsDebugFirst ? 'const physicsDebug = await import(physicsDebugUrl.href);' : ''}
const debug = await import('@codexo/exojs/debug');
${physicsDebugFirst ? '' : 'const physicsDebug = await import(physicsDebugUrl.href);'}
const empty = [];
for (const entry of entries) {
  if (Object.keys(await import(entry)).length === 0) empty.push(entry);
}
const ok =
  empty.length === 0 &&
  typeof debug.PhysicsDebugDraw === 'function' &&
  debug.PhysicsDebugDraw === physicsDebug.PhysicsDebugDraw &&
  Object.getPrototypeOf(debug.PhysicsDebugDraw) === debug.DebugLayer;
console.log(ok ? 'ENTRIES_OK' : 'ENTRIES_BAD ' + JSON.stringify({ empty, draw: typeof debug.PhysicsDebugDraw }));
`;

const SIDE_EFFECT_PROBE = `${ENTRY_IMPORTS}
const calls = [];
const record = name => () => { calls.push(name); return 0; };
for (const name of ['setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'requestIdleCallback']) {
  globalThis[name] = record(name);
}
for (const name of ['AudioContext', 'OfflineAudioContext', 'Worker', 'MessageChannel', 'BroadcastChannel']) {
  globalThis[name] = class { constructor() { calls.push(name); } };
}
globalThis.document = new Proxy({}, { get: (_target, key) => { calls.push('document.' + String(key)); return undefined; } });
const before = new Set(Reflect.ownKeys(globalThis));
for (const entry of entries) await import(entry);
const added = Reflect.ownKeys(globalThis).filter(key => !before.has(key)).map(String);
if (calls.length > 0 || added.length > 0) {
  console.log('SIDE_EFFECTS ' + JSON.stringify({ calls, added }));
  process.exit(1);
}
console.log('NO_SIDE_EFFECTS');
`;

describe.runIf(runsAgainstBuild(['dist/esm/index.js']))('hybrid runtime: Core tarball alone', () => {
  let consumer: InstalledConsumer;

  beforeAll(() => {
    consumer = installHybridConsumer();
  }, 180_000);

  afterAll(() => consumer?.dispose());

  it('lists exactly the seven runtime modules in the release matrix', () => {
    expect(RUNTIME_MODULES.map(module => module.subpath)).toEqual([...RUNTIME_SUBPATHS]);
  });

  it('installs without any retired runtime package and depends on none', () => {
    const manifest = JSON.parse(readFileSync(join(consumer.coreDir, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >;
    const declared = Object.keys({ ...manifest['dependencies'], ...manifest['peerDependencies'], ...manifest['optionalDependencies'] });

    expect(declared.filter(name => name.startsWith('@codexo/'))).toEqual([]);
    expect(readdirSync(join(consumer.dir, 'node_modules', '@codexo'))).toEqual(['exojs']);
  });

  it('exports every runtime module subpath with the same condition shape as the root', () => {
    const exports = (JSON.parse(readFileSync(join(consumer.coreDir, 'package.json'), 'utf8')) as { exports: Record<string, unknown> })
      .exports;

    const expected = Object.fromEntries(
      RUNTIME_SUBPATHS.map(subpath => [
        `./${subpath}`,
        { types: `./dist/esm/${subpath}/index.d.ts`, import: `./dist/esm/${subpath}/index.js`, default: `./dist/esm/${subpath}/index.js` },
      ]),
    );

    expect(Object.fromEntries(RUNTIME_SUBPATHS.map(subpath => [`./${subpath}`, exports[`./${subpath}`]]))).toEqual(expected);
    expect(['.', './extensions', './renderer-sdk', './debug', './package.json'].filter(key => exports[key] === undefined)).toEqual([]);
  });

  it('ships every exports target in the tarball', () => {
    const exports = (JSON.parse(readFileSync(join(consumer.coreDir, 'package.json'), 'utf8')) as { exports: unknown }).exports;
    const missing = collectTargets(exports).filter(target => !existsSync(resolve(consumer.coreDir, target)));

    expect(missing).toEqual([]);
  });

  it.each([false, true])('imports every subpath and the debug entry in Node (physics debug module first: %s)', physicsDebugFirst => {
    const check = runNodeCheck(
      consumer.dir,
      'entries',
      `entries-${String(physicsDebugFirst)}.mjs`,
      importOrderScript(physicsDebugFirst),
      'ENTRIES_OK',
    );

    expect(check.detail ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
  });

  it('ships runtime module declarations that name no package and no # import', () => {
    // Core's own declarations keep resolving `#` through the Core imports map;
    // the debug entry is checked because it is where Core reaches into physics.
    const moduleDeclarations = RUNTIME_SUBPATHS.flatMap(subpath => listFiles(join(consumer.coreDir, 'dist', 'esm', subpath))).filter(path =>
      path.endsWith('.d.ts'),
    );
    const offending: string[] = [];
    const dangling: string[] = [];

    for (const file of [...moduleDeclarations, join(consumer.coreDir, 'dist', 'esm', 'debug', 'index.d.ts')]) {
      for (const { specifier } of findModuleSpecifiers(file, readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('@codexo/') || specifier.startsWith('#')) {
          offending.push(`${file}: ${specifier}`);
        } else if (specifier.startsWith('.') && !existsSync(resolve(dirname(file), specifier.replace(/\.js$/, '.d.ts')))) {
          dangling.push(`${file}: ${specifier}`);
        }
      }
    }

    expect(offending).toEqual([]);
    expect(dangling).toEqual([]);
  });

  it.each(['bundler', 'nodenext'] as const)(
    'type-checks a strict %s consumer of every subpath without paths or skipLibCheck',
    resolution => {
      const combined = typecheckConsumer(consumer.dir, 'combined', `combined-${resolution}`, CORE_CONSUMER_TS, resolution);
      const isolated = [...RUNTIME_SUBPATHS, 'debug'].map(subpath =>
        typecheckConsumer(consumer.dir, subpath, `isolated-${resolution}-${subpath}`, subpathConsumerSource(subpath), resolution),
      );
      const failures = [combined, ...isolated].filter(check => !check.ok).map(check => `${check.name}: ${check.detail ?? ''}`);

      expect(failures).toEqual([]);
    },
    180_000,
  );

  it('creates no DOM access, timer, audio context, worker or global on import', () => {
    const check = runNodeCheck(consumer.dir, 'side effects', 'side-effects.mjs', SIDE_EFFECT_PROBE, 'NO_SIDE_EFFECTS');

    expect(check.detail ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
  });

  it('does not reference a retired runtime package anywhere in the shipped tree', () => {
    const files = listFiles(join(consumer.coreDir, 'dist', 'esm')).filter(path => /\.(?:js|d\.ts)$/.test(path));
    const offending = files.flatMap(file =>
      findModuleSpecifiers(file, readFileSync(file, 'utf8'))
        .map(occurrence => occurrence.specifier)
        .filter(specifier => RETIRED_PACKAGES.some(name => specifier === name || specifier.startsWith(`${name}/`)))
        .map(specifier => `${file}: ${specifier}`),
    );

    expect(offending).toEqual([]);
  });
});
