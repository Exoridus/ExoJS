import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planCi } from '../../scripts/ci/lanes.ts';

/**
 * Locks the build-once/deploy-once contract for GitHub Pages.
 *
 * Each channel is built and validated exactly once: by the `site` job in
 * `ci.yml` for a push to main (Stable) or next (Next), or by a Release for a
 * stable tag. The tree goes up as `site-<channel>-<sha>-<attempt>` with its
 * `site-build.json`. `deploy-pages.yml` is the one publisher: it re-decides
 * both channels from GitHub metadata, verifies the chosen bytes with scripts
 * from the trusted default branch, composes Stable at the root and Next under
 * `next/`, and deploys that one tree.
 *
 * The defect this prevents: the Pages workflow used to check the sources out
 * and rebuild the library and the site itself, so what went live was a second,
 * unvalidated build. A build that CI never gated could reach production, and a
 * green CI run was no evidence about the deployed bytes.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const readWorkflow = (name: string) => readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf8');

const ci = readWorkflow('ci.yml');
const release = readWorkflow('release.yml');
const deployPages = readWorkflow('deploy-pages.yml');

const CANDIDATE_UPLOAD = 'site-${{ steps.channel.outputs.channel }}-${{ github.sha }}-${{ github.run_attempt }}';

/** Everything between `<job>:` and the next top-level job key. */
const jobBlock = (workflow: string, job: string) => {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, `job '${job}' not found`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);

  return next === -1 ? rest : rest.slice(0, next);
};

/** The script bodies of every `run:` step, single-line and block form. */
const runScripts = (workflow: string): string[] =>
  [...workflow.matchAll(/^( *)(?:- )?run: ?(?:[|>]-?\n((?:\1 {2,}.*\n?)+)|(.*))$/gm)].map(match => (match[2] ?? match[3] ?? '').trim());

