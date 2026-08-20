/**
 * Runs the parity matrix as a MEASUREMENT run rather than a gate run.
 *
 * The parity specs live inside the `browser-webgpu` project, so they also
 * execute on every push as a backend-comparison gate. A gate run must not
 * rewrite `test/rendering/parity/evidence.json`: the file is committed and
 * published on the site, so an incidental rewrite only dirties the working tree
 * and manufactures merge conflicts. The sink therefore writes only when
 * `EXOJS_WRITE_PARITY_EVIDENCE` is set, and this wrapper is the one place that
 * sets it.
 *
 * A wrapper rather than an inline env prefix in `package.json`, because
 * `VAR=value cmd` is not portable to the Windows shells this repo is developed
 * on, and a wrapper avoids taking a dependency purely to prefix a variable.
 *
 * Usage:  tsx scripts/run-parity.ts <vitest args...>
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('vitest', ['run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXOJS_WRITE_PARITY_EVIDENCE: '1' },
});

if (result.error !== undefined) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
