/**
 * Opt-in renderer benchmark sweep. Skipped by default; runs only when
 * `EXOJS_PERF_PROFILE` is set (`quick` or `full`) via `pnpm perf:renderers`.
 *
 * For each scenario it captures deterministic structural metrics (one steady
 * frame) and Tier-B CPU submission timing (median/p95 over many frames against
 * the recording fake context). Timing is informational — never a CI gate — and
 * measures CPU submission only, NOT GPU execution or real-driver upload cost.
 *
 * @internal Test/perf-only.
 */
import { execSync } from 'node:child_process';

import { describe, it } from 'vitest';

import { createWebGl2Harness, measureFrame } from './harness';
import { mean, median, percentile, type ScenarioResult, writeSweepOutput } from './report';
import { type BenchProfile, buildScenarioCatalog } from './scenarios';
import { readTilemapRebuilds, resetTilemapRebuilds } from './tilemapFixtures';

const profileEnv = process.env['EXOJS_PERF_PROFILE'] ?? '';
const profile: BenchProfile = profileEnv === 'full' ? 'full' : 'quick';
const WARMUP_FRAMES = 3;
const TIMED_FRAMES = profile === 'full' ? 60 : 20;

const gitSha = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

describe.runIf(profileEnv !== '')('renderer benchmark sweep', () => {
  it(`runs the ${profile} catalog and writes machine-readable output`, () => {
    const catalog = buildScenarioCatalog(profile);
    const results: ScenarioResult[] = [];

    for (const scenario of catalog) {
      const harness = createWebGl2Harness();
      const built = scenario.build(harness);

      for (let i = 0; i < WARMUP_FRAMES; i++) {
        measureFrame(harness, built.root, built.beforeFrame);
      }

      // Structural metrics from one representative steady frame.
      resetTilemapRebuilds();
      const metrics = measureFrame(harness, built.root, built.beforeFrame);
      const geometryRebuilds = readTilemapRebuilds();

      // Tier-B CPU submission timing.
      const times: number[] = [];

      for (let i = 0; i < TIMED_FRAMES; i++) {
        const start = performance.now();

        measureFrame(harness, built.root, built.beforeFrame);
        times.push(performance.now() - start);
      }

      results.push({
        scenario: scenario.id,
        family: scenario.family,
        backend: 'webgl2',
        frames: TIMED_FRAMES,
        tags: scenario.tags,
        metrics: { ...metrics, geometryRebuilds },
        timing: { cpuMeanMs: mean(times), cpuMedianMs: median(times), cpuP95Ms: percentile(times, 95) },
      });

      built.teardown?.();
      harness.destroy();
    }

    writeSweepOutput('.workspace/output/render-perf', results, {
      profile,
      commit: gitSha(),
      timestamp: new Date().toISOString(),
      node: process.version,
    });

    console.log(`[sweep] ${results.length} ${profile} scenarios → .workspace/output/render-perf/`);
  }, 600_000);
});