describe('site candidate production (ci.yml)', () => {
  const site = jobBlock(ci, 'site');
  const smokePlans = [false, true].map(
    fullQualification =>
      planCi({ eventName: 'pull_request', changedFiles: ['examples/basics/sprite.ts'], refName: 'feature', fullQualification }).smokeMatrix,
  );

  it('builds the channel the branch publishes, from the one channel table', () => {
    expect(site).toContain('node scripts/pages/site-channel.ts >> "$GITHUB_OUTPUT"');
    expect(site).toContain("SITE_REF: ${{ github.event_name == 'pull_request' && github.base_ref || github.ref_name }}");
    expect(site).toContain('EXOJS_SITE_CHANNEL: ${{ steps.channel.outputs.channel }}');
    expect(site).toContain('EXOJS_SITE_BASE: ${{ steps.channel.outputs.base }}');
  });

  it('uploads the built tree as a channel candidate, kept 90 days for a push', () => {
    expect(site).toContain('actions/upload-artifact@v7');
    expect(site).toContain(`name: ${CANDIDATE_UPLOAD}`);
    expect(site).toContain('path: site/dist/');
    expect(site).toContain("retention-days: ${{ github.event_name == 'push' && 90 || 1 }}");
    expect(site).toContain(`candidate: ${CANDIDATE_UPLOAD}`);
  });

  it('fails the build rather than publishing an empty site artifact', () => {
    expect(site).toContain('if-no-files-found: error');
  });

  it('uploads only after the site gate, the build and the candidate verification have passed', () => {
    const gateIndex = site.indexOf('pnpm gates site');
    const buildIndex = site.indexOf('pnpm site:build');
    const verifyIndex = site.indexOf('node scripts/pages/channel-artifact.ts verify --dir site/dist');
    const uploadIndex = site.indexOf('actions/upload-artifact@v7\n        with:\n          name: site-');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(gateIndex);
    expect(verifyIndex).toBeGreaterThan(buildIndex);
    expect(uploadIndex).toBeGreaterThan(verifyIndex);
  });

  it('runs every planned smoke partition independently against exactly that candidate', () => {
    const smoke = jobBlock(ci, 'smoke');
    expect(smoke).toContain('name: smoke (${{ matrix.id }})');
    expect(smoke).toContain('fail-fast: false');
    expect(smoke).toContain('include: ${{ fromJSON(needs.plan.outputs.smokeMatrix) }}');
    expect(smoke).toContain('browser: chromium');
    expect(smoke.match(/actions\/download-artifact@/g)).toHaveLength(1);
    expect(smoke).toContain('name: ${{ needs.site.outputs.candidate }}');
    expect(smoke).toContain('path: site/dist');
    expect(runScripts(smoke)).toEqual(['${{ matrix.run }}']);
    expect(smoke).toMatch(/^ {6}- run: \$\{\{ matrix\.run \}\}\n\n/m);
    expect(smoke).not.toContain('continue-on-error:');

    for (const [index, entries] of smokePlans.entries()) {
      expect(entries.filter(entry => entry.suite === 'examples')).toHaveLength(index === 0 ? 1 : 3);
      expect(entries.filter(entry => entry.suite === 'playground').map(entry => entry.run)).toEqual([
        'pnpm test:playground:e2e --suite shell',
        'pnpm test:playground:e2e --suite rendering',
        'pnpm test:playground:e2e --suite lifecycle',
        'pnpm test:playground:e2e --suite assets',
      ]);
    }
  });

  it('keeps distinct reports from both smoke runners, including their failures', () => {
    const smoke = jobBlock(ci, 'smoke');
    const uploads = smoke.split(/(?=^ {6}- )/m).filter(step => step.includes('actions/upload-artifact@'));
    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toContain("if: ${{ matrix.suite == 'examples' && !cancelled() }}");
    expect(uploads[0]).toContain('name: smoke-${{ matrix.id }}');
    expect(uploads[0]).toContain('.workspace/reports/example-smoke.md');
    expect(uploads[0]).toContain('.workspace/reports/example-smoke-artifacts');
    expect(uploads[1]).toContain("if: ${{ matrix.suite == 'playground' && !cancelled() }}");
    expect(uploads[1]).toContain('name: smoke-${{ matrix.id }}');
    expect(uploads[1]).toContain('.workspace/reports/playground-e2e');

    for (const entries of smokePlans) {
      expect(new Set(entries.map(entry => `smoke-${entry.id}`)).size).toBe(entries.length);
    }
  });
});

describe('the required smoke verdict', () => {
  const verdict = jobBlock(ci, 'verdict');

  const verdictResult = (smoke: string | undefined, required = true) => {
    const needs: Record<string, { result: string }> = Object.fromEntries(
      ['plan', 'gates', 'test', 'skip-budget', 'build', 'verify', 'site'].map(job => [job, { result: 'success' }]),
    );

    if (smoke !== undefined) {
      needs['smoke'] = { result: smoke };
    }

    return spawnSync(process.execPath, ['scripts/ci/verdict.ts'], {
      cwd: repoRoot,
      env: { ...process.env, NEEDS: JSON.stringify(needs), PLAN: JSON.stringify({ smoke: String(required) }) },
      encoding: 'utf8',
      timeout: 10_000,
    });
  };

  it('waits for the smoke matrix aggregate even after a failed or cancelled job', () => {
    expect(verdict).toContain('if: always()');
    expect(verdict).toMatch(/needs: \[[^\]\n]*\bsmoke\b[^\]\n]*\]/);
    expect(verdictResult('success').status).toBe(0);
  });

  it.each(['failure', 'cancelled', 'skipped'])('rejects a required smoke aggregate that is %s', result => {
    const actual = verdictResult(result);
    expect(actual.status).toBe(1);
    expect(actual.stdout).toMatch(new RegExp(`FAIL smoke\\s+${result}`));
  });

  it('rejects a missing smoke aggregate', () => {
    const actual = verdictResult(undefined);
    expect(actual.status).toBe(1);
    expect(actual.stdout).toMatch(/FAIL smoke\s+missing from needs/);
  });

  it('allows smoke to be skipped only when the plan did not require it', () => {
    expect(verdictResult('skipped', false).status).toBe(0);
  });
});

