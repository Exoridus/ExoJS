import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const oxlint = fileURLToPath(new URL('./bin/oxlint', import.meta.resolve('oxlint/package.json')));
// Oxlint does not expand positional globs when the shell passes them literally.
const roots = ['src', ...globSync('packages/*/src').toSorted()];
const result = spawnSync(
  process.execPath,
  [oxlint, '--config', 'scripts/ci/oxlint-exojs-shadow.json', ...process.argv.slice(2), '--', ...roots],
  {
    stdio: 'inherit',
  },
);

process.exitCode = result.status ?? 1;
