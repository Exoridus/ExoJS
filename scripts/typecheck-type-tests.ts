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
 *                   loader/catalog overloads and document version contracts
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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runTypeScriptCompiler } from '@codexo/exojs-config/typescript/compiler';

import { checkNativeProject } from './lib/native-compiler-diagnostics.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SHOW_CONFIG = process.argv.includes('--show-config');

interface Profile {
  /** Lane name, printed per run. */
  readonly name: string;
  /** What this profile proves, printed alongside the name. */
  readonly proves: string;
  /** Raw tsconfig body, resolved as if it were a file in the repository root. */
  readonly config: object;
}

const SUITE = ['test/type-tests/**/*.ts', 'test/type-tests/**/*.tsx', 'src/typings.d.ts'];

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
    proves: 'loader/catalog overloads and document versions under the engine profile',
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
      include: [
        'test/type-tests/asset-define-decode.type-test.ts',
        'test/type-tests/asset-load-v2.type-test.ts',
        'test/type-tests/asset-type-definitions.type-test.ts',
        'test/type-tests/document-asset-definitions.type-test.ts',
        'test/type-tests/document-versions.type-test.ts',
        'test/type-tests/loader-catalog-input.type-test.ts',
        'test/type-tests/loader-catalog-leaf.type-test.ts',
        'test/type-tests/live-load-group.type-test.ts',
        'src/typings.d.ts',
      ],
    },
  },
];

/** Materialize an isolated native compiler profile with repo-absolute paths. */
const profileConfig = (profile: Profile, directory: string): string => {
  const config = profile.config as {
    extends: string;
    include: string[];
    compilerOptions?: Record<string, unknown>;
  };
  const compilerOptions = { ...config.compilerOptions };

  if ('rootDir' in compilerOptions) {
    compilerOptions.rootDir = REPO_ROOT;
  }

  if ('paths' in compilerOptions) {
    compilerOptions.paths = { '@codexo/exojs': [resolve(REPO_ROOT, 'src/index.ts')] };
  }

  const path = join(directory, `${profile.name}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      extends: resolve(REPO_ROOT, config.extends),
      include: config.include.map(pattern => resolve(REPO_ROOT, pattern)),
      compilerOptions,
    }),
  );

  return path;
};

let failed = false;
const directory = mkdtempSync(join(tmpdir(), 'exojs-native-profiles-'));

try {
  for (const profile of PROFILES) {
    const config = profileConfig(profile, directory);

    if (SHOW_CONFIG) {
      const shown = runTypeScriptCompiler(['--showConfig', '-p', config], { cwd: REPO_ROOT, stdio: 'pipe' });

      if (shown.status !== 0) {
        console.error(shown.output);
        failed = true;
        continue;
      }

      console.log(`\n=== ${profile.name} - ${profile.proves} ===`);
      console.log(shown.output.trim());
      continue;
    }

    const checked = checkNativeProject(config, REPO_ROOT);

    if (checked.status !== 0) {
      console.error(checked.output);
      console.error(`typecheck:type-tests [${profile.name}]: ${checked.diagnostics.length} error(s) - ${profile.proves}.`);
      failed = true;
      continue;
    }

    console.log(`typecheck:type-tests [${profile.name}]: clean - ${profile.proves}.`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
