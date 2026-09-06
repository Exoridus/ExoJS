/**
 * Every published package packs and passes publint.
 *
 * The package set comes from `release/lockstep-packages.ts`, so a package that
 * joins the release line is checked here without a second edit. That is the
 * point of deriving it: the hand-written list this replaces had fallen three
 * packages behind the release matrix, and a package publint never saw could
 * have shipped with a broken `exports` map.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { INDEPENDENT_PACKAGES, LOCKSTEP_PACKAGES } from './release/lockstep-packages.ts';

const PUBLINT = 'publint@0.3.21';

const rootDir = resolve(import.meta.dirname, '..');
const packages = [...LOCKSTEP_PACKAGES, ...INDEPENDENT_PACKAGES];

const run = (dir: string, command: string): boolean => {
  console.log(`\n=== ${dir}: ${command} ===\n`);
  // A shell so the pnpm shim resolves on Windows as well.
  const result = spawnSync(command, { cwd: resolve(rootDir, dir), stdio: 'inherit', shell: true });
  return result.status === 0;
};

let failed = 0;

for (const pkg of packages) {
  const ok = run(pkg.dir, 'pnpm pack --dry-run') && run(pkg.dir, `pnpm dlx ${PUBLINT} --strict .`);
  if (!ok) {
    failed += 1;
    console.error(`\n${pkg.name} failed the publish check.`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${packages.length} published package(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${packages.length} published packages pack and pass publint.`);
