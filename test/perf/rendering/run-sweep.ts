/**
 * Launcher for the renderer benchmark sweep.
 *
 * Sets `EXOJS_PERF_PROFILE` in-process (cross-platform — no shell env syntax
 * needed) and runs the `rendering-perf` vitest project's `sweep.test.ts`, which
 * writes machine-readable output to `.workspace/output/render-perf/`.
 *
 * Usage:
 *   tsx test/perf/rendering/run-sweep.ts            # quick profile
 *   tsx test/perf/rendering/run-sweep.ts full       # full matrix
 */
import { spawnSync } from 'node:child_process';

const profile = process.argv[2] === 'full' ? 'full' : 'quick';

console.log(`[perf:renderers] running ${profile} sweep → .workspace/output/render-perf/`);

const result = spawnSync('pnpm exec vitest run --project=rendering-perf sweep.test.ts', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXOJS_PERF_PROFILE: profile },
});

process.exit(result.status ?? 1);
