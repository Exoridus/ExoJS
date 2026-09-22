/**
 * Delete what a local test, benchmark or release run left behind.
 *
 * By default only run artifacts go; build outputs and caches stay, since the
 * next build needs them. `--all` removes those too - every dist, the site's
 * cache and its synced inputs - which is the state of a fresh clone before
 * `bootstrap:dev`. Prints what it removed so a surprising deletion is at
 * least a visible one.
 *
 * Deletion goes through `git clean -X`, which removes only files the
 * repository ignores: a tracked placeholder inside an artifact directory
 * (`test/perf/results/.gitkeep`) survives, and so does anything a person put
 * there that git does not know to be disposable.
 */
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_CACHES, formatBytes, presentArtifacts, RUN_ARTIFACTS } from './artifacts.ts';
import { collectBuildUnits } from './dist-freshness.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const all = process.argv.includes('--all');
const buildOutputs = all ? collectBuildUnits().map(unit => relative(root, unit.distDir).replace(/\\/g, '/')) : [];
const present = presentArtifacts(root, all ? [...RUN_ARTIFACTS, ...BUILD_CACHES, ...buildOutputs] : RUN_ARTIFACTS);
const label = all ? 'clean:all' : 'clean:artifacts';

if (present.length === 0) {
  console.log(`${label}: nothing to remove.`);
  process.exit(0);
}

let freed = 0;

for (const artifact of present) {
  execFileSync('git', ['clean', '-fdXq', '--', join(root, artifact.path)], { cwd: root, stdio: 'inherit' });
  freed += artifact.bytes;
  console.log(`  removed ${artifact.path} (${formatBytes(artifact.bytes)})`);
}

console.log(`${label}: ${present.length} director${present.length === 1 ? 'y' : 'ies'} removed, ${formatBytes(freed)} freed.`);
