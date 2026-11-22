/**
 * Runs validated native rules, then ESLint in two memory-isolated passes.
 *
 * The rule set is type-aware, so a pass holds a TypeScript program for every
 * file it lints plus ESLint's own AST for each. Linting the engine, its tests,
 * the examples, the scripts and every package in ONE process put all of that in
 * one heap at once and reached V8's 4 GB ceiling, which fails the push gate with
 * an out-of-memory crash rather than a lint error - and does so intermittently,
 * depending on what else the machine is doing.
 *
 * Each ESLint pass returns its memory when it exits. The standard invocation
 * delegates validated rule/options pairs to Oxlint first and retains every
 * other rule on ESLint. Unvalidated versions or contexts keep full ESLint;
 * the runner does not raise the heap ceiling or follow the residual passes
 * with another full-rule ESLint pass.
 *
 * Arguments are forwarded to every pass, so `pnpm lint --fix` and
 * `pnpm lint --cache` behave as they would against a single invocation.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { NATIVE_PLAN_ENV, runNativeLint } from './lint-native.ts';

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
      'packages/exojs-react/examples/**/*.{ts,tsx}',
      'packages/create-exo-app/src/**/*.ts',
      'packages/eslint-plugin-exojs/src/**/*.ts',
      'packages/eslint-plugin-exojs/test/**/*.ts',
    ],
  },
];

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const env = { ...process.env };

  // Flags retain ESLint's existing CLI contract, including fixes, caching,
  // custom configs and positional paths. Native ownership is only the standard
  // read-only invocation, with a newly generated and verified completion plan.
  delete env[NATIVE_PLAN_ENV];
  delete process.env[NATIVE_PLAN_ENV];

  const native =
    args.length === 0
      ? await runNativeLint(
          root,
          LINT_PASSES.flatMap(pass => pass.globs),
        )
      : null;

  if (native?.status) {
    native.cleanup();

    return native.status;
  }

  if (native?.planPath) {
    env[NATIVE_PLAN_ENV] = native.planPath;
  }

  const eslint = fileURLToPath(new URL('./bin/eslint.js', import.meta.resolve('eslint/package.json')));

  try {
    for (const pass of LINT_PASSES) {
      console.log(`\n=== lint: ${pass.name} ===\n`);

      // ESLint expands its globs. Direct Node arguments preserve file names and
      // flags on Windows without a shell command or its length/quoting hazards.
      const result = spawnSync(process.execPath, [eslint, '--max-warnings=0', ...pass.globs, ...args], {
        cwd: root,
        env,
        stdio: 'inherit',
      });

      if (result.status !== 0) {
        console.error(`\nlint: the ${pass.name} pass failed (exit ${result.status ?? 'signal'}).`);

        return result.status ?? 1;
      }
    }

    return 0;
  } finally {
    native?.cleanup();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
