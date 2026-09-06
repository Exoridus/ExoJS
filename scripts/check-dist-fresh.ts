/**
 * Refuse to run a dist-consuming step against a stale build.
 *
 * The site build, the API docs generator and the full-bundle export check read
 * `dist/` (Core) and `packages/exojs-*\/dist/` (extensions) rather than the
 * sources. After a pull or a local edit those artifacts silently lag behind:
 * the site bundles an engine without the new export and the example smoke then
 * reports a black canvas with no error; the export check names a symbol the
 * package "does not export"; the docs generator drops every extension page.
 * Each of those wasted a diagnosis before this check existed.
 *
 * A package that was never built is left to the consuming step's own error,
 * except where that step would destroy something first - the docs generator
 * guards that case itself. Set `EXOJS_SKIP_DIST_CHECK=1` to bypass.
 */
import { checkFreshness, REBUILD_COMMAND } from './dist-freshness.ts';

if (process.env['EXOJS_SKIP_DIST_CHECK'] === '1') {
  console.log('check-dist-fresh: skipped (EXOJS_SKIP_DIST_CHECK=1).');
  process.exit(0);
}

const report = checkFreshness();
const checked = report.units.length - report.unbuilt.length;

if (report.stale.length === 0) {
  console.log(`check-dist-fresh: ${checked} build unit(s) up to date.`);
  process.exit(0);
}

console.error('check-dist-fresh: dist is older than its sources; the step you are about to run would use a stale build.\n');

for (const line of report.stale) console.error(`  - ${line}`);

console.error(`\nRebuild with: ${REBUILD_COMMAND}`);
process.exit(1);
