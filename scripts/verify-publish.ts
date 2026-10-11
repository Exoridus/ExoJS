import { resolve } from 'node:path';

import { readOutputOptions } from './lib/output.ts';
import { createExecRunner } from './release/command-runner.ts';
import { INDEPENDENT_PACKAGES, LOCKSTEP_PACKAGES } from './release/lockstep-packages.ts';

const PUBLINT = 'publint@0.3.21';

const rootDir = resolve(import.meta.dirname, '..');
const packages = [...LOCKSTEP_PACKAGES, ...INDEPENDENT_PACKAGES];
const { mode } = readOutputOptions(process.argv.slice(2));
const logDirectory = resolve(rootDir, '.workspace/logs');
const runner = createExecRunner({ logDirectory });

const run = (dir: string, args: readonly string[]): boolean => {
  if (mode === 'verbose') {
    console.log(`\n=== ${dir}: pnpm ${args.join(' ')} ===\n`);
  }

  const result = runner.run({ command: 'pnpm', args, cwd: resolve(rootDir, dir) });

  if (mode === 'verbose' || result.code !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }

  return result.code === 0;
};

let failed = 0;

for (const pkg of packages) {
  const ok = run(pkg.dir, ['pack', '--dry-run']) && run(pkg.dir, ['dlx', PUBLINT, '--strict', '.']);

  if (!ok) {
    failed += 1;
    console.error(`\n${pkg.name} failed the publish check.`);
  } else if (mode !== 'silent') {
    console.log(`${pkg.name}: pack OK, publint OK`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${packages.length} published package(s) failed.`);
  process.exit(1);
}

if (mode !== 'silent') {
  console.log(`\nAll ${packages.length} published packages pack and pass publint. Full logs: ${logDirectory}`);
}
