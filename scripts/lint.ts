/**
 * Runs ESLint over the repository in passes, one process each.
 *
 * The rule set is type-aware, so a pass holds a TypeScript program for every
 * file it lints plus ESLint's own AST for each. Linting the engine, its tests,
 * the examples, the scripts and every package in ONE process put all of that in
 * one heap at once and reached V8's 4 GB ceiling, which fails the push gate with
 * an out-of-memory crash rather than a lint error - and does so intermittently,
 * depending on what else the machine is doing.
 *
 * Splitting costs a second startup and one more program build; it does not
 * lint anything twice, and each pass's memory is returned when its process
 * exits. That is the trade this file exists to make. Raising the heap ceiling
 * instead would hide the growth and move the failure onto whichever machine has
 * least memory, which for a push gate is the wrong direction.
 *
 * Arguments are forwarded to every pass, so `pnpm lint --fix` and
 * `pnpm lint --cache` behave as they would against a single invocation.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

interface LintPass {
  /** What the pass covers, for the console. */
  readonly name: string;
  /** Globs handed to ESLint, quoted by the shell call below. */
  readonly globs: readonly string[];
}

export const LINT_PASSES: readonly LintPass[] = [
  { name: 'engine', globs: ['src/**/*.ts', 'test/**/*.ts', 'examples/**/*.ts', 'scripts/**/*.{ts,mts,cts,mjs}', '*.config.ts'] },
  {
    name: 'packages',
    globs: [
      'packages/exojs-*/src/**/*.{ts,tsx}',
      'packages/exojs-*/test/**/*.{ts,tsx}',
      'packages/exojs-bench/competitors/*.ts',
      'packages/create-exo-app/src/**/*.ts',
    ],
  },
];

const main = (): void => {
  const args = process.argv.slice(2);

  for (const pass of LINT_PASSES) {
    console.log(`\n=== lint: ${pass.name} ===\n`);

    const quoted = pass.globs.map(glob => `"${glob}"`);
    // A shell so the eslint shim resolves on Windows as well.
    const result = spawnSync(['eslint', '--max-warnings=0', ...quoted, ...args].join(' '), { stdio: 'inherit', shell: true });

    if (result.status !== 0) {
      console.error(`\nlint: the ${pass.name} pass failed (exit ${result.status ?? 'signal'}).`);
      process.exit(result.status ?? 1);
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
