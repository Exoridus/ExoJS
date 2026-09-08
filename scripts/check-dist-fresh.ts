/**
 * Refuse to run a dist-consuming step against a stale build, or bring the
 * build up to date first.
 *
 * The site build and the full-bundle export check read `dist/` (Core) and
 * `packages/exojs-*\/dist/` (extensions) rather than the sources. After a
 * pull or a local edit those artifacts silently lag behind: the site bundles
 * an engine without the new export and the example smoke then reports a black
 * canvas with no error; the export check names a symbol the package "does not
 * export". Each of those wasted a diagnosis before this check existed. The
 * API docs generator is not gated: it converts from the sources.
 *
 * Without `--rebuild`, a stale unit fails the step with the rebuild command
 * named; a package that was never built is left to the consuming step's own
 * error. With `--rebuild`, a stale or unbuilt unit runs that command here and
 * the check is repeated, so a caller that would otherwise fail minutes later
 * pays the build exactly when it is due and nothing else. Set
 * `EXOJS_SKIP_DIST_CHECK=1` to bypass either mode.
 */
import { spawnSync } from 'node:child_process';

import { checkFreshness, REBUILD_COMMAND, repoRoot } from './dist-freshness.ts';

const rebuild = process.argv.includes('--rebuild');

if (process.env['EXOJS_SKIP_DIST_CHECK'] === '1') {
  console.log('check-dist-fresh: skipped (EXOJS_SKIP_DIST_CHECK=1).');
  process.exit(0);
}

let report = checkFreshness();

if (rebuild && (report.stale.length > 0 || report.unbuilt.length > 0)) {
  const reasons = [...report.stale, ...report.unbuilt.map(unit => `${unit.name}: never built`)];

  console.log(`check-dist-fresh: rebuilding, because\n${reasons.map(line => `  - ${line}`).join('\n')}\n`);

  // Through the shell: on Windows `pnpm` resolves to a `.cmd` shim, which the
  // direct spawn path refuses to execute.
  const result = spawnSync(REBUILD_COMMAND, { cwd: repoRoot, stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    console.error(`check-dist-fresh: '${REBUILD_COMMAND}' failed (exit ${String(result.status)}).`);
    process.exit(result.status ?? 1);
  }

  report = checkFreshness();
}

const checked = report.units.length - report.unbuilt.length;

if (report.stale.length === 0) {
  console.log(`check-dist-fresh: ${checked} build unit(s) up to date.`);
  process.exit(0);
}

console.error('check-dist-fresh: dist is older than its sources; the step you are about to run would use a stale build.\n');

for (const line of report.stale) console.error(`  - ${line}`);

console.error(`\nRebuild with: ${REBUILD_COMMAND}`);
process.exit(1);
