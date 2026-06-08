/**
 * Publish stage of the coordinated release.
 *
 * Consumes ONLY the artifacts recorded by `prepare` (it never builds or packs).
 * Guarantees, all enforced here and covered by `test/release/publish.test.ts`:
 *
 *   - Build-once: re-hashes every tarball and aborts on drift from the manifest.
 *   - Order: Core → Particles → Tiled.
 *   - Two-phase tags: every package is published to a version-specific temporary
 *     dist-tag first; `latest` is moved only AFTER all three publish succeed.
 *   - Idempotent resume: a version already on the registry is skipped, not
 *     re-published; a re-run completes a partially-finished release.
 *   - No partial `latest`: a failure on any package promotes nothing.
 *   - No false success: any failed step yields `ok === false`.
 *   - Dry-run: every npm mutation carries `--dry-run` and nothing is promoted.
 */
import { PUBLISH_ORDER, type ReleaseManifest, type TarballRecord, verifyManifestArtifacts } from './manifest.ts';
import type { CommandResult, CommandRunner } from './command-runner.ts';

export interface PublishOptions {
  /** Append `--dry-run` to every npm mutation and skip `latest` promotion side effects. */
  dryRun: boolean;
  /** Version-specific temporary dist-tag, e.g. `staging-0.12.0`. */
  distTag: string;
  /** Final dist-tag promoted to after all publishes succeed. */
  promoteTag: string;
  /** When true, query `npm view` to skip versions already on the registry. */
  checkExisting: boolean;
  /** Pass `--provenance` to `npm publish` (OIDC trusted publishing). */
  provenance: boolean;
}

export const defaultPublishOptions = (version: string): PublishOptions => ({
  dryRun: true,
  distTag: `staging-${version}`,
  promoteTag: 'latest',
  checkExisting: true,
  provenance: false,
});

export type PublishState = 'published' | 'already-published' | 'failed' | 'not-attempted';
export type PromoteState = 'promoted' | 'skipped-dry-run' | 'failed' | 'not-attempted';

export interface PackageOutcome {
  name: string;
  version: string;
  publish: PublishState;
  promote: PromoteState;
  detail?: string;
}

export interface PublishReport {
  ok: boolean;
  dryRun: boolean;
  version: string;
  distTag: string;
  promoteTag: string;
  /** Set when the run aborted before touching the registry. */
  abortReason?: string;
  packages: PackageOutcome[];
}

const orderedPackages = (manifest: ReleaseManifest): TarballRecord[] =>
  [...manifest.packages].sort((a, b) => PUBLISH_ORDER.indexOf(a.name) - PUBLISH_ORDER.indexOf(b.name));

const isAlreadyPublished = (runner: CommandRunner, pkg: TarballRecord): boolean => {
  const result: CommandResult = runner.run({ command: 'npm', args: ['view', `${pkg.name}@${pkg.version}`, 'version'] });
  // `npm view` prints the version on stdout when it exists, errors otherwise.
  return result.code === 0 && result.stdout.trim() === pkg.version;
};

const publishTarball = (runner: CommandRunner, pkg: TarballRecord, absoluteTarball: string, options: PublishOptions): CommandResult => {
  const args = ['publish', absoluteTarball, '--tag', options.distTag, '--access', 'public'];
  if (options.provenance) args.push('--provenance');
  if (options.dryRun) args.push('--dry-run');
  return runner.run({ command: 'npm', args });
};

const promoteTarball = (runner: CommandRunner, pkg: TarballRecord, options: PublishOptions): CommandResult =>
  runner.run({
    command: 'npm',
    args: ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, options.promoteTag, ...(options.dryRun ? ['--dry-run'] : [])],
  });

/**
 * Runs the publish stage. Pure orchestration over the injected runner and a
 * resolver that maps a manifest-relative tarball path to its absolute location.
 */
export const publishRelease = (
  manifest: ReleaseManifest,
  options: PublishOptions,
  runner: CommandRunner,
  resolveArtifact: (relativeFile: string) => string,
): PublishReport => {
  const packages = orderedPackages(manifest);
  const outcomes: PackageOutcome[] = packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,
    publish: 'not-attempted',
    promote: 'not-attempted',
  }));

  const report: PublishReport = {
    ok: false,
    dryRun: options.dryRun,
    version: manifest.version,
    distTag: options.distTag,
    promoteTag: options.promoteTag,
    packages: outcomes,
  };

  // ── Build-once guard ────────────────────────────────────────────────────
  // Re-hash the on-disk artifacts. Any drift means something rebuilt or
  // mutated the tarballs after `prepare` — refuse to publish.
  const drift = verifyManifestArtifacts(manifest, resolveArtifact);
  if (drift.length > 0) {
    report.abortReason = `artifact drift since prepare: ${drift.map(issue => `${issue.file} (${issue.reason})`).join(', ')}`;
    return report;
  }

  // ── Phase 1: publish each package to the temporary dist-tag, in order ────
  let allPresent = true;
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    const outcome = outcomes[i];

    if (options.checkExisting && isAlreadyPublished(runner, pkg)) {
      outcome.publish = 'already-published';
      continue;
    }

    const result = publishTarball(runner, pkg, resolveArtifact(pkg.file), options);
    if (result.code !== 0) {
      outcome.publish = 'failed';
      outcome.detail = (result.stderr || result.stdout).trim().split('\n').slice(-1)[0];
      allPresent = false;
      // Stop the chain immediately — later packages are never attempted,
      // and nothing gets promoted to `latest`.
      return report;
    }
    outcome.publish = 'published';
  }

  if (!allPresent) {
    return report;
  }

  // ── Phase 2: promote to `latest` only after ALL three are on the registry ─
  // In dry-run the promotion is simulated WITHOUT calling npm: `npm dist-tag
  // add` is an authenticated registry mutation that cannot be safely
  // dry-run'd (it touches `latest` for real). The gating/order is proven by
  // the unit tests against a fake runner.
  if (options.dryRun) {
    for (const outcome of outcomes) {
      outcome.promote = 'skipped-dry-run';
    }
    report.ok = true;
    return report;
  }

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    const outcome = outcomes[i];

    const result = promoteTarball(runner, pkg, options);
    if (result.code !== 0) {
      outcome.promote = 'failed';
      outcome.detail = (result.stderr || result.stdout).trim();
      return report;
    }
    outcome.promote = 'promoted';
  }

  report.ok = true;
  return report;
};
