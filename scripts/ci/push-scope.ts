/**
 * Pre-push scope - how much local verification a pushed range actually needs.
 *
 * Consumed by `.husky/pre-push`, which decides between the full gate sweep and
 * a narrower one, and by `test/ci/push-scope.test.ts`.
 *
 * The hook is a convenience that saves a failed round trip to CI, not the
 * authority on correctness: CI re-runs its own selection on every push
 * regardless of what this returns. That is what makes narrowing safe here, and
 * why the narrowing is deliberately small - `full` is the answer for anything
 * this module does not positively recognise.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Published reference profiles and the README beside them. These are measured
 * data rather than code: nothing typechecks, lints, bundles or imports them,
 * and the single check that opens one is `verify:bench-results`. Classifying
 * them keeps a push that carries a reference run from rebuilding `dist` and
 * running all four gate groups to validate a file none of them reads.
 */
const isBenchResultsPath = (file: string): boolean => file.startsWith('packages/exojs-bench/results/');

/**
 * `none`  - the range changes no tracked file; nothing can have broken.
 * `data`  - published benchmark data only; its own gate still runs.
 * `full`  - anything else, including a range this module cannot determine.
 */
export type PushScope = 'none' | 'data' | 'full';

/** Gates a `data` scope still runs, by package.json script name. */
export const DATA_SCOPE_GATES: readonly string[] = ['verify:bench-results'];

export const pushScope = (changedFiles: readonly string[]): PushScope => {
  const files = changedFiles.map(file => String(file).replace(/\\/g, '/').trim()).filter(file => file !== '');

  if (files.length === 0) return 'none';

  return files.every(isBenchResultsPath) ? 'data' : 'full';
};

const changedFilesBetween = (base: string, head: string): string[] =>
  execFileSync('git', ['diff', '--name-only', `${base}..${head}`], { encoding: 'utf8' }).split('\n');

const main = (): void => {
  const [base, head] = process.argv.slice(2);

  // An undeterminable range must not narrow anything: the hook reads this on
  // stdout and branches on it, so failing open would silently skip the gates.
  if (base === undefined || head === undefined || base === '' || head === '') {
    process.stdout.write('full\n');
    return;
  }

  try {
    process.stdout.write(`${pushScope(changedFilesBetween(base, head))}\n`);
  } catch {
    process.stdout.write('full\n');
  }
};

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