describe('site candidate production at a release (release.yml)', () => {
  it('builds Stable and uploads it under the tagged commit for the publisher', () => {
    const prepare = jobBlock(release, 'prepare');
    expect(prepare).toContain('EXOJS_SITE_CHANNEL: stable');
    expect(prepare).toContain('node scripts/pages/channel-artifact.ts verify --dir site/dist --channel stable --sha "$RELEASE_SHA"');
    expect(prepare).toContain('name: site-stable-${{ needs.trust.outputs.sha }}-${{ github.run_attempt }}');
    expect(prepare).toContain('path: site/dist/');
    expect(prepare).toContain('retention-days: 90');
  });
});

describe('Pages publisher (deploy-pages.yml)', () => {
  const compose = jobBlock(deployPages, 'compose');
  const deploy = jobBlock(deployPages, 'deploy');

  it('builds no source code of its own', () => {
    for (const forbidden of ['pnpm', './.github/actions/setup', 'npm install', 'npx ', 'actions/download-artifact']) {
      expect(deployPages, `deploy-pages.yml must not use '${forbidden}'`).not.toContain(forbidden);
    }
  });

  it('runs only its own scripts from the trusted default-branch checkout, never a downloaded file', () => {
    expect(compose).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(compose).toContain('persist-credentials: false');
    expect(compose).toContain('/scripts/pages/');
    expect(deployPages.match(/actions\/checkout@/g)).toHaveLength(1);

    const scripts = runScripts(deployPages);
    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      expect(script, 'every step runs a publisher script with node').toMatch(/^node scripts\/pages\/[a-z-]+\.ts\b/);
      // Event text must never be interpolated into a shell script.
      expect(script).not.toContain('${{');
    }
  });

  it('is woken by a finished CI or Release run and has no other trigger', () => {
    const triggers = deployPages.slice(deployPages.indexOf('\non:\n'), deployPages.indexOf('\npermissions:'));
    expect(triggers).toContain("workflows: ['Release', 'CI']");
    expect(triggers).toContain('types: [completed]');

    for (const other of ['workflow_dispatch', 'pull_request', 'push:', 'schedule']) {
      expect(triggers).not.toContain(other);
    }
  });

  it('acts only on a successful same-repository push run, and re-decides from metadata', () => {
    for (const condition of [
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      'github.event.workflow_run.repository.full_name == github.repository',
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ]) {
      expect(compose).toContain(condition);
    }

    expect(compose).toContain('TRIGGER_RUN_ID: ${{ github.event.workflow_run.id }}');
    expect(compose).toContain('node scripts/pages/select-channels.ts');
    expect(compose).toContain('node scripts/pages/compose-site.ts');
  });

  it('serializes the whole site without cancelling a running deployment', () => {
    expect(deployPages).toContain('concurrency:\n  group: pages-combined\n  cancel-in-progress: false');
  });

  it('grants each job only what it needs', () => {
    expect(deployPages).toContain('\npermissions: {}\n');
    expect(compose).toContain(
      'permissions:\n      contents: read\n      # Listing runs and reading artifacts of other workflow runs.\n      actions: read\n    outputs:',
    );
    expect(compose).not.toMatch(/pages: write|id-token: write/);
    expect(deploy).toContain('permissions:\n      pages: write\n      id-token: write\n    environment:');
    expect(deploy).not.toMatch(/contents:|actions:/);
  });

  it('uploads exactly one Pages artifact and keeps it with the deployed pairing', () => {
    expect(deployPages.match(/actions\/upload-pages-artifact@v5/g)).toHaveLength(1);
    expect(deployPages.match(/actions\/deploy-pages@v5/g)).toHaveLength(1);
    expect(compose).toContain('retention-days: 90');
    expect(compose).toContain('name: pages-channels-${{ github.run_id }}');
    expect(deploy).toContain("if: needs.compose.outputs.deploy == 'true'");
    expect(deploy).toContain('name: github-pages');
  });
});
