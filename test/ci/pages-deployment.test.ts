import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Locks the build-once/deploy-once contract for GitHub Pages.
 *
 * The site is built and validated exactly once, by the `site-build` job in
 * `_ci-checks.yml`, which publishes `site/dist/**` as an artifact named after
 * the commit it was built from. `deploy-pages.yml` then downloads exactly that
 * artifact - from exactly the workflow run that triggered it - and deploys it.
 *
 * The defect this prevents: the Pages workflow used to check the sources out
 * and rebuild the library and the site itself, so what went live was a second,
 * unvalidated build. A build that CI never gated could reach production, and a
 * green CI run was no evidence about the deployed bytes.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const readWorkflow = (name: string) => readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf8');

const ciChecks = readWorkflow('_ci-checks.yml');
const deployPages = readWorkflow('deploy-pages.yml');

/** The artifact name is derived from the commit on both sides of the handover. */
const SITE_ARTIFACT_UPLOAD = 'site-dist-${{ github.sha }}';
const SITE_ARTIFACT_DOWNLOAD = 'site-dist-${{ github.event.workflow_run.head_sha }}';

/** Everything between `<job>:` and the next top-level job key. */
const jobBlock = (workflow: string, job: string) => {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, `job '${job}' not found`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
};

describe('site artifact production (_ci-checks.yml)', () => {
  const siteBuild = jobBlock(ciChecks, 'site-build');

  it('uploads the built site as a commit-identified artifact', () => {
    expect(siteBuild).toContain('actions/upload-artifact@v4');
    expect(siteBuild).toContain(`name: ${SITE_ARTIFACT_UPLOAD}`);
    expect(siteBuild).toContain('path: site/dist/');
  });

  it('fails the build rather than publishing an empty site artifact', () => {
    expect(siteBuild).toContain('if-no-files-found: error');
  });

  it('uploads only after the site typecheck gate and the site build have passed', () => {
    const gateIndex = siteBuild.indexOf('pnpm gates site');
    const buildIndex = siteBuild.indexOf('pnpm site:build');
    const uploadIndex = siteBuild.indexOf('actions/upload-artifact@v4');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(gateIndex);
    expect(uploadIndex).toBeGreaterThan(buildIndex);
  });
});

describe('Pages deployment (deploy-pages.yml)', () => {
  it('builds no source code of its own', () => {
    for (const forbidden of ['pnpm install', 'pnpm build', 'pnpm site:build', 'pnpm --filter', 'pnpm/action-setup', 'actions/setup-node', 'actions/checkout']) {
      expect(deployPages, `deploy-pages.yml must not run '${forbidden}'`).not.toContain(forbidden);
    }
  });

  it('deploys the artifact of the run that triggered it', () => {
    expect(deployPages).toContain('actions/download-artifact@v4');
    expect(deployPages).toContain(`name: ${SITE_ARTIFACT_DOWNLOAD}`);
    expect(deployPages).toContain('run-id: ${{ github.event.workflow_run.id }}');
    // Cross-run artifact reads need an explicit token and `actions: read`.
    expect(deployPages).toContain('actions: read');
    expect(deployPages).toContain('github-token: ${{ github.token }}');
  });

  it('refuses to deploy when it has no triggering run to read the artifact from', () => {
    expect(deployPages).toContain('workflow_run.id');
    expect(deployPages).toMatch(/github\.event_name == 'workflow_run'/);
    // A manual dispatch has no triggering run, so it must not be a trigger.
    const triggers = deployPages.slice(deployPages.indexOf('\non:\n'), deployPages.indexOf('\npermissions:\n'));
    expect(triggers).not.toContain('workflow_dispatch');
  });

  it('still hands the deployed tree to the Pages actions', () => {
    expect(deployPages).toContain('actions/upload-pages-artifact@v4');
    expect(deployPages).toContain('actions/deploy-pages@v5');
  });
});
