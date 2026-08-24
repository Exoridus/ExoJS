/**
 * Compiles `test/type-tests/**` once per compiler profile the public API is
 * expected to hold up under.
 *
 * The type tests assert a type-level contract, so the profile they are compiled
 * with IS the assertion: an overload that only resolves under `strict` proves
 * nothing about a consumer who has it off, and a `@ts-expect-error` that stops
 * erroring under a looser profile is a silent hole. Three profiles are
 * therefore real, distinct programs:
 *
 *   consumer        the `create-exo-app` scaffold profile (shared consumer
 *                   preset, plain `strict: true`) over the whole suite
 *   consumer-loose  the same file set with `strict`/`strictNullChecks` off, for
 *                   the contracts that must survive a JavaScript-flavoured
 *                   consumer
 *   engine-strict   the engine's own profile - `noUncheckedIndexedAccess`,
 *                   `exactOptionalPropertyTypes`, `noUnusedLocals` - scoped to
 *                   the loader/catalog overloads, which are the surface where
 *                   those options change inference
 *
 * They live here rather than as one root tsconfig per profile because a profile
 * is a run mode, not a program the repository owns: three near-identical files
 * whose only difference was a strictness flag is config surface standing in for
 * orchestration. The compiler options still come from the shared presets and
 * the two real root programs (`tsconfig.examples.json`, `tsconfig.json`); only
 * the file set and the strictness override are declared here.
 *
 * `paths` is explicit on the engine-strict profile on purpose: the engine
 * tsconfig has none (it compiles `src/` only, which never imports the package by
 * name). Without it the `@codexo/exojs` import resolves only through a BUILT
 * `dist/` - green on a machine that has built, TS2307 on a clean CI checkout.
 *
 * Run `pnpm typecheck:type-tests -- --show-config` to print each profile's
 * resolved compiler options and file set instead of compiling.
 */
import { resolve } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SHOW_CONFIG = process.argv.includes('--show-config');

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => REPO_ROOT,
  getNewLine: () => ts.sys.newLine,
};

interface Profile {
  /** Lane name, printed per run. */
  readonly name: string;
  /** What this profile proves, printed alongside the name. */
  readonly proves: string;
  /** Raw tsconfig body, resolved as if it were a file in the repository root. */
  readonly config: object;
}

const SUITE = ['test/type-tests/**/*.ts', 'src/typings.d.ts'];

const PROFILES: readonly Profile[] = [
  {
    name: 'consumer',
    proves: 'the scaffold profile a create-exo-app user starts from',
    config: {
      extends: './tsconfig.examples.json',
      include: SUITE,
    },
  },
  {
    name: 'consumer-loose',
    proves: 'a consumer with strict off',
    config: {
      extends: './tsconfig.examples.json',
      compilerOptions: { strict: false, strictNullChecks: false },
      include: SUITE,
    },
  },
  {
    name: 'engine-strict',
    proves: 'the loader/catalog overloads under the engine profile',
    config: {
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: true,
        rootDir: '.',
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        paths: { '@codexo/exojs': ['./src/index.ts'] },
      },
      include: ['test/type-tests/loader-catalog-input.type-test.ts', 'test/type-tests/loader-catalog-leaf.type-test.ts', 'src/typings.d.ts'],
    },
  },
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Resolves a profile the same way `tsc -p` resolves a file on disk: the config
 * is parsed against the repository root, so its `extends` and every relative
 * path in it mean what they would mean in a root tsconfig.
 */
function parseProfile(profile: Profile): ts.ParsedCommandLine {
  const parsed = ts.parseJsonConfigFileContent(profile.config, ts.sys, REPO_ROOT, undefined, resolve(REPO_ROOT, `tsconfig.type-tests-${profile.name}.json`));

  if (parsed.errors.length > 0) {
    fail(ts.formatDiagnosticsWithColorAndContext(parsed.errors, FORMAT_HOST));
  }

  return parsed;
}

let failed = false;

for (const profile of PROFILES) {
  const parsed = parseProfile(profile);

  if (SHOW_CONFIG) {
    console.log(`\n=== ${profile.name} - ${profile.proves} ===`);
    console.log(JSON.stringify({ compilerOptions: parsed.options, files: parsed.fileNames }, null, 2));
    continue;
  }

  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST));
    console.error(`typecheck:type-tests [${profile.name}]: ${diagnostics.length} error(s) - ${profile.proves}.`);
    failed = true;
    continue;
  }

  console.log(`typecheck:type-tests [${profile.name}]: ${parsed.fileNames.length} file(s) clean - ${profile.proves}.`);
}

if (failed) {
  process.exit(1);
}
