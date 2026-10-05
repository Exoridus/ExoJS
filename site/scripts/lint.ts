/**
 * Lints the documentation site: ESLint for TypeScript, React and Astro source,
 * then Stylelint for stylesheets and Astro `<style>` blocks.
 *
 * Both tools run even when the first fails, so one invocation reports every
 * finding. Arguments are forwarded to each, so `pnpm lint --fix` fixes both.
 */
import { spawnSync } from 'node:child_process';

const STYLE_GLOBS = ['src/**/*.{scss,astro}'];

const run = (name: string, command: string, args: readonly string[]): boolean => {
  console.log(`\n=== lint: ${name} ===\n`);

  // A shell so the tool shims resolve on Windows as well.
  const result = spawnSync([command, ...args].join(' '), { stdio: 'inherit', shell: true });

  return result.status === 0;
};

const forwarded = process.argv.slice(2);
const results = [
  run('eslint', 'eslint', ['--max-warnings=0', '.', ...forwarded]),
  run('stylelint', 'stylelint', ['--max-warnings=0', ...STYLE_GLOBS.map(glob => `"${glob}"`), ...forwarded]),
];

process.exit(results.every(Boolean) ? 0 : 1);
