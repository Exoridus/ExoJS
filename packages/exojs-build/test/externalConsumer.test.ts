// @vitest-environment node
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The package as an npm consumer actually receives it.
 *
 * A workspace import proves nothing about a publish: it resolves through
 * `src`, sees every file on disk, and inherits the repository's dependencies.
 * This spec packs the real tarball, unpacks it into a project outside the
 * repository, and drives a Vite build, a Rollup build and a `tsc` type-check
 * against that copy alone - which is the only way the exports map, the
 * `files` allowlist, the shipped declarations and the dependency list get
 * judged the way a consumer judges them.
 *
 * The consumer's peer tooling (Vite, Rollup, and this package's own `esbuild`
 * dependency) is linked in from the repository's store rather than installed
 * from a registry, so the spec is offline and deterministic. What that link
 * cannot prove - that the manifest declares those dependencies at all - is
 * asserted directly against the packed `package.json`.
 */
const packageDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageDir, '..', '..');
const tscBin = resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

interface PackedManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
}

let staging: string;
let consumer: string;
let installed: string;
let manifest: PackedManifest;
let tarballBytes: number;

const run = (command: string, args: string[], cwd: string): { code: number; output: string } => {
  try {
    return { code: 0, output: execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string; message?: string };

    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}` };
  }
};

const succeeds = (command: string, args: string[], cwd: string): string => {
  const { code, output } = run(command, args, cwd);

  expect(code, `${command} ${args.join(' ')} failed:\n${output}`).toBe(0);

  return output;
};

/**
 * Links a dependency in from the repository's store, the way an install would
 * place it. `junction` is the only link type Windows grants without elevation;
 * the argument is ignored everywhere else.
 */
const link = (name: string): void => {
  symlinkSync(realpathSync(resolve(packageDir, 'node_modules', name)), join(consumer, 'node_modules', name), 'junction');
};

/**
 * Unpacks an npm tarball, dropping its leading `package/` component.
 *
 * Read here rather than shelled out to `tar`: on Windows the name can resolve
 * to GNU tar, which reads a drive-letter path as a remote host spec and fails.
 * The archive is ustar with short paths, which is all npm emits.
 */
const extractTarball = (tarball: string, destination: string): void => {
  const archive = gunzipSync(readFileSync(tarball));
  const field = (header: Buffer, start: number, length: number): string =>
    header
      .subarray(start, start + length)
      .toString('utf8')
      .replace(/\0.*$/s, '');

  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    const name = field(header, 0, 100);

    if (name === '') break;

    const prefix = field(header, 345, 155);
    const size = Number.parseInt(field(header, 124, 12).trim(), 8) || 0;
    const isFile = header[156] === 0 || header[156] === 0x30;
    const entry = (prefix ? `${prefix}/${name}` : name).split('/').slice(1);

    offset += 512;

    if (isFile && entry.length > 0) {
      const target = join(destination, ...entry);

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, archive.subarray(offset, offset + size));
    }

    offset += Math.ceil(size / 512) * 512;
  }
};

/** Every file in a directory tree, as paths relative to it, in `/` form. */
const treeFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .replaceAll('\\', '/'),
    );

beforeAll(() => {
  staging = mkdtempSync(join(tmpdir(), 'exojs-build-pack-'));
  consumer = join(staging, 'consumer');

  // Pack what this source tree emits, not whatever `dist` happens to hold.
  succeeds(process.execPath, [tscBin, '-p', 'tsconfig.build.json'], packageDir);
  // `pnpm` is a `.cmd` shim on Windows, which Node will not spawn without a
  // shell, so this one goes through a quoted command line rather than an
  // argument vector.
  execSync(`pnpm pack --pack-destination "${staging}" --config.ignore-scripts=true`, { cwd: packageDir, encoding: 'utf8', stdio: 'pipe' });

  const tarball = readdirSync(staging).find(name => name.endsWith('.tgz'));

  expect(tarball, `no tarball in ${staging}`).toBeDefined();

  tarballBytes = readFileSync(join(staging, tarball!)).byteLength;

  installed = join(consumer, 'node_modules', '@codexo', 'exojs-build');

  mkdirSync(installed, { recursive: true });
  extractTarball(join(staging, tarball!), installed);

  manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as PackedManifest;

  for (const dependency of ['esbuild', 'vite', 'rollup']) link(dependency);

  cpSync(join(packageDir, 'test', 'fixtures', 'consumer'), consumer, { recursive: true });
  cpSync(join(packageDir, 'test', 'worklet-globals.d.ts'), join(consumer, 'worklet-globals.d.ts'));

  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'exojs-build-external-consumer',
        private: true,
        type: 'module',
        devDependencies: { '@codexo/exojs-build': manifest.version, rollup: '*', vite: '*' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  // The setup a consumer is told to write: `types` picks up the published
  // ambient `?worklet`/`?worker` declarations, nothing else is declared locally.
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['es2022', 'dom', 'dom.iterable'],
          types: ['@codexo/exojs-build/client'],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['main.ts', 'my-effect/**/*.ts', 'shader-example/**/*.ts', 'worker-example/**/*.ts', 'vite.config.ts'],
        exclude: ['**/*.worklet.ts', '**/*.worker.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  // The worklet and the worker belong to global scopes the app program cannot
  // select, so each gets its own program - the same split the documentation
  // describes.
  writeFileSync(
    join(consumer, 'tsconfig.worklets.json'),
    `${JSON.stringify(
      {
        compilerOptions: { target: 'es2022', module: 'esnext', moduleResolution: 'bundler', lib: ['es2022'], types: [], strict: true, noEmit: true },
        include: ['**/*.worklet.ts', 'worklet-globals.d.ts', 'my-effect/dsp.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    join(consumer, 'tsconfig.workers.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['es2022', 'webworker'],
          types: [],
          strict: true,
          noEmit: true,
        },
        include: ['**/*.worker.ts', 'worker-example/shared.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    join(consumer, 'vite.config.ts'),
    [
      "import { defineConfig } from 'vite';",
      '',
      "import { exojs } from '@codexo/exojs-build';",
      '',
      'export default defineConfig({',
      '  plugins: [exojs()],',
      "  build: { lib: { entry: 'main.ts', formats: ['es'], fileName: 'consumer' }, minify: false },",
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  // Rollup gets a plain-JS entry on purpose: it proves the preset is the only
  // thing a Rollup user has to add, with no TypeScript plugin in sight - the
  // `.ts` modules behind the queries are esbuild's business, not Rollup's. The
  // shader imports are here too because Rollup, unlike Vite, offers nothing of
  // its own for them.
  writeFileSync(
    join(consumer, 'rollup.entry.mjs'),
    [
      "import workletSource from './my-effect/my-effect.worklet.ts?worklet';",
      "import fragmentSource from './shader-example/demo.frag';",
      "import vertexSource from './shader-example/demo.vert';",
      "import wgslSource from './shader-example/demo.wgsl';",
      "import workerSource from './worker-example/generator.worker.ts?worker';",
      '',
      'export const sources = [workletSource, workerSource, vertexSource, fragmentSource, wgslSource];',
      '',
    ].join('\n'),
    'utf8',
  );

  // The production shape: `minify: true`, plus a `?raw` import of a shader the
  // same entry also imports bare. One bundle then carries both forms of one
  // file, which is what makes "a query is left to the bundler" checkable.
  writeFileSync(
    join(consumer, 'vite.min.entry.mjs'),
    [
      "import strippedFragment from './shader-example/demo.frag';",
      "import rawFragment from './shader-example/demo.frag?raw';",
      '',
      'export const fragments = [strippedFragment, rawFragment];',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(consumer, 'vite.config.min.ts'),
    [
      "import { defineConfig } from 'vite';",
      '',
      "import { exojs } from '@codexo/exojs-build';",
      '',
      'export default defineConfig({',
      '  plugins: [exojs({ minify: true })],',
      "  build: { outDir: 'dist-min', lib: { entry: 'vite.min.entry.mjs', formats: ['es'], fileName: 'consumer-min' }, minify: false },",
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(consumer, 'rollup.config.mjs'),
    [
      "import { exojs } from '@codexo/exojs-build';",
      '',
      'export default {',
      "  input: 'rollup.entry.mjs',",
      "  output: { dir: 'rollup-dist', format: 'es' },",
      '  plugins: [exojs()],',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
});

afterAll(() => {
  rmSync(staging, { recursive: true, force: true });
});

describe('packed manifest', () => {
  it('is publishable and independently versioned', () => {
    expect(manifest.name).toBe('@codexo/exojs-build');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('declares esbuild and nothing else', () => {
    expect(Object.keys(manifest.dependencies ?? {})).toStrictEqual(['esbuild']);
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it('carries no runtime dependency on the engine or the private repository config', () => {
    const declared = JSON.stringify({ ...manifest.dependencies, ...manifest.peerDependencies });

    expect(declared).not.toContain('@codexo/exojs-config');
    // The engine must never be pulled in by a build-time tool: a consumer's
    // app depends on `@codexo/exojs` itself, at whatever version it chose.
    expect(declared).not.toContain('@codexo/exojs"');
    expect(JSON.stringify(manifest)).not.toContain('workspace:');
  });
});

describe('packed contents', () => {
  it('ships the built tree, the client types and the licence, and no sources', () => {
    const files = treeFiles(installed);

    expect(files).toContain('dist/esm/index.js');
    expect(files).toContain('dist/esm/index.d.ts');
    expect(files).toContain('client.d.ts');
    expect(files).toContain('README.md');
    expect(files).toContain('LICENSE');
    expect(files.filter(file => file.startsWith('src/'))).toStrictEqual([]);
    expect(files.filter(file => file.startsWith('test/'))).toStrictEqual([]);
  });

  it('leaks no path from the machine that packed it', () => {
    const marker = repoRoot.replaceAll('\\', '/');
    const leaking = treeFiles(installed)
      .filter(file => file.endsWith('.js') || file.endsWith('.d.ts'))
      .filter(file => readFileSync(join(installed, file), 'utf8').includes(marker));

    expect(leaking).toStrictEqual([]);
  });

  it('emits declarations that import nothing a consumer cannot resolve', () => {
    // The same contract `verify:declaration-imports` enforces in the
    // repository, restated against the packed tree - which is the only copy a
    // consumer's `tsc` ever reads.
    const unresolvable = /(^|\/)src\/|@codexo\/exojs-config|\?(?:worklet|worker)$/;
    const violations = treeFiles(installed)
      .filter(file => file.endsWith('.d.ts'))
      .flatMap(file =>
        [...readFileSync(join(installed, file), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^\n]*?from\s*['"]([^'"]+)['"]/g)]
          .map(match => `${file}: ${match[1]}`)
          .filter(entry => unresolvable.test(entry.slice(entry.indexOf(': ') + 2))),
      );

    expect(violations).toStrictEqual([]);
  });
});

describe('external consumer', () => {
  it('type-checks against the published declarations', () => {
    succeeds(process.execPath, [tscBin, '-p', 'tsconfig.json'], consumer);
    succeeds(process.execPath, [tscBin, '-p', 'tsconfig.worklets.json'], consumer);
    succeeds(process.execPath, [tscBin, '-p', 'tsconfig.workers.json'], consumer);
  });

  it('builds with Vite, inlining every source into the one entry chunk', () => {
    succeeds(process.execPath, [join(consumer, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], consumer);

    const emitted = treeFiles(join(consumer, 'dist'));
    const bundle = readFileSync(join(consumer, 'dist', 'consumer.js'), 'utf8');

    expect(bundle).toContain('exojs-build-saturator-dsp');
    expect(bundle).toContain('exojs-build-generator');
    expect(bundle).toContain('exojs-build-demo-wgsl');
    expect(bundle).toContain('#version 300 es');
    // The transitive helper, reached only through the worklet's own import.
    expect(bundle).toContain('Math.tanh');
    expect(emitted.filter(file => /worklet|worker/i.test(file))).toStrictEqual([]);
    // Shader text is bundle payload, never a fetched asset - the single emitted
    // chunk is what says so.
    expect(emitted).toStrictEqual(['consumer.js']);
  });

  it('builds with Rollup and no other plugin', () => {
    succeeds(process.execPath, [join(consumer, 'node_modules', 'rollup', 'dist', 'bin', 'rollup'), '-c', 'rollup.config.mjs'], consumer);

    const emitted = treeFiles(join(consumer, 'rollup-dist'));
    const bundle = readFileSync(join(consumer, 'rollup-dist', 'rollup.entry.js'), 'utf8');

    expect(bundle).toContain('exojs-build-saturator-dsp');
    expect(bundle).toContain('exojs-build-generator');
    expect(bundle).toContain('#version 300 es');
    expect(bundle).toContain('fn fragmentMain');
    expect(emitted.filter(file => /worklet|worker/i.test(file))).toStrictEqual([]);
    expect(emitted.filter(file => /\.(vert|frag|wgsl)$/.test(file))).toStrictEqual([]);
  });

  it('strips shader comments under `minify`, and leaves a `?raw` import alone', () => {
    succeeds(process.execPath, [join(consumer, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.min.ts'], consumer);

    const bundle = readFileSync(join(consumer, 'dist-min', 'consumer-min.js'), 'utf8');
    // The same file twice: bare (stripped by the plugin) and `?raw` (verbatim,
    // because the plugin never claimed it). The marker comment therefore
    // survives exactly once, which no other split of the two behaviours gives.
    const markers = bundle.match(/exojs-build-demo-fragment/g) ?? [];

    expect(markers).toHaveLength(1);
    // Stripping is comment and layout removal only - the code is still there.
    expect(bundle.match(/#version 300 es/g) ?? []).toHaveLength(2);
    expect(bundle).toContain('fragColor = vec4(vUv, abs(sin(u_time)), 1.0);');
    expect(treeFiles(join(consumer, 'dist-min')).filter(file => /\.(vert|frag|wgsl)$/.test(file))).toStrictEqual([]);
  });

  it('stays a small tarball', () => {
    // A two-plugin build tool has no business growing past this; the guard is
    // here to catch an accidental `files` widening, not to be tuned.
    expect(tarballBytes).toBeLessThan(32 * 1024);
  });
});
