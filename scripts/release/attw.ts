/**
 * `@arethetypeswrong/cli` gate for the packed tarballs.
 *
 * ExoJS ships browser/bundler-first ESM. The `bundler` resolution must be green
 * for every entrypoint; the `node16`/`node10` resolutions surface a documented,
 * accepted limitation (extensionless relative barrel re-exports), so the three
 * rules that encode exactly those symptoms are ignored. We additionally assert
 * the positive `bundler: 🟢` signal so an ignored rule can never mask a genuine
 * bundler regression.
 *
 * Invoked via `pnpm dlx` (no permanent dependency added).
 */
import type { CommandRunner } from './command-runner.ts';

const IGNORED_RULES = ['no-resolution', 'internal-resolution-error', 'cjs-resolves-to-esm'] as const;

export interface AttwResult {
  tarball: string;
  ok: boolean;
  detail?: string;
}

export const checkTarballTypes = (runner: CommandRunner, tarball: string): AttwResult => {
  const result = runner.run({
    command: 'pnpm',
    args: ['dlx', '@arethetypeswrong/cli@latest', tarball, '--ignore-rules', ...IGNORED_RULES],
  });

  const output = `${result.stdout}\n${result.stderr}`;
  const bundlerGreen = output.includes('bundler: 🟢');
  const bundlerBroken = /bundler:\s*(💀|❌|🚫)/.test(output);

  const ok = result.code === 0 && bundlerGreen && !bundlerBroken;
  return {
    tarball,
    ok,
    detail: ok ? undefined : `exit ${result.code}${bundlerGreen ? '' : ', no bundler:🟢'}${bundlerBroken ? ', bundler broken' : ''}`,
  };
};

export const checkAllTarballTypes = (runner: CommandRunner, tarballs: string[]): { ok: boolean; results: AttwResult[] } => {
  const results = tarballs.map(t => checkTarballTypes(runner, t));
  return { ok: results.every(r => r.ok), results };
};
