import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type CiPlan, LANES, planCi } from '../../scripts/ci/lanes';

/**
 * What `ci.yml` receives from the `plan` job for representative events. The
 * verdict job fails a skipped job the plan asked for, so these are also the
 * assertions that a path-filter regression cannot pass unnoticed.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');

const pullRequest = (changedFiles: string[]): CiPlan => planCi({ eventName: 'pull_request', changedFiles, refName: 'feature' });
const push = (changedFiles: string[], refName = 'next'): CiPlan => planCi({ eventName: 'push', changedFiles, refName });
const ids = (entries: Array<{ id: string }>): string[] => entries.map(entry => entry.id);

describe('lane table', () => {
  it('has a unique id per lane', () => {
    const all = LANES.map(lane => lane.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every browser lane a JUnit report or a reason not to', () => {
    for (const lane of LANES.filter(lane => lane.stage === 'test' && lane.id !== 'bench')) {
      expect(lane.junit, `${lane.id} feeds the skip budget`).toBe(true);
      expect(lane.ciRun, `${lane.id} writes its report on CI`).toContain(`test-results/${lane.id}.junit.xml`);
    }
  });

  it('never mentions a lane by name in the workflow', () => {
    for (const lane of LANES) {
      expect(workflow).not.toMatch(new RegExp(`\\b${lane.run.split(' ').slice(0, 3).join(' ')}\\b`));
    }
  });
});

describe('plan for a push to a long-lived branch', () => {
  const plan = planCi({ eventName: 'push', changedFiles: [], refName: 'next' });

  it('runs every stage in full with coverage', () => {
    expect(ids(plan.gates)).toEqual(['typecheck', 'lint', 'sync']);
    expect(ids(plan.test)).toEqual(['unit', 'webgl', 'webgpu', 'firefox', 'audio', 'tilemap', 'bench']);
    expect(ids(plan.verify)).toEqual(['package', 'create-exo-app']);
    expect(plan).toMatchObject({ build: true, site: true, smoke: true, smokeSample: false, skipBudget: true, coverage: true });
  });

  it('instruments the lanes that upload coverage and no other', () => {
    expect(plan.test.filter(entry => entry.coverage).map(entry => entry.id)).toEqual(['unit', 'webgl']);
    expect(plan.test.find(entry => entry.id === 'unit')?.run).toContain('test:coverage');
  });

  it('collects no coverage on a push to any other branch', () => {
    expect(planCi({ eventName: 'push', changedFiles: [], refName: 'release/0.15.x' }).coverage).toBe(false);
  });
});

describe('plan for a push whose before..after diff did not resolve', () => {
  // The workflow leaves `changedFiles` empty both when `before` is unknown (a
  // new branch, a force-push with no shared history) and when the diff ran but
  // legitimately touched nothing; `planCi` cannot tell those apart and must not
  // skip validation for either, on any branch.
  it('validates every area, regardless of branch', () => {
    const plan = planCi({ eventName: 'push', changedFiles: [], refName: 'feature-x' });
    expect(Object.values(plan.areas).every(Boolean)).toBe(true);
    expect(ids(plan.test)).toEqual(['unit', 'webgl', 'webgpu', 'firefox', 'audio', 'tilemap', 'bench']);
  });
});

describe('plan for a push with a resolved diff', () => {
  it('narrows to the engine lanes for an engine change, same as a pull request', () => {
    const plan = push(['src/rendering/webgl2/backend.ts']);
    expect(ids(plan.test)).toEqual(['unit', 'webgl', 'webgpu', 'firefox', 'bench']);
    expect(ids(plan.verify)).toEqual(['package']);
    expect(plan).toMatchObject({ build: true, site: true, smoke: true, smokeSample: false });
  });

  it('builds the site without the engine lanes for a site-only change', () => {
    const plan = push(['site/src/pages/index.astro']);
    expect(plan.test).toEqual([]);
    expect(plan).toMatchObject({ build: true, site: true, smoke: true });
  });

  it('runs the engine lanes without the site build for an engine-test-only change', () => {
    const plan = push(['test/rendering/webgl2/backend.test.ts']);
    expect(ids(plan.test)).toContain('unit');
    expect(plan).toMatchObject({ site: false, smoke: false });
  });

  it('runs only the gates for a docs-only change', () => {
    const plan = push(['README.md']);
    expect(ids(plan.gates)).toEqual(['typecheck', 'lint', 'sync']);
    expect(plan.test).toEqual([]);
    expect(plan.verify).toEqual([]);
    expect(plan).toMatchObject({ build: false, site: false, smoke: false });
  });

  it('never enables the pull-request-only release lane', () => {
    expect(ids(push(['scripts/release/prepare.ts']).verify)).toEqual(['package']);
  });
});

describe('plan for events that always validate everything', () => {
  it('ignores a changed-file list on a manual dispatch', () => {
    const plan = planCi({ eventName: 'workflow_dispatch', changedFiles: ['README.md'], refName: 'next' });
    expect(plan.areas).toEqual(planCi({ eventName: 'workflow_dispatch', changedFiles: [], refName: 'next' }).areas);
    expect(ids(plan.test)).toEqual(['unit', 'webgl', 'webgpu', 'firefox', 'audio', 'tilemap', 'bench']);
  });
});

describe('plan for a pull request', () => {
  it('runs everything for an engine change, uninstrumented, with a sampled smoke', () => {
    const plan = pullRequest(['src/rendering/webgl2/backend.ts']);
    expect(ids(plan.test)).toEqual(['unit', 'webgl', 'webgpu', 'firefox', 'bench']);
    expect(ids(plan.verify)).toEqual(['package']);
    expect(plan).toMatchObject({ build: true, site: true, smoke: true, smokeSample: true, skipBudget: true, coverage: false });
    expect(plan.test.find(entry => entry.id === 'unit')?.run).not.toContain('coverage');
  });

  it('adds the release dry run when the release tooling or a packed manifest changes', () => {
    expect(ids(pullRequest(['scripts/release/prepare.ts']).verify)).toEqual(['package', 'release']);
    expect(ids(pullRequest(['packages/exojs-tiled/package.json']).verify)).toEqual(['package', 'release']);
    expect(ids(planCi({ eventName: 'push', changedFiles: [], refName: 'next' }).verify)).toEqual(['package', 'create-exo-app']);
  });

  it('runs only the gates for a docs-only change', () => {
    const plan = pullRequest(['README.md']);
    expect(ids(plan.gates)).toEqual(['typecheck', 'lint', 'sync']);
    expect(plan.test).toEqual([]);
    expect(plan.verify).toEqual([]);
    expect(plan).toMatchObject({ build: false, site: false, smoke: false, skipBudget: false });
  });

  it('adds the audio lane for an audio-fx change and the tilemap lane for a tilemap change', () => {
    expect(ids(pullRequest(['packages/exojs-audio-fx/src/reverb.ts']).test)).toContain('audio');
    expect(ids(pullRequest(['packages/exojs-tilemap/src/worker.ts']).test)).toContain('tilemap');
    expect(ids(pullRequest(['src/scene/node.ts']).test)).not.toContain('audio');
  });

  it('builds the site without the engine lanes for a site-only change', () => {
    const plan = pullRequest(['site/src/pages/index.astro']);
    expect(plan.test).toEqual([]);
    expect(plan).toMatchObject({ build: true, site: true, smoke: true });
  });
});

describe('the matrix entries carry what the setup action needs', () => {
  const plan = planCi({ eventName: 'push', changedFiles: [], refName: 'main' });

  it('names the browser and the apt packages per lane', () => {
    const byId = Object.fromEntries(plan.test.map(entry => [entry.id, entry]));
    expect(byId['webgpu']).toMatchObject({ browser: 'chromium', apt: 'mesa-vulkan-drivers xvfb' });
    expect(byId['firefox']).toMatchObject({ browser: 'firefox', apt: 'xvfb' });
    expect(byId['unit']).toMatchObject({ browser: '', apt: '', naga: true });
  });

  it('asks for the dist only where the lane packs it', () => {
    expect(plan.verify.find(entry => entry.id === 'package')?.dist).toBe(true);
    expect(plan.test.every(entry => !entry.dist)).toBe(true);
  });
});
