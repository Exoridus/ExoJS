/**
 * Builds the core package: `exo.esm.js`, `exo.debug.esm.js`, and the
 * preserveModules `dist/esm` tree (with declarations) including every runtime
 * module under `dist/esm/<subpath>/`.
 *
 * Bundling runs on Rolldown; declarations are a separate `tsc
 * --emitDeclarationOnly` pass, since Rolldown has no declaration emitter. Core
 * and the runtime modules are emitted from ONE program: the `./debug` entry
 * re-exports the physics draw layer, whose declarations in turn name Core's
 * debug types, so neither half can be emitted against the other's output.
 * `EXOJS_ENV=development` selects the dev build (`pnpm build:dev`); `--watch`
 * runs Rolldown's watch mode instead of a single build (`pnpm build:watch`)
 * and skips declarations - they are not part of the inner dev loop this mode
 * serves, and `pnpm typecheck` already covers type correctness.
 *
 * The v0.20 distribution is ESM-only: the four prebuilt IIFE global bundles
 * (`exo.iife.js`/`exo.full.iife.js` and their minified twins) were removed with
 * v0.20. A script-tag consumer uses a module script with an import map against
 * `dist/esm` (see the migration guide).
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative as relativePath, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createShaderPlugin, createWorkletPlugin } from '@codexo/exojs-build';
import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import { createRuntimeModuleBuildOptions, createShippedExternalsPlugin, type RuntimeModule } from '@codexo/exojs-config/rolldown';
import { runTypeScriptCompiler } from '@codexo/exojs-config/typescript/compiler';
import { build as buildWorker } from 'esbuild';
import { type OutputOptions, type Plugin, type PreRenderedChunk, rolldown, type RolldownOptions, watch } from 'rolldown';
import ts from 'typescript';

import { rewriteModuleSpecifiers } from './lib/module-specifiers.ts';
import {
  createShippedLayout,
  moduleOfShipped,
  moduleOfSource,
  relativeSpecifier,
  resolveCoreExport,
  resolvePackageImportSource,
  shippedPathForSource,
  SOURCE_CONDITIONS,
} from './lib/shipped-specifiers.ts';
import { RUNTIME_MODULES } from './release/lockstep-packages.ts';
import { coreSourceRoots, writeSourceStamp } from './source-hash.ts';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const watchMode = process.argv.includes('--watch');
// `--dev` (used by `build:dev`/`build:watch`) selects the dev build without
// relying on a cross-platform env-var-setting mechanism. `EXOJS_ENV` is
// still honored as a fallback for anything that invokes this script directly
// with the env var set (matching the previous `rollup -c` convention).
const buildMode = process.argv.includes('--dev') || process.env.EXOJS_ENV === 'development' ? 'development' : 'production';
// One version for the whole tarball: runtime modules ship inside Core, so their
// `__VERSION__` is Core's, not whatever their private source manifest says.
const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });
const layout = createShippedLayout(rootDir);

// Activates the package-private `@codexo/exojs-source` condition in package.json#imports
// so `#*` resolves to ./src/*.ts at build time. preserveModules then rewrites the
// resolved paths to relative specifiers in the emitted ESM tree. The trailing
// standard conditions keep normal dependency resolution intact.
const sourceConditions = ['@codexo/exojs-source', 'browser', 'module', 'import', 'default'];

// The preserveModules tree emits `sources` one directory level too high
// (`../../../../src/...` escapes the repo), so consumers (e.g. Vite serving the
// site) warn about missing source files on every module. Re-anchor every
// `src/...` source to its real location relative to its map file.
const ESCAPED_SOURCE = /^(?:\.\.[\\/])+(src[\\/].*)$/;

const sourcemapPathTransform = (relativeSourcePath: string, sourcemapPath: string): string => {
  const match = ESCAPED_SOURCE.exec(relativeSourcePath);

  if (!match) {
    return relativeSourcePath;
  }

  return relativePath(dirname(sourcemapPath), resolvePath(rootDir, match[1])).replaceAll('\\', '/');
};

// Rolldown derives a preserveModules chunk name by dropping the module path's
// final extension, so `color-matrix.frag` and `color-matrix.wgsl` both want
// `color-matrix.js` and the second is disambiguated to `color-matrix2.js`.
// Rollup (the previous bundler) keeps the full basename, which is what the
// shipped `dist/esm` tree has always contained. Rebuilding the path from
// `facadeModuleId` restores that for the shader files; every other module
// keeps the default `[name]`.
const SHADER_EXTENSION = /\.(?:vert|frag|wgsl)$/;

const preservedModuleNaming = (info: PreRenderedChunk): string => {
  const id = info.facadeModuleId;

  if (id && SHADER_EXTENSION.test(id)) {
    return `${relativePath(resolvePath(rootDir, 'src'), id).replaceAll('\\', '/')}.js`;
  }

  return '[name].js';
};

// Codecov Bundle Analysis: uploads per-bundle module stats when a token is
// present (CI passes CODECOV_TOKEN via secrets: inherit). A plain local
// `pnpm build` has no token and stays fully offline.
const codecovBundlePlugin = (bundleName: string): Plugin[] =>
  // `codecovRollupPlugin` returns a Rollup plugin array. Rolldown accepts them
  // at runtime, but the two `Plugin` types are nominally distinct, so the shape
  // has to be restated rather than narrowed.
  process.env.CODECOV_TOKEN
    ? (codecovRollupPlugin({
        enableBundleAnalysis: true,
        bundleName,
        uploadToken: process.env.CODECOV_TOKEN,
        telemetry: false,
      }) as unknown as Plugin[])
    : [];

// WebGl2Shader text (`.vert`/`.frag`/`.wgsl`) ships verbatim inside the bundle -
// minification never descends into a string literal - so the outputs that
// minify get the comment-stripped variant and the readable ones keep the
// source as authored.
const shaderAndWorkletPlugins = (minify: boolean): Plugin[] => [createShaderPlugin({ minify }), createWorkletPlugin({ minify })];

// No `pure_funcs`-equivalent config needed here: once `__DEV__` is replaced by
// `false`, Rolldown's own dead-code elimination already removes calls to the
// now-empty `assert`/`assertDefined` bodies together with their (provably
// pure) argument expressions, in every output including the unminified
// `modules` tree - unlike the previous Rollup+terser pipeline, which only did
// this for the minified single-file bundles and left live callsites in the
// unminified tree.

const shared = {
  cwd: rootDir,
  transform: { define: defines },
  resolve: { conditionNames: sourceConditions, mainFields: ['browser', 'module', 'main'] },
};

const basisWorkerUrls = (): Plugin => ({
  name: 'basis-worker-url',
  transform(code, id) {
    if (!/\/BasisKtx2Runtime\.(?:ts|js)$/.test(id.replaceAll('\\', '/'))) {
      return null;
    }

    return {
      // `import.meta.url` is correct for every v0.20 ESM consumer, including
      // module scripts; the former script-tag variant that derived the URL
      // from `document.currentScript` left with the IIFE bundles.
      code: code.replace('basis/ktx2.worker.ts', 'basis/ktx2.worker.js'),
      map: {
        version: 3,
        sources: [id],
        sourcesContent: [code],
        names: [],
        mappings: `AAAA${';AACA'.repeat(code.split('\n').length - 1)}`,
      },
    };
  },
});

const emitBasisRuntime = async (): Promise<void> => {
  const source = resolvePath(rootDir, 'src/assets/factories/basis');
  const targets = ['dist/basis', 'dist/esm/assets/factories/basis'];
  await buildWorker({
    entryPoints: [resolvePath(source, 'ktx2.worker.ts')],
    outfile: resolvePath(rootDir, targets[0], 'ktx2.worker.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    external: ['fs'],
    logOverride: { 'commonjs-variable-in-esm': 'silent' },
  });

  for (const target of targets) {
    const destination = resolvePath(rootDir, target);
    mkdirSync(destination, { recursive: true });
    cpSync(resolvePath(source, 'basis_transcoder.wasm'), resolvePath(destination, 'basis_transcoder.wasm'));
    cpSync(resolvePath(source, 'LICENSE'), resolvePath(destination, 'LICENSE'));

    if (target !== targets[0]) {
      cpSync(resolvePath(rootDir, targets[0], 'ktx2.worker.js'), resolvePath(destination, 'ktx2.worker.js'));
    }
  }
};

const bundled = (minify: boolean): RolldownOptions => ({
  ...shared,
  input: 'src/index.ts',
  plugins: [basisWorkerUrls(), ...shaderAndWorkletPlugins(minify), ...codecovBundlePlugin('exo-esm')],
  output: { file: 'dist/exo.esm.js', format: 'es', sourcemap: true, minify },
});

// The single-file family (`exo.esm.js` + `exo.debug.esm.js`) carries Core only;
// the runtime modules ship in the `dist/esm` tree alone. The debug bundle is
// therefore built from the Core debug layers, without the physics draw layer the
// `./debug` entry adds.
const debugBundled = (minify: boolean): RolldownOptions => ({
  ...shared,
  input: 'src/debug/core.ts',
  // All `#` imports are core dependencies - mark them external so the debug
  // bundle contains only debug code and imports from @codexo/exojs at
  // runtime. (Intra-debug imports are same-directory `./` and stay bundled.)
  external: (id: string) => id.startsWith('#'),
  plugins: shaderAndWorkletPlugins(minify),
  output: {
    file: 'dist/exo.debug.esm.js',
    format: 'es',
    sourcemap: true,
    minify,
    // Remap all `#` external IDs to the package name in the output.
    paths: (id: string) => (id.startsWith('#') ? '@codexo/exojs' : id),
  },
});

// A Core source that reaches into a runtime module (the `./debug` entry's
// physics re-export) must not pull the module's sources into the Core tree: the
// module is built separately into its own subtree, and a second copy here would
// be a second instance. The import is emitted as a relative path to the file
// the module build writes.
const runtimeModuleBoundary = createShippedExternalsPlugin({
  sourceRoot: layout.coreSourceRoot,
  outDir: layout.distEsm,
  resolveExternal: (source, importer) => {
    if (!source.startsWith('#') || importer === undefined || moduleOfSource(layout, importer) !== undefined) {
      return;
    }

    const target = resolvePackageImportSource(rootDir, source);
    const shipped = target === undefined || moduleOfSource(layout, target) === undefined ? undefined : shippedPathForSource(layout, target);

    return shipped === undefined ? undefined : `${shipped}.js`;
  },
});

const modules = (): RolldownOptions => ({
  ...shared,
  // `src/extensions/index.ts` is deliberately absent: it exports nothing but
  // types, so bundling it produced an empty chunk. Its declaration still comes
  // from the separate `tsc --emitDeclarationOnly` pass, which is all the
  // `./extensions` subpath resolves to.
  input: ['src/index.ts', 'src/debug/index.ts', 'src/renderer-sdk.ts'],
  resolve: { conditionNames: sourceConditions, mainFields: ['module', 'browser', 'main'] },
  plugins: [runtimeModuleBoundary, basisWorkerUrls(), ...shaderAndWorkletPlugins(false), ...codecovBundlePlugin('exo-esm-modules')],
  output: {
    dir: 'dist/esm',
    format: 'es',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src',
    entryFileNames: preservedModuleNaming,
    chunkFileNames: preservedModuleNaming,
    sourcemapPathTransform,
    // Rolldown's own default is 'dce-only', not off - left implicit here it
    // would silently remove the (verified side-effect-free) assert/
    // assertDefined callsites from this tree too. Explicit `false` to match
    // this tree's actual intent: intentionally unoptimized, so consumers do
    // their own tree-shaking against predictable, unmodified-beyond-
    // transpilation source.
    minify: false,
  },
});

// Everything a runtime module imports from outside itself is a Core specifier:
// Core, a Core subpath, or a sibling module. Each is emitted as a relative path
// to the file the Core manifest exports for it, so the module joins the one
// Core instance instead of naming a package. Anything else under `@codexo/` -
// a retired package name in particular - fails the build: resolving it through
// `node_modules` would bundle a second copy.
const resolveRuntimeModuleExternal = (specifier: string, importer: string | undefined): string | undefined => {
  if (!specifier.startsWith('@codexo/')) {
    return undefined;
  }

  const target = resolveCoreExport(layout, specifier, 'js');

  if (target === undefined) {
    throw new Error(
      `${importer ?? 'a runtime module'} imports "${specifier}"; runtime modules may only import @codexo/exojs and its subpaths.`,
    );
  }

  return target;
};

const assertNoSubpathCollision = (): void => {
  const coreDirectories = new Set(
    readdirSync(layout.coreSourceRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name),
  );

  for (const module of RUNTIME_MODULES) {
    if (coreDirectories.has(module.subpath)) {
      throw new Error(`Runtime module subpath "${module.subpath}" collides with the Core source directory src/${module.subpath}.`);
    }
  }
};

const runtimeModuleJobs = async (): Promise<RolldownOptions[]> => {
  assertNoSubpathCollision();

  return Promise.all(
    RUNTIME_MODULES.map(async module => {
      const config = resolvePath(rootDir, module.dir, 'rolldown.config.ts');
      const { default: descriptor } = (await import(pathToFileURL(config).href)) as { default: Readonly<RuntimeModule> };

      return createRuntimeModuleBuildOptions(descriptor, {
        outDir: resolvePath(rootDir, 'dist', 'esm', module.subpath),
        defines,
        bundleName: `exo-esm-${module.subpath}`,
        resolveExternal: resolveRuntimeModuleExternal,
      });
    }),
  );
};

const runJob = async (options: RolldownOptions): Promise<void> => {
  const bundle = await rolldown(options);
  await bundle.write(options.output as OutputOptions);
  await bundle.close();
};

const DECLARATION_STAGING = resolvePath(rootDir, 'dist', '.declarations');

/** The files a package's own `tsconfig.json` type-checks, so the composed emit sees exactly what each package does. */
const programFiles = (configPath: string): string[] => {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(`cannot read ${configPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
      },
    },
  );

  if (parsed === undefined || parsed.errors.length > 0) {
    const reason = parsed?.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; ') ?? 'unreadable';

    throw new Error(`cannot read ${configPath}: ${reason}`);
  }

  return parsed.fileNames;
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);

    return entry.isDirectory() ? listFiles(path) : [path];
  });

/**
 * Where an emitted declaration (or declaration map) ships: Core sources under
 * `dist/esm/`, a runtime module's sources under `dist/esm/<subpath>/`.
 */
const shippedDeclarationPath = (stagingOut: string, emitted: string): string => {
  const source = resolvePath(rootDir, relativePath(stagingOut, emitted));
  const match = /\.d\.ts(\.map)?$/.exec(source);
  const shipped = match === null ? undefined : shippedPathForSource(layout, `${source.slice(0, match.index)}.ts`);

  if (match === null || shipped === undefined) {
    throw new Error(`declaration emit produced ${emitted}, which belongs to no shipped source tree`);
  }

  return `${shipped}.d.ts${match[1] ?? ''}`;
};

/**
 * The specifier a shipped declaration has to use instead of `specifier`, or
 * `undefined` to keep it. A runtime module's declarations name Core, its
 * subpaths and sibling modules through relative paths to the exported files,
 * and their own `#` imports through the module's place in the Core tree, so no
 * consumer needs the source repository's resolution to read them. Core's own
 * `#` imports keep resolving through the Core `imports` map, except where they
 * point into a runtime module.
 *
 * Every extensionless relative specifier gains the explicit `.js` (or
 * `/index.js`) of the declaration it names. The emitter keeps specifiers as
 * written, and Node's own resolution (`NodeNext`) rejects a relative ESM import
 * without an extension, so without this a NodeNext consumer could not read any
 * shipped declaration.
 */
const shippedDeclarationSpecifier = (file: string, specifier: string, shipped: ReadonlySet<string>): string | undefined => {
  const module = moduleOfShipped(layout, file);

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = resolvePath(dirname(file), specifier);

    if (shipped.has(`${base}.d.ts`)) {
      return `${specifier}.js`;
    }

    return shipped.has(join(base, 'index.d.ts')) ? `${specifier}/index.js` : undefined;
  }

  const toDeclarationSpecifier = (target: string): string => relativeSpecifier(file, target).replace(/\.d\.ts$/, '.js');

  if (specifier.startsWith('#')) {
    const source = resolvePackageImportSource(module?.packageDir ?? rootDir, specifier);
    const shipped = source === undefined ? undefined : shippedPathForSource(layout, source);

    if (source === undefined || shipped === undefined) {
      throw new Error(`${file}: cannot resolve "${specifier}" to a shipped source`);
    }

    return module === undefined && moduleOfSource(layout, source) === undefined ? undefined : toDeclarationSpecifier(`${shipped}.d.ts`);
  }

  if (module !== undefined && specifier.startsWith('@codexo/')) {
    const target = resolveCoreExport(layout, specifier, 'types');

    if (target === undefined) {
      throw new Error(`${file}: runtime module declarations may only name @codexo/exojs and its subpaths, found "${specifier}"`);
    }

    return toDeclarationSpecifier(target);
  }

  return undefined;
};

/** Re-anchors a moved declaration map's `sources` to the source files they named before the move. */
const relocateDeclarationMap = (from: string, to: string): string => {
  const map = JSON.parse(readFileSync(from, 'utf8')) as { sources: string[] };
  map.sources = map.sources.map(source => relativePath(dirname(to), resolvePath(dirname(from), source)).replaceAll('\\', '/'));

  return JSON.stringify(map);
};

const emitDeclarations = async (): Promise<void> => {
  const stagingOut = join(DECLARATION_STAGING, 'out');
  const configs = [
    resolvePath(rootDir, 'tsconfig.json'),
    ...RUNTIME_MODULES.map(module => resolvePath(rootDir, module.dir, 'tsconfig.json')),
  ];
  const files = [...new Set(configs.flatMap(programFiles))];
  const configPath = join(DECLARATION_STAGING, 'tsconfig.json');

  rmSync(DECLARATION_STAGING, { recursive: true, force: true });
  mkdirSync(DECLARATION_STAGING, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        extends: resolvePath(rootDir, 'tsconfig.json'),
        compilerOptions: { rootDir, outDir: stagingOut, declarationDir: stagingOut, customConditions: SOURCE_CONDITIONS },
        files,
        include: [],
      },
      null,
      2,
    ),
  );

  try {
    const { status } = runTypeScriptCompiler(['-p', configPath, '--emitDeclarationOnly', '--inlineSources', '--incremental', 'false'], {
      cwd: rootDir,
    });

    if (status !== 0) {
      throw new Error(`declaration emit failed (tsc exit ${status})`);
    }

    const emitted = listFiles(stagingOut).map(file => ({ file, target: shippedDeclarationPath(stagingOut, file) }));
    const shipped = new Set(emitted.map(entry => entry.target).filter(target => target.endsWith('.d.ts')));

    for (const { file, target } of emitted) {
      mkdirSync(dirname(target), { recursive: true });

      if (target.endsWith('.map')) {
        writeFileSync(target, relocateDeclarationMap(file, target));
      } else {
        const text = readFileSync(file, 'utf8');
        writeFileSync(
          target,
          rewriteModuleSpecifiers(target, text, specifier => shippedDeclarationSpecifier(target, specifier, shipped)),
        );
      }
    }
  } finally {
    rmSync(DECLARATION_STAGING, { recursive: true, force: true });
  }
};

if (watchMode) {
  await emitBasisRuntime();
  const jobs = [bundled(false), debugBundled(false), modules(), ...(await runtimeModuleJobs())];
  const watcher = watch(jobs as never);
  watcher.on('event', event => {
    if (event.code === 'BUNDLE_END') {
      void event.result.close();
    }

    if (event.code === 'ERROR') {
      console.error(event.error);
    }

    if (event.code === 'END') {
      console.log('rebuilt');
    }
  });
} else {
  // The runtime modules come after the Core tree they import.
  const moduleJobs = await runtimeModuleJobs();
  const jobs = [bundled(true), debugBundled(true), modules(), ...moduleJobs];

  for (const job of jobs) {
    await runJob(job);
  }

  await emitDeclarations();
  await emitBasisRuntime();
  writeSourceStamp(coreSourceRoots(rootDir), resolvePath(rootDir, 'dist'));
}
